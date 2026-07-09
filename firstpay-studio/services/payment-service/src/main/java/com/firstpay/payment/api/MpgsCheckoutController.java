package com.firstpay.payment.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.firstpay.payment.connector.mpgs.MpgsClient;
import com.firstpay.payment.dto.MpgsConfig;
import com.firstpay.payment.dto.PaymentResult;
import com.firstpay.payment.infra.MpgsConfigProvider;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.kafka.sender.KafkaSender;
import reactor.kafka.sender.SenderRecord;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;

/**
 * Hosted Checkout MPGS — endpoints PUBLICS (routés via gateway {@code /public/checkout/**} sans
 * filtre tenant). La création de session (Basic auth marchand) reste 100 % serveur : le navigateur
 * ne reçoit que l'id de session. Le montant provient de la transaction serveur (jamais du navigateur).
 */
@RestController
@RequestMapping("/public/checkout/mpgs")
public class MpgsCheckoutController {

    private static final String TOPIC_OK = "transactions.processed";
    private static final String TOPIC_KO = "transactions.failed";

    private final MpgsConfigProvider config;
    private final MpgsClient mpgs;
    private final WebClient transactions;
    private final KafkaSender<String, String> sender;
    private final ReactiveStringRedisTemplate redis;
    private final ObjectMapper json;

    public MpgsCheckoutController(MpgsConfigProvider config, MpgsClient mpgs,
                                  @Qualifier("transaction") WebClient transactionWebClient,
                                  KafkaSender<String, String> sender,
                                  ReactiveStringRedisTemplate redis, ObjectMapper json) {
        this.config = config;
        this.mpgs = mpgs;
        this.transactions = transactionWebClient;
        this.sender = sender;
        this.redis = redis;
        this.json = json;
    }

    public record SessionRequest(String transactionId, String shortCode, String slug) {}
    public record SessionResponse(String sessionId, String gatewayHost, String checkoutJsUrl,
                                  String merchantId, String mode) {}

    /** Crée la session Hosted Checkout pour une transaction PENDING et renvoie de quoi lancer le paiement. */
    @PostMapping("/session")
    public Mono<SessionResponse> session(@RequestBody SessionRequest req) {
        if (req == null || req.transactionId() == null || req.transactionId().isBlank()) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "transactionId requis"));
        }
        return config.get().flatMap(cfg -> {
            if (!cfg.isReady()) {
                return Mono.error(new ResponseStatusException(HttpStatus.CONFLICT, "Passerelle carte MPGS non configurée"));
            }
            return fetchTx(req.transactionId()).flatMap(tx -> {
                String amount = tx.amount() != null ? tx.amount().toPlainString() : null;
                if (amount == null) {
                    return Mono.error(new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Transaction sans montant"));
                }
                String returnUrl = buildReturnUrl(cfg, req);
                String description = "Paiement " + (tx.reference() != null ? tx.reference() : tx.id());
                return mpgs.createSession(cfg, tx.id(), amount, tx.currency(), description, null, returnUrl)
                    .map(s -> new SessionResponse(s.sessionId(), cfg.host(), cfg.checkoutJsUrl(),
                        cfg.merchantId(), cfg.mode()))
                    .onErrorMap(e -> !(e instanceof ResponseStatusException),
                        e -> new ResponseStatusException(HttpStatus.BAD_GATEWAY, "MPGS : " + e.getMessage()));
            });
        });
    }

    /**
     * URL de retour Mastercard : interroge l'order (statut faisant autorité), finalise la transaction
     * puis redirige le payeur vers la page de confirmation {@code /{shortCode}/{slug}?tx=...}.
     */
    @GetMapping("/return")
    public Mono<ResponseEntity<Void>> returnUrl(@RequestParam("tx") String tx,
                                                @RequestParam(value = "to", required = false) String to) {
        String redirect = "/" + (to == null ? "" : to) + "?tx=" + enc(tx);
        return config.get()
            .flatMap(cfg -> cfg.isReady() ? finalize(cfg, tx) : Mono.empty())
            .onErrorResume(e -> Mono.empty())
            .then(Mono.just(ResponseEntity.status(HttpStatus.FOUND).location(URI.create(redirect)).<Void>build()));
    }

    /** Interroge MPGS et publie le résultat final une seule fois (dédup Redis). */
    private Mono<Void> finalize(MpgsConfig cfg, String tx) {
        return redis.opsForValue().setIfAbsent("mpgs:finalized:" + tx, "1", Duration.ofHours(6))
            .flatMap(first -> Boolean.TRUE.equals(first)
                ? mpgs.retrieveOrderStatus(cfg, tx).flatMap(status -> switch (status) {
                    case "SUCCESS" -> fetchTx(tx).flatMap(t -> publish(t, true, null));
                    case "FAILED" -> fetchTx(tx).flatMap(t -> publish(t, false, "Paiement carte refusé"));
                    default -> releaseGuard(tx); // encore PENDING : on relâche le verrou pour un retour ultérieur
                })
                : Mono.empty());
    }

    private Mono<Void> releaseGuard(String tx) {
        return redis.opsForValue().delete("mpgs:finalized:" + tx).then();
    }

    private Mono<Void> publish(TxView tx, boolean success, String reason) {
        UUID id = UUID.fromString(tx.id());
        UUID tenantId = tx.tenantId() != null ? UUID.fromString(tx.tenantId()) : null;
        PaymentResult result = success
            ? new PaymentResult(id, tenantId, tx.amount(), "SUCCESS", null, null)
            : new PaymentResult(id, tenantId, tx.amount(), "FAILED", reason, null);
        String topic = success ? TOPIC_OK : TOPIC_KO;
        SenderRecord<String, String, UUID> out = SenderRecord.create(
            new ProducerRecord<>(topic, id.toString(), write(result)), id);
        return sender.send(Mono.just(out)).then();
    }

    private Mono<TxView> fetchTx(String txId) {
        return transactions.get().uri("/api/v1/transactions/{id}", txId)
            .retrieve()
            .onStatus(st -> st.value() == 404,
                resp -> Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction introuvable")))
            .bodyToMono(TxView.class)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction introuvable")));
    }

    private static String buildReturnUrl(MpgsConfig cfg, SessionRequest req) {
        String base = cfg.appBaseUrl() == null ? "" : cfg.appBaseUrl().replaceAll("/+$", "");
        String to = enc((req.shortCode() == null ? "" : req.shortCode()) + "/" + (req.slug() == null ? "" : req.slug()));
        return base + "/public/checkout/mpgs/return?tx=" + enc(req.transactionId()) + "&to=" + to;
    }

    private static String enc(String s) { return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8); }

    private String write(PaymentResult r) {
        try { return json.writeValueAsString(r); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    /** Sous-ensemble de la réponse transaction-service utile au checkout MPGS. */
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public record TxView(String id, String tenantId, BigDecimal amount, String currency,
                         String status, String method, String reference) {}
}
