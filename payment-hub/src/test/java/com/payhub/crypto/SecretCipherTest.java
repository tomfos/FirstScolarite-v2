package com.payhub.crypto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SecretCipherTest {

    // Clé AES-256 de test (32 octets en Base64).
    private final SecretCipher cipher = new SecretCipher("ZGV2LW9ubHktY2hhbmdlLW1lLTMyLWJ5dGVzLWtleSE=");

    @Test
    void round_trip_restitue_le_clair() {
        String secret = "{\"appId\":\"APP123\",\"secret\":\"topsecret-xyz\"}";
        String enc = cipher.encrypt(secret);
        assertNotEquals(secret, enc);
        assertFalse(enc.contains("topsecret"));
        assertEquals(secret, cipher.decrypt(enc));
    }

    @Test
    void chiffrement_non_deterministe() {
        String s = "abc";
        assertNotEquals(cipher.encrypt(s), cipher.encrypt(s), "IV aléatoire => ciphertext différent");
    }

    @Test
    void cle_de_taille_invalide_rejetee() {
        assertThrows(IllegalStateException.class, () -> new SecretCipher("YWJj")); // "abc" -> 3 octets
    }
}
