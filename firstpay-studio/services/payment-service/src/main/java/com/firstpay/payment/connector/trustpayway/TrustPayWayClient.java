package com.firstpay.payment.connector.trustpayway;

import com.fasterxml.jackson.databind.JsonNode;
import com.firstpay.payment.dto.AggregatorConfig;
import com.firstpay.payment.dto.PaymentResult;
import com.firstpay.payment.dto.TransactionCreatedEvent;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Client HTTP TrustPayWay : login (token 2 h), process-payment (202), get-status
 * (INITIATED / PENDING / FAILED / SUCCESSFUL).
 */
@Service
public class TrustPayWayClient {

    private static final String TOKEN_KEY_PREFIX = "tpw:access_token:";
    private static final Duration TOKEN_TTL = Duration.ofMinutes(115);

    private final WebClient http;
    private final ReactiveStringRedisTemplate redis;
    private final String webhookBase;

    public TrustPayWayClient(@Qualifier("trustpayway") WebClient trustPayWayWebClient,
                             ReactiveStringRedisTemplate redis,
                             @Value("${firstpay.payment.webhook-base:http://localhost:18080/webhooks/trustpayway}") String webhookBase) {
        this.http = trustPayWayWebClient;
        this.redis = redis;
        this.webhookBase = webhookBase;
    }

    public Mono<PaymentResult> initiatePayment(TransactionCreatedEvent event, String network, AggregatorConfig cfg) {
        if (!cfg.isReady()) {
            return Mono.just(PaymentResult.failed(event, "Agrégateur TrustPayWay non configuré"));
        }
        String msisdn = normalizeMsisdn(event.phone());
        if (msisdn.isBlank()) {
            return Mono.just(PaymentResult.failed(event, "Numéro de téléphone payeur requis"));
        }
        String orderId = event.id().toString();

        return token(cfg).flatMap(token -> {
            Map<String, Object> body = Map.of(
                "amount", event.amount().stripTrailingZeros().toPlainString(),
                "currency", event.currency() != null ? event.currency() : "XAF",
                "subscriberMsisdn", msisdn,
                "description", "FirstPay " + orderId,
                "orderId", orderId,
                "verificationToken", event.id().toString(),
                "notifUrl", webhookBase + "/" + network);

            return http.post()
                .uri(cfg.baseUrl() + "/api/" + network + "/process-payment")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .flatMap(res -> {
                    JsonNode data = res.path("data");
                    String aggTxId = data.path("transaction_id").asText(null);
                    if (aggTxId == null || aggTxId.isBlank()) {
                        return Mono.just(PaymentResult.failed(event, "Réponse agrégateur invalide (transaction_id manquant)"));
                    }
                    return Mono.just(PaymentResult.pending(event, aggTxId));
                })
                .onErrorResume(e -> Mono.just(PaymentResult.failed(event, "TrustPayWay : " + e.getMessage())));
        });
    }

    /** Interroge le statut final ou intermédiaire d'une transaction agrégateur. */
    public Mono<String> getStatus(String network, String aggregatorTxId, AggregatorConfig cfg) {
        return token(cfg).flatMap(token ->
            http.get()
                .uri(cfg.baseUrl() + "/api/" + network + "/get-status/" + aggregatorTxId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .bodyToMono(JsonNode.class)
                .map(node -> node.path("status").asText("PENDING"))
                .onErrorReturn("PENDING"));
    }

    private Mono<String> token(AggregatorConfig cfg) {
        // Clé scopée par applicationId : sandbox et production ont des identifiants distincts,
        // donc un token mis en cache pour l'un n'est jamais réutilisé pour l'autre après bascule.
        String key = TOKEN_KEY_PREFIX + cfg.appId();
        return redis.opsForValue().get(key)
            .switchIfEmpty(fetchToken(cfg).flatMap(t -> redis.opsForValue()
                .set(key, t, TOKEN_TTL).thenReturn(t)));
    }

    private Mono<String> fetchToken(AggregatorConfig cfg) {
        return http.post()
            .uri(cfg.baseUrl() + "/api/login")
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + cfg.secret())
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(Map.of("applicationId", cfg.appId()))
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
