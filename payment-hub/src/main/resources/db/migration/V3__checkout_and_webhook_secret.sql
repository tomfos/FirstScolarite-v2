-- V3 : capacité de checkout + signature des webhooks sortants.

-- Jeton de capacité du checkout hébergé : requis (en plus de l'id) pour afficher/payer une
-- page de paiement. Empêche l'énumération des paiements par simple id.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_token VARCHAR(64);

-- Secret de signature des webhooks sortants (HMAC-SHA256), chiffré au repos.
-- Communiqué UNE fois à la création de l'application ; sert au client à vérifier l'authenticité.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS webhook_secret TEXT;
