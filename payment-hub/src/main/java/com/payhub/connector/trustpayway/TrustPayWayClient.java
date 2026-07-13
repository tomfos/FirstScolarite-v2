package com.payhub.connector.trustpayway;

import com.fasterxml.jackson.databind.JsonNode;
import com.payhub.connector.ChargeResult;
import com.payhub.connector.PaymentAttempt;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

/**
 * Client HTTP TrustPayWay : login (token ~2 h, mis en cache Redis par appId),
 * process-payment (202 → PENDING), get-status (INITIATED / PENDING / FAILED / SUCCESSFUL).
 * Les credentials proviennent du provider ({@code baseUrl}, {@code appId}, {@code secret}).
 */
@Component
public class TrustPayWayClient {

    private static final String TOKEN_KEY_PREFIX = "tpw:access_token:";
    private static final Duration TOKEN_TTL = Duration.ofMinutes(115);

    private final WebClient http;
    private final ReactiveStringRedisTemplate redis;

    public TrustPayWayClient(WebClient.Builder builder, ReactiveStringRedisTemplate redis) {
        this.http = builder.build();
        this.redis = redis;
    }

    /** Initie un paiement mobile money ; renvoie PENDING + transaction_id agrégateur. */
    public Mono<ChargeResult> initiate(PaymentAttempt attempt, String network, Map<String, String> creds) {
        String msisdn = normalizeMsisdn(attempt.payerMsisdn());
        if (msisdn.isBlank()) {
            return Mono.just(ChargeResult.failed("Numéro de téléphone payeur requis"));
        }
        String baseUrl = creds.get("baseUrl");
        String orderId = attempt.paymentId().toString();
        Map<String, Object> body = Map.of(
            "amount", attempt.amount().stripTrailingZeros().toPlainString(),
            "currency", attempt.currency() != null ? attempt.currency() : "XAF",
            "subscriberMsisdn", msisdn,
            "description", attempt.reference() != null ? attempt.reference() : ("Paiement " + orderId),
            "orderId", orderId,
            "verificationToken", orderId,
            "notifUrl", attempt.notifyUrl());

        return token(creds).flatMap(tok -> http.post()
            .uri(baseUrl + "/api/" + network + "/process-payment")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + tok)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve()
            .bodyToMono(JsonNode.class)
            .map(res -> {
                String aggTxId = res.path("data").path("transaction_id").asText(null);
                return (aggTxId == null || aggTxId.isBlank())
                    ? ChargeResult.failed("Réponse TrustPayWay invalide (transaction_id manquant)")
                    : ChargeResult.pending(aggTxId);
            }))
            .onErrorResume(e -> Mono.just(ChargeResult.failed("TrustPayWay : " + e.getMessage())));
    }

    /** Statut normalisé (SUCCESS / PENDING / FAILED) d'une transaction agrégateur. */
    public Mono<ChargeResult> status(String network, String aggregatorTxId, Map<String, String> creds) {
        String baseUrl = creds.get("baseUrl");
        return token(creds).flatMap(tok -> http.get()
            .uri(baseUrl + "/api/" + network + "/get-status/" + aggregatorTxId)
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + tok)
            .accept(MediaType.APPLICATION_JSON)
            .retrieve()
            .bodyToMono(JsonNode.class)
            .map(node -> normalize(node.path("status").asText("PENDING"), aggregatorTxId)))
            .onErrorReturn(ChargeResult.pending(aggregatorTxId));
    }

    static ChargeResult normalize(String raw, String ref) {
        return switch (raw == null ? "" : raw.toUpperCase()) {
            case "SUCCESSFUL", "SUCCESS" -> ChargeResult.success(ref);
            case "FAILED", "REJECTED", "CANCELLED" -> ChargeResult.failed("TrustPayWay : " + raw);
            default -> ChargeResult.pending(ref);   // INITIATED / PENDING
        };
    }

    private Mono<String> token(Map<String, String> creds) {
        String key = TOKEN_KEY_PREFIX + creds.get("appId");
        return redis.opsForValue().get(key)
            .switchIfEmpty(fetchToken(creds).flatMap(t ->
                redis.opsForValue().set(key, t, TOKEN_TTL).thenReturn(t)));
    }

    private Mono<String> fetchToken(Map<String, String> creds) {
        return http.post()
            .uri(creds.get("baseUrl") + "/api/login")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + creds.get("secret"))
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("applicationId", creds.get("appId")))
            .retrieve()
            .bodyToMono(JsonNode.class)
            .map(node -> node.path("access_token").asText())
            .filter(t -> t != null && !t.isBlank())
            .switchIfEmpty(Mono.error(new IllegalStateException("Token TrustPayWay absent")));
    }

    static String normalizeMsisdn(String phone) {
        if (phone == null) return "";
        String digits = phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("237") && digits.length() >= 12) return digits;
        if (digits.length() == 9) return "237" + digits;
        return digits;
    }
}
