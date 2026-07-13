package com.payhub.security;

import com.payhub.application.Application;
import org.springframework.web.server.ServerWebExchange;

import java.util.Optional;

/**
 * Porte l'application cliente authentifiée (via clé API) le long du traitement d'une requête.
 * Déposée par {@link ApiKeyAuthFilter} dans les attributs de l'échange ; lue par les contrôleurs
 * exposés aux applications clientes.
 */
public final class ApplicationContext {

    public static final String ATTR = "payhub.application";

    private ApplicationContext() {}

    public static Optional<Application> from(ServerWebExchange exchange) {
        Object v = exchange.getAttributes().get(ATTR);
        return v instanceof Application app ? Optional.of(app) : Optional.empty();
    }

    public static Application require(ServerWebExchange exchange) {
        return from(exchange).orElseThrow(() ->
            new IllegalStateException("Application non authentifiée dans le contexte"));
    }
}
