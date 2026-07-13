package com.payhub.application;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApiKeyHasherTest {

    @Test
    void sha256_vecteur_connu() {
        // SHA-256("abc")
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ApiKeyHasher.sha256Hex("abc"));
    }

    @Test
    void longueur_hex_64() {
        assertEquals(64, ApiKeyHasher.sha256Hex("phk_quelconque").length());
    }
}
