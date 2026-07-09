package com.firstpay.payment.connector.mpgs;

import com.fasterxml.jackson.databind.JsonNode;
import com.firstpay.payment.dto.MpgsConfig;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/**
 * Client MPGS (Mastercard Payment Gateway Services) — Hosted Checkout.
 * <p>Deux appels serveur, JAMAIS exposés au navigateur (Basic auth marchand) :
 * <ol>
 *   <li>{@code POST /session} (INITIATE_CHECKOUT) → renvoie l'id de session ;</li>
 *   <li>{@code GET /order/{orderId}} → statut faisant autorité après retour du payeur.</li>
 * </ol>
 */
@Service
public class MpgsClient {

    private final WebClient http;

    public MpgsClient(@Qualifier("mpgs") WebClient mpgsWebClient) {
        this.http = mpgsWebClient;
    }

    /** Résultat de la création de session (id transmis au navigateur, successIndicator conservé). */
    public record SessionResult(String sessionId, String successIndicator) {}

    /**
     * Crée une session Hosted Checkout pour la transaction {@code orderId}. Le montant et la devise
     * proviennent de la transaction serveur (jamais du navigateur) ; {@code returnUrl} est l'URL
     * absolue vers laquelle Mastercard redirige le payeur après paiement.
     */
    public Mono<SessionResult> createSession(MpgsConfig cfg, String orderId, String amount, String currency,
                                             String description, String merchantName, String returnUrl) {
        Map<String, Object> body = Map.of(
            "apiOperation", "INITIATE_CHECKOUT",
            "interaction", Map.of(
                "operation", "PURCHASE",
                "merchant", Map.of("name", merchantName == null || merchantName.isBlank() ? cfg.merchantId() : merchantName),
                "returnUrl", returnUrl),
            "order", Map.of(
                "id", orderId,
                "currency", currency == null || currency.isBlank() ? "XAF" : currency,
                "amount", amount,
                "description", description == null || description.isBlank() ? ("Paiement " + orderId) : description));

        return http.post()
            .uri(cfg.merchantApiBase() + "/session")
            .header(HttpHeaders.AUTHORIZATION, basicAuth(cfg))
            .contentType(MediaType.APPLICATION_JSON)
            .accept(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(JsonNode.class)
            .flatMap(res -> {
                String sessionId = res.path("session").path("id").asText(null);
                if (sessionId == null || sessionId.isBlank()) {
                    return Mono.error(new IllegalStateException("MPGS : session.id absent de la réponse"));
                }
                return Mono.just(new SessionResult(sessionId, res.path("successIndicator").asText(null)));
            });
    }

    /**
     * Statut faisant autorité de l'order après retour du payeur. Renvoie {@code SUCCESS} /
     * {@code FAILED} / {@code PENDING} selon le champ {@code result} + le statut de l'order.
     */
    public Mono<String> retrieveOrderStatus(MpgsConfig cfg, String orderId) {
        return http.get()
            .uri(cfg.merchantApiBase() + "/order/" + orderId)
            .header(HttpHeaders.AUTHORIZATION, basicAuth(cfg))
            .accept(MediaType.APPLICATION_JSON)
            .retrieve()
            .bodyToMono(JsonNode.class)
            .map(MpgsClient::mapOrderStatus)
            .onErrorReturn("PENDING");
    }

    /** SUCCESS si result=SUCCESS et order capturé/autorisé ; FAILED si échec explicite ; sinon PENDING. */
    private static String mapOrderStatus(JsonNode order) {
        String result = order.path("result").asText("");
        String status = order.path("status").asText("");
        if ("SUCCESS".equalsIgnoreCase(result)
            && (status.isBlank() || "CAPTURED".equalsIgnoreCase(status) || "AUTHORIZED".equalsIgnoreCase(status))) {
            return "SUCCESS";
        }
        if ("FAILURE".equalsIgnoreCase(result) || "ERROR".equalsIgnoreCase(result)
            || "CANCELLED".equalsIgnoreCase(status) || "DECLINED".equalsIgnoreCase(status)) {
            return "FAILED";
        }
        return "PENDING";
    }

    private static String basicAuth(MpgsConfig cfg) {
        String creds = "merchant." + cfg.merchantId() + ":" + cfg.password();
        return "Basic " + Base64.getEncoder().encodeToString(creds.getBytes(StandardCharsets.UTF_8));
    }
}
