# Payment Hub

Service de paiement **central, autonome et réutilisable**. Plusieurs applications clientes
l'intègrent pour encaisser via différents canaux (Orange Money / MTN MoMo via **TrustPayWay**,
carte via **MPGS**, **SARA**, virement…). Toute la configuration vit dans le Hub : on y déclare
les providers (PSP) une fois, puis **chaque application choisit les moyens qu'elle active/désactive**.

> Monolithe modulaire Spring Boot 3 (WebFlux + R2DBC) · PostgreSQL · Redis · traitement synchrone.

## Concepts

| Concept | Rôle |
|---------|------|
| **Application** | Une app cliente. Clé API + secret (hashés), branding, `webhook_url`, `return_url`. |
| **Provider** | Un PSP configuré au centre (credentials chiffrés AES, mode sandbox/prod). |
| **Payment method** | Un moyen (`orange`, `mtn`, `card`, `sara`, `transfer`) rattaché à un provider. |
| **Activation par app** | `application_methods` : quels moyens une application expose (on/off). |
| **Payment** | Un encaissement (`PENDING → SUCCESS/FAILED/REFUNDED`), idempotent par application. |

## Démarrage (dev)

```bash
# Infra + service
docker compose up -d --build
# API : http://localhost:8090   ·   Doc : http://localhost:8090/docs
```

Application de démo (seed) : clé API `phk_demo_publickey_change_me`, secret `phs_demo_secret_change_me`.

## Roadmap

- [x] **Phase 0** — Scaffold (schéma, config, docker)
- [ ] **Phase 1** — Registre d'applications + auth clé API
- [ ] **Phase 2** — Providers + moyens + activation par app
- [x] **Phase 3** — Connecteurs (SPI) + orchestrateur + TrustPayWay + API paiement S2S + webhooks + réconciliation
- [x] **Phase 4** — Checkout hébergé (page de paiement `/checkout/{id}`)
- [x] **Phase 5** — Widget `pay.js` (iframe) + webhooks sortants signés (HMAC)
- [x] **Phase 6** — Connecteurs **réels** : TrustPayWay (OM/MTN), **SARA** (débit wallet), **MPGS** (carte, Hosted Checkout) — repli simulé si non configuré
- [x] **Phase 7** — Back-office admin (`/console`) + tests + CORS

## Intégration côté application cliente

Voir [`docs/INTEGRATION.md`](docs/INTEGRATION.md). En bref :

1. **Backend client** : `POST /api/v1/payments` (en-tête `X-Api-Key`) → `{ id, clientSecret, checkoutUrl }`.
2. **Front client** : charger `/widget/pay.js` puis `PayHub.open({ checkoutUrl, onSuccess, onError })`
   → la page de paiement du Hub s'affiche dans une iframe modale (moyens filtrés + branding de l'app).
3. **Confirmation** : le Hub notifie le backend client via `webhook_url` (signé `X-PayHub-Signature`),
   et le client confirme via `GET /api/v1/payments/{id}` (source de vérité).

Administration : `http://localhost:8090/console` (jeton `X-Admin-Token`).
