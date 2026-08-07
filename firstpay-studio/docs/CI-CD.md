# CI/CD

## Vue d'ensemble

Le pipeline tourne sur **GitHub Actions** (gratuit, hébergé par GitHub — aucun serveur à gérer). 3 workflows, tous dans `.github/workflows/` à la racine du dépôt :

| Fichier | Déclencheur | Rôle |
|---|---|---|
| `ci.yml` | push/PR vers `master`, ou manuel | Build + tests backend, lint + build frontend, build & publication des images Docker |
| `security.yml` | push/PR vers `master`, tous les lundis 6h, ou manuel | `npm audit`, vérif format Prettier, scan de vulnérabilités Trivy |
| `cd.yml` | **manuel uniquement** (pour l'instant) | Déploiement vers un serveur de production, désactivé tant qu'aucun serveur n'est configuré |

## `ci.yml` en détail

3 jobs, dans l'ordre :

1. **`backend`** — `mvn -B -ntp verify` sur tous les modules Maven (`libs/`, `apps/api-gateway`, `services/*`). Compile et exécute les tests JUnit. Publie les rapports Surefire en artefact même en cas d'échec.
2. **`frontend`** — `npm ci`, puis `npm run lint` (ESLint) et `npm run build` (Angular). **Il n'y a pas de tests unitaires frontend** (aucun `.spec.ts` dans le projet, aucune cible `test` configurée dans `angular.json`) — ce n'est donc pas exécuté en CI. Écrire ces tests est un chantier séparé, pas un manque de configuration CI.
3. **`docker`** — seulement sur `push` (pas sur les PR) et seulement si `backend`+`frontend` réussissent. Build les images des 5 services (`api-gateway`, `transaction-service`, `partner-service`, `payment-service`, `reporting-service`) et les publie sur **GHCR** (`ghcr.io/tomfos/firstpay-<service>`), taguées `:latest` et `:<sha du commit>`. Authentification via `GITHUB_TOKEN`, généré automatiquement à chaque run — rien à configurer.

## GHCR (GitHub Container Registry)

Un registre Docker gratuit, intégré à GitHub. Les images publiées sont visibles sous l'onglet **Packages** du compte `tomfos`. Elles servent d'artefact de livraison ("Continuous Delivery") — prêtes à être récupérées par un déploiement, mais **pas utilisées automatiquement** par `cd.yml` (voir plus bas).

## Activer le déploiement (`cd.yml`)

Ce workflow existe mais ne fait rien tant qu'il n'est pas configuré : c'est volontaire, en attendant l'accès à un serveur.

Pour l'activer une fois un serveur disponible :

1. Sur le serveur : cloner le dépôt dans `/opt/firstpay-studio`, créer le fichier `.env` (voir `firstpay-studio/.env.production.example`), s'assurer que Docker + Docker Compose y sont installés.
2. Dans **Settings → Secrets and variables → Actions** du dépôt GitHub, ajouter :
   - `DEPLOY_HOST` : IP ou nom de domaine du serveur
   - `DEPLOY_USER` : utilisateur SSH (avec droits Docker)
   - `DEPLOY_SSH_KEY` : clé privée SSH correspondante
3. (Optionnel) Dans `.github/workflows/cd.yml`, décommenter le bloc `push: branches: [master]` pour un déploiement automatique à chaque merge — sinon il reste déclenchable à la main depuis l'onglet Actions.

Le déploiement fait un `git pull` + `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` sur le serveur (reconstruction depuis le code source, cohérent avec ce que documente déjà `docker-compose.prod.yml`) — il ne consomme pas les images GHCR pour l'instant. Pour passer à un déploiement par pull d'image pré-construite (plus rapide, plus proche des pratiques standard), il faudrait adapter le compose de prod pour référencer `image: ghcr.io/...` au lieu de `build:`.

## Bugs corrigés en mettant en place ce pipeline

Le pipeline existait dans le dépôt depuis un moment (`ci.yml`, `security.yml`) mais **n'avait jamais tourné une seule fois**, pour personne :

- Les fichiers étaient dans `firstpay-studio/.github/workflows/` — un sous-dossier. GitHub Actions ne scanne que `.github/workflows/` à la racine du dépôt.
- Les déclencheurs ciblaient les branches `main`/`develop`, qui n'ont jamais existé dans ce dépôt (seule `master` existe).

Une fois ces deux points corrigés et le pipeline exécuté pour la première fois, 2 bugs préexistants et jusque-là invisibles sont apparus :

- `transaction-service` : les tests de `TransactionCommandHandler` appelaient un constructeur à 5 arguments alors que le code réel en attend 6 depuis l'ajout d'un `ReactiveTransactionManager` (commit `ca30859`) — corrigé.
- `security.yml` référençait `aquasecurity/trivy-action@0.24.0`, un tag inexistant (il manquait le préfixe `v`) — corrigé vers `v0.36.0`.

## Bonnes pratiques mises en place

- **Protection de la branche `master`** (Settings → Branches) : merge impossible si les checks CI ne sont pas au vert.
- **Secrets** : uniquement `GITHUB_TOKEN` (auto-généré) pour l'instant. Les secrets de déploiement (`DEPLOY_*`) ne sont ajoutés que le jour où un serveur existe — jamais commités en clair dans le dépôt.
- **`workflow_dispatch`** sur les 3 workflows : possibilité de les relancer manuellement depuis l'onglet Actions, utile pour tester sans avoir à pousser du code.

## Pourquoi GitHub Actions plutôt que Jenkins

GitHub Actions est hébergé par GitHub — gratuit, aucun serveur à installer ni maintenir. Jenkins est également gratuit en tant que logiciel, mais nécessite un serveur dédié pour tourner en continu. Sans serveur disponible aujourd'hui, GitHub Actions est le choix pragmatique ; les concepts (déclencheurs, jobs, étapes, registry d'images) restent transposables vers Jenkins si l'infrastructure évolue.
