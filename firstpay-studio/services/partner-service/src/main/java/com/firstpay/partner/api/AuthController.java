package com.firstpay.partner.api;

import com.firstpay.partner.api.dto.Dtos.ForgotPasswordRequest;
import com.firstpay.partner.infra.EmailService;
import com.firstpay.partner.infra.PartnerStore;
import com.firstpay.partner.infra.PasswordHasher;
import com.firstpay.partner.infra.PublicBaseUrl;
import com.firstpay.security.JwtService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/**
 * Authentification du portail : émet un JWT de session porté par
 * {@code Authorization: Bearer <token>}. Le token contient le tenant et le rôle, et
 * sert de preuve d'identité vérifiée par l'API Gateway (alternative à l'API-key M2M).
 *
 * <p>Login unifié pour TOUS les profils (banque, caisse, partenaires) : email + mot de
 * passe. Le mot de passe est vérifié contre un hash BCrypt ({@code partner_users.password_hash}).
 * Les comptes de démonstration n'ont pas de hash → on accepte alors le mot de passe « demo ».
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final String DEMO_PASSWORD = "demo";

    private final PartnerStore partners;
    private final PasswordHasher passwords;
    private final JwtService jwt;
    private final EmailService email;

    public AuthController(PartnerStore partners, PasswordHasher passwords, JwtService jwt, EmailService email) {
        this.partners = partners;
        this.passwords = passwords;
        this.jwt = jwt;
        this.email = email;
    }

    public record LoginRequest(String email, String password) {}
    public record LoginResponse(String token, String email, String name, String role,
                                String tenantId, String partner, String code, String shortCode,
                                String sector, String partnerType, String tokenType, boolean mustChangePassword) {}

    @PostMapping("/login")
    public Mono<ResponseEntity<LoginResponse>> login(@RequestBody LoginRequest req) {
        if (req == null || req.email() == null || req.email().isBlank()) {
            return Mono.just(ResponseEntity.badRequest().build());
        }
        return partners.findUserForLogin(req.email())
            .filter(u -> passwordValid(req.password(), u.passwordHash()))
            .map(u -> {
                String token = jwt.issue(u.email(), u.tenantId(), u.role(), u.partner(), u.partnerType());
                return ResponseEntity.ok(new LoginResponse(
                    token, u.email(), u.name(), u.role(), u.tenantId(), u.partner(),
                    u.code(), u.shortCode(), u.sector(), u.partnerType(), "Bearer", u.mustChangePassword()));
            })
            .defaultIfEmpty(ResponseEntity.status(HttpStatus.UNAUTHORIZED).build());
    }

    /** Hash présent → BCrypt ; sinon (compte démo) → mot de passe « demo ». */
    private boolean passwordValid(String raw, String hash) {
        if (hash != null && !hash.isBlank()) {
            return raw != null && passwords.matches(raw, hash);
        }
        return raw == null || raw.isBlank() || DEMO_PASSWORD.equals(raw);
    }

    /**
     * "Mot de passe oublié" : réponse TOUJOURS générique (200, corps vide), que l'email
     * corresponde ou non à un compte — pour ne pas permettre d'énumérer les comptes existants.
     * En cas de correspondance (compte actif, tenant actif), un nouveau mot de passe temporaire
     * est généré, envoyé par email, et son changement rendu obligatoire à la prochaine connexion
     * (même mécanisme qu'à la création de partenaire).
     */
    @PostMapping("/mot-de-passe-oublie")
    public Mono<ResponseEntity<Void>> motDePasseOublie(@RequestBody ForgotPasswordRequest req, ServerHttpRequest request) {
        if (req == null || req.email() == null || req.email().isBlank()) {
            return Mono.just(ResponseEntity.ok().build());
        }
        String baseUrl = PublicBaseUrl.fromRequest(request);
        return partners.resetPassword(req.email())
            .flatMap(res -> email.sendPasswordResetEmail(res.email(), res.name(), res.partnerName(), res.tempPassword(), baseUrl))
            .thenReturn(ResponseEntity.ok().<Void>build())
            .defaultIfEmpty(ResponseEntity.ok().build());
    }
}
