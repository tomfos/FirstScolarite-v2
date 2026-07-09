-- Répertoire des étudiants importés par l'établissement (partenaire).
-- Alimente l'auto-remplissage du formulaire payeur à partir du matricule saisi :
-- le payeur tape son matricule, le serveur récupère les infos associées (nom, prénom, classe…).
--
-- `data` (JSONB) porte tous les attributs importés, avec des CLÉS NORMALISÉES
-- (minuscule, sans accent, alphanumériques uniquement) : « Prénom » -> "prenom",
-- « Établissement » -> "etablissement". Le rapprochement avec un champ du formulaire
-- se fait sur le libellé du champ normalisé de la même façon.
--
-- Le matricule est UNIQUE par tenant (partenaire) : deux partenaires distincts peuvent
-- réutiliser un même matricule, mais au sein d'un partenaire il identifie un seul étudiant.
CREATE TABLE IF NOT EXISTS student_roster (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    matricule     VARCHAR(80)  NOT NULL,
    etablissement VARCHAR(160),
    data          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_roster_tenant_matricule UNIQUE (tenant_id, matricule)
);

CREATE INDEX IF NOT EXISTS idx_roster_tenant_etab ON student_roster (tenant_id, etablissement);

-- Établissement auquel une interface de paiement est rattachée : quand il est renseigné,
-- la recherche d'un matricule est LIMITÉE à cet établissement précis (exigence métier).
-- NULL / vide => recherche sur tout le répertoire du partenaire.
ALTER TABLE payment_interfaces
    ADD COLUMN IF NOT EXISTS establishment VARCHAR(160);
