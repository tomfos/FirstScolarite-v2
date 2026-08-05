-- V17 : archivage du journal d'audit. N'efface jamais rien (principe "infalsifiable" -
-- EF-ADM-03) : archiver ne fait que sortir les entrees de la vue par defaut, elles restent
-- consultables via le filtre "archives".
ALTER TABLE audit_log ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_audit_archived ON audit_log (archived, occurred_at DESC);
