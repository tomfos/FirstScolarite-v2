package com.payhub.connector.sara;

import com.fasterxml.jackson.databind.JsonNode;
import com.payhub.connector.ChargeResult;
import com.payhub.connector.PaymentAttempt;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

/**
 * Client SARA (PAIEMENT WALLET) : login (token Bearer mis en cache Redis),
 * init_wallet_withdrawal (débit du wallet du payeur), getStatus (COMPLETED / PENDING / …).
 * Credentials attendus : {@code baseUrl} (ex. {@code http://host:7003}), {@code username},
 * {@code password}.
 */
@Component
public class SaraClient {

    private static final String TOKEN_KEY_PREFIX = "sara:access_token:";
    private static final Duration TOKEN_TTL = Duration.ofMinutes(25);

    private final WebClient http;
    private final ReactiveStringRedisTemplate redis;

    public SaraClient(WebClient.Builder builder, ReactiveStringRedisTemplate redis) {
        this.http = builder.build();
        this.redis = redis;
    }

    /** Débit du wallet (retrait) : renvoie PENDING, statut final via get-status. */
    public Mono<ChargeResult> initWithdrawal(PaymentAttempt attempt, Map<String, String> creds) {
        String baseUrl = base(creds);
        String externalRef = attempt.paymentId().toString();
        Map<String, Object> body = Map.of(
            "accountNumber", attempt.payerMsisdn() != null ? attempt.payerMsisdn() : "",
            "reason", attempt.reference() != null ? attempt.reference() : ("Paiement " + externalRef),
            "amount", attempt.amount().longValue(),
            "externalReference", externalRef);

        return token(creds).flatMap(tok -> http.post()
            .uri(baseUrl + "/agentms/api/v1/partners/init_wallet_withdrawal")
            .header("Authorization", "Bearer " + tok)
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve().bodyToMono(JsonNode.class)
            .map(res -> {
                String status = res.path("status").asText("PENDING");
                return mapStatus(status, externalRef);
            }))
            .onErrorResume(e -> Mono.just(ChargeResult.failed("SARA : " + e.getMessage())));
    }

    /** Statut d'une transaction par sa référence externe (= id du paiement Hub). */
    public Mono<ChargeResult> status(String externalRef, Map<String, String> creds) {
        String baseUrl = base(creds);
        return token(creds).flatMap(tok -> http.get()
            .uri(baseUrl + "/agentms/api/v1/partners/getStatus/" + externalRef)
            .header("Authorization", "Bearer " + tok)
            .accept(MediaType.APPLICATION_JSON)
            .retrieve().bodyToMono(JsonNode.class)
            .map(res -> mapStatus(res.path("status").asText("PENDING"), externalRef)))
            .onErrorReturn(ChargeResult.pending(externalRef));
    }

    static ChargeResult mapStatus(String raw, String ref) {
        return switch (raw == null ? "" : raw.toUpperCase()) {
            case "COMPLETED", "SUCCESS", "SUCCESSFUL" -> ChargeResult.success(ref);
            case "FAILED", "REJECTED", "CANCELLED", "CANCELED" -> ChargeResult.failed("SARA : " + raw);
            default -> ChargeResult.pending(ref);   // PENDING / PROCESSING / INITIATED
        };
    }

    private Mono<String> token(Map<String, String> creds) {
        String key = TOKEN_KEY_PREFIX + creds.get("username");
        return redis.opsForValue().get(key)
            .switchIfEmpty(login(creds).flatMap(t ->
                redis.opsForValue().set(key, t, TOKEN_TTL).thenReturn(t)));
    }

    private Mono<String> login(Map<String, String> creds) {
        return http.post()
            .uri(base(creds) + "/agentms/api-public/v1/partners/auth/login")
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body(BodyInserters.fromFormData("username", creds.get("username"))
                .with("password", creds.get("password")))
            .retrieve().bodyToMono(JsonNode.class)
            .map(node -> {
                for (String f : new String[]{"access_token", "accessToken", "token"}) {
                    String v = node.path(f).asText(null);
                    if (v == null && node.has("data")) v = node.path("data").path(f).asText(null);
                    if (v != null && !v.isBlank()) return v;
                }
                throw new IllegalStateException("Token SARA absent de la réponse login");
            });
    }

    private static String base(Map<String, String> creds) {
        String b = creds.getOrDefault("baseUrl", "");
        return b.trim().replaceAll("/+$", "");
    }
}
