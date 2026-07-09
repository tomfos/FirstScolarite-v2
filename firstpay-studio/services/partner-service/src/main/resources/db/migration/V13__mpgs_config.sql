-- V13 : passerelle carte MPGS (Mastercard Payment Gateway Services) — Hosted Checkout.
-- Même modèle que l'agrégateur : deux jeux d'identifiants (production + sandbox) et un
-- sélecteur de mode, configurables et permutables depuis l'UI admin sans ressaisie.
-- Le mot de passe marchand n'est JAMAIS renvoyé en clair en lecture (masqué comme agg_secret).

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_mode VARCHAR(20) NOT NULL DEFAULT 'production';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_api_version VARCHAR(10) NOT NULL DEFAULT '100';

-- Jeu PRODUCTION
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_host        VARCHAR(200) NOT NULL DEFAULT 'na-gateway.mastercard.com';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_merchant_id VARCHAR(100);
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_password    VARCHAR(300);

-- Jeu SANDBOX (pré-rempli avec les identifiants de test fournis par la banque)
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_sandbox_host        VARCHAR(200) NOT NULL DEFAULT 'test-gateway.mastercard.com';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_sandbox_merchant_id VARCHAR(100);
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS mpgs_sandbox_password    VARCHAR(300);

UPDATE platform_settings
   SET mpgs_sandbox_host        = 'test-gateway.mastercard.com',
       mpgs_sandbox_merchant_id = 'TESTAFB-MARCHANT',
       mpgs_sandbox_password    = '7631e1802ff5c91a2a883d84e13bbd48'
 WHERE id = 1
   AND (mpgs_sandbox_merchant_id IS NULL OR mpgs_sandbox_merchant_id = '');
