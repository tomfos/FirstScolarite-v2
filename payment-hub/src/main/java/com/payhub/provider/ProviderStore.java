package com.payhub.provider;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.payhub.crypto.SecretCipher;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.Parameter;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Accès R2DBC à la table {@code providers}. Chiffre/déchiffre les credentials de façon
 * transparente : le reste de l'application ne manipule que du clair.
 */
@Repository
public class ProviderStore {

    private static final String COLUMNS =
        "id, code, label, mode, enabled, credentials, created_at, updated_at";
    private static final TypeReference<Map<String, String>> MAP_TYPE = new TypeReference<>() {};

    private final DatabaseClient db;
    private final SecretCipher cipher;
    private final ObjectMapper json;

    public ProviderStore(DatabaseClient db, SecretCipher cipher, ObjectMapper json) {
        this.db = db;
        this.cipher = cipher;
        this.json = json;
    }

    public Flux<Provider> findAll() {
        return db.sql("SELECT " + COLUMNS + " FROM providers ORDER BY code")
            .map(this::map).all();
    }

    public Mono<Provider> findByCode(String code) {
        return db.sql("SELECT " + COLUMNS + " FROM providers WHERE code = :code")
            .bind("code", code).map(this::map).one();
    }

    /** Met à jour mode/activation/credentials (credentials chiffrés avant persistance). */
    public Mono<Provider> update(String code, String mode, Boolean enabled, Map<String, String> credentials) {
        String encrypted = credentials == null ? null : cipher.encrypt(serialize(credentials));
        return db.sql("""
                UPDATE providers SET
                    mode = COALESCE(:mode, mode),
                    enabled = COALESCE(:enabled, enabled),
                    credentials = COALESCE(:credentials, credentials),
                    updated_at = now()
                WHERE code = :code
                """)
            .bind("code", code)
            .bind("mode", Parameter.fromOrEmpty(mode, String.class))
            .bind("enabled", Parameter.fromOrEmpty(enabled, Boolean.class))
            .bind("credentials", Parameter.fromOrEmpty(encrypted, String.class))
            .fetch().rowsUpdated()
            .then(findByCode(code));
    }

    private Provider map(Readable row) {
        String enc = row.get("credentials", String.class);
        Map<String, String> creds = enc == null ? Map.of() : deserialize(cipher.decrypt(enc));
        return new Provider(
            row.get("id", UUID.class),
            row.get("code", String.class),
            row.get("label", String.class),
            row.get("mode", String.class),
            Boolean.TRUE.equals(row.get("enabled", Boolean.class)),
            creds,
            row.get("created_at", Instant.class),
            row.get("updated_at", Instant.class)
        );
    }

    private String serialize(Map<String, String> m) {
        try { return json.writeValueAsString(m); }
        catch (Exception e) { throw new IllegalStateException("Sérialisation credentials", e); }
    }

    private Map<String, String> deserialize(String s) {
        try { return json.readValue(s, MAP_TYPE); }
        catch (Exception e) { throw new IllegalStateException("Désérialisation credentials", e); }
    }
}
