-- Payment Hub — schéma initial.
-- Modèle : des APPLICATIONS clientes consomment le Hub ; des PROVIDERS (PSP) sont
-- configurés une seule fois au centre ; chaque application ACTIVE/DÉSACTIVE les moyens
-- de paiement qu'elle expose. Les PAIEMENTS et leur historique sont tracés ici.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- Applications clientes : une par app qui intègre le Hub.
-- La clé API et le secret ne sont JAMAIS stockés en clair (hash SHA-256).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE applications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(160) NOT NULL,
    slug            VARCHAR(80)  NOT NULL UNIQUE,
    api_key_hash    CHAR(64)     NOT NULL UNIQUE,     -- SHA-256 hex de la clé API publique
    api_secret_hash CHAR(64)     NOT NULL,            -- SHA-256 hex du secret (webhooks/S2S)
    status          VARCHAR(16)  NOT NULL DEFAULT 'active',   -- active | suspended
    brand_color     VARCHAR(9)   NOT NULL DEFAULT '#E53935',
    logo_url        VARCHAR(400),
    return_url      VARCHAR(400),                     -- redirection payeur post-paiement
    webhook_url     VARCHAR(400),                     -- notification serveur→serveur (signée)
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Providers (PSP) : configurés au centre. credentials chiffrés (AES) côté appli.
-- code = trustpayway | mpgs | sara | rtgs | ...
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE providers (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code         VARCHAR(40)  NOT NULL UNIQUE,
    label        VARCHAR(120) NOT NULL,
    mode         VARCHAR(12)  NOT NULL DEFAULT 'sandbox',   -- sandbox | production
    enabled      BOOLEAN      NOT NULL DEFAULT FALSE,
    credentials  TEXT,                                       -- JSON chiffré (AES/GCM, Base64)
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Catalogue des moyens de paiement, chacun rattaché à un provider.
-- code = orange | mtn | card | sara | transfer | ...
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE payment_methods (
    code          VARCHAR(40)  PRIMARY KEY,
    label         VARCHAR(120) NOT NULL,
    provider_code VARCHAR(40)  NOT NULL REFERENCES providers(code) ON UPDATE CASCADE,
    icon          VARCHAR(80),
    currency      VARCHAR(3)   NOT NULL DEFAULT 'XAF',
    sort_order    INT          NOT NULL DEFAULT 100,
    active        BOOLEAN      NOT NULL DEFAULT TRUE       -- disponibilité globale (au niveau Hub)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Activation d'un moyen POUR une application donnée (le cœur du paramétrage).
-- Absence de ligne = moyen non proposé ; enabled=false = explicitement coupé.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE application_methods (
    application_id UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    method_code    VARCHAR(40) NOT NULL REFERENCES payment_methods(code) ON DELETE CASCADE,
    enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
    PRIMARY KEY (application_id, method_code)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Paiements. status : PENDING | SUCCESS | FAILED | REFUNDED.
-- idempotency_key unique PAR application (rejeu = même paiement, pas de doublon).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE payments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id   UUID           NOT NULL REFERENCES applications(id),
    reference        VARCHAR(120),                    -- référence côté application cliente
    method           VARCHAR(40),                     -- moyen retenu (null tant que non choisi)
    amount           NUMERIC(18,2)  NOT NULL,
    currency         VARCHAR(3)     NOT NULL DEFAULT 'XAF',
    status           VARCHAR(16)    NOT NULL DEFAULT 'PENDING',
    provider_ref     VARCHAR(160),                    -- id transaction côté PSP
    payer_msisdn     VARCHAR(20),
    payer_name       VARCHAR(160),
    idempotency_key  VARCHAR(120)   NOT NULL,
    return_url       VARCHAR(400),
    metadata         JSONB          NOT NULL DEFAULT '{}',
    failure_reason   VARCHAR(400),
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    UNIQUE (application_id, idempotency_key)
);
CREATE INDEX idx_payments_app_status_created ON payments (application_id, status, created_at DESC);
CREATE INDEX idx_payments_provider_ref       ON payments (provider_ref);

-- Historique de statut / audit d'un paiement (append-only).
CREATE TABLE payment_events (
    id          BIGSERIAL PRIMARY KEY,
    payment_id  UUID        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    type        VARCHAR(40) NOT NULL,                -- CREATED | METHOD_SELECTED | PSP_INITIATED | WEBHOOK | STATUS_CHANGED
    detail      JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_events_payment ON payment_events (payment_id, created_at);

-- Notifications sortantes vers les applications clientes (webhooks signés + retries).
CREATE TABLE webhook_deliveries (
    id            BIGSERIAL PRIMARY KEY,
    payment_id    UUID         NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    application_id UUID        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    url           VARCHAR(400) NOT NULL,
    payload       JSONB        NOT NULL,
    status        VARCHAR(16)  NOT NULL DEFAULT 'PENDING',   -- PENDING | DELIVERED | FAILED
    attempts      INT          NOT NULL DEFAULT 0,
    last_error    VARCHAR(400),
    next_retry_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries (status, next_retry_at);
