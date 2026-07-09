package com.firstpay.transaction.domain;

import com.firstpay.transaction.api.dto.TenantStats;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Accès réactif aux transactions via DatabaseClient (table partitionnée, PK composite).
 * Participe à la transaction R2DBC ouverte par {@code @Transactional} sur le handler.
 */
@Repository
public class TransactionStore {

    private final DatabaseClient db;

    public TransactionStore(DatabaseClient db) { this.db = db; }

    public Mono<Transaction> insert(Transaction t) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                INSERT INTO transactions
                  (id, tenant_id, interface_id, external_ref, amount, currency, status, type, method, idempotency_key, metadata, created_at)
                VALUES (:id, :tenant, :iface, :ref, :amount, :currency, :status, :type, :method, :idem, :metadata::jsonb, :createdAt)
                """)
            .bind("id", t.getId())
            .bind("tenant", t.getTenantId())
            .bind("ref", t.getExternalRef())
            .bind("amount", t.getAmount())
            .bind("currency", t.getCurrency())
            .bind("status", t.getStatus())
            .bind("type", t.getType())
            .bind("idem", t.getIdempotencyKey())
            .bind("createdAt", t.getCreatedAt());
        spec = t.getInterfaceId() != null ? spec.bind("iface", t.getInterfaceId()) : spec.bindNull("iface", UUID.class);
        spec = t.getMethod() != null ? spec.bind("method", t.getMethod()) : spec.bindNull("method", String.class);
        String metadataJson = serializeMetadata(t.getMetadata());
        spec = metadataJson != null ? spec.bind("metadata", metadataJson) : spec.bindNull("metadata", String.class);
        return spec.fetch().rowsUpdated().thenReturn(t);
    }

    /** Met à jour le statut final (SUCCESS/FAILED) suite au traitement Kafka. */
    public Mono<Long> updateStatus(UUID id, String status) {
        return db.sql("UPDATE transactions SET status = :s, processed_at = now() WHERE id = :id")
            .bind("s", status).bind("id", id)
            .fetch().rowsUpdated();
    }

    public Mono<Transaction> findById(UUID id) {
        return db.sql("SELECT * FROM transactions WHERE id = :id LIMIT 1")
            .bind("id", id).map(TransactionStore::map).one();
    }

    public Mono<Transaction> findByIdempotencyKey(UUID tenantId, String key) {
        return db.sql("""
                SELECT * FROM transactions
                WHERE tenant_id = :t AND idempotency_key = :k
                ORDER BY created_at DESC LIMIT 1
                """)
            .bind("t", tenantId).bind("k", key)
            .map(TransactionStore::map).one();
    }

    public Flux<Transaction> recentForTenant(UUID tenantId, int limit) {
        return db.sql("SELECT * FROM transactions WHERE tenant_id = :t ORDER BY created_at DESC LIMIT :n")
            .bind("t", tenantId).bind("n", limit)
            .map(TransactionStore::map).all();
    }

    /** Stats temps réel sur la dernière minute (transactions/minute, taux de succès). */
    public Mono<TenantStats> realtimeStats(UUID tenantId) {
        return db.sql("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE status = 'SUCCESS') AS ok
                FROM transactions
                WHERE tenant_id = :t AND created_at > now() - interval '1 minute'
                """)
            .bind("t", tenantId)
            .map((Readable row) -> {
                long total = num(row.get("total"));
                long ok = num(row.get("ok"));
                double rate = total == 0 ? 0 : Math.round((ok * 1000.0) / total) / 10.0;
                return new TenantStats(total, rate, 0);
            })
            .one()
            .defaultIfEmpty(new TenantStats(0, 0, 0));
    }

    private static long num(Object v) { return v == null ? 0 : ((Number) v).longValue(); }

    /** Sérialise les métadonnées en JSON pour la colonne jsonb ; null si absentes/vides. */
    private static String serializeMetadata(java.util.Map<String, Object> metadata) {
        if (metadata == null || metadata.isEmpty()) return null;
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(metadata);
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static java.util.Map<String, Object> parseMetadata(Object raw) {
        if (raw == null) return null;
        if (raw instanceof java.util.Map<?, ?> m) return (java.util.Map<String, Object>) m;
        if (raw instanceof String s && !s.isBlank()) {
            try {
                return new com.fasterxml.jackson.databind.ObjectMapper()
                    .readValue(s, new com.fasterxml.jackson.core.type.TypeReference<>() {});
            } catch (Exception ignored) { }
        }
        return null;
    }

    private static Transaction map(Readable row) {
        Transaction t = new Transaction();
        t.setId(row.get("id", UUID.class));
        t.setTenantId(row.get("tenant_id", UUID.class));
        t.setInterfaceId(row.get("interface_id", UUID.class));
        t.setExternalRef(row.get("external_ref", String.class));
        t.setAmount(row.get("amount", BigDecimal.class));
        t.setCurrency(row.get("currency", String.class));
        t.setStatus(row.get("status", String.class));
        t.setType(row.get("type", String.class));
        t.setMethod(row.get("method", String.class));
        t.setIdempotencyKey(row.get("idempotency_key", String.class));
        t.setMetadata(parseMetadata(row.get("metadata", String.class)));
        t.setCreatedAt(row.get("created_at", Instant.class));
        t.setProcessedAt(row.get("processed_at", Instant.class));
        return t;
    }
}
