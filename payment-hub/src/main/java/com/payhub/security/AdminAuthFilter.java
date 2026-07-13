package com.payhub.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;

/**
 * Protège le back-office ({@code /admin/**}) par un jeton statique {@code X-Admin-Token}.
 * En développement, laisser {@code payhub.admin.token} vide désactive le contrôle.
 */
@Component
@Order(5)
public class AdminAuthFilter implements WebFilter {

    private static final String PROTECTED_PREFIX = "/admin/";

    private final String adminToken;

    public AdminAuthFilter(@Value("${payhub.admin.token:}") String adminToken) {
        this.adminToken = adminToken;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        if (!path.startsWith(PROTECTED_PREFIX) || adminToken.isBlank()) {
            return chain.filter(exchange);   // hors admin, ou contrôle désactivé (dev)
        }
        String provided = exchange.getRequest().getHeaders().getFirst("X-Admin-Token");
        if (provided != null && constantTimeEquals(provided, adminToken)) {
            return chain.filter(exchange);
        }
        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
        return exchange.getResponse().setComplete();
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
