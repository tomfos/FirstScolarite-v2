package com.payhub.application;

import com.payhub.crypto.SecretCipher;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.UUID;

/** Accès R2DBC à la table {@code applications}. */
@Repository
public class ApplicationStore {

    private static final String COLUMNS =
        "id, name, slug, api_key_hash, api_secret_hash, status, brand_color, logo_url, return_url, webhook_url, webhook_secret, created_at, updated_at";

    private final DatabaseClient db;
    private final SecretCipher cipher;

    public ApplicationStore(DatabaseClient db, SecretCipher cipher) {
        this.db = db;
        this.cipher = cipher;
    }

    public Mono<Application> insert(Application a) {
        return db.sql("""
                INSERT INTO applications (id, name, slug, api_key_hash, api_secret_hash, status,
                                          brand_color, logo_url, return_url, webhook_url, webhook_secret)
                VALUES (:id, :name, :slug, :keyHash, :secretHash, :status,
                        :brandColor, :logoUrl, :returnUrl, :webhookUrl, :webhookSecret)
                """)
            .bind("id", a.id())
            .bind("name", a.name())
            .bind("slug", a.slug())
            .bind("keyHash", a.apiKeyHash())
            .bind("secretHash", a.apiSecretHash())
            .bind("status", a.status())
            .bind("brandColor", a.brandColor())
            .bind("logoUrl", nullable(a.logoUrl()))
            .bind("returnUrl", nullable(a.returnUrl()))
            .bind("webhookUrl", nullable(a.webhookUrl()))
            .bind("webhookSecret", nullable(a.webhookSecret() == null ? null : cipher.encrypt(a.webhookSecret())))
            .fetch().rowsUpdated()
            .then(findById(a.id()));
    }

    public Mono<Application> findById(UUID id) {
        return db.sql("SELECT " + COLUMNS + " FROM applications WHERE id = :id")
            .bind("id", id).map(this::map).one();
    }

    public Mono<Application> findByApiKeyHash(String hash) {
        return db.sql("SELECT " + COLUMNS + " FROM applications WHERE api_key_hash = :h")
            .bind("h", hash).map(this::map).one();
    }

    public Flux<Application> findAll() {
        return db.sql("SELECT " + COLUMNS + " FROM applications ORDER BY created_at DESC")
            .map(this::map).all();
    }

    /** Met à jour les champs modifiables (jamais les hash via ce chemin). */
    public Mono<Application> update(UUID id, String name, String status, String brandColor,
                                    String logoUrl, String returnUrl, String webhookUrl) {
        return db.sql("""
                UPDATE applications SET
                    name = COALESCE(:name, name),
                    status = COALESCE(:status, status),
                    brand_color = COALESCE(:brandColor, brand_color),
                    logo_url = COALESCE(:logoUrl, logo_url),
                    return_url = COALESCE(:returnUrl, return_url),
                    webhook_url = COALESCE(:webhookUrl, webhook_url),
                    updated_at = now()
                WHERE id = :id
                """)
            .bind("id", id)
            .bind("name", nullable(name))
            .bind("status", nullable(status))
            .bind("brandColor", nullable(brandColor))
            .bind("logoUrl", nullable(logoUrl))
            .bind("returnUrl", nullable(returnUrl))
            .bind("webhookUrl", nullable(webhookUrl))
            .fetch().rowsUpdated()
            .then(findById(id));
    }

    /** Remplace les hash clé/secret (rotation des identifiants). */
    public Mono<Application> updateKeys(UUID id, String apiKeyHash, String apiSecretHash) {
        return db.sql("UPDATE applications SET api_key_hash=:k, api_secret_hash=:s, updated_at=now() WHERE id=:id")
            .bind("id", id).bind("k", apiKeyHash).bind("s", apiSecretHash)
            .fetch().rowsUpdated().then(findById(id));
    }

    public Mono<Long> delete(UUID id) {
        return db.sql("DELETE FROM applications WHERE id = :id").bind("id", id).fetch().rowsUpdated();
    }

    /** Enveloppe une valeur (éventuellement null) en paramètre typé, requis par R2DBC pour lier NULL. */
    private static org.springframework.r2dbc.core.Parameter nullable(String v) {
        return org.springframework.r2dbc.core.Parameter.fromOrEmpty(v, String.class);
    }

    private Application map(Readable row) {
        String encSecret = row.get("webhook_secret", String.class);
        return new Application(
            row.get("id", UUID.class),
            row.get("name", String.class),
            row.get("slug", String.class),
            row.get("api_key_hash", String.class),
            row.get("api_secret_hash", String.class),
            row.get("status", String.class),
            row.get("brand_color", String.class),
            row.get("logo_url", String.class),
            row.get("return_url", String.class),
            row.get("webhook_url", String.class),
            encSecret == null ? null : cipher.decrypt(encSecret),
            row.get("created_at", Instant.class),
            row.get("updated_at", Instant.class)
        );
    }
}
