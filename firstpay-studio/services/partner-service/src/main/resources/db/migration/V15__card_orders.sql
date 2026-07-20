-- V15 : commandes de cartes prepayees (partenaires EMF). Une commande porte
-- uniquement une quantite (pas de prix/type de carte) ; le partenaire ne voit
-- jamais de carte individuelle ni de PAN, seulement des compteurs agreges.
-- quantite_vendue/quantite_activee sont de simples compteurs mis a jour par
-- une action bank_admin (pas de pipeline KYC/activation automatique : cette
-- plateforme n'a pas d'equivalent DossierKyc/Client, contrairement au systeme
-- dont ce module est porte).
CREATE TABLE card_orders (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id         UUID NOT NULL,
    quantite          INTEGER NOT NULL CHECK (quantite > 0),
    date_commande     DATE NOT NULL DEFAULT CURRENT_DATE,
    statut            VARCHAR(20) NOT NULL DEFAULT 'en_cours',  -- en_cours / livree / annulee
    quantite_vendue   INTEGER NOT NULL DEFAULT 0,
    quantite_activee  INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_card_orders_tenant ON card_orders (tenant_id);
