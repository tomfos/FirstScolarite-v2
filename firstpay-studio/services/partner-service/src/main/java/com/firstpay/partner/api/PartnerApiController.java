package com.firstpay.partner.api;

import com.firstpay.partner.api.dto.Dtos.*;
import com.firstpay.partner.infra.EmailService;
import com.firstpay.partner.infra.InterfaceStore;
import com.firstpay.partner.infra.PartnerStore;
import com.firstpay.partner.infra.PublicBaseUrl;
import com.firstpay.security.JwtService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.UUID;

@RestController
public class PartnerApiController {

    private final InterfaceStore interfaces;
    private final PartnerStore partners;
    private final EmailService email;
    private final JwtService jwt;

    public PartnerApiController(InterfaceStore interfaces, PartnerStore partners,
                                EmailService email, JwtService jwt) {
        this.interfaces = interfaces;
        this.partners = partners;
        this.email = email;
        this.jwt = jwt;
    }

    @GetMapping("/api/v1/partners")
    public Flux<PartnerDto> listPartners() {
        return partners.listPartners();
    }

    /**
     * Création d'un partenaire — réservée à l'administrateur banque. Le rôle est lu dans
     * X-User-Role, injecté par la gateway à partir du JWT vérifié (non falsifiable côté client).
     */
    @PostMapping("/api/v1/partners")
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<CreatePartnerResponse> createPartner(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestBody CreatePartnerRequest req,
            ServerHttpRequest request) {
        if (!"bank_admin".equals(role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul l'administrateur banque peut créer un partenaire"));
        }
        if (req == null || req.name() == null || req.name().isBlank()) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nom du partenaire requis"));
        }
        // Le lien du portail dans l'email suit le domaine réellement utilisé (SaaS multi-domaines).
        String baseUrl = PublicBaseUrl.fromRequest(request);
        return partners.createPartner(req)
            // Envoi best-effort de l'email de connexion (lien + identifiants temporaires).
            .flatMap(res -> email.sendConnectionEmail(
                    res.adminEmail(), req.adminName(), res.partner().name(), res.tempPassword(), baseUrl)
                .thenReturn(res));
    }

    public record ImpersonateResponse(String token, String tenantId, String partner,
                                      String code, String shortCode, String sector, String tokenType) {}

    /**
     * Émet un JWT de délégation (partner_admin) pour qu'un bank_admin ouvre le portail
     * partenaire sans connaître l'API-key M2M.
     */
    @PostMapping("/api/v1/partners/{tenantId}/impersonate")
    public Mono<ImpersonateResponse> impersonate(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User", required = false) String actorEmail,
            @PathVariable UUID tenantId) {
        if (!"bank_admin".equals(role) && !"bank_cashier".equals(role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul le personnel banque peut déléguer sur un partenaire"));
        }
        String subject = actorEmail != null && !actorEmail.isBlank() ? actorEmail : "bank_admin";
        return partners.findActiveTenant(tenantId)
            .flatMap(t -> partners.listPartners()
                .filter(p -> p.id().equals(t.id()))
                .next()
                .defaultIfEmpty(new PartnerDto(t.id(), t.code(), "", t.name(), "", "ACTIVE", 0))
                .map(p -> {
                    String token = jwt.issue(subject, t.id(), "partner_admin", t.name());
                    return new ImpersonateResponse(token, t.id(), t.name(), t.code(),
                        p.shortCode(), p.sector(), "Bearer");
                }))
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Partenaire introuvable")));
    }

    @GetMapping("/api/v1/interfaces")
    public Flux<InterfaceDto> listInterfaces(@RequestHeader("X-Tenant-Id") UUID tenantId) {
        return interfaces.listByTenant(tenantId);
    }

    @GetMapping("/api/v1/interfaces/{id}")
    public Mono<InterfaceDto> getInterface(@RequestHeader("X-Tenant-Id") UUID tenantId, @PathVariable UUID id) {
        return interfaces.findById(tenantId, id);
    }

    @PostMapping("/api/v1/interfaces")
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<InterfaceDto> createInterface(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @Valid @RequestBody SaveInterfaceRequest req) {
        return interfaces.upsert(tenantId, req);
    }

    @PutMapping("/api/v1/interfaces/{id}")
    public Mono<InterfaceDto> updateInterface(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @PathVariable UUID id,
            @Valid @RequestBody SaveInterfaceRequest req) {
        SaveInterfaceRequest withId = new SaveInterfaceRequest(
            id.toString(), req.name(), req.description(), req.sector(), req.customSlug(),
            req.status(), req.amountType(), req.fixedAmount(), req.minAmount(), req.maxAmount(),
            req.currency(), req.presets(), req.multiSelect(), req.refType(), req.refLabel(),
            req.refFormat(), req.customFields(), req.methods(), req.qrCodes()
        );
        return interfaces.upsert(tenantId, withId);
    }

    @DeleteMapping("/api/v1/interfaces/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> deleteInterface(@RequestHeader("X-Tenant-Id") UUID tenantId, @PathVariable UUID id) {
        return interfaces.delete(tenantId, id).then();
    }

    @GetMapping("/api/v1/users")
    public Flux<UserDto> listUsers(@RequestHeader("X-Tenant-Id") UUID tenantId) {
        return partners.listUsers(tenantId);
    }

    @PostMapping("/api/v1/users")
    public Mono<UserDto> upsertUser(@RequestHeader("X-Tenant-Id") UUID tenantId, @RequestBody UserDto user) {
        return partners.upsertUser(tenantId, user);
    }

    @DeleteMapping("/api/v1/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> deleteUser(@RequestHeader("X-Tenant-Id") UUID tenantId, @PathVariable UUID id) {
        return partners.deleteUser(tenantId, id).then();
    }

    @GetMapping("/api/v1/settings")
    public Mono<SettingsDto> getSettings(@RequestHeader("X-Tenant-Id") UUID tenantId) {
        return partners.getSettings(tenantId);
    }

    @PutMapping("/api/v1/settings")
    public Mono<SettingsDto> saveSettings(@RequestHeader("X-Tenant-Id") UUID tenantId, @RequestBody SettingsDto settings) {
        return partners.saveSettings(tenantId, settings);
    }
}
