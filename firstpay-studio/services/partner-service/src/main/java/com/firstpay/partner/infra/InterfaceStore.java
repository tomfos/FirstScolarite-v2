package com.firstpay.partner.infra;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.firstpay.partner.api.dto.Dtos.*;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.*;

@Repository
public class InterfaceStore {

    private final DatabaseClient db;
    private final ObjectMapper mapper;

    public InterfaceStore(DatabaseClient db, ObjectMapper mapper) {
        this.db = db;
        this.mapper = mapper;
    }

    public Flux<InterfaceDto> listByTenant(UUID tenantId) {
        return db.sql("SELECT * FROM payment_interfaces WHERE tenant_id = :t ORDER BY updated_at DESC")
            .bind("t", tenantId)
            .map(this::mapRow)
            .all()
            .flatMap(this::withFields);
    }

    public Mono<InterfaceDto> findById(UUID tenantId, UUID id) {
        return db.sql("SELECT * FROM payment_interfaces WHERE tenant_id = :t AND id = :id")
            .bind("t", tenantId).bind("id", id)
            .map(this::mapRow).one()
            .flatMap(this::withFields);
    }

    public Mono<InterfaceDto> upsert(UUID tenantId, SaveInterfaceRequest req) {
        UUID id = req.id() != null && !req.id().isBlank()
            ? UUID.fromString(req.id()) : UUID.randomUUID();
        String slug = slugify(req.customSlug() != null && !req.customSlug().isBlank()
            ? req.customSlug() : req.name());

        String presetsJson = toJson(req.presets() != null ? req.presets() : List.of());
        String methodsJson = toJson(req.methods() != null ? req.methods() : defaultMethods());
        String qrJson = toJson(req.qrCodes() != null ? req.qrCodes() : Map.of());

        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                INSERT INTO payment_interfaces (
                  id, tenant_id, name, description, sector, country, slug, custom_slug, status,
                  amount_type, fixed_amount, min_amount, max_amount, currency,
                  presets, multi_select, ref_type, ref_label, ref_format, methods, qr_codes, establishment, updated_at
                ) VALUES (
                  :id, :tenant, :name, :desc, :sector, :country, :slug, :customSlug, :status,
                  :amountType, :fixed, :min, :max, :currency,
                  :presets::jsonb, :multi, :refType, :refLabel, :refFormat, :methods::jsonb, :qr::jsonb, :establishment, now()
                )
                ON CONFLICT (id) DO UPDATE SET
                  name = EXCLUDED.name, description = EXCLUDED.description, sector = EXCLUDED.sector,
                  country = EXCLUDED.country,
                  slug = EXCLUDED.slug, custom_slug = EXCLUDED.custom_slug, status = EXCLUDED.status,
                  amount_type = EXCLUDED.amount_type, fixed_amount = EXCLUDED.fixed_amount,
                  min_amount = EXCLUDED.min_amount, max_amount = EXCLUDED.max_amount,
                  currency = EXCLUDED.currency, presets = EXCLUDED.presets, multi_select = EXCLUDED.multi_select,
                  ref_type = EXCLUDED.ref_type, ref_label = EXCLUDED.ref_label, ref_format = EXCLUDED.ref_format,
                  methods = EXCLUDED.methods, qr_codes = EXCLUDED.qr_codes, establishment = EXCLUDED.establishment,
                  updated_at = now()
                """)
            .bind("id", id).bind("tenant", tenantId)
            .bind("name", req.name())
            .bind("desc", req.description() != null ? req.description() : "")
            .bind("sector", req.sector() != null ? req.sector() : "")
            .bind("country", req.country() != null && !req.country().isBlank() ? req.country() : "CM")
            .bind("slug", slug)
            .bind("customSlug", req.customSlug() != null ? req.customSlug() : slug)
            .bind("status", req.status() != null ? req.status() : "brouillon")
            .bind("amountType", req.amountType() != null ? req.amountType() : "fixed")
            .bind("currency", req.currency() != null ? req.currency() : "XAF")
            .bind("presets", presetsJson)
            .bind("multi", req.multiSelect())
            .bind("refType", req.refType() != null ? req.refType() : "auto")
            .bind("refLabel", req.refLabel() != null ? req.refLabel() : "")
            .bind("refFormat", req.refFormat() != null ? req.refFormat() : "any")
            .bind("methods", methodsJson)
            .bind("qr", qrJson)
            .bind("establishment", req.establishment() != null ? req.establishment().trim() : "");

        // Montants nullables : R2DBC exige bindNull(...) explicite quand la valeur est absente.
        spec = bindAmount(spec, "fixed", req.fixedAmount());
        spec = bindAmount(spec, "min", req.minAmount());
        spec = bindAmount(spec, "max", req.maxAmount());

        return spec
            .fetch().rowsUpdated()
            .then(replaceFields(id, req.customFields()))
            .then(findById(tenantId, id));
    }

    public Mono<Long> delete(UUID tenantId, UUID id) {
        return db.sql("DELETE FROM payment_interfaces WHERE tenant_id = :t AND id = :id")
            .bind("t", tenantId).bind("id", id)
            .fetch().rowsUpdated();
    }

    private Mono<Void> replaceFields(UUID interfaceId, List<InterfaceFieldDto> fields) {
        return db.sql("DELETE FROM interface_fields WHERE interface_id = :id")
            .bind("id", interfaceId).fetch().rowsUpdated()
            .thenMany(Flux.fromIterable(fields != null ? fields : List.<InterfaceFieldDto>of())
                .index()
                .concatMap(tuple -> {
                    InterfaceFieldDto f = tuple.getT2();
                    // Un nouveau champ ajouté dans le Studio a un id client temporaire (« cf-<timestamp> »)
                    // qui n'est PAS un UUID : on lui attribue un UUID serveur au lieu de planter (500).
                    UUID fieldId = toUuidOrRandom(f.id());
                    return db.sql("""
                            INSERT INTO interface_fields (id, interface_id, type, label, required, readonly, options, position)
                            VALUES (:id, :iface, :type, :label, :req, :ro, :opts::jsonb, :pos)
                            """)
                        .bind("id", fieldId)
                        .bind("iface", interfaceId)
                        .bind("type", f.type())
                        .bind("label", f.label())
                        .bind("req", f.required())
                        .bind("ro", f.readonly())
                        .bind("opts", f.options() != null ? toJson(f.options()) : null)
                        .bind("pos", tuple.getT1().intValue())
                        .fetch().rowsUpdated();
                }))
            .then();
    }

    private Mono<InterfaceDto> withFields(InterfaceDto base) {
        return db.sql("SELECT * FROM interface_fields WHERE interface_id = :id ORDER BY position")
            .bind("id", UUID.fromString(base.id()))
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
            .map(fields -> new InterfaceDto(
                base.id(), base.tenantId(), base.name(), base.description(), base.sector(), base.country(),
                base.slug(), base.customSlug(), base.status(), base.tx(), base.collected(),
                base.amountType(), base.fixedAmount(), base.minAmount(), base.maxAmount(), base.currency(),
                base.presets(), base.multiSelect(), base.refType(), base.refLabel(), base.refFormat(),
                fields, base.methods(), base.qrCodes(), base.establishment()
            ));
    }

    private InterfaceDto mapRow(Readable r) {
        return new InterfaceDto(
            r.get("id", UUID.class).toString(),
            r.get("tenant_id", UUID.class).toString(),
            r.get("name", String.class),
            r.get("description", String.class),
            r.get("sector", String.class),
            r.get("country", String.class) != null ? r.get("country", String.class) : "CM",
            r.get("slug", String.class),
            r.get("custom_slug", String.class),
            r.get("status", String.class),
            r.get("tx_count", Long.class) != null ? r.get("tx_count", Long.class) : 0L,
            r.get("collected", BigDecimal.class) != null ? r.get("collected", BigDecimal.class).longValue() : 0L,
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
            parseBoolMap(r.get("qr_codes", String.class)),
            r.get("establishment", String.class) != null ? r.get("establishment", String.class) : ""
        );
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
        if (json == null || json.isBlank()) return defaultMethods();
        try {
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (Exception e) {
            return defaultMethods();
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

    private String toJson(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            return "{}";
        }
    }

    /** UUID à partir d'un id client, ou UUID aléatoire si absent/non-UUID (ex : « cf-172… » du Studio). */
    private static UUID toUuidOrRandom(String id) {
        if (id == null || id.isBlank()) return UUID.randomUUID();
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException e) {
            return UUID.randomUUID();
        }
    }

    private static BigDecimal parseNum(String s) {
        if (s == null || s.isBlank()) return null;
        return new BigDecimal(s);
    }

    /** Lie un montant nullable : bind(valeur) si présent, sinon bindNull (R2DBC l'exige). */
    private static DatabaseClient.GenericExecuteSpec bindAmount(
            DatabaseClient.GenericExecuteSpec spec, String name, String value) {
        BigDecimal n = parseNum(value);
        return n != null ? spec.bind(name, n) : spec.bindNull(name, BigDecimal.class);
    }

    private static String numStr(BigDecimal n) {
        return n != null ? n.stripTrailingZeros().toPlainString() : "";
    }

    private static Map<String, Boolean> defaultMethods() {
        return Map.of("orange", true, "mtn", true, "card", false, "transfer", false);
    }

    private static String slugify(String s) {
        if (s == null || s.isBlank()) return "interface";
        String slug = Normalizer.normalize(s, Normalizer.Form.NFD)
            .toLowerCase()
            .replaceAll("\\p{M}", "")
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("^-|-$", "");
        if (slug.isBlank()) return "interface";
        return slug.length() > 40 ? slug.substring(0, 40) : slug;
    }
}
