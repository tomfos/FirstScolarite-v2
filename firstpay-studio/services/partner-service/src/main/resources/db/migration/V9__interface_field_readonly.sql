-- V9__interface_field_readonly.sql
-- Champs de formulaire en lecture seule (auto-remplis depuis les données importées du partenaire).
-- La colonne `type` reste un VARCHAR(20) libre : les nouveaux types `date` / `phone` du Studio
-- y sont stockés sans changement de schéma. Les acomptes par frais (allowPartial / minAmount)
-- vivent dans la colonne JSONB `payment_interfaces.presets` — aucune migration nécessaire.
ALTER TABLE interface_fields
    ADD COLUMN IF NOT EXISTS readonly BOOLEAN NOT NULL DEFAULT FALSE;
