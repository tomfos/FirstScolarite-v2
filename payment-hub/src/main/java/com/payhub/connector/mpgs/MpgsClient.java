package com.payhub.connector.mpgs;

import com.fasterxml.jackson.databind.JsonNode;
import com.payhub.connector.ChargeResult;
import com.payhub.connector.HostedCheckoutConnector.HostedSession;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * Client MPGS (Mastercard Payment Gateway Services) — Hosted Checkout.
 * <ul>
 *   <li>{@code INITIATE_CHECKOUT} : crée une session (auth Basic {@code merchant.<id>:<password>}).</li>
 *   <li>{@code RETRIEVE_ORDER} : vérifie le résultat de l'ordre au retour du payeur.</li>
 * </ul>
 * Credentials attendus : {@code host} (ex. {@code test-gateway.mastercard.com}),
 * {@code merchantId}, {@code password}, et optionnels {@code apiVersion} (défaut 100),
 * {@code merchantName}, {@code merchantUrl}.
 */
@Component
public class MpgsClient {

    private final WebClient http;

    public MpgsClient(WebClient.Builder builder) {
        this.http = builder.build();
    }

    public Mono<HostedSession> createSession(String orderId, String amount, String currency,
                                             String description, String returnUrl, Map<String, String> creds) {
        String base = baseUrl(creds);
        String merchantId = creds.get("merchantId");
        String url = base + "/api/rest/version/" + version(creds) + "/merchant/" + merchantId + "/session";
        Map<String, Object> body = Map.of(
            "apiOperation", "INITIATE_CHECKOUT",
            "checkoutMode", "WEBSITE",
            "interaction", Map.of(
                "operation", "PURCHASE",
                "merchant", Map.of(
                    "name", creds.getOrDefault("merchantName", merchantId),
                    "url", creds.getOrDefault("merchantUrl", returnUrl)),
                "returnUrl", returnUrl),
            "order", Map.of("id", orderId, "amount", amount,
                "currency", currency != null ? currency : "XAF",
                "description", description != null ? description : ("Order " + orderId)));

        return http.post().uri(url)
            .headers(h -> h.setBasicAuth("merchant." + merchantId, creds.get("password")))
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve().bodyToMono(JsonNode.class)
            .map(res -> new HostedSession("mpgs",
                base + "/static/checkout/checkout.min.js",
                res.path("session").path("id").asText()));
    }

    public Mono<ChargeResult> retrieveOrder(String orderId, Map<String, String> creds) {
        String base = baseUrl(creds);
        String merchantId = creds.get("merchantId");
        String url = base + "/api/rest/version/" + version(creds) + "/merchant/" + merchantId + "/order/" + orderId;
        return http.get().uri(url)
            .headers(h -> h.setBasicAuth("merchant." + merchantId, creds.get("password")))
            .accept(MediaType.APPLICATION_JSON)
            .retrieve().bodyToMono(JsonNode.class)
            .map(res -> interpret(res, orderId))
            .onErrorReturn(ChargeResult.pending(orderId));
    }

    static ChargeResult interpret(JsonNode res, String orderId) {
        String result = res.path("result").asText("");        // SUCCESS | FAILURE | PENDING
        String status = res.path("status").asText("");        // CAPTURED | AUTHORIZED | FAILED | ...
        if ("SUCCESS".equalsIgnoreCase(result)
            && (status.startsWith("CAPTURED") || status.startsWith("AUTHORIZED") || status.startsWith("SUCCESS"))) {
            return ChargeResult.success(orderId);
        }
        if ("FAILURE".equalsIgnoreCase(result) || "FAILED".equalsIgnoreCase(status) || "CANCELLED".equalsIgnoreCase(status)) {
            return ChargeResult.failed("MPGS result=" + result + " status=" + status);
        }
        return ChargeResult.pending(orderId);
    }

    private static String baseUrl(Map<String, String> creds) {
        String host = creds.get("host");
        if (host == null) host = creds.getOrDefault("apiUrl", "");
        host = host.trim().replaceAll("/+$", "");
        return host.startsWith("http") ? host : "https://" + host;
    }

    private static String version(Map<String, String> creds) {
        String v = creds.get("apiVersion");
        return (v == null || v.isBlank()) ? "100" : v.trim();
    }
}
