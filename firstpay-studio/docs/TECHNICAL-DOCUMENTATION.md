# Cash collect First — Documentation technique & d'architecture

> Document de référence consolidé. Pour les détails par sujet, voir aussi
> [`ARCHITECTURE.md`](ARCHITECTURE.md) (décisions perf), [`PHASES.md`](PHASES.md) (roadmap),
> [`ROLES-MATRIX.md`](ROLES-MATRIX.md) (rôles), [`UI-UX-DESIGN-SYSTEM.md`](UI-UX-DESIGN-SYSTEM.md),
> [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md) et [`DEPLOIEMENT.md`](DEPLOIEMENT.md).

---

## 1. Présentation

**Cash collect First** est le portail de paiement multi-partenaires d'**Afriland First Bank**.
Des *partenaires* construisent sans code des **interfaces de paiement** (pages de collecte) ;
les payeurs règlent via **Orange Money, MTN MoMo, carte ou virement** (avec QR). Le
back-office banque supervise les partenaires, encaisse en agence (caisse) et audite la
plateforme.

Cible d'ingénierie : **≥ 1 000 000 transactions / minute (~16 667 TPS)**, P99 < 100 ms,
disponibilité 99.99 %, **zéro duplication** (idempotence stricte).

---

## 2. Vue d'architecture

```
                            Navigateur (portail Angular)
                                      │  HTTPS / JWT
                                      ▼
        Partenaires (REST, X-API-Key) ──▶  API GATEWAY (Spring Cloud Gateway)
                                           · Auth: JWT portail OU API-key
                                           · TenantExtractorFilter (injecte X-Tenant-Id)
                                           · Rate-limit Redis PAR tenant
                                           · retry + circuit breaker + CORS
                                      │ lb://  (routage)
       ┌───────────────┬─────────────┼──────────────┬────────────────┐
       ▼               ▼             ▼              ▼                ▼
 transaction-svc   partner-svc   payment-svc   reporting-svc    (frontend)
 CQRS + Event      interfaces,   orchestration  read models /    Angular 21
 Sourcing          users, auth,  PSP + sagas    projections      (SPA Nginx)
       │  ▲            JWT issuer       │             ▲
 outbox│  │processed/failed             │processed    │ /reports
       ▼  │                             ▼             │
   ┌──────┴───────┐   PostgreSQL 16 (partitionné) ◀── PgBouncer (pool transaction)
   │    KAFKA     │◀── OutboxPoller         │  read replica ──┘
   │ 12 part/topic│                         │
   └──────┬───────┘                  Redis (idempotence · cache · rate-limit · sessions)
          │ consumers (par partition, ack manuel)
          ▼
   Observabilité : Micrometer→Prometheus · OTel→Jaeger · Grafana · Alertmanager
```

**Principe directeur** : *accuser réception vite, traiter en asynchrone*. L'écriture renvoie
`202 Accepted` (transaction persistée + événement publié) ; toute la charge lourde
(orchestration paiement, projections, notifications) transite par **Kafka**. C'est ce
découplage qui permet d'absorber 16 k TPS.

---

## 3. Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | **Angular 21** (standalone, Signals, NgRx Signal Store), TypeScript, SCSS, Nginx |
| API Gateway | **Spring Cloud Gateway** (réactif) |
| Microservices | **Spring Boot 3.3 / Java 21**, WebFlux + R2DBC + Virtual Threads |
| Messaging | **Apache Kafka** (reactor-kafka, exactly-once, outbox pattern) |
| Base de données | **PostgreSQL 16** (partitionnement natif, PgBouncer, read replica) |
| Cache / locks | **Redis** (idempotence, rate-limit, cache L2, sessions) |
| Résilience | **Resilience4j** (circuit breaker, bulkhead, time limiter, retry) |
| Observabilité | Micrometer + **Prometheus** + **Grafana** + OpenTelemetry/**Jaeger** + Alertmanager |
| Sécurité | **JWT** (HMAC maison, sans dépendance) + API-key hashée SHA-256 |
| Déploiement | **Docker Compose** (dev) · **Kubernetes** (Helm/HPA/PDB/Istio) |

---

## 4. Modules

### 4.1 `apps/api-gateway` — Porte d'entrée
Responsabilité : authentification, multi-tenant, rate-limiting, résilience, CORS.
- **`TenantExtractorFilter`** : deux modes d'auth —
  (1) **JWT portail** (`Authorization: Bearer`) → tenant + rôle lus dans les claims signés ;
  (2) **API-key** (`X-API-Key`) → résolue par `TenantResolver`.
  Dans les deux cas, `X-Tenant-Id`/`X-Tenant-Rate-Limit`/`X-User-Role` sont **réécrits**
  côté gateway ⇒ aucune usurpation possible par le client.
- **`TenantResolver`** : cache Redis (TTL 5 min) → partner-service (`/internal/v1/tenants/by-key-hash`)
  → `TenantRegistry` in-memory en repli (résilience).
- **`TenantRateLimitFilter`** : compteur Redis atomique (Lua), fenêtre 1 s, quota dérivé de
  `rate_limit_tpm` → `429` au dépassement.
- **`GatewayConfig`** : routes `lb://` + retry + circuit breaker + fallback ; route publique
  `/api/v1/auth/**` (login, sans filtre tenant).

### 4.2 `services/transaction-service` — Cœur CQRS / Event Sourcing
Le service le plus critique (chemin chaud d'écriture).
- **Commande** : `TransactionCommandHandler` — idempotence **2 niveaux** (Redis `SETNX` +
  index DB unique en filet). Écrit, **dans la même transaction SQL** : l'état
  (`TransactionStore`), l'événement de domaine (`EventStore` → `domain_events` append-only)
  et l'événement d'intégration (`OutboxEventPublisher` → `outbox_events`).
- **Relais** : `OutboxPoller` (`@Scheduled`, garde anti-chevauchement) publie l'outbox sur
  `transactions.created` (clé = aggregate_id), puis marque PROCESSED.
- **Résultats** : `TransactionResultConsumer` consomme `transactions.processed`/`failed`
  → met à jour le statut + ajoute l'événement de domaine + pousse le **SSE** temps réel.
- **Lecture** : `TransactionQueryHandler` + `TransactionEventStream` (Sinks multicast).
- **API** (`/api/v1/transactions`) : `POST` (202 + Location + idempotency-key,
  `@RateLimiter`/`@CircuitBreaker`), `GET /{id}`, `GET /stream` (SSE par tenant),
  `GET /live-stats` (SSE 1 s).
- **Topics** : créés au démarrage par `TopicInitializer` (AdminClient).

### 4.3 `services/payment-service` — Orchestration des paiements
- **Connecteurs** : `OrangeMoneyConnector`, `MtnMomoConnector`, `CardConnector`,
  `TransferConnector` (base `SimulatedConnector`), chacun protégé par un **circuit breaker
  dédié** (+ bulkhead + time limiter). `PaymentConnectorRouter` aiguille selon le moyen.
- **`PaymentOrchestrator`** : idempotence Redis (`payment:processed:{txId}`) ⇒
  **exactly-once effectif** (un rejeu ne débite pas deux fois).
- **`PaymentEventConsumer`** : consomme `transactions.created`, orchestre, publie le résultat
  sur `transactions.processed` (succès) ou `transactions.failed` (DLQ) ; ack après publication.
- **`WebhookController`** (`/webhooks/{connector}`) : callbacks asynchrones des PSP.

### 4.4 `services/partner-service` — Partenaires, équipe, auth
- **`AuthController`** (`/api/v1/auth/**`) : login portail → **émet le JWT** (via `JwtService`).
- **`InternalTenantController`** : résolution tenant par hash d'API-key (consommé par le gateway).
- **`PartnerApiController`** : interfaces de paiement, utilisateurs, paramètres.
- **`AuditController`** : journal d'audit append-only.
- **`SecurityConfig`** : protection des endpoints internes/publics.
- Stores R2DBC : `PartnerStore`, `InterfaceStore`, `AuditStore`.

### 4.5 `services/reporting-service` — Read models / projections
- **`ReportStore`** : agrégats et lectures servis depuis le **read replica** (isolés de l'écriture).
- **`ReportsController`** (`/api/v1/reports/**`) : synthèse, séries quotidiennes, liste,
  exports, et `live-stats` alimenté par les projections.
- Schéma : `transaction_projection` (vue dénormalisée) + `tx_stats_daily` (agrégat).

### 4.6 `libs/` — Bibliothèques partagées
- **`shared-security`** : `JwtService` (JWT HMAC-SHA256 maison, sans dépendance externe),
  `TenantContext`.
- **`shared-domain`** : enums & value objects (`TransactionStatus`, `PaymentMethod`, `Role`…).

### 4.7 `apps/frontend` — Portail Angular 21
- **Cœur** (`core/`) : `auth` (catalogue des 6 rôles, `AuthService` en Signals, garde,
  intercepteur JWT/tenant), `tenant` (contexte), `api` (HTTP + SSE), `layout` (shell
  sidebar+topbar), `models`.
- **Features** : `dashboard`, `studio` (liste + **éditeur 4 étapes** + aperçu live + partage),
  `transactions` (filtres + export CSV/JSON/Excel), `users`, `settings`, `admin`
  (console, partenaires + délégation, audit), `cashier` (encaissement guichet + reçu), `auth`.
- **Stores NgRx Signals** : `StudioStore`, `UsersStore`, `SettingsStore`.
- Routing **gardé par rôle** (`moduleGuard`) ; design system fidèle au prototype
  (tokens CSS, rouge FP `#E53935`, police Inter).

---

## 5. Modèle de données (PostgreSQL)

| Table | Service | Rôle |
|-------|---------|------|
| `tenants` | transaction | partenaires (code, api_key_hash, rate_limit_tpm) |
| `transactions` | transaction | **partitionnée** par `RANGE(created_at)` (mensuel, pg_partman) ; index `(tenant_id,status,created_at)` ; unique `(tenant_id,idempotency_key,created_at)` |
| `domain_events` | transaction | **event store** append-only, partitionné |
| `outbox_events` | transaction | outbox pattern (publication fiable Kafka) |
| `payment_interfaces`, `interface_fields` | partner | interfaces de collecte + champs |
| `partner_users`, `partner_settings` | partner | équipe & marque |
| `audit_log` | partner | journal d'audit |
| `transaction_projection`, `tx_stats_daily` | reporting | read models (lecture isolée) |

Multi-tenant : `tenant_id` présent dans **chaque table et chaque requête**. PgBouncer en
`pool_mode = transaction` multiplexe des milliers de connexions clientes sur ~100 serveur.

---

## 6. Flux événementiel (le chemin d'un paiement)

```
1. POST /api/v1/transactions ─▶ transaction-service
   (Redis SETNX idempotence) → INSERT transactions + domain_events + outbox_events
   [MÊME TRANSACTION SQL] → 202 Accepted
2. OutboxPoller ─▶ Kafka  transactions.created
3. payment-service · PaymentEventConsumer
   → PaymentOrchestrator (idempotence Redis) → connecteur (circuit breaker)
   → Kafka  transactions.processed | transactions.failed (DLQ)
4. transaction-service · TransactionResultConsumer
   → UPDATE statut + domain_events + emit SSE
5. reporting-service projette → /reports & live-stats ; dashboard mis à jour (SSE)
```

**Garanties** : at-least-once (outbox + ack manuel) + consommation idempotente (Redis) =
**exactly-once effectif**, **0 duplication**. Échecs irrécupérables → **DLQ**
`transactions.failed`.

---

## 7. Sécurité & multi-tenant

- **Deux voies d'authentification** : JWT (sessions humaines du portail) et API-key
  (machine-à-machine partenaire). L'identité tenant est **toujours posée par le gateway**,
  jamais par le client → isolation stricte.
- **JWT** : HMAC-SHA256 signé (`JwtService`), claims `subject/tenantId/role/partner/exp`,
  secret via variable d'environnement (`JWT_SECRET`).
- **API-key** : jamais stockée en clair — hash **SHA-256** (`tenants.api_key_hash`).
- **Rate-limiting** par tenant (Redis) ; **CORS** restreint à l'origine du portail.
- **Audit** append-only des actions sensibles (publications, délégations, remboursements,
  connexions). Détails et recommandations dans [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md).

---

## 8. Observabilité

- **Micrometer → Prometheus** : TPS, latence P50/P99, taux d'erreur **par tenant** (histogrammes
  + SLO `20ms,100ms,500ms` sur `http.server.requests`).
- **OpenTelemetry → Jaeger** : tracing distribué gateway → service → Kafka → consumer.
- **Grafana** : dashboards FirstPay. **Alertmanager** : alertes (P99 > 100 ms, erreurs > 1 %,
  lag Kafka).
- Probes K8s : `/actuator/health/{liveness,readiness}`.

---

## 9. Build, exécution locale & tests

### 9.1 Frontend seul (le plus rapide — données mock intégrées)
```bash
cd apps/frontend
npm install            # si node_modules absent
npm start              # http://localhost:4200
```
> Le portail fonctionne **sans backend** (stores seed) : on peut parcourir tous les écrans
> et tous les rôles. Comptes de démo : voir `docs/ROLES-MATRIX.md`.

### 9.2 Pile complète (Docker)
```bash
# Infra seule
docker compose up -d postgres pgbouncer kafka redis
# Tout (build des images Java 21 + services + observabilité)
docker compose up --build
```
Accès : portail `:4200` · gateway `:8080` · Grafana `:3000` · Jaeger `:16686` · Prometheus `:9090`.

### 9.3 Tests
- **Frontend** : `npm test` (Karma/Jasmine).
- **Backend** : `mvn test` (nécessite **JDK 21**). Tests unitaires clés :
  `TransactionCommandHandlerTest` (idempotence : doublon → même id),
  `PaymentOrchestratorTest` (exactly-once : rejeu non débité),
  `TransactionControllerTest` (`@WebFluxTest`), `JwtServiceTest`.
- **Charge** (Phase 10, à compléter) : Gatling 1M tx/min, seuils P99 < 500 ms, erreurs < 0.1 %.

### Prérequis
JDK **21** (le projet cible Java 21 ; un JDK 17 fera échouer `mvn`), Node 20+, Docker.

---

## 10. État d'implémentation

| Phase | Périmètre | État |
|-------|-----------|------|
| 0 | Fondations & monorepo | ✅ |
| 1 | Données & domaine (Flyway, partitions) | ✅ |
| 2 | Cœur transaction (CQRS/ES, idempotence, SSE) | ✅ |
| 3 | Gateway & multi-tenant (JWT + API-key, rate-limit) | ✅ |
| 4 | Frontend — socle (design system, auth, shell) | ✅ |
| 5 | Frontend — Studio partenaire | ✅ |
| 6 | Frontend — Banque & Caisse | ✅ |
| 7 | Messaging & paiements (Kafka, outbox, connecteurs) | ✅ |
| 8 | Reporting & projections (read models, exports) | ✅ |
| 9 | Scalabilité & observabilité (K8s, Prometheus/Jaeger) | ✅ |
| 10 | Tests de charge & durcissement final | 🔜 à compléter |

### Vérification effectuée (2026-06-27)
- ✅ **Frontend compilé et servi** : bundle généré (~5 s), `HTTP 200` sur `http://localhost:4200`
  — l'intégralité du code Angular type-check.
- ✅ **docker-compose** validé (`docker compose config` OK, 16 services).
- ✅ **Backend** structurellement cohérent (67 classes Java, intégrations vérifiées :
  EventStore, JwtService, auth partner, connecteurs). Compilation Maven non rejouée dans
  l'environnement courant (JDK 17 ; le projet exige JDK 21) — à confirmer via
  `docker compose up --build` ou `mvn test` sous JDK 21.

### Limites connues / restes
- Connecteurs PSP **simulés** (à remplacer par les SDK réels Orange/MTN/acquéreur/RTGS).
- `TenantRegistry` du gateway = repli in-memory ; source de vérité = partner-service.
- Tests d'intégration **Testcontainers** (Kafka/Redis/PG) et **tests de charge Gatling**
  (Phase 10) à ajouter.
- Frontend ↔ API : brancher les écrans sur les endpoints réels (aujourd'hui sur stores seed).
