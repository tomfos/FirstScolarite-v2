package com.firstpay.partner.infra;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.firstpay.partner.api.dto.Dtos.*;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Résolution PUBLIQUE d'une page de paiement à partir de l'URL partagée
 * {@code pay.firstpay.cm/{shortCode}/{slug}}. Aucune notion de tenant authentifié ici :
 * le shortCode (globalement unique) sert de clé d'entrée. On ne renvoie QUE les interfaces
 * {@code status = actif} d'un tenant {@code ACTIVE}. Un brouillon ou un shortCode/slug inconnu
 * → Mono.empty().
 *
 * <p>Deux vues à partir de la MÊME requête :
 * <ul>
 *   <li>{@link #resolve} → {@link PublicCheckoutDto} (sans champ sensible, pour la page payeur) ;</li>
 *   <li>{@link #resolveInternal} → {@link Resolved} (inclut le tenantId, usage serveur uniquement
 *       pour valider le montant puis initier la transaction).</li>
 * </ul>
 */
@Repository
public class PublicCheckoutStore {

    private final DatabaseClient db;
    private final ObjectMapper mapper;

    public PublicCheckoutStore(DatabaseClient db, ObjectMapper mapper) {
        this.db = db;
        this.mapper = mapper;
    }

    /**
     * Vue interne (tenantId inclus) — NE JAMAIS sérialiser telle quelle vers le client public.
     */
    public record Resolved(
        UUID tenantId, String interfaceId, String name, String description, String sector, String slug,
        String amountType, String fixedAmount, String minAmount, String maxAmount, String currency,
        List<PresetDto> presets, boolean multiSelect, String refType, String refLabel, String refFormat,
        List<InterfaceFieldDto> customFields, Map<String, Boolean> methods, PublicMerchantDto merchant
    ) {
        /** Projection public-safe (retire le tenantId). */
        public PublicCheckoutDto toPublic() {
            return new PublicCheckoutDto(
                interfaceId, name, description, sector, slug,
                amountType, fixedAmount, minAmount, maxAmount, currency,
                presets, multiSelect, refType, refLabel, refFormat,
                customFields, methods, merchant);
        }
    }

    public Mono<PublicCheckoutDto> resolve(String shortCode, String slug) {
        return resolveInternal(shortCode, slug).map(Resolved::toPublic);
    }

    /** Résout l'interface active correspondant au couple (shortCode, slug), champs inclus. */
    public Mono<Resolved> resolveInternal(String shortCode, String slug) {
        if (shortCode == null || shortCode.isBlank() || slug == null || slug.isBlank()) {
            return Mono.empty();
        }
        return db.sql("""
                SELECT pi.id, pi.tenant_id, pi.name, pi.description, pi.sector, pi.slug,
                       pi.amount_type, pi.fixed_amount, pi.min_amount, pi.max_amount, pi.currency,
                       pi.presets, pi.multi_select, pi.ref_type, pi.ref_label, pi.ref_format, pi.methods,
                       t.name AS partner_name, t.config->>'shortCode' AS short_code,
                       ps.logo_url AS logo_url, ps.brand_color AS brand_color
                FROM payment_interfaces pi
                JOIN tenants t ON t.id = pi.tenant_id
                LEFT JOIN partner_settings ps ON ps.tenant_id = t.id
                WHERE t.config->>'shortCode' = :sc
                  AND pi.slug = :slug
                  AND pi.status = 'actif'
                  AND t.status = 'ACTIVE'
                """)
            .bind("sc", shortCode)
            .bind("slug", slug)
            .map(this::mapRow)
            .one()
            .flatMap(this::withFields);
    }

    private Resolved mapRow(Readable r) {
        String brandColor = r.get("brand_color", String.class);
        PublicMerchantDto merchant = new PublicMerchantDto(
            r.get("partner_name", String.class),
            r.get("short_code", String.class),
            r.get("logo_url", String.class),
            brandColor != null && !brandColor.isBlank() ? brandColor : "#E53935"
        );
        return new Resolved(
            r.get("tenant_id", UUID.class),
            r.get("id", UUID.class).toString(),
            r.get("name", String.class),
            r.get("description", String.class),
            r.get("sector", String.class),
            r.get("slug", String.class),
            r.get("amount_type", String.class),
            numStr(r.get("fixed_amount", BigDecimal.class)),
            numStr(r.get("min_amount", BigDecimal.class)),
            numStr(r.get("max_amount", BigDecimal.class)),
            r.get("currency", String.class),
            parsePresets(r.get("presets", String.class)),
            Boolean.TRUE.equals(r.get("multi_select", Boolean.class)),
            r.get("ref_type", String.class),
            r.get("ref_label", String.class),
            r.get("ref_format", String.class),
            List.of(),
            parseBoolMap(r.get("methods", String.class)),
            merchant
        );
    }

    /** Charge les champs personnalisés (ordre d'affichage) et les injecte dans la vue. */
    private Mono<Resolved> withFields(Resolved base) {
        return db.sql("SELECT id, type, label, required, readonly, options FROM interface_fields WHERE interface_id = :id ORDER BY position")
            .bind("id", UUID.fromString(base.interfaceId()))
            .map(r -> new InterfaceFieldDto(
                r.get("id", UUID.class).toString(),
                r.get("type", String.class),
                r.get("label", String.class),
                Boolean.TRUE.equals(r.get("required", Boolean.class)),
                Boolean.TRUE.equals(r.get("readonly", Boolean.class)),
                parseOptions(r.get("options", String.class))
            ))
            .all()
            .collectList()
            .map(fields -> new Resolved(
                base.tenantId(), base.interfaceId(), base.name(), base.description(), base.sector(), base.slug(),
                base.amountType(), base.fixedAmount(), base.minAmount(), base.maxAmount(), base.currency(),
                base.presets(), base.multiSelect(), base.refType(), base.refLabel(), base.refFormat(),
                fields, base.methods(), base.merchant()
            ));
    }

    private List<PresetDto> parsePresets(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            List<Map<String, Object>> list = mapper.readValue(json, new TypeReference<>() {});
            return list.stream()
                .map(m -> new PresetDto(
                    ((Number) m.getOrDefault("id", 1)).longValue(),
                    String.valueOf(m.getOrDefault("label", "")),
                    String.valueOf(m.getOrDefault("amount", "")),
                    Boolean.TRUE.equals(m.get("allowPartial")),
                    m.get("minAmount") != null ? String.valueOf(m.get("minAmount")) : ""))
                .toList();
        } catch (Exception e) {
            return List.of();
        }
    }

    private Map<String, Boolean> parseBoolMap(String json) {
        if (json == null || json.isBlank()) return Map.of("orange", true, "mtn", true, "card", false, "transfer", false);
        try {
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return Map.of("orange", true, "mtn", true, "card", false, "transfer", false);
        }
    }

    private List<String> parseOptions(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String numStr(BigDecimal n) {
        return n != null ? n.stripTrailingZeros().toPlainString() : "";
    }
}
