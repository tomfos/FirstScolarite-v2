-- V14 : introduit l'axe "type de partenaire" (config->>'partnerType'), orthogonal au
-- rôle hiérarchique (partner_admin/manager/accountant/viewer). Backfill des tenants
-- existants à 'standard' pour que tout partenaire porte explicitement un type
-- cohérent (application/JWT/nav en dépendent, pas de valeur absente en pratique même
-- si le code applicatif retombe déjà sur 'standard' par défaut).
UPDATE tenants
SET config = jsonb_set(config, '{partnerType}', '"standard"', true)
WHERE NOT (config ? 'partnerType');

-- Tenant de démonstration de type EMF, pour valider le parcours partenaire EMF
-- (commande de cartes / suivi des ventes) de bout en bout : login → JWT → nav filtrée.
INSERT INTO tenants (id, code, name, status, config, rate_limit_tpm) VALUES
    ('33333333-3333-3333-3333-333333333333', 'FSPAY_202607200001', 'EMF DIGITAL FINANCE', 'ACTIVE',
     '{"shortCode":"EMFDF","sector":"Finance","partnerType":"emf"}', 5000)
ON CONFLICT (id) DO NOTHING;

-- Compte de démo (password_hash NULL -> mot de passe "demo" accepté, cf. AuthController).
INSERT INTO partner_users (tenant_id, name, email, role, status, password_hash) VALUES
    ('33333333-3333-3333-3333-333333333333', 'Awa Ndongo', 'admin@emfdigital.cm', 'partner_admin', 'active', NULL)
ON CONFLICT (tenant_id, email) DO NOTHING;

INSERT INTO partner_settings (tenant_id, brand_color, notifications) VALUES
    ('33333333-3333-3333-3333-333333333333', '#E53935', '{}')
ON CONFLICT (tenant_id) DO NOTHING;
