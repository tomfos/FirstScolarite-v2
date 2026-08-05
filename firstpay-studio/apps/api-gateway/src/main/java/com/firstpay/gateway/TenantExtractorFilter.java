package com.firstpay.gateway;

import com.firstpay.gateway.tenant.TenantResolver;
import com.firstpay.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Middleware multi-tenant. Deux modes d'authentification :
 *   1) <b>JWT de portail</b> ({@code Authorization: Bearer ...}) — sessions humaines :
 *      le tenant et le rôle sont lus dans les claims signés (vérifiés par {@link JwtService}) ;
 *   2) <b>API-key</b> ({@code X-API-Key} ou query {@code apiKey}) — accès machine-à-machine :
 *      résolu via {@link TenantResolver} (cache Redis devant la source de vérité).
 *
 * Dans les deux cas, X-Tenant-Id (+ X-Tenant-Rate-Limit, et X-User-Role / X-Partner-Type
 * pour le JWT) sont RÉÉCRITS côté gateway → aucune usurpation possible par le client. 401 sinon.
 */
@Component
public class TenantExtractorFilter implements GatewayFilter {

    private final TenantResolver resolver;
    private final JwtService jwt;
    private final int portalRateLimitTpm;

    public TenantExtractorFilter(TenantResolver resolver, JwtService jwt,
                                 @Value("${firstpay.portal.rate-limit-tpm:6000}") int portalRateLimitTpm) {
        this.resolver = resolver;
        this.jwt = jwt;
        this.portalRateLimitTpm = portalRateLimitTpm;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String authorization = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authorization != null && authorization.startsWith("Bearer ")) {
            return filterWithJwt(exchange, chain, authorization.substring(7).trim());
        }
        return filterWithApiKey(exchange, chain);
    }

    private Mono<Void> filterWithJwt(ServerWebExchange exchange, GatewayFilterChain chain, String token) {
        final JwtService.Claims claims;
        try {
            claims = jwt.verify(token);
        } catch (JwtService.JwtException e) {
            return Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "JWT invalide : " + e.getMessage()));
        }
        ServerHttpRequest mutated = exchange.getRequest().mutate()
            .header("X-Tenant-Id", claims.tenantId())
            .header("X-User-Role", claims.role() != null ? claims.role() : "")
            .header("X-User", claims.subject() != null ? claims.subject() : "")
            .header("X-Partner-Type", claims.partnerType() != null ? claims.partnerType() : "")
            .header("X-Tenant-Rate-Limit", String.valueOf(portalRateLimitTpm))
            .build();
        return chain.filter(exchange.mutate().request(mutated).build());
    }

    private Mono<Void> filterWithApiKey(ServerWebExchange exchange, GatewayFilterChain chain) {
        String apiKey = exchange.getRequest().getHeaders().getFirst("X-API-Key");
        if (apiKey == null || apiKey.isBlank()) {
            apiKey = exchange.getRequest().getQueryParams().getFirst("apiKey");
        }
        if (apiKey == null || apiKey.isBlank()) {
            return Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentification manquante (JWT Bearer ou API key)"));
        }
        return resolver.resolve(apiKey)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "API key invalide")))
            .flatMap(tenant -> {
                ServerHttpRequest mutated = exchange.getRequest().mutate()
                    .header("X-Tenant-Id", tenant.id())
                    .header("X-Tenant-Rate-Limit", String.valueOf(tenant.rateLimitTpm()))
                    .build();
                return chain.filter(exchange.mutate().request(mutated).build());
            });
    }
}
