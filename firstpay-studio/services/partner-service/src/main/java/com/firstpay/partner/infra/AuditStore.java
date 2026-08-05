package com.firstpay.partner.infra;

import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.UUID;

@Repository
public class AuditStore {

    private final DatabaseClient db;

    public AuditStore(DatabaseClient db) { this.db = db; }

    public Flux<AuditEntry> list(String level, int limit, boolean archived) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                SELECT id, actor_email, actor_role, action, target_type, target_id, tenant_id, detail, occurred_at, archived
                FROM audit_log
                WHERE archived = :archived
                ORDER BY occurred_at DESC
                LIMIT :limit
                """)
            .bind("archived", archived)
            .bind("limit", limit);
        return spec.map(this::map).all()
            .filter(e -> level == null || level.isBlank() || level.equals("all") || level.equals(e.level()));
    }

    /**
     * Archive toutes les entrees actuellement actives (n'efface rien, EF-ADM-03 "infalsifiable" :
     * les entrees restent consultables via le filtre archives, juste sorties de la vue courante).
     */
    public Mono<Long> archiveAll() {
        return db.sql("UPDATE audit_log SET archived = true WHERE archived = false")
            .fetch().rowsUpdated();
    }

    public Mono<Void> append(String actorEmail, String actorRole, String action,
                             String targetType, String targetId, UUID tenantId, String detailJson) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                INSERT INTO audit_log (actor_email, actor_role, action, target_type, target_id, tenant_id, detail)
                VALUES (:email, :role, :action, :tt, :tid, :tenant, :detail::jsonb)
                """)
            .bind("email", actorEmail)
            .bind("role", actorRole)
            .bind("action", action)
            .bind("tt", targetType)
            .bind("tid", targetId)
            .bind("detail", detailJson != null ? detailJson : "{}");
        spec = tenantId != null ? spec.bind("tenant", tenantId) : spec.bindNull("tenant", UUID.class);
        return spec.then();
    }

    private AuditEntry map(Readable r) {
        String action = r.get("action", String.class);
        String detail = r.get("detail", String.class);
        String level = inferLevel(action, detail);
        return new AuditEntry(
            String.valueOf(r.get("id", Long.class)),
            mapKind(action),
            r.get("actor_email", String.class),
            buildTarget(r),
            partnerName(detail),
            formatTs(r.get("occurred_at", Instant.class)),
            level,
            Boolean.TRUE.equals(r.get("archived", Boolean.class))
        );
    }

    private static String inferLevel(String action, String detail) {
        if (action.contains("fail") || action.contains("impersonate")) return "danger";
        if (action.contains("delete") || action.contains("refund")) return "warning";
        return "info";
    }

    private static String mapKind(String action) {
        if (action.startsWith("impersonate")) return "impersonate";
        if (action.startsWith("publish")) return "publish";
        if (action.startsWith("refund")) return "refund";
        if (action.startsWith("delete")) return "delete";
        if (action.startsWith("login_fail")) return "login_fail";
        if (action.startsWith("login")) return "login";
        if (action.startsWith("settings")) return "settings";
        if (action.startsWith("create")) return "create";
        return "settings";
    }

    private static String buildTarget(Readable r) {
        String type = r.get("target_type", String.class);
        String id = r.get("target_id", String.class);
        if (type == null && id == null) return "—";
        return (type != null ? type + " · " : "") + (id != null ? id : "");
    }

    private static String partnerName(String detail) {
        if (detail == null || !detail.contains("partner")) return "—";
        int i = detail.indexOf("\"partner\"");
        if (i < 0) return "—";
        int start = detail.indexOf(':', i) + 2;
        int end = detail.indexOf('"', start);
        return end > start ? detail.substring(start, end) : "—";
    }

    private static String formatTs(Instant ts) {
        if (ts == null) return "—";
        return ts.toString();
    }

    public record AuditEntry(String id, String kind, String actor, String target, String partner, String ts, String level, boolean archived) {}
}
