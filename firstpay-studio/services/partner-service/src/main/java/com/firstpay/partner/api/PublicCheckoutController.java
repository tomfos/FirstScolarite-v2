package com.firstpay.partner.api;

import com.firstpay.partner.api.dto.Dtos.PublicCheckoutDto;
import com.firstpay.partner.api.dto.Dtos.PublicPayRequest;
import com.firstpay.partner.api.dto.Dtos.PublicPayResponse;
import com.firstpay.partner.api.dto.Dtos.PublicTxStatusDto;
import com.firstpay.partner.api.dto.Dtos.StudentLookupDto;
import com.firstpay.partner.infra.PublicCheckoutService;
import com.firstpay.partner.infra.PublicCheckoutStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

/**
 * API PUBLIQUE de la page payeur. Servie SANS authentification (le gateway route
 * {@code /public/**} sans le filtre tenant). C'est ce que le client final appelle quand il
 * ouvre le lien/QR partagé {@code pay.firstpay.cm/{shortCode}/{slug}}.
 *
 * <p>Sécurité : ne renvoie qu'une interface {@code actif} d'un tenant {@code ACTIVE}, projetée
 * en DTO public-safe (aucun champ sensible). Tout shortCode/slug inconnu ou brouillon répond 404
 * — sans divulguer s'il s'agit d'un commerçant ou d'une interface inexistant(e). Le montant et les
 * champs requis sont (re)validés côté serveur lors de l'initiation : le navigateur ne peut rien forcer.
 */
@RestController
public class PublicCheckoutController {

    private final PublicCheckoutStore store;
    private final PublicCheckoutService service;

    public PublicCheckoutController(PublicCheckoutStore store, PublicCheckoutService service) {
        this.store = store;
        this.service = service;
    }

    /** Résout la config publique du parcours (rendu de la page payeur). */
    @GetMapping("/public/p/{shortCode}/{slug}")
    public Mono<PublicCheckoutDto> resolve(@PathVariable String shortCode, @PathVariable String slug) {
        return store.resolve(shortCode, slug)
            .switchIfEmpty(Mono.error(new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Page de paiement introuvable ou indisponible")));
    }

    /**
     * Auto-remplissage : recherche un matricule dans le répertoire de l'établissement et renvoie
     * les champs à pré-remplir. {@code found=false} => matricule inexistant (la page bloque).
     */
    @GetMapping("/public/p/{shortCode}/{slug}/lookup")
    public Mono<StudentLookupDto> lookup(@PathVariable String shortCode, @PathVariable String slug,
                                         @RequestParam String matricule) {
        return service.lookup(shortCode, slug, matricule);
    }

    /** Initie le paiement (création d'une transaction PENDING côté plateforme). */
    @PostMapping("/public/p/{shortCode}/{slug}/pay")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Mono<PublicPayResponse> pay(@PathVariable String shortCode, @PathVariable String slug,
                                       @RequestBody PublicPayRequest req) {
        return service.initiate(shortCode, slug, req);
    }

    /** Suivi de statut (polling par la page payeur après initiation). */
    @GetMapping("/public/tx/{transactionId}")
    public Mono<PublicTxStatusDto> status(@PathVariable String transactionId) {
        return service.status(transactionId);
    }
}
