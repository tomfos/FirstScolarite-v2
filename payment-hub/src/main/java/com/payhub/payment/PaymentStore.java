package com.payhub.payment;

import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.Parameter;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Accès R2DBC à la table {@code payments}. */
@Repository
public class PaymentStore {

    private static final String COLUMNS = """
        id, application_id, reference, method, amount, currency, status, provider_ref,
        payer_msisdn, payer_name, idempotency_key, return_url, metadata::text AS metadata,
        failure_reason, checkout_token, created_at, updated_at
        """;

    private final DatabaseClient db;

    public PaymentStore(DatabaseClient db) {
        this.db = db;
    }

    public Mono<Payment> insert(Payment p) {
        return db.sql("""
                INSERT INTO payments (id, application_id, reference, method, amount, currency, status,
                                      payer_msisdn, payer_name, idempotency_key, return_url, metadata, checkout_token)
                VALUES (:id, :appId, :reference, :method, :amount, :currency, :status,
                        :msisdn, :payerName, :idem, :returnUrl, CAST(:metadata AS JSONB), :checkoutToken)
                """)
            .bind("id", p.id())
            .bind("appId", p.applicationId())
            .bind("reference", str(p.reference()))
            .bind("method", str(p.method()))
            .bind("amount", p.amount())
            .bind("currency", p.currency())
            .bind("status", p.status())
            .bind("msisdn", str(p.payerMsisdn()))
            .bind("payerName", str(p.payerName()))
            .bind("idem", p.idempotencyKey())
            .bind("returnUrl", str(p.returnUrl()))
            .bind("metadata", p.metadata() != null ? p.metadata() : "{}")
            .bind("checkoutToken", str(p.checkoutToken()))
            .fetch().rowsUpdated()
            .then(findById(p.id()));
    }

    public Mono<Payment> findById(UUID id) {
        return db.sql("SELECT " + COLUMNS + " FROM payments WHERE id = :id")
            .bind("id", id).map(PaymentStore::map).one();
    }

    public Mono<Payment> findByIdForApp(UUID id, UUID applicationId) {
        return db.sql("SELECT " + COLUMNS + " FROM payments WHERE id = :id AND application_id = :appId")
            .bind("id", id).bind("appId", applicationId).map(PaymentStore::map).one();
    }

    /** Résolution du checkout : l'id ET le jeton de capacité doivent correspondre. */
    public Mono<Payment> findByIdAndToken(UUID id, String checkoutToken) {
        return db.sql("SELECT " + COLUMNS + " FROM payments WHERE id = :id AND checkout_token = :tok")
            .bind("id", id).bind("tok", checkoutToken).map(PaymentStore::map).one();
    }

    public Mono<Payment> findByIdempotency(UUID applicationId, String key) {
        return db.sql("SELECT " + COLUMNS + " FROM payments WHERE application_id = :appId AND idempotency_key = :key")
            .bind("appId", applicationId).bind("key", key).map(PaymentStore::map).one();
    }

    /** Enregistre le résultat d'une tentative de débit (moyen + statut + réf PSP). */
    public Mono<Payment> applyChargeResult(UUID id, String method, String status,
                                           String providerRef, String failureReason) {
        return db.sql("""
                UPDATE payments SET method = COALESCE(:method, method), status = :status,
                    provider_ref = COALESCE(:providerRef, provider_ref),
                    failure_reason = :failureReason, updated_at = now()
                WHERE id = :id
                """)
            .bind("id", id)
            .bind("method", str(method))
            .bind("status", status)
            .bind("providerRef", str(providerRef))
            .bind("failureReason", str(failureReason))
            .fetch().rowsUpdated()
            .then(findById(id));
    }

    /** Fixe le moyen et le payeur choisis au checkout, avant le débit. */
    public Mono<Payment> setPayerAndMethod(UUID id, String method, String msisdn, String payerName) {
        return db.sql("""
                UPDATE payments SET method = :method, payer_msisdn = :msisdn,
                    payer_name = COALESCE(:payerName, payer_name), updated_at = now()
                WHERE id = :id
                """)
            .bind("id", id)
            .bind("method", str(method))
            .bind("msisdn", str(msisdn))
            .bind("payerName", str(payerName))
            .fetch().rowsUpdated()
            .then(findById(id));
    }

    /** Paiements initiés en attente de confirmation asynchrone (réconciliation). */
    public Flux<Payment> findPendingWithProviderRef() {
        return db.sql("SELECT " + COLUMNS + " FROM payments WHERE status = 'PENDING' AND provider_ref IS NOT NULL")
            .map(PaymentStore::map).all();
    }

    public Flux<Payment> listForApp(UUID applicationId, int limit) {
        return db.sql("SELECT " + COLUMNS + " FROM payments WHERE application_id = :appId ORDER BY created_at DESC LIMIT :limit")
            .bind("appId", applicationId).bind("limit", limit).map(PaymentStore::map).all();
    }

    private static Parameter str(String v) { return Parameter.fromOrEmpty(v, String.class); }

    private static Payment map(Readable row) {
        return new Payment(
            row.get("id", UUID.class),
            row.get("application_id", UUID.class),
            row.get("reference", String.class),
            row.get("method", String.class),
            row.get("amount", BigDecimal.class),
            row.get("currency", String.class),
            row.get("status", String.class),
            row.get("provider_ref", String.class),
            row.get("payer_msisdn", String.class),
            row.get("payer_name", String.class),
            row.get("idempotency_key", String.class),
            row.get("return_url", String.class),
            row.get("metadata", String.class),
            row.get("failure_reason", String.class),
            row.get("checkout_token", String.class),
            row.get("created_at", Instant.class),
            row.get("updated_at", Instant.class)
        );
    }
}
