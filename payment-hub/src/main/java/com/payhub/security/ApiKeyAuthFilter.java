package com.payhub.security;

import com.payhub.application.ApiKeyHasher;
import com.payhub.application.ApplicationStore;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

/**
 * Authentifie les requêtes des applications clientes ({@code /api/v1/**}) par clé API.
 *
 * <p>La clé est transmise via l'en-tête {@code X-Api-Key}, hashée en SHA-256 puis résolue
 * en application. L'application est déposée dans le contexte d'échange
 * ({@link ApplicationContext}). L'identité n'est jamais dérivée d'un en-tête fourni par le
 * client — seule la clé secrète fait foi.
 */
@Component
@Order(10)
public class ApiKeyAuthFilter implements WebFilter {

    private static final String PROTECTED_PREFIX = "/api/v1/";

    private final ApplicationStore applications;

    public ApiKeyAuthFilter(ApplicationStore applications) {
        this.applications = applications;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        if (!path.startsWith(PROTECTED_PREFIX)) {
            return chain.filter(exchange);
        }
        String apiKey = exchange.getRequest().getHeaders().getFirst("X-Api-Key");
        if (apiKey == null || apiKey.isBlank()) {
            return unauthorized(exchange, "Clé API manquante (X-Api-Key)");
        }
        return applications.findByApiKeyHash(ApiKeyHasher.sha256Hex(apiKey))
            .flatMap(app -> {
                if (!app.isActive()) {
                    return unauthorized(exchange, "Application suspendue");
                }
                exchange.getAttributes().put(ApplicationContext.ATTR, app);
                return chain.filter(exchange);
            })
            .switchIfEmpty(Mono.defer(() -> unauthorized(exchange, "Clé API invalide")));
    }

    private Mono<Void> unauthorized(ServerWebExchange exchange, String reason) {
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        exchange.getResponse().getHeaders().add("WWW-Authenticate", "ApiKey");
        exchange.getResponse().getHeaders().add("X-Auth-Error", reason);
        return exchange.getResponse().setComplete();
    }
}
