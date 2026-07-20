package com.firstpay.partner.infra;

import com.firstpay.partner.api.dto.Dtos.*;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.LocalDate;
import java.util.UUID;

@Repository
public class CardOrderStore {

    private final DatabaseClient db;

    public CardOrderStore(DatabaseClient db) {
        this.db = db;
    }

    public Mono<CardOrderDto> create(UUID tenantId, CreateCardOrderRequest req) {
        UUID id = UUID.randomUUID();
        return db.sql("INSERT INTO card_orders (id, tenant_id, quantite) VALUES (:id, :tenant, :quantite)")
            .bind("id", id).bind("tenant", tenantId).bind("quantite", req.quantite())
            .fetch().rowsUpdated()
            .then(findById(id));
    }

    public Flux<CardOrderDto> listByTenant(UUID tenantId) {
        return db.sql("""
                SELECT id, tenant_id, quantite, date_commande, statut, quantite_vendue, quantite_activee
                FROM card_orders WHERE tenant_id = :t ORDER BY date_commande DESC, created_at DESC
                """)
            .bind("t", tenantId)
            .map(r -> mapRow(r, null))
            .all();
    }

    /** Vue banque : toutes les commandes, tous partenaires, avec le nom du partenaire. */
    public Flux<CardOrderDto> listAll() {
        return db.sql("""
                SELECT co.id, co.tenant_id, co.quantite, co.date_commande, co.statut,
                       co.quantite_vendue, co.quantite_activee, t.name AS partner_name
                FROM card_orders co JOIN tenants t ON t.id = co.tenant_id
                ORDER BY co.date_commande DESC, co.created_at DESC
                """)
            .map(r -> mapRow(r, r.get("partner_name", String.class)))
            .all();
    }

    public Mono<CardOrderDto> findById(UUID id) {
        return db.sql("""
                SELECT id, tenant_id, quantite, date_commande, statut, quantite_vendue, quantite_activee
                FROM card_orders WHERE id = :id
                """)
            .bind("id", id)
            .map(r -> mapRow(r, null))
            .one();
    }

    /** en_cours -> livree. 0 ligne affectee si la commande n'existe pas ou n'est plus en_cours. */
    public Mono<Long> livrer(UUID id) {
        return db.sql("UPDATE card_orders SET statut = 'livree', updated_at = now() WHERE id = :id AND statut = 'en_cours'")
            .bind("id", id).fetch().rowsUpdated();
    }

    /** en_cours -> annulee. 0 ligne affectee si la commande n'existe pas ou n'est plus en_cours. */
    public Mono<Long> annuler(UUID id) {
        return db.sql("UPDATE card_orders SET statut = 'annulee', updated_at = now() WHERE id = :id AND statut = 'en_cours'")
            .bind("id", id).fetch().rowsUpdated();
    }

    /**
     * Enregistre les compteurs vendue/activee (valeurs absolues, pas des deltas), bornes a la
     * quantite commandee -- reprend la regle "stock epuise" du systeme d'origine sans reproduire
     * de pipeline d'activation individuelle par carte (aucun equivalent dossier KYC/client ici).
     */
    public Mono<CardOrderDto> enregistrerVentes(UUID id, EnregistrerVentesRequest req) {
        return findById(id).flatMap(order -> {
            int max = order.quantite();
            int vendue = Math.max(0, Math.min(req.quantiteVendue(), max));
            int activee = Math.max(0, Math.min(req.quantiteActivee(), max));
            return db.sql("UPDATE card_orders SET quantite_vendue = :v, quantite_activee = :a, updated_at = now() WHERE id = :id")
                .bind("v", vendue).bind("a", activee).bind("id", id)
                .fetch().rowsUpdated()
                .then(findById(id));
        });
    }

    private static CardOrderDto mapRow(Readable r, String partnerName) {
        return new CardOrderDto(
            r.get("id", UUID.class).toString(),
            r.get("tenant_id", UUID.class).toString(),
            partnerName,
            r.get("quantite", Integer.class),
            String.valueOf(r.get("date_commande", LocalDate.class)),
            r.get("statut", String.class),
            r.get("quantite_vendue", Integer.class),
            r.get("quantite_activee", Integer.class)
        );
    }
}
