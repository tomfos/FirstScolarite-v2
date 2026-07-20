package com.firstpay.partner.api;

import com.firstpay.partner.api.dto.Dtos.*;
import com.firstpay.partner.infra.CardOrderStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Set;
import java.util.UUID;

/**
 * Commandes de cartes prepayees -- reserve aux partenaires de type EMF. Le role est verifie ici
 * en defense en profondeur (X-User-Role / X-Partner-Type injectes par la gateway a partir du JWT
 * verifie, non falsifiables cote client), en plus du filtrage deja fait cote frontend.
 */
@RestController
public class CardOrderController {

    private static final Set<String> ROLES_PASSER_COMMANDE = Set.of("partner_admin", "partner_manager");

    private final CardOrderStore orders;

    public CardOrderController(CardOrderStore orders) {
        this.orders = orders;
    }

    @PostMapping("/api/v1/card-orders")
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<CardOrderDto> create(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-Partner-Type", required = false) String partnerType,
            @RequestBody CreateCardOrderRequest req) {
        if (!ROLES_PASSER_COMMANDE.contains(role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul un administrateur ou gestionnaire partenaire peut commander des cartes"));
        }
        if (!"emf".equals(partnerType)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "La commande de cartes est reservee aux partenaires de type EMF"));
        }
        if (req == null || req.quantite() <= 0) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantite invalide"));
        }
        return orders.create(tenantId, req);
    }

    @GetMapping("/api/v1/card-orders")
    public Flux<CardOrderDto> listMine(@RequestHeader("X-Tenant-Id") UUID tenantId) {
        return orders.listByTenant(tenantId);
    }

    /** Vue banque : toutes les commandes, tous partenaires confondus. */
    @GetMapping("/api/v1/card-orders/all")
    public Flux<CardOrderDto> listAll(@RequestHeader(value = "X-User-Role", required = false) String role) {
        if (!"bank_admin".equals(role)) {
            return Flux.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul l'administrateur banque peut consulter toutes les commandes"));
        }
        return orders.listAll();
    }

    @PostMapping("/api/v1/card-orders/{id}/livrer")
    public Mono<CardOrderDto> livrer(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        if (!"bank_admin".equals(role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul l'administrateur banque peut marquer une commande comme livree"));
        }
        return orders.livrer(id).flatMap(n -> n > 0 ? orders.findById(id)
            : Mono.<CardOrderDto>error(new ResponseStatusException(HttpStatus.CONFLICT,
                "Commande introuvable ou deja traitee")));
    }

    /** Autorisee pour la banque, ou pour le partenaire proprietaire de la commande. */
    @PostMapping("/api/v1/card-orders/{id}/annuler")
    public Mono<CardOrderDto> annuler(
            @PathVariable UUID id,
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        boolean estBanque = "bank_admin".equals(role);
        if (!estBanque && !ROLES_PASSER_COMMANDE.contains(role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Vous n'etes pas autorise a annuler cette commande"));
        }
        Mono<UUID> autorise = estBanque
            ? Mono.just(id)
            : orders.findById(id)
                .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Commande introuvable")))
                .flatMap(order -> order.tenantId().equals(tenantId.toString())
                    ? Mono.just(id)
                    : Mono.<UUID>error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Commande introuvable")));
        return autorise
            .flatMap(orderId -> orders.annuler(orderId))
            .flatMap(n -> n > 0 ? orders.findById(id)
                : Mono.<CardOrderDto>error(new ResponseStatusException(HttpStatus.CONFLICT,
                    "Commande introuvable ou deja traitee")));
    }

    /** Reserve aux commandes livrees (meme regle que l'activation individuelle dans le systeme d'origine). */
    @PostMapping("/api/v1/card-orders/{id}/enregistrer-ventes")
    public Mono<CardOrderDto> enregistrerVentes(
            @PathVariable UUID id,
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestBody EnregistrerVentesRequest req) {
        if (!"bank_admin".equals(role)) {
            return Mono.error(new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Seul l'administrateur banque peut enregistrer les ventes"));
        }
        return orders.findById(id)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Commande introuvable")))
            .flatMap(order -> "livree".equals(order.statut())
                ? orders.enregistrerVentes(id, req)
                : Mono.<CardOrderDto>error(new ResponseStatusException(HttpStatus.CONFLICT,
                    "Les ventes ne peuvent etre enregistrees que pour une commande livree")));
    }
}
