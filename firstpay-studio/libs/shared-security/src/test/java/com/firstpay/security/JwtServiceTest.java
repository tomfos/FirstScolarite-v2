package com.firstpay.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private final JwtService jwt = new JwtService("firstpay-dev-secret-change-me-please-32b", 3600);

    @Test
    void issueThenVerify_roundTripsClaims() {
        String token = jwt.issue("jospin@softtech.cm", "11111111-1111-1111-1111-111111111111", "partner_admin", "SOFT TECHNOLOGIES", "emf");
        JwtService.Claims c = jwt.verify(token);
        assertEquals("jospin@softtech.cm", c.subject());
        assertEquals("11111111-1111-1111-1111-111111111111", c.tenantId());
        assertEquals("partner_admin", c.role());
        assertEquals("SOFT TECHNOLOGIES", c.partner());
        assertEquals("emf", c.partnerType());
    }

    @Test
    void issueThenVerify_blankPartnerType_roundTripsAsEmpty() {
        String token = jwt.issue("admin.banque@afrilandfirstbank.com", "t0", "bank_admin", "Afriland First Bank", null);
        JwtService.Claims c = jwt.verify(token);
        assertEquals("", c.partnerType());
    }

    @Test
    void tamperedSignature_isRejected() {
        String token = jwt.issue("a@b.cm", "t1", "partner_viewer", "ACME", "");
        String tampered = token.substring(0, token.length() - 2) + "xy";
        assertThrows(JwtService.JwtException.class, () -> jwt.verify(tampered));
    }

    @Test
    void wrongSecret_isRejected() {
        String token = jwt.issue("a@b.cm", "t1", "partner_viewer", "ACME", "");
        JwtService other = new JwtService("a-totally-different-secret-of-32-bytes!", 3600);
        assertThrows(JwtService.JwtException.class, () -> other.verify(token));
    }

    @Test
    void expiredToken_isRejected() throws InterruptedException {
        JwtService shortLived = new JwtService("firstpay-dev-secret-change-me-please-32b", 0);
        String token = shortLived.issue("a@b.cm", "t1", "partner_viewer", "ACME", "");
        Thread.sleep(1100);
        assertThrows(JwtService.JwtException.class, () -> shortLived.verify(token));
    }
}
