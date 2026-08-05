-- V16 : messagerie banque -> partenaires (cible un partenaire precis, ou diffusion a tous).
-- Le partenaire recoit ces messages comme des notifications (cloche du portail).
-- La lecture est suivie par tenant destinataire, pas par utilisateur individuel : un message lu
-- par un membre de l'equipe du partenaire est considere lu pour toute son equipe.
CREATE TABLE partner_messages (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    UUID,               -- NULL = diffusion a tous les partenaires
    subject      VARCHAR(200) NOT NULL,
    body         TEXT NOT NULL,
    sender_name  VARCHAR(200) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_partner_messages_tenant ON partner_messages (tenant_id);

CREATE TABLE partner_message_reads (
    message_id        UUID NOT NULL REFERENCES partner_messages(id) ON DELETE CASCADE,
    reader_tenant_id  UUID NOT NULL,
    read_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, reader_tenant_id)
);
