package com.payhub.webhook;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.payhub.application.Application;
import com.payhub.application.ApplicationStore;
import com.payhub.crypto.HmacSigner;
import com.payhub.payment.Payment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Notifie les applications clientes du résultat final d'un paiement, via leur {@code webhook_url}.
 * Chaque appel est signé (HMAC-SHA256 sur le corps, en-tête {@code X-PayHub-Signature}) avec le
 * secret de webhook de l'application. Les échecs sont persistés et ré-essayés (backoff).
 */
@Service
public class OutboundWebhookService {

    private static final Logger log = LoggerFactory.getLogger(OutboundWebhookService.class);
    private static final int MAX_ATTEMPTS = 6;

    private final ApplicationStore applications;
    private final WebhookDeliveryStore deliveries;
    private final ObjectMapper json;
    private final WebClient http;

    public OutboundWebhookService(ApplicationStore applications, WebhookDeliveryStore deliveries,
                                  ObjectMapper json, WebClient.Builder builder) {
        this.applications = applications;
        this.deliveries = deliveries;
        this.json = json;
        this.http = builder.build();
    }

    /** À appeler quand un paiement atteint un statut final. Ne fait rien si l'app n'a pas de webhook. */
    public Mono<Void> onFinal(Payment p) {
        if (!p.isFinal()) return Mono.empty();
        return applications.findById(p.applicationId())
            .filter(app -> app.webhookUrl() != null && !app.webhookUrl().isBlank())
            .flatMap(app -> {
                String payload = payload(p);
                return deliveries.enqueue(p.id(), app.id(), app.webhookUrl(), payload)
                    .flatMap(id -> deliver(id, app, app.webhookUrl(), payload, 0));
            })
            .onErrorResume(e -> { log.warn("Webhook sortant paiement {} : {}", p.id(), e.getMessage()); return Mono.empty(); })
            .then();
    }

    /** Ré-essaie périodiquement les livraisons échouées non expirées. */
    @Scheduled(fixedDelay = 60_000)
    public void retryDue() {
        deliveries.findDue(MAX_ATTEMPTS, 50)
            .flatMap(d -> applications.findById(d.applicationId())
                .flatMap(app -> deliver(d.id(), app, d.url(), d.payload(), d.attempts())), 5)
            .doOnError(e -> log.warn("Retry webhooks : {}", e.getMessage()))
            .subscribeOn(Schedulers.boundedElastic())
            .subscribe();
    }

    private Mono<Void> deliver(long id, Application app, String url, String payload, int attempts) {
        String signature = "sha256=" + HmacSigner.sign(nullSafe(app.webhookSecret()), payload);
        return http.post().uri(url)
            .contentType(MediaType.APPLICATION_JSON)
            .header("X-PayHub-Signature", signature)
            .header("X-PayHub-Delivery", String.valueOf(id))
            .bodyValue(payload)
            .retrieve().toBodilessEntity()
            .then(deliveries.markDelivered(id))
            .onErrorResume(e -> {
                Instant next = Instant.now().plus(backoff(attempts));
                log.info("Webhook {} échoué (essai {}) -> retry à {}", id, attempts + 1, next);
                return deliveries.markFailed(id, e.getMessage(), next);
            });
    }

    private String payload(Payment p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("event", "payment." + p.status().toLowerCase());
        m.put("id", p.id().toString());
        m.put("reference", p.reference());
        m.put("method", p.method());
        m.put("amount", p.amount());
        m.put("currency", p.currency());
        m.put("status", p.status());
        m.put("providerRef", p.providerRef());
        m.put("failureReason", p.failureReason());
        try { return json.writeValueAsString(m); } catch (Exception e) { return "{}"; }
    }

    private static Duration backoff(int attempts) {
        long minutes = (long) Math.min(60, Math.pow(2, Math.min(attempts, 6)));  // 1,2,4,…,60 min
        return Duration.ofMinutes(minutes);
    }

    private static String nullSafe(String s) { return s == null ? "" : s; }
}
