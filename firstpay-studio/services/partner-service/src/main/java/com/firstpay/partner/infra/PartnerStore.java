package com.firstpay.partner.infra;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.firstpay.partner.api.dto.Dtos.*;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Repository
public class PartnerStore {

    private final DatabaseClient db;
    private final ObjectMapper mapper;
    private final PasswordHasher passwords;

    public PartnerStore(DatabaseClient db, ObjectMapper mapper, PasswordHasher passwords) {
        this.db = db;
        this.mapper = mapper;
        this.passwords = passwords;
    }

    private static final SecureRandom RNG = new SecureRandom();
    private static final DateTimeFormatter CODE_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    /**
     * Crée un partenaire (tenant) : génère le code, le shortCode et une API-key (hashée
     * en base), insère le tenant + son administrateur + ses paramètres par défaut.
     * Renvoie le partenaire et l'API-key EN CLAIR (à n'afficher qu'une fois).
     */
    @Transactional
    public Mono<CreatePartnerResponse> createPartner(CreatePartnerRequest req) {
        // Le shortCode est rendu GLOBALEMENT unique → garantit l'unicité des liens de paiement
        // (URL = pay.firstpay.cm/{shortCode}/{slug}, slug déjà unique par tenant).
        return uniqueShortCode(deriveShortCode(req.name())).flatMap(shortCode -> {
            UUID tenantId = UUID.randomUUID();
            String code = "FSPAY_" + LocalDateTime.now(ZoneOffset.UTC).format(CODE_FMT) + String.format("%04d", RNG.nextInt(10000));
            String apiKey = "fpk_live_" + randomHex(24);
            String apiKeyHash = sha256(apiKey);
            String tempPassword = passwords.generateTempPassword();
            String passwordHash = passwords.hash(tempPassword);
            String sector = req.sector() != null ? req.sector() : "Autre";
            String partnerType = notBlank(req.partnerType()) ? req.partnerType() : "standard";

            Map<String, Object> cfg = new LinkedHashMap<>();
            cfg.put("shortCode", shortCode);
            cfg.put("sector", sector);
            cfg.put("partnerType", partnerType);
            if (notBlank(req.settlementAccount())) cfg.put("settlementAccount", req.settlementAccount());
            if (notBlank(req.accountHolder())) cfg.put("accountHolder", req.accountHolder());
            if (notBlank(req.settlementBank())) cfg.put("settlementBank", req.settlementBank());
            String config = toJson(cfg);

            Mono<Void> insertTenant = db.sql("""
                    INSERT INTO tenants (id, code, name, status, config, api_key_hash, rate_limit_tpm)
                    VALUES (:id, :code, :name, 'ACTIVE', :config::jsonb, :hash, 5000)
                    """)
                .bind("id", tenantId).bind("code", code).bind("name", req.name())
                .bind("config", config).bind("hash", apiKeyHash)
                .fetch().rowsUpdated().then();

            // Pas de ON CONFLICT ... DO NOTHING ici : on veut que l'échec de création de
            // l'admin (insert à 0 ligne, ex. email déjà pris) remonte et fasse échouer +
            // rollback toute la création, plutôt que de renvoyer un faux succès avec un mot
            // de passe temporaire pour un compte qui n'existe pas.
            Mono<Void> insertAdmin = (req.adminEmail() == null || req.adminEmail().isBlank())
                ? Mono.empty()
                : db.sql("""
                    INSERT INTO partner_users (id, tenant_id, name, email, role, status, password_hash)
                    VALUES (:id, :t, :name, :email, 'partner_admin', 'active', :pwd)
                    """)
                    .bind("id", UUID.randomUUID()).bind("t", tenantId)
                    .bind("name", req.adminName() != null ? req.adminName() : "Administrateur")
                    .bind("email", req.adminEmail())
                    .bind("pwd", passwordHash)
                    .fetch().rowsUpdated()
                    .flatMap(n -> n == 1
                        ? Mono.<Void>empty()
                        : Mono.<Void>error(new IllegalStateException(
                            "Création de l'administrateur du partenaire échouée (email=" + req.adminEmail() + ")")));

            Mono<Void> insertSettings = db.sql("""
                    INSERT INTO partner_settings (tenant_id, brand_color, notifications)
                    VALUES (:t, '#E53935', '{}'::jsonb) ON CONFLICT (tenant_id) DO NOTHING
                    """)
                .bind("t", tenantId).fetch().rowsUpdated().then();

            PartnerDto dto = new PartnerDto(tenantId.toString(), code, shortCode, req.name(), sector, partnerType, "ACTIVE", 0);
            return insertTenant.then(insertAdmin).then(insertSettings)
                .thenReturn(new CreatePartnerResponse(dto, apiKey, req.adminEmail(), tempPassword));
        });
    }

    /** Garantit l'unicité globale du shortCode (suffixe numérique en cas de collision). */
    private Mono<String> uniqueShortCode(String base) {
        return db.sql("SELECT config->>'shortCode' AS sc FROM tenants WHERE config->>'shortCode' LIKE :p")
            .bind("p", base + "%")
            .map(r -> r.get("sc", String.class)).all().collectList()
            .map(existing -> {
                if (!existing.contains(base)) return base;
                int n = 2;
                while (existing.contains(base + n)) n++;
                return base + n;
            });
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    private static String deriveShortCode(String name) {
        String s = name == null ? "" : name.toUpperCase().replaceAll("[^A-Z0-9]", "");
        if (s.isEmpty()) return "P" + randomHex(3).toUpperCase();
        return s.substring(0, Math.min(6, s.length()));
    }

    private static String randomHex(int len) {
        byte[] b = new byte[(len + 1) / 2];
        RNG.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.substring(0, len);
    }

    private static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public Flux<PartnerDto> listPartners() {
        return db.sql("""
                SELECT t.id, t.code, t.name, t.status, t.config,
                       (SELECT count(*) FROM payment_interfaces pi WHERE pi.tenant_id = t.id) AS iface_count
                FROM tenants t WHERE t.status = 'ACTIVE' ORDER BY t.name
                """)
            .map(r -> {
                Map<String, Object> config = parseConfig(r.get("config", String.class));
                return new PartnerDto(
                    r.get("id", UUID.class).toString(),
                    r.get("code", String.class),
                    String.valueOf(config.getOrDefault("shortCode", "")),
                    r.get("name", String.class),
                    String.valueOf(config.getOrDefault("sector", "")),
                    String.valueOf(config.getOrDefault("partnerType", "standard")),
                    r.get("status", String.class),
                    r.get("iface_count", Long.class).intValue()
                );
            }).all();
    }

    /**
     * Recherche un membre par email (tous tenants) pour l'authentification du portail.
     * Renvoie l'utilisateur + le tenant auquel il appartient + le nom du partenaire.
     */
    public Mono<LoginRow> findUserForLogin(String email) {
        return db.sql("""
                SELECT u.id, u.name, u.email, u.role, u.status, u.password_hash,
                       t.id AS tenant_id, t.name AS partner_name, t.code AS tenant_code,
                       t.config->>'shortCode' AS short_code, t.config->>'sector' AS sector,
                       COALESCE(t.config->>'partnerType', 'standard') AS partner_type
                FROM partner_users u
                JOIN tenants t ON t.id = u.tenant_id
                WHERE lower(u.email) = lower(:email) AND u.status = 'active'
                LIMIT 1
                """)
            .bind("email", email)
            .map(r -> new LoginRow(
                r.get("id", UUID.class).toString(),
                r.get("name", String.class),
                r.get("email", String.class),
                r.get("role", String.class),
                r.get("tenant_id", UUID.class).toString(),
                r.get("partner_name", String.class),
                r.get("tenant_code", String.class),
                r.get("short_code", String.class),
                r.get("sector", String.class),
                r.get("partner_type", String.class),
                r.get("password_hash", String.class)
            )).one();
    }

    public record LoginRow(String id, String name, String email, String role, String tenantId,
                           String partner, String code, String shortCode, String sector, String partnerType,
                           String passwordHash) {}

    /** Résout un tenant à partir du hash SHA-256 de son API-key (appel interne de la gateway). */
    public Mono<TenantResolution> resolveByApiKeyHash(String apiKeyHash) {
        return db.sql("""
                SELECT id, code, name, rate_limit_tpm
                FROM tenants
                WHERE api_key_hash = :hash AND status = 'ACTIVE'
                LIMIT 1
                """)
            .bind("hash", apiKeyHash)
            .map(r -> new TenantResolution(
                r.get("id", UUID.class).toString(),
                r.get("code", String.class),
                r.get("name", String.class),
                r.get("rate_limit_tpm", Integer.class)
            )).one();
    }

    public record TenantResolution(String id, String code, String name, int rateLimitTpm) {}

    /** Tenant actif par identifiant (délégation banque → partenaire). */
    public Mono<TenantResolution> findActiveTenant(UUID tenantId) {
        return db.sql("""
                SELECT id, code, name, rate_limit_tpm
                FROM tenants
                WHERE id = :id AND status = 'ACTIVE'
                LIMIT 1
                """)
            .bind("id", tenantId)
            .map(r -> new TenantResolution(
                r.get("id", UUID.class).toString(),
                r.get("code", String.class),
                r.get("name", String.class),
                r.get("rate_limit_tpm", Integer.class)
            )).one();
    }

    /**
     * Suppression douce : passe le tenant hors du statut ACTIVE plutot que de le supprimer en
     * base (transactions/commandes/messages y font reference sans contrainte de cle etrangere
     * a rompre, mais un vrai DELETE romprait aussi la tracabilite). Reutilise le filtre ACTIVE
     * deja en place partout (listPartners, resolution API-key, impersonation) : un partenaire
     * supprime disparait automatiquement de tout ca, sans logique dupliquee.
     */
    public Mono<Long> delete(UUID id) {
        return db.sql("UPDATE tenants SET status = 'SUPPRIME', updated_at = now() WHERE id = :id AND status = 'ACTIVE'")
            .bind("id", id).fetch().rowsUpdated();
    }

    public Mono<Long> updateType(UUID id, String partnerType) {
        return db.sql("UPDATE tenants SET config = jsonb_set(config, '{partnerType}', to_jsonb(:type::text), true), updated_at = now() WHERE id = :id")
            .bind("id", id).bind("type", partnerType)
            .fetch().rowsUpdated();
    }

    /** Hash de mot de passe du compte connecté (tous rôles, table partagée). "" si compte de démo (hash absent). */
    public Mono<String> passwordHashByEmail(String email) {
        return db.sql("SELECT password_hash FROM partner_users WHERE lower(email) = lower(:email) AND status = 'active'")
            .bind("email", email)
            .map(r -> {
                String h = r.get("password_hash", String.class);
                return h != null ? h : "";
            })
            .one();
    }

    public Mono<Long> updatePassword(String email, String newHash) {
        return db.sql("UPDATE partner_users SET password_hash = :h WHERE lower(email) = lower(:email)")
            .bind("h", newHash).bind("email", email)
            .fetch().rowsUpdated();
    }

    public Flux<UserDto> listUsers(UUID tenantId) {
        return db.sql("SELECT * FROM partner_users WHERE tenant_id = :t ORDER BY created_at")
            .bind("t", tenantId)
            .map(r -> new UserDto(
                r.get("id", UUID.class).toString(),
                r.get("name", String.class),
                r.get("email", String.class),
                r.get("role", String.class),
                r.get("status", String.class)
            )).all();
    }

    public Mono<UserDto> upsertUser(UUID tenantId, UserDto user) {
        UUID id = user.id() != null && !user.id().isBlank()
            ? UUID.fromString(user.id()) : UUID.randomUUID();
        return db.sql("""
                INSERT INTO partner_users (id, tenant_id, name, email, role, status)
                VALUES (:id, :t, :name, :email, :role, :status)
                ON CONFLICT (tenant_id, email) DO UPDATE SET
                  name = EXCLUDED.name, role = EXCLUDED.role, status = EXCLUDED.status
                RETURNING *
                """)
            .bind("id", id).bind("t", tenantId)
            .bind("name", user.name()).bind("email", user.email())
            .bind("role", user.role()).bind("status", user.status() != null ? user.status() : "active")
            .map(r -> new UserDto(
                r.get("id", UUID.class).toString(),
                r.get("name", String.class),
                r.get("email", String.class),
                r.get("role", String.class),
                r.get("status", String.class)
            )).one();
    }

    public Mono<Long> deleteUser(UUID tenantId, UUID userId) {
        return db.sql("DELETE FROM partner_users WHERE tenant_id = :t AND id = :id")
            .bind("t", tenantId).bind("id", userId)
            .fetch().rowsUpdated();
    }

    public Mono<SettingsDto> getSettings(UUID tenantId) {
        return db.sql("SELECT * FROM partner_settings WHERE tenant_id = :t")
            .bind("t", tenantId)
            .map(this::mapSettings).one()
            .defaultIfEmpty(new SettingsDto(tenantId.toString(), null, null, "#E53935", Map.of()));
    }

    public Mono<SettingsDto> saveSettings(UUID tenantId, SettingsDto s) {
        return db.sql("""
                INSERT INTO partner_settings (tenant_id, logo_url, logo_name, brand_color, notifications, updated_at)
                VALUES (:t, :logo, :logoName, :color, :notif::jsonb, now())
                ON CONFLICT (tenant_id) DO UPDATE SET
                  logo_url = EXCLUDED.logo_url, logo_name = EXCLUDED.logo_name,
                  brand_color = EXCLUDED.brand_color, notifications = EXCLUDED.notifications, updated_at = now()
                RETURNING *
                """)
            .bind("t", tenantId)
            .bind("logo", s.logoUrl())
            .bind("logoName", s.logoName())
            .bind("color", s.brandColor() != null ? s.brandColor() : "#E53935")
            .bind("notif", toJson(s.notifications() != null ? s.notifications() : Map.of()))
            .map(this::mapSettings).one();
    }

    private SettingsDto mapSettings(Readable r) {
        return new SettingsDto(
            r.get("tenant_id", UUID.class).toString(),
            r.get("logo_url", String.class),
            r.get("logo_name", String.class),
            r.get("brand_color", String.class),
            parseConfig(r.get("notifications", String.class))
        );
    }

    private Map<String, Object> parseConfig(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    private String toJson(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }
}
