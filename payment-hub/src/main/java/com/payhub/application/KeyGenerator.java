package com.payhub.application;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Génère les identifiants d'accès d'une application :
 * clé API publique ({@code phk_…}) et secret ({@code phs_…}). Le clair n'est retourné
 * qu'une seule fois, à la création ; seul le hash est persisté.
 */
public final class KeyGenerator {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    private KeyGenerator() {}

    public static String apiKey()        { return "phk_" + token(24); }
    public static String secret()        { return "phs_" + token(32); }
    public static String webhookSecret() { return "phwh_" + token(32); }

    private static String token(int bytes) {
        byte[] buf = new byte[bytes];
        RANDOM.nextBytes(buf);
        return B64.encodeToString(buf);
    }
}
