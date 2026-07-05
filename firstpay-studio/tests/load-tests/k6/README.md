# Test de charge k6 — FirstStudioPay (exécution locale depuis votre PC)

Alternative légère à Gatling (`../README.md`) : un seul binaire `k6`, aucun JDK/Gradle.
Cible le même endpoint `POST /api/v1/transactions` (écriture async → `202 Accepted`)
et les mêmes SLO (P99 < 500 ms, erreurs < 0,1 %).

## 1. Installer k6

- **macOS** : `brew install k6`
- **Windows** : `winget install k6 --source winget`  (ou `choco install k6`)
- **Linux (Debian/Ubuntu)** :
  ```bash
  sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
  ```
- Sinon binaire direct : https://github.com/grafana/k6/releases

Vérifier : `k6 version`

## 2. Ce qu'il vous faut

| Élément | Détail |
|---------|--------|
| `BASE_URL` | **Défaut = `https://esign.afbdei.com`** (endpoint public : nginx proxyfie `/api/` vers le gateway, TLS valide). Rien à configurer — laissez le défaut. |
| `API_KEY` | Clé API d'un **tenant actif**. Son SHA-256 doit correspondre à `tenants.api_key_hash`. Les clés démo (`demo-soft-key`) sont désactivées → `401`. |

> Pas de clé sous la main ? Créez un **tenant de test jetable** côté serveur puis supprimez-le après (voir §4).

## 3. Lancer

`BASE_URL` pointe par défaut sur `https://esign.afbdei.com` — vous n'avez qu'à
fournir `API_KEY`.

```bash
# Fumée : 5 req/s pendant 30 s — valide connectivité + auth
k6 run -e API_KEY=xxxx -e SCENARIO=smoke transactions.js

# Charge soutenue — pic réaliste pour 1M users/jour (~100-200 tx/s)
k6 run -e API_KEY=xxxx -e SCENARIO=load -e TARGET_TPS=150 -e RAMP=30 -e HOLD=150 transactions.js

# Burst & recovery : nominal -> pic ×5 -> retour nominal
k6 run -e API_KEY=xxxx -e SCENARIO=burst -e TARGET_TPS=100 -e BURST_FACTOR=5 transactions.js

# Viser un autre environnement (ex. stack locale via tunnel) : surchargez BASE_URL
k6 run -e BASE_URL=http://localhost:18080 -e API_KEY=xxxx -e SCENARIO=smoke transactions.js
```

### Tout enchaîner en une commande

`run-k6.sh` lance smoke → load → burst et sauvegarde chaque résumé dans
`./k6-results/` :

```bash
./run-k6.sh              # les 3 étapes
./run-k6.sh smoke        # une seule (smoke | load | burst)
TARGET_TPS=200 ./run-k6.sh load   # surcharger un paramètre
```

**Signification des 3 étapes :**
- **smoke** — 5 req/s pendant 30 s. But : vérifier que la connexion, le TLS et
  la clé API marchent (aucun 401/403) *avant* d'envoyer de la charge. Un
  contrôle de bon fonctionnement, pas une mesure de performance.
- **load** — montée jusqu'à `TARGET_TPS` puis palier soutenu. But : mesurer le
  comportement en régime établi au débit cible (P50/P95/P99, taux d'erreur).
  C'est LE test qui répond à « tient-elle la charge de 1M users/jour ? ».
- **burst** — nominal → pic ×`BURST_FACTOR` → retour nominal. But : voir si le
  système absorbe une pointe soudaine (heure de pointe) puis **récupère** sans
  rester dégradé (backpressure & recovery).

### Paramètres (`-e CLE=valeur`)

| Variable | Défaut | Rôle |
|----------|--------|------|
| `BASE_URL` | `https://esign.afbdei.com` | URL de l'API Gateway (endpoint public) |
| `API_KEY` | *(vide)* | clé API d'un tenant actif — **obligatoire** |
| `SCENARIO` | `load` | `smoke` \| `load` \| `burst` |
| `TARGET_TPS` | `150` | débit cible (req/s) |
| `RAMP` / `HOLD` | `30` / `150` | montée / palier en secondes (scénario `load`) |
| `BURST_FACTOR` | `5` | multiplicateur du pic (scénario `burst`) |
| `AMOUNT` / `METHOD` | `25000` / `orange` | corps de la transaction |

### Rapport

- Résumé console en fin de run (P90/P95/P99, taux d'erreur, req/s).
- Export JSON détaillé : `k6 run --out json=resultats.json ...`
- Les seuils (`thresholds`) font **sortir k6 en code ≠ 0** si P99 ≥ 500 ms ou erreurs ≥ 0,1 % (utile en CI).

## 4. (Option) Tenant de test jetable — à exécuter côté serveur

```sql
-- Créer (clé = 'loadtest-key-2026'), rate-limit élevé pour ne pas fausser la mesure
INSERT INTO tenants (code, name, status, config, api_key_hash, rate_limit_tpm)
VALUES ('LOADTEST', 'Load Test Tenant', 'ACTIVE', '{}',
        encode(digest('loadtest-key-2026','sha256'),'hex'), 100000000)
ON CONFLICT (code) DO UPDATE SET api_key_hash = EXCLUDED.api_key_hash;

-- ... lancer k6 avec -e API_KEY=loadtest-key-2026 ...

-- Nettoyer APRÈS le test (les lignes de test sont préfixées 'LOAD-')
DELETE FROM outbox_events        WHERE payload::text LIKE '%LOAD-%';
DELETE FROM domain_events        WHERE payload::text LIKE '%LOAD-%';
DELETE FROM transactions t USING tenants te WHERE t.tenant_id=te.id AND te.code='LOADTEST';
DELETE FROM tenants WHERE code='LOADTEST';
```
> `digest()` nécessite l'extension `pgcrypto`. Sinon, calculez le hash côté shell :
> `printf '%s' 'loadtest-key-2026' | sha256sum` et collez la valeur dans `api_key_hash`.

## 5. (Option) Tunnel SSH pour viser la stack locale du serveur

Non nécessaire avec le défaut public. Utile seulement pour tester le gateway en
direct (`127.0.0.1:18080` du serveur, sans passer par nginx). Depuis votre PC :

```bash
ssh -N -L 18080:127.0.0.1:18080 utilisateur@serveur
# puis, dans un autre terminal, viser le tunnel :
k6 run -e BASE_URL=http://localhost:18080 -e API_KEY=xxxx transactions.js
```
> Un tunnel SSH ajoute de la latence et un plafond de débit : bon pour un *smoke*,
> peu représentatif pour un vrai test de charge. Pour mesurer la capacité réelle,
> injectez depuis une machine proche du serveur (même datacenter/VPC).

## Notes importantes

- `POST /api/v1/transactions` est **asynchrone** (202 → Kafka) : k6 mesure le
  chemin d'ingestion, **sans** déclencher d'appel synchrone à l'agrégateur.
- Chaque transaction crée des lignes en base (`transactions`, `outbox_events`,
  `domain_events`) préfixées `LOAD-` → **pensez à nettoyer** après un gros run (§4).
- Ne visez pas un serveur de prod avec du trafic réel sans fenêtre dédiée.
