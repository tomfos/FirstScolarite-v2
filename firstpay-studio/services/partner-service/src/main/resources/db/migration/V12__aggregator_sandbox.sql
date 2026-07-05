-- V12 : bascule sandbox / production de l'agrégateur TrustPayWay depuis l'UI admin.
-- Les colonnes agg_* existantes (V7) restent le jeu d'identifiants PRODUCTION ; on ajoute
-- un jeu SANDBOX distinct + un sélecteur de mode. Basculer = changer agg_mode et enregistrer,
-- sans avoir à ressaisir les identifiants de l'autre environnement.

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS agg_mode VARCHAR(20) NOT NULL DEFAULT 'production';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS agg_sandbox_base_url VARCHAR(300) NOT NULL DEFAULT 'https://mobilewallet.trustpayway.com';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS agg_sandbox_app_id   VARCHAR(200);
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS agg_sandbox_secret   VARCHAR(500);

-- Pré-remplissage du jeu SANDBOX avec les éléments de test TrustPayWay (merchant 2).
-- Le secret (Bearer de /api/login) reste à saisir depuis l'UI : il n'est pas fourni par la
-- collection Postman. Le mode reste 'production' : ce jeu est inerte tant qu'on ne bascule pas.
UPDATE platform_settings
   SET agg_sandbox_base_url = 'https://mobilewallet.trustpayway.com',
       agg_sandbox_app_id   = '38e1a762-cceb-4d71-9340-c76ad040b42a'
 WHERE id = 1
   AND (agg_sandbox_app_id IS NULL OR agg_sandbox_app_id = '');
