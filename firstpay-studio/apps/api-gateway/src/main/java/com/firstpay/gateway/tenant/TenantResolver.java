package com.firstpay.gateway.tenant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * Résout le tenant à partir de l'API-key. Chaîne :
 *   1) cache Redis (TTL 5 min) ;
 *   2) partner-service (table {@code tenants}, source de vérité) ;
 *   3) {@link TenantRegistry} uniquement si {@code firstpay.tenant.fallback-enabled=true} (dev).
 */
@Service
public class TenantResolver {

    private static final Logger log = LoggerFactory.getLogger(TenantResolver.class);
    private static final Duration TTL = Duration.ofMinutes(5);
    private static final String CACHE_SEP = "\t";

    private final ReactiveStringRedisTemplate redis;
    private final TenantRegistry registry;
    private final WebClient partnerClient;
    private final String internalToken;
    private final boolean fallbackEnabled;

    public TenantResolver(ReactiveStringRedisTemplate redis, TenantRegistry registry,
                          WebClient.Builder webClientBuilder,
                          @Value("${firstpay.partner-service.url:http://partner-service:8080}") String partnerUrl,
                          @Value("${firstpay.internal-token:}") String internalToken,
                          @Value("${firstpay.tenant.fallback-enabled:false}") boolean fallbackEnabled) {
        this.redis = redis;
        this.registry = registry;
        this.internalToken = internalToken == null ? "" : internalToken;
        this.fallbackEnabled = fallbackEnabled;
        this.partnerClient = webClientBuilder.baseUrl(partnerUrl).build();
    }

    public Mono<TenantInfo> resolve(String apiKey) {
        String hash = ApiKeyHasher.sha256(apiKey);
        String cacheKey = "tenant:apikey:" + hash;
        return redis.opsForValue().get(cacheKey)
            .map(TenantResolver::deserialize)
            .switchIfEmpty(Mono.defer(() -> resolveFromSource(apiKey, hash)
                .flatMap(t -> redis.opsForValue().set(cacheKey, serialize(t), TTL).thenReturn(t))));
    }

    private Mono<TenantInfo> resolveFromSource(String apiKey, String hash) {
        return partnerClient.get()
            .uri("/internal/v1/tenants/by-key-hash/{hash}", hash)
            .headers(h -> { if (!internalToken.isBlank()) h.set("X-Internal-Token", internalToken); })
            .retrieve()
            .bodyToMono(TenantInfo.class)
            .doOnNext(t -> log.debug("Tenant résolu via partner-service : {}", t.code()))
            // 404 = clé réellement inconnue → empty → 401 en aval (auth refusée).
            .onErrorResume(WebClientResponseException.NotFound.class, e -> Mono.empty())
            // Toute autre erreur (timeout, 5xx, connexion) = panne d'infrastructure,
            // PAS une clé invalide : renvoyer 503 (le client peut réessayer) au lieu
            // de 401. Évite les faux échecs d'auth observés sous burst.
            .onErrorResume(e -> {
                log.warn("partner-service indisponible pour résolution tenant : {}", e.getMessage());
                if (fallbackEnabled) return fallback(apiKey);
                return Mono.error(new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "Résolution du tenant temporairement indisponible"));
            })
            .switchIfEmpty(fallbackEnabled ? fallback(apiKey) : Mono.empty());
    }

    private Mono<TenantInfo> fallback(String apiKey) {
        log.debug("Repli in-memory pour clé API (mode dev)");
        return registry.findByApiKey(apiKey).map(Mono::just).orElseGet(Mono::empty);
    }

    private static String serialize(TenantInfo t) {
        return String.join(CACHE_SEP, t.id(), t.code(), t.name().replace(CACHE_SEP, " "), String.valueOf(t.rateLimitTpm()));
    }

    private static TenantInfo deserialize(String s) {
        String[] p = s.split(CACHE_SEP, 4);
        return new TenantInfo(p[0], p[1], p[2], Integer.parseInt(p[3]));
    }
}
