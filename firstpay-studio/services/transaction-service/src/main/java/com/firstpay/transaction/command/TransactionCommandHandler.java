package com.firstpay.transaction.command;

import com.firstpay.transaction.api.dto.TransactionEvent;
import com.firstpay.transaction.domain.Transaction;
import com.firstpay.transaction.domain.TransactionStore;
import com.firstpay.transaction.infra.EventStore;
import com.firstpay.transaction.infra.OutboxEventPublisher;
import com.firstpay.transaction.infra.TransactionEventStream;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.ReactiveTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Handler d'écriture (CQRS + Event Sourcing). Pour chaque commande, l'écriture est
 * atomique dans UNE transaction SQL ({@code @Transactional}) :
 *   1) mise à jour de la projection « hot » {@code transactions} ;
 *   2) append de l'événement de domaine dans l'event store {@code domain_events}
 *      (source de vérité append-only) ;
 *   3) éventuel événement d'intégration dans {@code outbox_events} (publié sur Kafka).
 *
 * Idempotence à 2 niveaux sur la création : Redis SETNX (rapide) + index DB unique
 * {@code (tenant_id, idempotency_key)} (filet de sécurité fort).
 */
@Service
public class TransactionCommandHandler {

    private static final java.time.Duration IDEMPOTENCY_TTL = java.time.Duration.ofMinutes(10);

    private final TransactionStore store;
    private final ReactiveStringRedisTemplate redis;
    private final OutboxEventPublisher outbox;
    private final EventStore eventStore;
    private final TransactionEventStream events;
    // Transaction SQL programmatique : permet d'envelopper UNIQUEMENT les écritures DB
    // (et de laisser l'idempotence Redis hors transaction, cf. handle/createNew).
    private final TransactionalOperator txOperator;

    public TransactionCommandHandler(TransactionStore store, ReactiveStringRedisTemplate redis,
                                     OutboxEventPublisher outbox, EventStore eventStore,
                                     TransactionEventStream events, ReactiveTransactionManager txManager) {
        this.store = store;
        this.redis = redis;
        this.outbox = outbox;
        this.eventStore = eventStore;
        this.events = events;
        this.txOperator = TransactionalOperator.create(txManager);
    }

    // NB : pas de @Transactional ici — l'idempotence Redis (SETNX) est faite HORS
    // transaction SQL. Tenir une connexion DB pendant l'aller-retour Redis occupait
    // le pool pour rien sous charge (goulot de débit). La transaction n'enveloppe
    // que les écritures DB (cf. createNew).
    public Mono<Transaction> handle(TransactionCommand.CreateTransaction cmd) {
        String key = "idempotency:%s:%s".formatted(cmd.tenantId(), cmd.idempotencyKey());
        return redis.opsForValue()
            .setIfAbsent(key, "processing", IDEMPOTENCY_TTL)
            .flatMap(acquired -> Boolean.TRUE.equals(acquired)
                ? createNew(cmd)
                : existing(cmd));   // rejeu détecté par Redis → renvoie l'existante
    }

    private Mono<Transaction> createNew(TransactionCommand.CreateTransaction cmd) {
        Transaction tx = Transaction.create(
            cmd.tenantId(), cmd.externalRef(), cmd.amount(),
            cmd.currency(), cmd.type(), cmd.method(), cmd.idempotencyKey());
        tx.setMetadata(cmd.metadata());
        String payload = createdPayload(tx); // calculé une seule fois (event store + outbox)

        // La transaction SQL n'enveloppe QUE les 3 écritures (projection + event store +
        // outbox), atomiques ensemble. Redis reste dehors (cf. handle).
        Mono<Transaction> write = store.insert(tx)
            .flatMap(saved -> eventStore.append(saved.getId(), saved.getTenantId(), "TransactionCreated", payload)
                .then(outbox.publish(saved.getId(), saved.getTenantId(), "TransactionCreated", payload))
                .thenReturn(saved))
            .as(txOperator::transactional);

        return write
            // Émission SSE après commit réussi.
            .doOnSuccess(saved -> events.emit(TransactionEvent.created(saved)))
            // Filet : si l'index unique DB rejette le doublon, on renvoie l'existante.
            .onErrorResume(DataIntegrityViolationException.class, e -> existing(cmd));
    }

    /**
     * Traitement explicite (commande {@code ProcessTransaction}). Marque la transaction
     * SUCCESS, journalise {@code TransactionProcessed} dans l'event store et notifie le SSE.
     */
    @Transactional
    public Mono<Transaction> handle(TransactionCommand.ProcessTransaction cmd) {
        return store.findById(cmd.transactionId())
            .filter(tx -> tx.getTenantId().equals(cmd.tenantId()))
            .flatMap(tx -> {
                if (!"PENDING".equals(tx.getStatus())) return Mono.just(tx); // idempotent
                tx.markProcessed();
                return store.updateStatus(tx.getId(), "SUCCESS")
                    .then(eventStore.append(tx.getId(), tx.getTenantId(), "TransactionProcessed", resultPayload(tx)))
                    .doOnSuccess(v -> events.emit(new TransactionEvent(
                        tx.getId(), tx.getTenantId(), "TransactionProcessed", "SUCCESS", tx.getAmount(), Instant.now())))
                    .thenReturn(tx);
            });
    }

    /**
     * Remboursement (commande {@code RefundTransaction}). Autorisé uniquement sur une
     * transaction SUCCESS ; passe la transaction en REFUNDED, journalise
     * {@code TransactionRefunded} (event store) et émet un événement d'intégration outbox.
     */
    @Transactional
    public Mono<Transaction> handle(TransactionCommand.RefundTransaction cmd) {
        return store.findById(cmd.transactionId())
            .filter(tx -> tx.getTenantId().equals(cmd.tenantId()))
            .switchIfEmpty(Mono.error(new IllegalArgumentException("Transaction introuvable pour ce tenant")))
            .flatMap(tx -> {
                if ("REFUNDED".equals(tx.getStatus())) return Mono.just(tx); // idempotent
                if (!"SUCCESS".equals(tx.getStatus()))
                    return Mono.error(new IllegalStateException("Seule une transaction SUCCESS peut être remboursée"));
                BigDecimal refundAmount = cmd.amount() != null ? cmd.amount() : tx.getAmount();
                tx.markRefunded();
                return store.updateStatus(tx.getId(), "REFUNDED")
                    .then(eventStore.append(tx.getId(), tx.getTenantId(), "TransactionRefunded", refundPayload(tx, refundAmount)))
                    .then(outbox.publish(tx.getId(), tx.getTenantId(), "TransactionRefunded", refundPayload(tx, refundAmount)))
                    .doOnSuccess(v -> events.emit(new TransactionEvent(
                        tx.getId(), tx.getTenantId(), "TransactionRefunded", "REFUNDED", refundAmount, Instant.now())))
                    .thenReturn(tx);
            });
    }

    /** Contrat d'événement consommé par payment-service (transactions.created). */
    private static String createdPayload(Transaction t) {
        String method = t.getMethod() == null ? "null" : "\"" + escape(t.getMethod()) + "\"";
        String phone = "";
        if (t.getMetadata() != null && t.getMetadata().get("phone") != null) {
            phone = escape(String.valueOf(t.getMetadata().get("phone")));
        }
        String orderId = escape(t.getExternalRef() != null ? t.getExternalRef() : t.getId().toString());
        return "{\"id\":\"%s\",\"tenantId\":\"%s\",\"amount\":%s,\"currency\":\"%s\",\"method\":%s,\"phone\":\"%s\",\"orderId\":\"%s\"}"
            .formatted(t.getId(), t.getTenantId(), t.getAmount(), t.getCurrency(), method, phone, orderId);
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String resultPayload(Transaction t) {
        return "{\"id\":\"%s\",\"tenantId\":\"%s\",\"status\":\"%s\",\"amount\":%s}"
            .formatted(t.getId(), t.getTenantId(), t.getStatus(), t.getAmount());
    }

    private static String refundPayload(Transaction t, BigDecimal amount) {
        return "{\"id\":\"%s\",\"tenantId\":\"%s\",\"status\":\"REFUNDED\",\"refundAmount\":%s,\"originalAmount\":%s}"
            .formatted(t.getId(), t.getTenantId(), amount, t.getAmount());
    }

    private Mono<Transaction> existing(TransactionCommand.CreateTransaction cmd) {
        return store.findByIdempotencyKey(cmd.tenantId(), cmd.idempotencyKey());
    }
}
