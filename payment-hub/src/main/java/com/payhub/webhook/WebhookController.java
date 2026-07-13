package com.payhub.webhook;

import com.fasterxml.jackson.databind.JsonNode;
import com.payhub.payment.PaymentFinalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * Callbacks asynchrones des PSP (public, sans clé API). Le webhook signale qu'un paiement a
 * évolué ; le Hub re-interroge le PSP pour connaître le statut autoritatif (cf. PaymentFinalizer).
 * Chemin : {@code /webhooks/{provider}/{network}}.
 */
@RestController
@RequestMapping("/webhooks")
public class WebhookController {

    private static final Logger log = LoggerFactory.getLogger(WebhookController.class);

    private final PaymentFinalizer finalizer;

    public WebhookController(PaymentFinalizer finalizer) {
        this.finalizer = finalizer;
    }

    @PostMapping("/{provider}/{network}")
    public Mono<ResponseEntity<String>> onCallback(@PathVariable String provider,
                                                   @PathVariable String network,
                                                   @RequestBody(required = false) JsonNode body) {
        UUID paymentId = extractPaymentId(body);
        log.info("Webhook {} / {} pour paiement {}", provider, network, paymentId);
        if (paymentId == null) {
            return Mono.just(ResponseEntity.ok("ignored"));
        }
        return finalizer.finalizeById(paymentId)
            .thenReturn(ResponseEntity.ok("ok"))
            .onErrorResume(e -> Mono.just(ResponseEntity.ok("ok")));   // toujours 200 : le PSP ne doit pas ré-essayer en boucle
    }

    /** L'{@code orderId}/{@code verificationToken} renvoyé par le PSP est l'id du paiement Hub. */
    private static UUID extractPaymentId(JsonNode body) {
        if (body == null) return null;
        for (String field : new String[]{"orderId", "order_id", "verificationToken", "paymentId"}) {
            String v = body.path(field).asText(null);
            if (v == null && body.has("data")) v = body.path("data").path(field).asText(null);
            if (v != null && !v.isBlank()) {
                try { return UUID.fromString(v); } catch (IllegalArgumentException ignored) { }
            }
        }
        return null;
    }
}
