package com.firstpay.partner.infra;

import org.springframework.http.HttpHeaders;
import org.springframework.http.server.reactive.ServerHttpRequest;

import java.net.URI;

/**
 * Dérive l'URL publique de l'application à partir de la requête entrante, afin que les liens
 * envoyés par email pointent toujours vers le domaine réellement utilisé (déploiement SaaS
 * multi-domaines). Équivalent backend du helper {@code payHost()} du frontend.
 *
 * <p>Chaîne réelle : navigateur → nginx → api-gateway → partner-service. nginx conserve le
 * {@code Host} d'origine et la gateway (Spring Cloud Gateway) ajoute les en-têtes
 * {@code X-Forwarded-*} en aval — on lit donc ceux-ci en priorité, le {@code Host} direct
 * ayant été réécrit en {@code partner-service:8080}.</p>
 *
 * <p>Renvoie {@code null} si aucun host exploitable n'est trouvé (l'appelant retombe alors sur
 * la valeur configurée puis sur le défaut applicatif).</p>
 */
public final class PublicBaseUrl {

    private PublicBaseUrl() {}

    public static String fromRequest(ServerHttpRequest request) {
        if (request == null) return null;
        HttpHeaders headers = request.getHeaders();
        URI uri = request.getURI();

        String host = firstToken(headers.getFirst("X-Forwarded-Host"));
        if (isBlank(host)) host = firstToken(headers.getFirst(HttpHeaders.HOST));
        if (isBlank(host)) host = authority(uri);
        if (isBlank(host)) return null;

        String proto = firstToken(headers.getFirst("X-Forwarded-Proto"));
        if (isBlank(proto)) proto = uri.getScheme();
        if (isBlank(proto)) proto = "https";

        return proto + "://" + host;
    }

    /** Premier élément d'un en-tête éventuellement multivalué ("a, b" → "a"). */
    private static String firstToken(String value) {
        if (value == null) return null;
        int comma = value.indexOf(',');
        return (comma >= 0 ? value.substring(0, comma) : value).trim();
    }

    private static String authority(URI uri) {
        if (uri == null || uri.getHost() == null) return null;
        return uri.getPort() > 0 ? uri.getHost() + ":" + uri.getPort() : uri.getHost();
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }
}
