-- Catalogue de démarrage : providers + moyens de paiement + une application de démo.
-- Les providers sont créés DÉSACTIVÉS (enabled=false) et sans credentials : ils sont
-- configurés ensuite depuis l'admin. Tant qu'un provider n'est pas prêt, le connecteur
-- simulé prend le relais (payhub.payment.simulation-enabled=true en dev).

-- Providers (PSP) ------------------------------------------------------------
INSERT INTO providers (code, label, mode, enabled) VALUES
    ('trustpayway', 'TrustPayWay (Orange Money / MTN MoMo)', 'sandbox', FALSE),
    ('mpgs',        'MPGS — carte bancaire',                 'sandbox', FALSE),
    ('sara',        'SARA',                                  'sandbox', FALSE),
    ('rtgs',        'Virement / RTGS',                       'sandbox', FALSE)
ON CONFLICT (code) DO NOTHING;

-- Catalogue des moyens de paiement -------------------------------------------
INSERT INTO payment_methods (code, label, provider_code, icon, currency, sort_order) VALUES
    ('orange',   'Orange Money',   'trustpayway', 'orange',   'XAF', 10),
    ('mtn',      'MTN MoMo',       'trustpayway', 'mtn',      'XAF', 20),
    ('card',     'Carte bancaire', 'mpgs',        'card',     'XAF', 30),
    ('sara',     'SARA',           'sara',        'sara',     'XAF', 40),
    ('transfer', 'Virement',       'rtgs',        'transfer', 'XAF', 50)
ON CONFLICT (code) DO NOTHING;

-- Application de démo ---------------------------------------------------------
-- Clé API    : phk_demo_publickey_change_me
-- Secret     : phs_demo_secret_change_me
-- (à supprimer / régénérer en production)
INSERT INTO applications (id, name, slug, api_key_hash, api_secret_hash, brand_color)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Application de démo',
    'demo',
    'c575907bf111a93afd83e793156d5f51dbcd2af6ab3bff04d373f21f6e43b50a',
    '51c3a2eb23164df944932da7e98c594df086ff39ccd5163a6cd6d2d1af956313',
    '#E53935'
) ON CONFLICT (id) DO NOTHING;

-- Par défaut, l'app démo propose Orange Money + MTN MoMo (activés).
INSERT INTO application_methods (application_id, method_code, enabled) VALUES
    ('00000000-0000-0000-0000-000000000001', 'orange', TRUE),
    ('00000000-0000-0000-0000-000000000001', 'mtn',    TRUE)
ON CONFLICT DO NOTHING;
