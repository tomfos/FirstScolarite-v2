package com.payhub.webhook;

import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.r2dbc.core.Parameter;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.UUID;

/** Accès R2DBC aux notifications sortantes (table {@code webhook_deliveries}). */
@Repository
public class WebhookDeliveryStore {

    private final DatabaseClient db;

    public WebhookDeliveryStore(DatabaseClient db) {
        this.db = db;
    }

    public Mono<Long> enqueue(UUID paymentId, UUID applicationId, String url, String payload) {
        return db.sql("""
                INSERT INTO webhook_deliveries (payment_id, application_id, url, payload)
                VALUES (:pid, :appId, :url, CAST(:payload AS JSONB))
                RETURNING id
                """)
            .bind("pid", paymentId).bind("appId", applicationId).bind("url", url).bind("payload", payload)
            .map(r -> r.get("id", Long.class)).one();
    }

    public Mono<Void> markDelivered(long id) {
        return db.sql("UPDATE webhook_deliveries SET status='DELIVERED', attempts=attempts+1, last_error=NULL WHERE id=:id")
            .bind("id", id).fetch().rowsUpdated().then();
    }

    public Mono<Void> markFailed(long id, String error, Instant nextRetryAt) {
        return db.sql("UPDATE webhook_deliveries SET status='FAILED', attempts=attempts+1, last_error=:err, next_retry_at=:next WHERE id=:id")
            .bind("id", id).bind("err", Parameter.fromOrEmpty(error, String.class))
            .bind("next", Parameter.fromOrEmpty(nextRetryAt, Instant.class))
            .fetch().rowsUpdated().then();
    }

    /** Livraisons à ré-essayer (échouées, prochaine tentative due, sous le plafond d'essais). */
    public Flux<Delivery> findDue(int maxAttempts, int limit) {
        return db.sql("""
                SELECT id, payment_id, application_id, url, payload::text AS payload, attempts
                FROM webhook_deliveries
                WHERE status='FAILED' AND attempts < :maxAttempts
                  AND (next_retry_at IS NULL OR next_retry_at <= now())
                ORDER BY id LIMIT :limit
                """)
            .bind("maxAttempts", maxAttempts).bind("limit", limit)
            .map(WebhookDeliveryStore::map).all();
    }

    private static Delivery map(Readable row) {
        return new Delivery(
            row.get("id", Long.class),
            row.get("payment_id", UUID.class),
            row.get("application_id", UUID.class),
            row.get("url", String.class),
            row.get("payload", String.class),
            row.get("attempts", Integer.class));
    }

    public record Delivery(long id, UUID paymentId, UUID applicationId, String url, String payload, int attempts) {}
}
