# Guide de déploiement — Cash collect First

Ce document décrit le déploiement de la plateforme Cash collect First en **environnement de test** (recette / staging) et en **environnement de production**, avec deux profils de données :

| Profil | Usage | Données |
|--------|-------|---------|
| **Démo / recette** | UAT, démonstration, formation | Tenants SOFT & EPAL, interfaces, transactions et audit pré-chargés (Flyway V2/V4) |
| **Opérationnel minimal** | Mise en production réelle | Schéma seul + bootstrap manuel (1 tenant banque, 1er partenaire pilote) |

---

## 1. Prérequis

### Logiciels

| Composant | Version minimale |
|-----------|------------------|
| JDK | 21 (OpenJDK / Temurin) |
| Maven | 3.9+ |
| Node.js | 20 LTS |
| Docker & Docker Compose | 24+ / v2 |
| kubectl & Helm | 1.28+ / 3.12+ (déploiement K8s) |
| Istio | 1.20+ (prod K8s, optionnel en test) |

### Ressources indicatives

| Environnement | CPU | RAM | Stockage |
|---------------|-----|-----|----------|
| Dev local (Docker Compose) | 4 cœurs | 8 Go | 20 Go |
| Test / staging (K8s) | 8 cœurs | 16 Go | 50 Go |
| Production | 32+ cœurs | 64+ Go | 200 Go+ (PostgreSQL, Kafka, Redis cluster) |

### Secrets à préparer avant tout déploiement

| Variable | Description | Exemple test | Production |
|----------|-------------|--------------|------------|
| `JWT_SECRET` | Secret HMAC JWT (≥ 32 car.) — **identique** sur gateway et partner-service | `firstpay-dev-secret-change-me-please-32b` | Vault / SealedSecret |
| `DB_USER` / `DB_PASS` | Compte PostgreSQL applicatif | `firstpay` / `dev_password` | Compte dédié, mot de passe fort |
| `KAFKA_BROKERS` | Brokers Kafka | `kafka:9092` | Cluster 3+ brokers |
| `REDIS_NODES` | Nœuds Redis | `redis:6379` | Cluster Redis 6+ nœuds |
| Clés API partenaires | Hash SHA-256 en base (`tenants.api_key_hash`) | Voir § 6 | Générées par partenaire, jamais en clair en base |

---

## 2. Vue d'ensemble des modes de déploiement

```
┌─────────────────────────────────────────────────────────────────┐
│  DEV LOCAL          │  TEST / STAGING      │  PRODUCTION        │
├─────────────────────┼──────────────────────┼────────────────────┤
│  docker compose     │  Helm + K8s          │  Helm + K8s        │
│  values.yaml        │  values-staging.yaml │  values-prod.yaml  │
│  profil Spring dev  │  profil Spring prod  │  profil Spring prod│
│  seeds Flyway ON    │  seeds Flyway ON     │  seeds OFF + SQL   │
│  tracing 100 %      │  tracing 50 %        │  tracing 5 %       │
└─────────────────────┴──────────────────────┴────────────────────┘
```

**Services déployés :**

- `api-gateway` (8080) — point d'entrée unique
- `transaction-service`, `partner-service`, `payment-service`, `reporting-service`
- `frontend` (Angular 21, nginx)
- Infra : PostgreSQL (+ réplica lecture), PgBouncer, Kafka, Redis
- Observabilité (optionnel) : Prometheus, Grafana, Jaeger, Alertmanager

---

## 3. Environnement de TEST

L'environnement de test sert à la recette fonctionnelle, aux démos et aux tests de charge. Il inclut **automatiquement** les données de démonstration via Flyway.

### 3.1 Option A — Docker Compose (recommandé pour test local)

#### 3.1.1 Build et démarrage

```bash
cd firstpay-studio

# Build Maven (images Docker utilisent le contexte racine)
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64   # adapter si besoin
mvn -B -ntp verify -DskipTests=false

# Démarrer toute la stack (infra + services + frontend)
export JWT_SECRET="firstpay-test-secret-min-32-chars!!"
docker compose up -d --build

# Observabilité (optionnel)
docker compose up -d prometheus grafana jaeger otel-collector alertmanager
```

**Ordre de démarrage :** PostgreSQL → PgBouncer → Kafka / Redis → microservices → gateway → frontend.

Les migrations Flyway s'exécutent au démarrage de `partner-service`, `transaction-service` et `reporting-service`. Les fichiers `V2__seed_demo_data.sql` et `V4__seed_audit_data.sql` peuplent la base.

#### 3.1.2 Ports exposés (test local)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:14200 |
| API Gateway | http://localhost:18080 |
| Grafana | http://localhost:13000 (admin / admin) |
| Prometheus | http://localhost:19090 |
| Jaeger | http://localhost:16686 |
| PostgreSQL | localhost:15432 |
| PgBouncer | localhost:16432 |
| Redis | localhost:16379 |
| Kafka | localhost:19092 |

#### 3.1.3 Vérification

```bash
chmod +x infrastructure/scripts/verify-deployment.sh
./infrastructure/scripts/verify-deployment.sh
```

Résultat attendu : health OK, JWT émis, transactions et reporting accessibles.

### 3.2 Option B — Kubernetes staging

#### 3.2.1 Prérequis cluster

- Namespace `firstpay` créé
- Registry d'images accessible (`firstpay/*:staging`)
- Secrets PostgreSQL, JWT, Kafka injectés (Helm ou Vault)
- Istio installé si `istio.enabled: true`

#### 3.2.2 Build et push des images

```bash
cd firstpay-studio
mvn -B -ntp verify

TAG=staging
REGISTRY=registry.example.com/firstpay

for svc in api-gateway transaction-service partner-service payment-service reporting-service; do
  docker build -t "${REGISTRY}/${svc}:${TAG}" -f "services/${svc}/Dockerfile" . 2>/dev/null \
    || docker build -t "${REGISTRY}/${svc}:${TAG}" -f "apps/${svc}/Dockerfile" .
  docker push "${REGISTRY}/${svc}:${TAG}"
done

docker build -t "${REGISTRY}/frontend:${TAG}" -f apps/frontend/Dockerfile .
docker push "${REGISTRY}/frontend:${TAG}"
```

#### 3.2.3 Déploiement Helm

```bash
cd infrastructure/helm/firstpay

# Adapter global.imageRegistry et secrets dans values-staging.yaml
helm upgrade --install firstpay . \
  -n firstpay --create-namespace \
  -f values.yaml \
  -f values-staging.yaml \
  --set global.imageTag=staging \
  --set secrets.data.JWT_SECRET="firstpay-test-secret-min-32-chars!!"
```

Vérifier le rollout :

```bash
kubectl -n firstpay rollout status deploy/transaction-service
kubectl -n firstpay get pods,svc,hpa
```

URL publique (selon Istio Gateway) : `https://studio-staging.afrilandfirstbank.com`

### 3.3 Données démo (environnement de test)

Les migrations Flyway suivantes chargent les données de recette :

| Migration | Service | Contenu |
|-----------|---------|---------|
| `V2__seed_demo_data.sql` | partner-service | Tenants SOFT & EPAL, 3 interfaces, utilisateurs partenaire |
| `V3__tenant_api_keys.sql` | partner-service | Hash des clés API démo |
| `V2__seed_demo_data.sql` | transaction-service | 3 transactions exemple |
| `V4__seed_audit_data.sql` | partner-service | 4 entrées journal d'audit |

#### Comptes portail (frontend)

Le portail propose 6 comptes de démonstration (sélection directe à l'écran de login) :

| Rôle | Nom | Email |
|------|-----|-------|
| Administrateur banque | Cécile Mvondo | `admin.banque@afrilandfirstbank.com` |
| Caissière agence | Sylvie Atangana | `caisse.bonanjo@afrilandfirstbank.com` |
| Admin partenaire | Jospin Leunou | `jospinleunou@softtech.cm` |
| Gestionnaire | Marie Ngono | `marie.ngono@softtech.cm` |
| Comptable | Daniel Essomba | `d.essomba@softtech.cm` |
| Lecture seule | Sophie Mbarga | `s.mbarga@softtech.cm` |

> **Note :** les rôles banque (`bank_admin`, `bank_cashier`) sont gérés côté frontend pour la démo. L'authentification JWT backend ne couvre aujourd'hui que les utilisateurs présents dans `partner_users`. Les comptes partenaire ci-dessus obtiennent un JWT réel via `POST /api/v1/auth/login` avec le mot de passe `demo`.

#### Clés API de test

| Partenaire | Clé API (header `X-Api-Key`) | Tenant ID |
|------------|------------------------------|-----------|
| SOFT TECHNOLOGIES | `demo-soft-key` | `11111111-1111-1111-1111-111111111111` |
| ÉCOLE LES PALMIERS | `demo-epal-key` | `22222222-2222-2222-2222-222222222222` |

Exemple d'appel :

```bash
curl -X POST http://localhost:18080/api/v1/transactions \
  -H 'Content-Type: application/json' \
  -H 'X-Api-Key: demo-soft-key' \
  -H 'X-Tenant-Id: 11111111-1111-1111-1111-111111111111' \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{"externalRef":"TEST-001","amount":25000,"currency":"XAF","type":"PAYMENT","method":"orange"}'
```

### 3.4 Tests complémentaires (staging)

```bash
# Tests de charge Gatling (workflow_dispatch ou local)
cd tests/load-tests && ./gradlew gatlingRun

# Chaos engineering (cluster K8s requis)
./tests/chaos/run-chaos.sh

# Validation SLO
GATEWAY_URL=https://studio-staging.example.com ./tests/slo-recette/validate-slo.sh
```

---

## 4. Environnement de PRODUCTION

La production cible ≥ 1 M tx/min. Le chart Helm `values-prod.yaml` dimensionne les réplicas, le HPA et le tracing (5 %).

### 4.1 Checklist pré-production

- [ ] Secrets dans Vault / SealedSecrets (pas de `secrets.create: true` en prod)
- [ ] `JWT_SECRET` ≥ 32 caractères, rotation planifiée
- [ ] TLS terminé (Istio Gateway ou ingress), mTLS STRICT activé
- [ ] PostgreSQL : auth forte, sauvegardes PITR, réplica lecture opérationnel
- [ ] Kafka : RF=3, `min.insync.replicas=2`
- [ ] Redis Cluster (pas instance standalone)
- [ ] Alertmanager branché (PagerDuty / Slack)
- [ ] Revue `docs/SECURITY-REVIEW.md` validée
- [ ] Profil de données choisi (§ 4.2 ou § 4.3)

### 4.2 Production avec données démo (recette pré-prod / UAT)

Utiliser ce profil pour une **recette client** ou une **pré-production** où l'équipe métier doit manipuler des données réalistes sans impacter la prod réelle.

**Procédure :** identique au staging (§ 3.2), avec `values-prod.yaml` pour le dimensionnement, mais sur un cluster / domaine dédié UAT :

```bash
helm upgrade --install firstpay ./infrastructure/helm/firstpay \
  -n firstpay-uat --create-namespace \
  -f values.yaml \
  -f values-prod.yaml \
  --set global.domain=studio-uat.afrilandfirstbank.com \
  --set global.environment=uat \
  --set secrets.create=false
```

Les seeds Flyway V2/V4 s'appliquent normalement. Conserver les comptes et clés API de la section 3.3.

> Ne pas utiliser ce profil sur le cluster de production métier : les clés `demo-soft-key` / `demo-epal-key` et le mot de passe `demo` sont publics dans le dépôt.

### 4.3 Production opérationnelle — sans données démo (minimal)

Profil pour la **mise en service réelle** : schéma complet, aucune donnée fictive, bootstrap minimal pour l'exploitation.

#### Étape 1 — Déployer l'infrastructure et les services

```bash
# Secrets (exemple avec kubectl ; préférer Vault en prod)
kubectl -n firstpay create secret generic firstpay-secrets \
  --from-literal=DB_USER=firstpay \
  --from-literal=DB_PASS='***' \
  --from-literal=JWT_SECRET='***' \
  --dry-run=client -o yaml | kubectl apply -f -

helm upgrade --install firstpay ./infrastructure/helm/firstpay \
  -n firstpay \
  -f values.yaml \
  -f values-prod.yaml \
  --set secrets.create=false
```

Attendre que les pods soient `Ready` et que Flyway ait terminé (logs `partner-service` : `Successfully applied migration`).

#### Étape 2 — Purger les données démo

Les migrations V2/V4 s'exécutent au premier démarrage. Les supprimer immédiatement après :

```bash
psql "postgresql://firstpay:***@postgres-primary.firstpay.svc:5432/firstpay" \
  -f infrastructure/scripts/sql/prod-cleanup-demo-data.sql
```

#### Étape 3 — Bootstrap minimal

1. Générer les hash SHA-256 des clés API (ne jamais stocker la clé en clair en base) :

```bash
echo -n 'fpk_live_votre_cle_banque' | sha256sum
echo -n 'fpk_live_votre_cle_partenaire' | sha256sum
```

2. Éditer `infrastructure/scripts/sql/prod-minimal-bootstrap.sql` : remplacer les placeholders `REMPLACER_PAR_SHA256_HEX_*`.

3. Exécuter :

```bash
psql "postgresql://firstpay:***@postgres-primary.firstpay.svc:5432/firstpay" \
  -f infrastructure/scripts/sql/prod-minimal-bootstrap.sql
```

**Contenu minimal créé :**

- Tenant plateforme banque (`FSPAY_PLATFORM`) — supervision, clé API interne
- Premier partenaire pilote avec admin (`admin@partenaire-pilote.cm`)
- Paramètres de marque par défaut

#### Étape 4 — Configurer le frontend production

Le build Angular utilise `environment.prod.ts` (`apiUrl: '/api'`). Nginx proxifie `/api/` vers la gateway (voir `apps/frontend/nginx.conf`).

Variables à configurer côté ingress / CDN :

- `FRONTEND_ORIGIN` = `https://studio.afrilandfirstbank.com` (ConfigMap Helm)
- CORS gateway aligné sur ce domaine

#### Étape 5 — Premier accès opérationnel

| Action | Procédure |
|--------|-----------|
| Connexion partenaire pilote | `POST /api/v1/auth/login` avec l'email bootstrap ; mot de passe via futur IdP (aujourd'hui `demo` si non remplacé) |
| Appels M2M | Header `X-Api-Key: fpk_live_votre_cle_partenaire` + `X-Tenant-Id` |
| Supervision banque | Console admin via compte banque (intégration SSO à planifier) ; API audit `GET /api/v1/audit` |
| Enrôlement nouveau partenaire | API partner-service ou insertion SQL tenant + hash clé + `partner_users` |

#### Limitation connue — rôles banque

Les rôles `bank_admin` et `bank_cashier` sont encore portés par le catalogue frontend (`DEMO_ACCOUNTS`). Pour une prod sans démo :

1. **Court terme :** accès supervision via API (audit, transactions plateforme) avec clé API banque et outils internes.
2. **Moyen terme :** brancher un IdP (LDAP / OIDC) et persister les utilisateurs banque en base.

---

## 5. Variables d'environnement par service

### 5.1 Communes (ConfigMap Helm `firstpay-config`)

| Variable | Description |
|----------|-------------|
| `SPRING_PROFILES_ACTIVE` | `dev` (Compose) / `prod` (K8s) |
| `DB_URL` | R2DBC via PgBouncer : `r2dbc:pool:postgresql://pgbouncer:6432/firstpay` |
| `JDBC_URL` | JDBC direct primaire (Flyway) |
| `READ_DB_URL` | R2DBC réplica (reporting-service) |
| `KAFKA_BROKERS` | Brokers Kafka |
| `REDIS_NODES` | Nœuds Redis |
| `JWT_SECRET` | Secret JWT (Secret K8s) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Collecteur OpenTelemetry |
| `TRACING_SAMPLE_RATE` | `1.0` test · `0.5` staging · `0.05` prod |
| `FRONTEND_ORIGIN` | Origine CORS autorisée |

### 5.2 Spécifiques

| Service | Variable supplémentaire |
|---------|-------------------------|
| api-gateway | `PARTNER_SVC_URI`, `REDIS_NODES` |
| transaction-service | `DB_USER`, `DB_PASS` |
| partner-service | `JWT_TTL_SECONDS` (défaut 28800 = 8 h) |
| reporting-service | `READ_DB_URL` obligatoire en prod |

Référence complète : `docker-compose.yml` et `infrastructure/helm/firstpay/templates/configmap.yaml`.

---

## 6. Base de données et migrations Flyway

Chaque service possède son propre historique Flyway :

| Service | Table d'historique | Migrations |
|---------|-------------------|------------|
| transaction-service | `flyway_schema_history` | Schéma tenants, transactions partitionnées, event store, outbox |
| partner-service | `partner_flyway_schema_history` | Interfaces, utilisateurs, audit |
| reporting-service | `reporting_flyway_schema_history` | Projections read-model |

### Politique par environnement

| Environnement | Migrations schema (V1) | Migrations seed (V2, V4) | Migration clés démo (V3) |
|---------------|------------------------|--------------------------|--------------------------|
| Test / staging | ✅ | ✅ | ✅ |
| Prod UAT (démo) | ✅ | ✅ | ✅ |
| Prod opérationnelle | ✅ | Purger après coup (§ 4.3) | Remplacer par clés réelles |

### Partitionnement PostgreSQL

La table `transactions` est partitionnée mensuellement (`pg_partman`). Vérifier périodiquement :

```sql
SELECT * FROM partman.part_config;
SELECT partman.run_maintenance('public.transactions');
```

---

## 7. Observabilité

| Outil | Test local | Production |
|-------|------------|------------|
| Prometheus | :9090 | ServiceMonitor Helm (`serviceMonitor.enabled: true`) |
| Grafana | :3000 | Dashboards provisionnés dans `infrastructure/observability/grafana/` |
| Jaeger | :16686 | Via OTel Collector |
| Alertmanager | :9093 | Brancher receivers réels (non `null` en prod) |

Health checks Kubernetes :

```
GET /actuator/health/liveness
GET /actuator/health/readiness
```

---

## 8. CI/CD

Le pipeline `.github/workflows/ci.yml` exécute :

1. `mvn verify` (backend + tests)
2. `npm run build` (frontend)
3. Build Docker matrix (sur push)

Workflows complémentaires :

- `security.yml` — npm audit, Prettier, Trivy
- `load-test.yml` — Gatling (déclenchement manuel)

**Promotion test → prod :**

1. Tag image `1.0.0` → push registry prod
2. `helm upgrade` avec `values-prod.yaml`
3. Smoke test + `verify-deployment.sh` adapté à l'URL prod
4. Surveillance Grafana 30 min post-déploiement

---

## 9. Rollback et dépannage

### Rollback Helm

```bash
helm history firstpay -n firstpay
helm rollback firstpay <revision> -n firstpay
```

### Problèmes fréquents

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| `401` sur toutes les API | JWT_SECRET différent gateway / partner-service | Aligner le Secret |
| `403` / tenant inconnu | Hash API-key incorrect | Vérifier `tenants.api_key_hash` |
| Flyway échoue au démarrage | Schéma partiel / conflit migration | Logs service, `flyway repair` si nécessaire |
| Reporting vide | Réplica pas synchronisé | Vérifier `postgres-replica`, `READ_DB_URL` |
| Frontend 502 sur `/api` | Gateway pas prête | `kubectl logs deploy/api-gateway` |
| SSE live-stats coupé | Proxy buffering nginx | `proxy_buffering off` (déjà configuré) |

### Arrêt propre (Docker Compose)

```bash
docker compose down          # conserve les volumes
docker compose down -v       # ⚠️ supprime les données PostgreSQL
```

---

## 10. Récapitulatif des commandes

```bash
# ── TEST LOCAL ──
export JWT_SECRET="firstpay-test-secret-min-32-chars!!"
docker compose up -d --build
./infrastructure/scripts/verify-deployment.sh

# ── STAGING K8s ──
helm upgrade --install firstpay ./infrastructure/helm/firstpay \
  -n firstpay -f values.yaml -f values-staging.yaml

# ── PROD (minimal) ──
helm upgrade --install firstpay ./infrastructure/helm/firstpay \
  -n firstpay -f values.yaml -f values-prod.yaml --set secrets.create=false
# ── PROD VPS (firstsign.afbdei.com) ──
sudo ./infrastructure/scripts/deploy-production.sh      # premier déploiement
sudo ./infrastructure/scripts/update-production.sh      # git pull + rebuild
sudo ./infrastructure/scripts/verify-production.sh      # smoke test HTTPS

---

## 12. Déploiement VPS production (Docker Compose + SSL)

Pour un **serveur unique** (VPS / VM) avec le domaine **`firstsign.afbdei.com`**, sans Kubernetes.

### 12.1 Prérequis serveur

| Élément | Détail |
|---------|--------|
| OS | Ubuntu 22.04+ ou Debian 12+ |
| RAM | 8 Go minimum (16 Go recommandé) |
| CPU | 4 vCPU |
| DNS | Enregistrement **A** : `firstsign.afbdei.com` → IP publique du serveur |
| Pare-feu | Ports **80** et **443** ouverts |
| Accès | SSH + sudo |

### 12.2 Premier déploiement

```bash
# Sur le serveur
sudo apt update && sudo apt install -y git gettext-base

# Cloner le projet (adapter l'URL du dépôt)
sudo git clone https://github.com/VOTRE_ORG/firstpay-studio.git /opt/firstpay-studio
cd /opt/firstpay-studio

# Rendre les scripts exécutables
sudo chmod +x infrastructure/scripts/*.sh

# Déploiement complet (Docker + build + SSL Let's Encrypt via Caddy)
sudo ./infrastructure/scripts/deploy-production.sh
```

Le script :

1. Installe Docker si absent
2. Crée `.env` avec secrets générés (JWT, mot de passe PostgreSQL)
3. Génère le **Caddyfile** pour `firstsign.afbdei.com`
4. Build toutes les images et démarre la stack
5. Obtient automatiquement le **certificat SSL** (Let's Encrypt) au premier accès HTTPS

**URLs après déploiement :**

| Service | URL |
|---------|-----|
| Application | https://firstsign.afbdei.com |
| API | https://firstsign.afbdei.com/api/v1/ |
| Webhooks TrustPayWay | https://firstsign.afbdei.com/webhooks/trustpayway/{mtn\|orange} |

### 12.3 Configuration `.env`

Avant le premier lancement (ou édition après génération auto) :

```bash
cp .env.production.example .env
nano .env
```

Variables importantes :

```bash
DOMAIN=esignafbdei.com
SSL_EMAIL=admin@afbdei.com          # Let's Encrypt
JWT_SECRET=...                         # ≥ 32 caractères
DB_PASS=...                            # PostgreSQL
FRONTEND_ORIGIN=https://esignafbdei.com
PAYMENT_WEBHOOK_BASE=https://firstsign.afbdei.com/webhooks/trustpayway
```

### 12.4 Tester l'application en production

```bash
cd /opt/firstpay-studio

# Smoke test HTTPS + SSL + login démo
sudo ./infrastructure/scripts/verify-production.sh

# Test manuel navigateur
# → https://esignafbdei.com
# → Connexion admin banque : admin.banque@afrilandfirstbank.com / demo

# Test API
curl -sf https://firstsign.afbdei.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jospinleunou@softtech.cm","password":"demo"}'
```

**Configuration post-déploiement (admin banque) :**

1. **Paramètres plateforme** → SMTP (emails partenaires)
2. **Paramètres plateforme** → TrustPayWay (app_id, secret, activer l'agrégateur)
3. Vérifier que `PAYMENT_WEBHOOK_BASE` dans `.env` correspond à l'URL publique

### 12.5 Mise à jour (git pull + rebuild)

```bash
cd /opt/firstpay-studio
sudo ./infrastructure/scripts/update-production.sh
```

Ce script :

1. Sauvegarde PostgreSQL dans `/var/backups/firstpay/` (gzip)
2. `git pull` sur la branche `main` (ou `GIT_BRANCH=xxx`)
3. Rebuild et redémarre tous les conteneurs
4. Lance `verify-production.sh`

Options :

```bash
# Branche spécifique
sudo GIT_BRANCH=release/1.0 ./infrastructure/scripts/update-production.sh

# Rebuild sans git pull
sudo SKIP_PULL=1 ./infrastructure/scripts/update-production.sh

# Sans sauvegarde DB
sudo SKIP_BACKUP=1 ./infrastructure/scripts/update-production.sh
```

### 12.6 Commandes utiles

```bash
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

# Logs
sudo $COMPOSE logs -f api-gateway
sudo $COMPOSE logs -f caddy

# État des conteneurs
sudo $COMPOSE ps

# Arrêt
sudo $COMPOSE down

# Renouvellement SSL (automatique via Caddy — vérification manuelle)
sudo $COMPOSE exec caddy caddy list-certificates
```

### 12.7 Fichiers créés

| Fichier | Rôle |
|---------|------|
| `docker-compose.prod.yml` | Overlay production (secrets, pas de ports internes exposés) |
| `infrastructure/caddy/Caddyfile` | Reverse proxy HTTPS |
| `.env.production.example` | Modèle de configuration |
| `infrastructure/scripts/deploy-production.sh` | Déploiement initial |
| `infrastructure/scripts/update-production.sh` | Mises à jour |
| `infrastructure/scripts/verify-production.sh` | Tests post-déploiement |

---

## 13. Références

- Architecture : [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- Phases d'implémentation : [`docs/PHASES.md`](PHASES.md)
- Sécurité : [`docs/SECURITY-REVIEW.md`](SECURITY-REVIEW.md)
- Tests de charge : [`tests/load-tests/README.md`](../tests/load-tests/README.md)
- Helm : [`infrastructure/helm/firstpay/`](../infrastructure/helm/firstpay/)
