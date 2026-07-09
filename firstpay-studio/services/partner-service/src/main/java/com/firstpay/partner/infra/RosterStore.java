package com.firstpay.partner.infra;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.firstpay.partner.api.dto.Dtos.RosterImportResult;
import com.firstpay.partner.api.dto.Dtos.RosterSummaryDto;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Répertoire des étudiants importés (matricule -> attributs). Accès R2DBC, SQL écrit à la main,
 * dans le style des autres stores du service.
 *
 * <p>Les clés du JSONB {@code data} sont NORMALISÉES (minuscule, sans accent, alphanumériques)
 * via {@link #norm(String)}. Le rapprochement avec un champ du formulaire payeur se fait sur le
 * libellé du champ normalisé de la même manière, si bien qu'un champ « Prénom » retrouve la
 * colonne « prénom »/« Prenom » du fichier importé.
 */
@Repository
public class RosterStore {

    private final DatabaseClient db;
    private final ObjectMapper mapper;

    public RosterStore(DatabaseClient db, ObjectMapper mapper) {
        this.db = db;
        this.mapper = mapper;
    }

    /**
     * Recherche un matricule dans le répertoire d'un partenaire. Quand {@code establishment} est
     * renseigné, la recherche est LIMITÉE à cet établissement (exigence métier). Renvoie la carte
     * des attributs (clés normalisées) ou {@code Mono.empty()} si le matricule est introuvable.
     */
    public Mono<Map<String, String>> findByMatricule(UUID tenantId, String establishment, String matricule) {
        if (matricule == null || matricule.isBlank()) return Mono.empty();
        boolean scoped = establishment != null && !establishment.isBlank();
        String sql = "SELECT data FROM student_roster WHERE tenant_id = :t AND matricule = :m"
            + (scoped ? " AND etablissement = :e" : "");
        DatabaseClient.GenericExecuteSpec spec = db.sql(sql)
            .bind("t", tenantId)
            .bind("m", matricule.trim());
        if (scoped) spec = spec.bind("e", establishment.trim());
        return spec.map((Readable r) -> parseData(r.get("data", String.class)))
            .one();
    }

    /**
     * Importe des lignes (en-tête -> valeur). Chaque ligne doit porter un « matricule » (après
     * normalisation) sinon elle est ignorée. Upsert par (tenant, matricule). {@code replace}
     * vide d'abord le répertoire du partenaire.
     */
    public Mono<RosterImportResult> importRows(UUID tenantId, List<Map<String, String>> rows, boolean replace) {
        List<Map<String, String>> normalized = new ArrayList<>();
        int skipped = 0;
        for (Map<String, String> raw : rows != null ? rows : List.<Map<String, String>>of()) {
            Map<String, String> data = new LinkedHashMap<>();
            for (Map.Entry<String, String> e : raw.entrySet()) {
                String key = norm(e.getKey());
                if (!key.isEmpty() && e.getValue() != null) data.put(key, e.getValue().trim());
            }
            String matricule = data.get("matricule");
            if (matricule == null || matricule.isBlank()) { skipped++; continue; }
            normalized.add(data);
        }
        final int skippedFinal = skipped;

        Mono<Void> clear = replace
            ? db.sql("DELETE FROM student_roster WHERE tenant_id = :t").bind("t", tenantId).fetch().rowsUpdated().then()
            : Mono.empty();

        return clear
            .thenMany(Flux.fromIterable(normalized).concatMap(data -> upsertRow(tenantId, data)))
            .then(count(tenantId))
            .map(total -> new RosterImportResult(normalized.size(), skippedFinal, total));
    }

    private Mono<Long> upsertRow(UUID tenantId, Map<String, String> data) {
        return db.sql("""
                INSERT INTO student_roster (tenant_id, matricule, etablissement, data, updated_at)
                VALUES (:t, :m, :e, :data::jsonb, now())
                ON CONFLICT (tenant_id, matricule) DO UPDATE SET
                  etablissement = EXCLUDED.etablissement, data = EXCLUDED.data, updated_at = now()
                """)
            .bind("t", tenantId)
            .bind("m", data.get("matricule"))
            .bind("e", data.getOrDefault("etablissement", ""))
            .bind("data", toJson(data))
            .fetch().rowsUpdated();
    }

    public Mono<Long> count(UUID tenantId) {
        return db.sql("SELECT COUNT(*) AS n FROM student_roster WHERE tenant_id = :t")
            .bind("t", tenantId)
            .map((Readable r) -> r.get("n", Long.class))
            .one();
    }

    public Mono<RosterSummaryDto> summary(UUID tenantId) {
        Mono<Long> total = count(tenantId);
        Mono<List<String>> etabs = db.sql("""
                SELECT DISTINCT etablissement FROM student_roster
                WHERE tenant_id = :t AND etablissement IS NOT NULL AND etablissement <> ''
                ORDER BY etablissement
                """)
            .bind("t", tenantId)
            .map((Readable r) -> r.get("etablissement", String.class))
            .all().collectList();
        return Mono.zip(total, etabs).map(tp -> new RosterSummaryDto(tp.getT1(), tp.getT2()));
    }

    public Mono<Long> deleteAll(UUID tenantId) {
        return db.sql("DELETE FROM student_roster WHERE tenant_id = :t")
            .bind("t", tenantId).fetch().rowsUpdated();
    }

    /* ----------------------------- helpers ----------------------------- */

    private Map<String, String> parseData(String json) {
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

    /** Minuscule, sans accent, alphanumériques uniquement. DOIT rester identique côté payeur (app.js). */
    static String norm(String s) {
        if (s == null) return "";
        String n = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return n.toLowerCase().replaceAll("[^a-z0-9]", "").trim();
    }
}
