# First Collect

Portail de paiement multi‑partenaires d'**Afriland First Bank**. Les partenaires
construisent des **interfaces de paiement** (pages de collecte) sans code ; les
payeurs règlent via Orange Money, MTN MoMo, carte ou virement, avec QR codes. Le
back‑office banque supervise les partenaires, encaisse en agence (caisse) et audite
la plateforme.

> Cible d'ingénierie : **≥ 1 000 000 transactions / minute (~16 667 TPS)**, P99 < 100 ms,
> disponibilité 99.99 %, zéro duplication (idempotence).

## Stack

| Couche        | Technologie |
|---------------|-------------|
| Frontend      | Angular 21 (standalone, Signals, NgRx Signal Store), TypeScript, Vite |
| API Gateway   | Spring Cloud Gateway (reactive) |
| Microservices | Spring Boot 3.x — WebFlux + R2DBC + Virtual Threads (Java 21) |
| Messaging     | Apache Kafka (event‑driven, exactly‑once, outbox pattern) |
| Base données  | PostgreSQL 16 (partitionnement natif, PgBouncer, read replicas) |
| Cache / locks | Redis Cluster (cache L2, idempotency keys, rate limiting) |
| Observabilité | Micrometer + Prometheus + Grafana + OpenTelemetry/Jaeger |
| Déploiement   | Docker + Kubernetes (Helm, HPA, Istio) |

## Arborescence

```
firstpay-studio/
├── apps/
│   ├── frontend/              # Angular 21 (standalone)
│   └── api-gateway/           # Spring Cloud Gateway
├── services/
│   ├── transaction-service/   # CQRS + Event Sourcing — le cœur
│   ├── partner-service/       # Onboarding multi-tenant, interfaces de paiement
│   ├── payment-service/       # Orchestration paiements (Orange/MTN/carte/virement)
│   └── reporting-service/     # Read models / projections / exports
├── libs/
│   ├── shared-domain/         # DTOs, enums, value objects partagés
│   └── shared-security/       # JWT utils, tenant context
├── infrastructure/
│   ├── kafka/  postgresql/  redis/
│   ├── k8s/                   # namespaces + exemple de manifeste
│   ├── helm/firstpay/         # chart paramétré (HPA/PDB/ServiceMonitor/Istio, values par env)
│   └── observability/         # Prometheus + alertes, Grafana, OTel Collector → Jaeger
└── docker-compose.yml         # Dev local complet (+ stack observabilité)
```

## Démarrage rapide (dev local)

```bash
# 1. Infra + services
docker compose up -d postgres pgbouncer kafka redis
docker compose up -d           # build & run de tous les services

# 2. Frontend (hors Docker, hot reload)
cd apps/frontend && npm install && npm start   # http://localhost:4200
```

Comptes de démonstration (voir [`docs/ROLES-MATRIX.md`](docs/ROLES-MATRIX.md)) :

| Rôle | Email |
|------|-------|
| Administrateur Banque | `admin.banque@afrilandfirstbank.com` |
| Caissière Agence | `caisse.bonanjo@afrilandfirstbank.com` |
| Administrateur Partenaire | `jospinleunou@softtech.cm` |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture cible 1M+ tx/min
- [`docs/PHASES.md`](docs/PHASES.md) — phases d'implémentation (roadmap)
- [`docs/UI-UX-DESIGN-SYSTEM.md`](docs/UI-UX-DESIGN-SYSTEM.md) — design system & inventaire des écrans
- [`docs/ROLES-MATRIX.md`](docs/ROLES-MATRIX.md) — rôles & permissions

> **État actuel** : structure de projet (scaffold) + design system + blueprint. Les
> composants et services sont des squelettes structurés ; chaque phase de
> `docs/PHASES.md` les transforme en implémentation complète.
