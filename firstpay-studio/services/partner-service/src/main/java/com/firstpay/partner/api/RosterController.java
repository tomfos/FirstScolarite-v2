package com.firstpay.partner.api;

import com.firstpay.partner.api.dto.Dtos.RosterImportRequest;
import com.firstpay.partner.api.dto.Dtos.RosterImportResult;
import com.firstpay.partner.api.dto.Dtos.RosterSummaryDto;
import com.firstpay.partner.infra.RosterStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.UUID;

/**
 * Gestion du répertoire d'étudiants d'un partenaire (import du fichier, aperçu, purge).
 * Tenant-scoped via {@code X-Tenant-Id} injecté par la gateway — comme les autres endpoints
 * authentifiés du partner-service.
 */
@RestController
public class RosterController {

    private final RosterStore roster;

    public RosterController(RosterStore roster) {
        this.roster = roster;
    }

    /** Aperçu du répertoire (nombre d'étudiants + établissements distincts). */
    @GetMapping("/api/v1/roster")
    public Mono<RosterSummaryDto> summary(@RequestHeader("X-Tenant-Id") UUID tenantId) {
        return roster.summary(tenantId);
    }

    /** Import du fichier (lignes en-tête -> valeur). `replace=true` remplace le répertoire existant. */
    @PostMapping("/api/v1/roster/import")
    public Mono<RosterImportResult> importRoster(@RequestHeader("X-Tenant-Id") UUID tenantId,
                                                 @RequestBody RosterImportRequest req) {
        return roster.importRows(tenantId, req != null ? req.rows() : null, req != null && req.replace());
    }

    /** Purge complète du répertoire du partenaire. */
    @DeleteMapping("/api/v1/roster")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> clear(@RequestHeader("X-Tenant-Id") UUID tenantId) {
        return roster.deleteAll(tenantId).then();
    }
}
