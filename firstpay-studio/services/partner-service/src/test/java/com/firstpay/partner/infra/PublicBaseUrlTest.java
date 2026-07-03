package com.firstpay.partner.infra;

import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class PublicBaseUrlTest {

    @Test
    void derivesFromForwardedHeadersSetByGateway() {
        var req = MockServerHttpRequest.get("http://partner-service:8080/api/v1/partners")
            .header("X-Forwarded-Proto", "https")
            .header("X-Forwarded-Host", "esign.afbdei.com")
            .build();
        assertEquals("https://esign.afbdei.com", PublicBaseUrl.fromRequest(req));
    }

    @Test
    void takesFirstValueOfMultiValuedForwardedHost() {
        var req = MockServerHttpRequest.get("http://internal/api")
            .header("X-Forwarded-Proto", "https, http")
            .header("X-Forwarded-Host", "portail.acme.cm, gateway:8080")
            .build();
        assertEquals("https://portail.acme.cm", PublicBaseUrl.fromRequest(req));
    }

    @Test
    void fallsBackToHostHeaderWhenNoForwardedHost() {
        var req = MockServerHttpRequest.get("http://ignored/api")
            .header("Host", "recette.acme.cm")
            .build();
        assertEquals("http://recette.acme.cm", PublicBaseUrl.fromRequest(req));
    }

    @Test
    void fallsBackToRequestUriWhenNoHostAtAll() {
        var req = MockServerHttpRequest.get("https://direct.example.com:8443/api").build();
        assertEquals("https://direct.example.com:8443", PublicBaseUrl.fromRequest(req));
    }

    @Test
    void returnsNullForNullRequest() {
        assertNull(PublicBaseUrl.fromRequest(null));
    }
}
