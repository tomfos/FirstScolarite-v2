# Architecture — Cash collect First (cible 1M+ tx/min)

## 1. Objectifs & SLO

| Métrique | Cible |
|----------|-------|
| Débit maximum | ≥ 1 000 000 tx/min (~16 667 TPS) |
| Latence P50 (accusé de réception) | < 20 ms |
| Latence P99 | < 100 ms |
| Taux d'erreur | < 0.01 % |
| Disponibilité | 99.99 % |
| RTO (recovery) | < 30 s |
| Duplication de transactions | 0 % (idempotence stricte) |

Principe directeur : **accuser réception vite, traiter de façon asynchrone**. L'API
expose une écriture en `202 Accepted` (la transaction est persistée + un événement
est publié), et tout le traitement lourd (orchestration paiement, projections,
notifications) se fait via Kafka. C'est ce découplage qui permet d'absorber 16 k TPS.

## 2. Vue d'ensemble

```
                        ┌────────────────────────────┐
        Partenaires ───▶│  API Gateway (Spring Cloud) │  auth API-key, rate-limit
        (REST / WS)     │  TenantExtractorFilter      │  par tenant, circuit breaker
                        └──────────────┬─────────────┘
                                       │ lb://
        ┌──────────────────────────────┼───────────────────────────────┐
        ▼                ▼              ▼               ▼                ▼
 transaction-svc   partner-svc    payment-svc     reporting-svc    (frontend SPA)
 (WebFlux/R2DBC)   (interfaces)   (orchestration) (read models)    Angular 21
        │  ▲              │              │               ▲
        │  │ outbox       │              │               │ projections
        ▼  │              ▼              ▼               │
   ┌─────────────┐   PostgreSQL 16 (partitionné) ◀── PgBouncer (pool transaction)
   │   Kafka     │◀──── outbox poller ───┘                 │
   │ 12 part/topic│                                         │ read replicas
   └──────┬──────┘                                          ▼
          │ consumers (par partition, virtual threads)  reporting read DB
          ▼
   Redis Cluster  (idempotency keys · cache L2 · rate limit · sessions)
```

## 3. Décisions clés

### 3.1 Écriture asynchrone + Outbox pattern
- `POST /transactions` : (1) check idempotence Redis `SETNX`, (2) `INSERT` transaction
  + `INSERT` outbox_events dans **la même transaction SQL**, (3) renvoie `202`.
- Un **outbox poller** (ou Debezium CDC) relit `outbox_events` et publie sur Kafka →
  garantit *at-least-once* sans 2‑phase commit, et la consommation idempotente
  garantit l'effet *exactly-once*.

### 3.2 PostgreSQL haute performance
- Table `transactions` **partitionnée par `RANGE(created_at)`** (mensuel, pg_partman,
  `premake=3`). Les partitions chaudes restent petites → index compacts.
- Index composites : `(tenant_id, status, created_at DESC)` pour les listes ;
  unique `(tenant_id, idempotency_key, created_at)` pour l'idempotence DB.
- **PgBouncer** en `pool_mode = transaction`, `max_client_conn = 5000` → multiplexe
  des milliers de connexions clientes sur ~100 connexions serveur.
- **Read replicas** pour `reporting-service` (séparation read/write) : service
  `postgres-replica` en streaming replication (`docker-compose`) ; `READ_DB_URL` pointe
  vers le réplica, Flyway et écritures sur le primaire.

### 3.3 Kafka — dimensionnement
- Règle : 1 partition ≈ 100 k msg/min ⇒ **12 partitions** par topic chaud pour 1M/min.
- `acks=all`, `min.insync.replicas=2`, `enable.idempotence=true`, `compression=lz4`,
  `batch.size=64KB`, `linger.ms=5`.
- Topics : `transactions.created`, `transactions.processed`, `transactions.failed`
  (DLQ), `payments.outbox` (compacté).
- Consumers : 1 flux par partition (`groupBy(partition)`), ack manuel, DLQ sur erreur.

### 3.4 Redis Cluster
- **Idempotency keys** : `idempotency:{tenant}:{key}` TTL 10 min.
- **Rate limiting** par tenant (`RedisRateLimiter`, défaut 10 000 req/s, configurable
  par `tenants.rate_limit_tpm`).
- **Cache L2** des interfaces de paiement et configs tenant (lecture très chaude).

### 3.5 Réactif + Virtual Threads
- Endpoints critiques en **WebFlux + R2DBC** (non bloquant de bout en bout).
- Java 21 **virtual threads** activés pour le code restant (`spring.threads.virtual`).
- `-XX:+UseZGC -XX:+ZGenerational` pour des pauses GC sub-milliseconde.

### 3.6 Multi-tenant
- Isolation logique par `tenant_id` présent dans **chaque table et chaque requête**.
- Le `TenantExtractorFilter` (Gateway) valide l'API-key, résout le tenant et injecte
  `X-Tenant-Id` + `X-Tenant-Rate-Limit` dans les headers en aval.
- Contexte propagé via `shared-security` (TenantContext) dans chaque service.

## 4. CQRS + Event Sourcing (transaction-service)

```
Command side                         Query side
────────────                         ──────────
CreateTransaction ─▶ Handler ─▶ event_store (domain_events, partitionné)
                        │                  │ projections
                        └─▶ outbox ─▶ Kafka ─▶ reporting-service ─▶ read models
```

- **Commands** : `CreateTransaction`, `ProcessTransaction`, `RefundTransaction`
  (sealed interface). Effets via handler réactif ; chaque commande append dans `domain_events`
  + met à jour la projection `transactions` + outbox (même transaction SQL).
- **Events** : `TransactionCreated/Processed/Failed/Refunded`, versionnés, stockés
  dans `domain_events` (append-only, partitionné par `occurred_at`).
- **Queries** : projections matérialisées côté `reporting-service` (alimentées par
  Kafka), servies depuis les read replicas → les lectures n'impactent pas l'écriture.

## 5. Résilience
- **Resilience4j** : circuit breaker (`payment-gateway`), rate limiter, retry+backoff.
- **DLQ** `transactions.failed` + rejeu manuel/automatique.
- **Idempotence** à 3 niveaux : Redis (rapide), index DB unique (filet), consommation
  Kafka idempotente.
- **PodDisruptionBudget** + readiness/liveness probes → déploiements zéro-downtime.

## 6. Scalabilité horizontale (K8s)
- HPA par service : `minReplicas=5`, `maxReplicas=50`, scale sur CPU 60 % **et** métrique
  custom `transactions_per_second > 2000/pod`.
- Istio VirtualService pour traffic shaping / canary.
- Stateless services → scaling linéaire ; l'état vit dans Postgres/Kafka/Redis.

## 7. Observabilité
- Micrometer → Prometheus (TPS, latence P50/P99, taux d'erreur **par tenant**).
- OpenTelemetry → Jaeger (tracing distribué Gateway → service → Kafka → consumer).
- Alertes : latence P99 > 100 ms, taux d'erreur > 1 %, lag consumer Kafka.
- Dashboard Grafana dédié (`infrastructure/observability/`).

## 8. Sécurité
- API-key hashée (`tenants.api_key_hash`) pour l'accès partenaire machine‑à‑machine ;
  résolution via partner-service (`/internal/v1/tenants/by-key-hash/{hash}`), cache Redis 5 min.
- **JWT portail** : `JwtService` (HS256, `shared-security`) — émission `POST /api/v1/auth/login`
  (partner-service), vérification dans `TenantExtractorFilter` (gateway) ; claims : tenantId, role, partner.
  Le frontend injecte `Authorization: Bearer` (repli API-key si backend indisponible).
- Chiffrement TLS partout, secrets via K8s Secrets / Vault (`JWT_SECRET` partagé gateway + partner-service).
- Audit append-only : event store `domain_events` + endpoint `GET /api/v1/transactions/{id}/events`.

## 9. Tests de charge (validation)
- Gatling (`tests/load-tests/`) : 1M tx/min sur 10 partenaires, scénarios burst ×5,
  panne d'un service, recovery. Seuils : P99 < 500 ms sous burst, erreurs < 0.1 %.
