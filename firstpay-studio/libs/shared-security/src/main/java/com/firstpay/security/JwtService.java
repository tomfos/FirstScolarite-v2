package com.firstpay.security;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Émission et vérification de JWT HS256, sans dépendance externe (HMAC-SHA256 via
 * {@link javax.crypto.Mac}). Utilisé pour les sessions du portail : le token porte
 * {@code sub} (email), {@code tenantId}, {@code role}, {@code partner} et
 * {@code partnerType} (axe de différenciation du partenaire — EMF, etc. — orthogonal
 * au rôle hiérarchique ; vide pour les comptes côté banque).
 *
 * <p>Volontairement minimal (HS256, claims plats string/long) : suffisant pour des
 * sessions de portail signées symétriquement par les services internes. Le secret doit
 * provenir de la configuration (jamais en dur en prod).
 */
public final class JwtService {

    private final byte[] secret;
    private final long ttlSeconds;

    public JwtService(String secret, long ttlSeconds) {
        if (secret == null || secret.length() < 16) {
            throw new IllegalArgumentException("Le secret JWT doit faire au moins 16 caractères");
        }
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
        this.ttlSeconds = ttlSeconds;
    }

    /** Émet un token signé pour la session de portail. */
    public String issue(String subject, String tenantId, String role, String partner, String partnerType) {
        long now = Instant.now().getEpochSecond();
        String header = b64("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", subject);
        claims.put("tenantId", tenantId);
        claims.put("role", role);
        claims.put("partner", partner);
        claims.put("partnerType", partnerType != null ? partnerType : "");
        claims.put("iat", now);
        claims.put("exp", now + ttlSeconds);
        String payload = b64(toJson(claims).getBytes(StandardCharsets.UTF_8));
        String signingInput = header + "." + payload;
        String signature = b64(hmac(signingInput.getBytes(StandardCharsets.UTF_8)));
        return signingInput + "." + signature;
    }

    /**
     * Vérifie la signature et l'expiration, puis renvoie les claims. Lève
     * {@link JwtException} si le token est invalide ou expiré.
     */
    public Claims verify(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) throw new JwtException("Format JWT invalide");
        String signingInput = parts[0] + "." + parts[1];
        String expected = b64(hmac(signingInput.getBytes(StandardCharsets.UTF_8)));
        if (!constantTimeEquals(expected, parts[2])) throw new JwtException("Signature JWT invalide");
        String json = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        Map<String, String> map = parseFlatJson(json);
        long exp = Long.parseLong(map.getOrDefault("exp", "0"));
        if (exp < Instant.now().getEpochSecond()) throw new JwtException("Token expiré");
        return new Claims(map.get("sub"), map.get("tenantId"), map.get("role"), map.get("partner"),
            map.get("partnerType"), exp);
    }

    public record Claims(String subject, String tenantId, String role, String partner, String partnerType, long exp) {}

    public static final class JwtException extends RuntimeException {
        public JwtException(String message) { super(message); }
    }

    private byte[] hmac(byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (Exception e) {
            throw new IllegalStateException("Échec du calcul HMAC", e);
        }
    }

    private static String b64(byte[] data) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int r = 0;
        for (int i = 0; i < a.length(); i++) r |= a.charAt(i) ^ b.charAt(i);
        return r == 0;
    }

    private static String toJson(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (!first) sb.append(',');
            first = false;
            sb.append('"').append(e.getKey()).append("\":");
            Object v = e.getValue();
            if (v instanceof Number) sb.append(v);
            else sb.append('"').append(escape(String.valueOf(v))).append('"');
        }
        return sb.append('}').toString();
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /** Parseur JSON plat (clé->valeur scalaire) suffisant pour les claims émis ici. */
    private static Map<String, String> parseFlatJson(String json) {
        Map<String, String> out = new LinkedHashMap<>();
        String body = json.trim();
        if (body.startsWith("{")) body = body.substring(1);
        if (body.endsWith("}")) body = body.substring(0, body.length() - 1);
        int i = 0, n = body.length();
        while (i < n) {
            while (i < n && (body.charAt(i) == ',' || Character.isWhitespace(body.charAt(i)))) i++;
            if (i >= n || body.charAt(i) != '"') break;
            int keyEnd = body.indexOf('"', i + 1);
            String key = body.substring(i + 1, keyEnd);
            int colon = body.indexOf(':', keyEnd);
            i = colon + 1;
            while (i < n && Character.isWhitespace(body.charAt(i))) i++;
            String value;
            if (body.charAt(i) == '"') {
                int valEnd = body.indexOf('"', i + 1);
                value = body.substring(i + 1, valEnd);
                i = valEnd + 1;
            } else {
                int valEnd = i;
                while (valEnd < n && body.charAt(valEnd) != ',' && body.charAt(valEnd) != '}') valEnd++;
                value = body.substring(i, valEnd).trim();
                i = valEnd;
            }
            out.put(key, value);
        }
        return out;
    }
}
