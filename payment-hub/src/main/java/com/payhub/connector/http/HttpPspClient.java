package com.payhub.connector.http;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * Petit client HTTP réactif partagé par les connecteurs « génériques » (MPGS, SARA, RTGS…).
 * POST JSON avec en-têtes optionnels, renvoie le corps JSON. Isole les appels PSP réels.
 */
@Component
public class HttpPspClient {

    private final WebClient http;

    public HttpPspClient(WebClient.Builder builder) {
        this.http = builder.build();
    }

    public Mono<JsonNode> postJson(String url, Map<String, Object> body, Map<String, String> headers) {
        WebClient.RequestBodySpec spec = http.post().uri(url).contentType(MediaType.APPLICATION_JSON);
        if (headers != null) headers.forEach(spec::header);
        return spec.bodyValue(body).retrieve().bodyToMono(JsonNode.class);
    }

    /** POST avec authentification Basic (ex. MPGS : merchant.<id> / apiPassword). */
    public Mono<JsonNode> postJsonBasicAuth(String url, String user, String password,
                                            Map<String, Object> body) {
        return http.post().uri(url)
            .headers(h -> h.setBasicAuth(user, password))
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(body)
            .retrieve().bodyToMono(JsonNode.class);
    }

    public Mono<JsonNode> getJson(String url, Map<String, String> headers) {
        WebClient.RequestHeadersSpec<?> spec = http.get().uri(url).accept(MediaType.APPLICATION_JSON);
        if (headers != null) for (var e : headers.entrySet()) spec = spec.header(e.getKey(), e.getValue());
        return spec.retrieve().bodyToMono(JsonNode.class);
    }

    /** Raccourci en-tête Authorization: Bearer. */
    public static Map<String, String> bearer(String token) {
        return Map.of(HttpHeaders.AUTHORIZATION, "Bearer " + token);
    }
}
