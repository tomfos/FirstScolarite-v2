package com.payhub.crypto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HmacSignerTest {

    @Test
    void vecteur_connu_hmac_sha256() {
        // Vecteur de référence RFC : key="key", data="The quick brown fox jumps over the lazy dog".
        String sig = HmacSigner.sign("key", "The quick brown fox jumps over the lazy dog");
        assertEquals("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8", sig);
    }

    @Test
    void deterministe() {
        assertEquals(HmacSigner.sign("s", "payload"), HmacSigner.sign("s", "payload"));
    }
}
