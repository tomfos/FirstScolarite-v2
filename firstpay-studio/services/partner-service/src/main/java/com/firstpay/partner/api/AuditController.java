package com.firstpay.partner.api;

import com.firstpay.partner.infra.AuditStore;
import com.firstpay.partner.infra.AuditStore.AuditEntry;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {

    private final AuditStore audit;

    public AuditController(AuditStore audit) { this.audit = audit; }

    @GetMapping
    public Flux<AuditEntry> list(
            @RequestParam(defaultValue = "all") String level,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(defaultValue = "false") boolean archived) {
        return audit.list(level, Math.min(limit, 500), archived);
    }

    /** Archive toutes les entrees actives — administrateur banque uniquement. */
    @PostMapping("/archiver")
    public Mono<Void> archiver(@RequestHeader(value = "X-User-Role", required = false) String role) {
        if (!"bank_admin".equals(role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul l'administrateur banque peut archiver le journal d'audit"));
        }
        return audit.archiveAll().then();
    }

    public record AuditLogRequest(String action, String targetType, String targetId, String partner, String detail) {}

    /** Enregistre un événement d'audit (portail banque / délégation). */
    @PostMapping
    public Mono<Void> log(
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID tenantId,
            @RequestHeader(value = "X-User", required = false) String actorEmail,
            @RequestHeader(value = "X-User-Role", required = false) String actorRole,
            @RequestBody AuditLogRequest req) {
        String email = actorEmail != null ? actorEmail : "system@firstpay.cm";
        String role = actorRole != null ? actorRole : "bank_admin";
        String detail = "{\"partner\":\"" + (req.partner() != null ? req.partner() : "") + "\",\"detail\":\""
            + (req.detail() != null ? req.detail().replace("\"", "'") : "") + "\"}";
        return audit.append(email, role, req.action(), req.targetType(), req.targetId(), tenantId, detail);
    }
}
