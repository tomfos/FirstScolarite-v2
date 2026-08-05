package com.firstpay.partner.api;

import com.firstpay.partner.infra.PartnerStore;
import com.firstpay.partner.infra.PasswordHasher;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

/**
 * Compte du profil connecté — commun à tous les rôles (bank_admin, bank_cashier,
 * partner_admin/manager/accountant/viewer, tous stockés dans partner_users). Distinct de
 * /api/v1/auth (public, avant authentification) et de /api/v1/users (gestion de l'équipe
 * par un partner_admin) : ici, chacun ne touche qu'à son propre mot de passe.
 */
@RestController
@RequestMapping("/api/v1/account")
public class AccountController {

    private static final String DEMO_PASSWORD = "demo";
    private static final int MIN_LENGTH = 8;

    private final PartnerStore partners;
    private final PasswordHasher passwords;

    public AccountController(PartnerStore partners, PasswordHasher passwords) {
        this.partners = partners;
        this.passwords = passwords;
    }

    public record ChangePasswordRequest(String currentPassword, String newPassword) {}

    @PostMapping("/mot-de-passe")
    public Mono<Void> changerMotDePasse(
            @RequestHeader(value = "X-User", required = false) String email,
            @RequestBody ChangePasswordRequest req) {
        if (email == null || email.isBlank()) {
            return Mono.error(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Session invalide"));
        }
        if (req == null || req.newPassword() == null || req.newPassword().length() < MIN_LENGTH) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Le nouveau mot de passe doit faire au moins " + MIN_LENGTH + " caractères"));
        }
        return partners.passwordHashByEmail(email)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Compte introuvable")))
            .flatMap(hash -> {
                boolean currentOk = !hash.isBlank()
                    ? passwords.matches(req.currentPassword(), hash)
                    : (req.currentPassword() == null || req.currentPassword().isBlank() || DEMO_PASSWORD.equals(req.currentPassword()));
                if (!currentOk) {
                    return Mono.<Void>error(new ResponseStatusException(HttpStatus.FORBIDDEN, "Mot de passe actuel incorrect"));
                }
                return partners.updatePassword(email, passwords.hash(req.newPassword())).then();
            });
    }
}
