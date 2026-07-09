-- Pays de la collecte : pilote l'indicatif téléphonique et la devise côté page payeur.
-- Cameroun (CM / +237) par défaut, cohérent avec l'usage historique de la plateforme.
ALTER TABLE payment_interfaces
    ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'CM';
