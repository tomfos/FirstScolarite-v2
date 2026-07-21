package com.firstpay.partner.infra;

import com.firstpay.partner.api.dto.Dtos.*;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.UUID;

@Repository
public class MessageStore {

    private final DatabaseClient db;

    public MessageStore(DatabaseClient db) {
        this.db = db;
    }

    public Mono<MessageDto> send(String senderName, SendMessageRequest req) {
        UUID id = UUID.randomUUID();
        boolean broadcast = req.tenantId() == null || req.tenantId().isBlank();
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                INSERT INTO partner_messages (id, tenant_id, subject, body, sender_name)
                VALUES (:id, :tenant, :subject, :body, :sender)
                """)
            .bind("id", id)
            .bind("subject", req.subject())
            .bind("body", req.body())
            .bind("sender", senderName);
        spec = broadcast ? spec.bindNull("tenant", UUID.class) : spec.bind("tenant", UUID.fromString(req.tenantId()));
        return spec.fetch().rowsUpdated().then(findSentById(id));
    }

    /** Vue banque : tout l'historique envoye, avec le nom du destinataire. */
    public Flux<MessageDto> listSent() {
        return db.sql("""
                SELECT m.id, m.tenant_id, m.subject, m.body, m.sender_name, m.created_at, t.name AS partner_name
                FROM partner_messages m LEFT JOIN tenants t ON t.id = m.tenant_id
                ORDER BY m.created_at DESC
                """)
            .map(this::mapSentRow)
            .all();
    }

    /** Vue partenaire : messages qui lui sont destines (cibles ou diffuses), avec l'etat de lecture. */
    public Flux<MessageDto> listForTenant(UUID tenantId) {
        return db.sql("""
                SELECT m.id, m.tenant_id, m.subject, m.body, m.sender_name, m.created_at,
                       (r.reader_tenant_id IS NOT NULL) AS is_read
                FROM partner_messages m
                LEFT JOIN partner_message_reads r ON r.message_id = m.id AND r.reader_tenant_id = :t
                WHERE m.tenant_id = :t OR m.tenant_id IS NULL
                ORDER BY m.created_at DESC
                """)
            .bind("t", tenantId)
            .map(r -> mapRow(r, null, Boolean.TRUE.equals(r.get("is_read", Boolean.class))))
            .all();
    }

    /**
     * Emails des administrateurs partenaire destinataires d'un message : ceux du tenant cible,
     * ou de tous les tenants actifs si diffusion (tenantId null). Utilise par l'envoi d'email
     * best-effort qui accompagne chaque message (voir MessageController).
     */
    public Flux<String> recipientEmails(UUID tenantId) {
        DatabaseClient.GenericExecuteSpec spec = tenantId != null
            ? db.sql("""
                SELECT u.email FROM partner_users u
                WHERE u.role = 'partner_admin' AND u.status = 'active' AND u.tenant_id = :t
                """).bind("t", tenantId)
            : db.sql("""
                SELECT u.email FROM partner_users u
                JOIN tenants t ON t.id = u.tenant_id
                WHERE u.role = 'partner_admin' AND u.status = 'active' AND t.status = 'ACTIVE'
                """);
        return spec.map(r -> r.get("email", String.class)).all();
    }

    public Mono<Long> markRead(UUID messageId, UUID readerTenantId) {
        return db.sql("""
                INSERT INTO partner_message_reads (message_id, reader_tenant_id)
                VALUES (:m, :t) ON CONFLICT (message_id, reader_tenant_id) DO NOTHING
                """)
            .bind("m", messageId).bind("t", readerTenantId)
            .fetch().rowsUpdated();
    }

    private Mono<MessageDto> findSentById(UUID id) {
        return db.sql("""
                SELECT m.id, m.tenant_id, m.subject, m.body, m.sender_name, m.created_at, t.name AS partner_name
                FROM partner_messages m LEFT JOIN tenants t ON t.id = m.tenant_id
                WHERE m.id = :id
                """)
            .bind("id", id)
            .map(this::mapSentRow)
            .one();
    }

    private MessageDto mapSentRow(Readable r) {
        UUID tenantId = r.get("tenant_id", UUID.class);
        String label = tenantId == null ? "Tous les partenaires" : r.get("partner_name", String.class);
        return mapRow(r, label, false);
    }

    private static MessageDto mapRow(Readable r, String targetLabel, boolean read) {
        UUID tenantId = r.get("tenant_id", UUID.class);
        return new MessageDto(
            r.get("id", UUID.class).toString(),
            tenantId != null ? tenantId.toString() : null,
            targetLabel,
            r.get("subject", String.class),
            r.get("body", String.class),
            r.get("sender_name", String.class),
            r.get("created_at", Instant.class).toString(),
            read
        );
    }
}
