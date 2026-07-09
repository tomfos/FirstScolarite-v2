# Phases d'implémentation — Cash collect First

Roadmap incrémentale : chaque phase est livrable, testable et déployable.

| # | Phase | Statut |
|---|-------|--------|
| 0 | Fondations & socle | ✅ |
| 1 | Données & domaine | ✅ |
| 2 | Cœur transaction (CQRS) | ✅ |
| 3 | Gateway & multi-tenant | ✅ |
| 4 | Frontend — socle UI | ✅ |
| 5 | Frontend — Studio partenaire | ✅ |
| 6 | Frontend — Banque & Caisse | ✅ |
| 7 | Messaging & paiements | ✅ |
| 8 | Reporting & projections | ✅ |
| 9 | Scalabilité & observabilité | ✅ |
| 10 | Tests de charge & durcissement | ✅ (scaffolding + runbooks) |

---

## Phase 0 — Fondations & socle ✅
- [x] Monorepo Maven + Angular 21 ; `docker-compose.yml` complet (postgres, réplica, pgbouncer, kafka, redis, services, observabilité).
- [x] CI/CD : `.github/workflows/ci.yml`, `security.yml`, `load-test.yml`.
- [x] Conventions : `.editorconfig`, `.prettierrc`, ESLint (`eslint.config.js`), packages `com.firstpay.*`, `JwtService` dans `shared-security`.

## Phase 1 — Données & domaine ✅
- [x] Migrations Flyway partitionnées (`pg_partman`), `domain_events`, `outbox_events`, partner schema, seeds.
- [x] PgBouncer `pool_mode=transaction` ; domain model + enums partagés.

## Phase 2 — Cœur transaction ✅
- [x] CQRS + Event Sourcing (`EventStore`), idempotence, outbox, SSE, process/refund, Testcontainers IT.

## Phase 3 — Gateway & multi-tenant ✅
- [x] JWT + API-key, tenant via partner-service, rate-limit, CORS.

## Phase 4 — Frontend : socle UI ✅
- [x] Angular 21 standalone, tokens CSS, 6 rôles, login JWT, shell (sidebar + breadcrumb + impersonation), interceptor, `ToastComponent`, `StatCard`, `Panel`.
- [x] Mode lecture seule (`studio.write` guard sur éditeur/liste).

## Phase 5 — Frontend : Studio partenaire ✅
- [x] Dashboard branché `ReportingApiService` + SSE live stats ; éditeur 4 étapes (validation complète), aperçu publication modal, share modal QR réel, transactions/users/settings branchés API.

## Phase 6 — Frontend : Banque & Caisse ✅
- [x] Console admin (stats live), partenaires (API + impersonation + audit log), journal d'audit (`/api/v1/audit`).
- [x] Caisse : encaissement via `POST /transactions`, historique caissier (`cashier_history`), reçu imprimable (`@media print`).
- [x] Vues scope route : `transactions_all` (plateforme), `settings_platform`.

## Phase 7–9 — Backend async, reporting, infra ✅
(Voir sections précédentes — messaging, projections, Helm, Istio, observabilité.)

## Phase 10 — Tests de charge & durcissement ✅
- [x] Gatling paramétrable + burst/recovery ; runbook `tests/load-tests/README.md`.
- [x] Chaos : `tests/chaos/run-chaos.sh` ; SLO : `tests/slo-recette/validate-slo.sh`.
- [x] Sécurité : `docs/SECURITY-REVIEW.md` + workflow `security.yml` (npm audit, Trivy, Prettier).
- [ ] Exécution cluster 1M tx/min (multi-injecteurs) — à lancer sur l'environnement cible.

---

### Parallélisation conseillée
- **Track Backend** : 0 → 1 → 2 → 3 → 7 → 8 → 9 → 10.
- **Track Frontend** : 0 → 4 → 5 → 6.
- Convergence en phase 9–10.

Voir aussi : [`DEPLOIEMENT.md`](DEPLOIEMENT.md) (test, prod démo, prod minimal).
