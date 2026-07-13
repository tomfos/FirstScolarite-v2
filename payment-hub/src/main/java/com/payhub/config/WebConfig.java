package com.payhub.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.config.CorsRegistry;
import org.springframework.web.reactive.config.WebFluxConfigurer;

/**
 * CORS pour l'API cliente et le checkout. Par défaut permissif (dev) ; en production, restreindre
 * via {@code payhub.cors.allowed-origins}. L'appel serveur→serveur (clé API) n'a pas besoin de
 * CORS ; ceci sert aux intégrations navigateur et au checkout hébergé.
 */
@Configuration
public class WebConfig implements WebFluxConfigurer {

    private final String[] allowedOrigins;

    public WebConfig(@Value("${payhub.cors.allowed-origins:*}") String origins) {
        this.allowedOrigins = origins.split("\\s*,\\s*");
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/v1/**")
            .allowedOrigins(allowedOrigins)
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("*");
        registry.addMapping("/checkout/api/**")
            .allowedOrigins(allowedOrigins)
            .allowedMethods("GET", "POST", "OPTIONS")
            .allowedHeaders("*");
    }
}
