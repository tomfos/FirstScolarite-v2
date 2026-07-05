// Test de charge k6 — création de transactions via l'API Gateway FirstStudioPay.
// Miroir léger de la simulation Gatling `TransactionLoadSimulation`, exécutable
// depuis un PC local (aucun JDK/Gradle requis, juste le binaire `k6`).
//
// Endpoint : POST /api/v1/transactions  (écriture asynchrone -> 202 Accepted)
// Auth     : header X-API-Key dont le SHA-256 doit correspondre à tenants.api_key_hash.
//
// --- Lancement rapide -------------------------------------------------------
//   k6 run -e BASE_URL=https://votre-gateway -e API_KEY=xxxx tests/load-tests/k6/transactions.js
//
// --- Paramètres (variables d'env -e KEY=val) --------------------------------
//   BASE_URL     URL de l'API Gateway              (défaut https://esign.afbdei.com)
//   API_KEY      clé API d'un tenant actif         (OBLIGATOIRE en pratique)
//   SCENARIO     smoke | load | burst              (défaut load)
//   TARGET_TPS   débit cible req/s (load/burst)    (défaut 150)
//   RAMP         durée de montée en s (load)       (défaut 30)
//   HOLD         durée du palier en s (load)       (défaut 150)
//   BURST_FACTOR multiplicateur du pic (burst)     (défaut 5)
//   AMOUNT       montant de la transaction         (défaut 25000)
//   METHOD       orange | mtn | ...                (défaut orange)
//
// Cible de dimensionnement : 1M utilisateurs/jour ≈ 12 tx/s en moyenne,
// pic réaliste ~100-200 tx/s. La cible plateforme (1M tx/min = 16 667 TPS)
// nécessite un cluster + plusieurs injecteurs (cf. ../README.md).

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// ----- paramètres -----------------------------------------------------------
// Défaut = endpoint public (nginx https://esign.afbdei.com/api/ -> gateway).
const BASE_URL = __ENV.BASE_URL || 'https://esign.afbdei.com';
const API_KEY = __ENV.API_KEY || '';
const SCENARIO = (__ENV.SCENARIO || 'load').toLowerCase();
const TARGET_TPS = parseInt(__ENV.TARGET_TPS || '150', 10);
const RAMP = parseInt(__ENV.RAMP || '30', 10);
const HOLD = parseInt(__ENV.HOLD || '150', 10);
const BURST_FACTOR = parseInt(__ENV.BURST_FACTOR || '5', 10);
const AMOUNT = parseInt(__ENV.AMOUNT || '25000', 10);
const METHOD = __ENV.METHOD || 'orange';

// ----- métriques personnalisées ---------------------------------------------
const accepted = new Counter('tx_accepted'); // réponses 202/200
const rejected = new Rate('tx_rejected');    // tout ce qui n'est pas 2xx/503

// ----- scénarios (un seul actif selon SCENARIO) -----------------------------
// Modèle "ouvert" (arrival-rate) : k6 vise un débit req/s stable, comme Gatling
// injectOpen — la latence ne ralentit pas l'injection (les VUs sont ajoutés).
const preAllocatedVUs = Math.max(50, TARGET_TPS);
const maxVUs = Math.max(500, TARGET_TPS * BURST_FACTOR * 4);

const SCENARIOS = {
  // Fumée : faible débit constant, valide la connectivité + l'auth.
  smoke: {
    executor: 'constant-arrival-rate',
    rate: 5, timeUnit: '1s', duration: '30s',
    preAllocatedVUs: 20, maxVUs: 100,
  },
  // Charge soutenue : montée puis palier au débit cible.
  load: {
    executor: 'ramping-arrival-rate',
    startRate: 1, timeUnit: '1s',
    preAllocatedVUs, maxVUs,
    stages: [
      { target: TARGET_TPS, duration: `${RAMP}s` },
      { target: TARGET_TPS, duration: `${HOLD}s` },
    ],
  },
  // Burst & recovery : nominal -> pic ×BURST_FACTOR -> retour nominal.
  burst: {
    executor: 'ramping-arrival-rate',
    startRate: TARGET_TPS, timeUnit: '1s',
    preAllocatedVUs, maxVUs,
    stages: [
      { target: TARGET_TPS, duration: '30s' },
      { target: TARGET_TPS * BURST_FACTOR, duration: '20s' },
      { target: TARGET_TPS * BURST_FACTOR, duration: '40s' },
      { target: TARGET_TPS, duration: '20s' },
      { target: TARGET_TPS, duration: '30s' },
    ],
  },
};

if (!SCENARIOS[SCENARIO]) {
  throw new Error(`SCENARIO inconnu: "${SCENARIO}" (attendu: smoke | load | burst)`);
}

export const options = {
  scenarios: { [SCENARIO]: SCENARIOS[SCENARIO] },
  // SLO (cf. tests/load-tests/README.md — seuils Phase 10 dev) :
  thresholds: {
    http_req_duration: ['p(99)<500'], // P99 < 500 ms
    http_req_failed: ['rate<0.001'],  // erreurs HTTP < 0,1 %
    tx_rejected: ['rate<0.001'],
    checks: ['rate>0.999'],
  },
};

// UUID v4 (k6 n'a pas de générateur natif) — pour X-Idempotency-Key + externalRef.
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function setup() {
  if (!API_KEY) {
    throw new Error(
      'API_KEY manquante. Fournissez la clé API d\'un tenant actif : ' +
      '-e API_KEY=xxxx (le SHA-256 doit matcher tenants.api_key_hash).');
  }
  console.log(`k6 -> ${BASE_URL} | scenario=${SCENARIO} | targetTps=${TARGET_TPS}`);
}

export default function () {
  const id = uuidv4();
  const res = http.post(
    `${BASE_URL}/api/v1/transactions`,
    JSON.stringify({
      externalRef: `LOAD-${id}`,
      amount: AMOUNT,
      currency: 'XAF',
      type: 'PAYMENT',
      method: METHOD,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': API_KEY,
        'X-Idempotency-Key': id,
      },
      tags: { name: 'POST /api/v1/transactions' },
    },
  );

  const ok = check(res, {
    'status 202/200/503': (r) => r.status === 202 || r.status === 200 || r.status === 503,
    'not 401/403 (auth)': (r) => r.status !== 401 && r.status !== 403,
    'not 429 (rate-limit)': (r) => r.status !== 429,
  });

  if (res.status === 202 || res.status === 200) accepted.add(1);
  rejected.add(!(res.status >= 200 && res.status < 300) && res.status !== 503);
}
