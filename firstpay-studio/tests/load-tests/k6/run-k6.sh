#!/usr/bin/env bash
# Enchaîne les scénarios k6 (fumée -> charge -> burst) contre l'API Gateway.
# À lancer depuis votre PC (k6 installé). Voir README.md.
#
# Usage :
#   ./run-k6.sh              # enchaîne smoke -> load -> burst
#   ./run-k6.sh smoke        # une seule étape (smoke | load | burst)
#
# Config par variables d'env (valeurs par défaut prêtes à l'emploi) :
#   API_KEY       clé du tenant           (défaut loadtest-key-2026)
#   BASE_URL      URL du gateway          (défaut https://esign.afbdei.com)
#   TARGET_TPS    débit de l'étape load   (défaut 150)
#   BURST_TPS     débit nominal du burst  (défaut 100 ; pic = ×BURST_FACTOR)
#   BURST_FACTOR  multiplicateur du pic   (défaut 5)
#   OUT_DIR       dossier des résultats   (défaut ./k6-results)
set -euo pipefail
cd "$(dirname "$0")"

API_KEY="${API_KEY:-loadtest-key-2026}"
BASE_URL="${BASE_URL:-https://esign.afbdei.com}"
TARGET_TPS="${TARGET_TPS:-150}"
BURST_TPS="${BURST_TPS:-100}"
BURST_FACTOR="${BURST_FACTOR:-5}"
OUT_DIR="${OUT_DIR:-./k6-results}"
STAGE="${1:-all}"

command -v k6 >/dev/null 2>&1 || {
  echo "ERREUR : 'k6' introuvable. Installez-le (README §1) puis relancez." >&2
  exit 1
}
mkdir -p "$OUT_DIR"

# Lance une étape ; --summary-export écrit les métriques en JSON, tee garde le
# tableau console. '|| true' : on n'arrête pas la chaîne si un seuil SLO échoue.
run_stage () {
  local name="$1"; shift
  echo
  echo "==================================================================="
  echo ">>> ÉTAPE : $name"
  echo "==================================================================="
  k6 run \
    -e API_KEY="$API_KEY" -e BASE_URL="$BASE_URL" \
    --summary-export="$OUT_DIR/${name}.json" \
    "$@" transactions.js 2>&1 | tee "$OUT_DIR/${name}.txt" || true
}

smoke () { run_stage smoke -e SCENARIO=smoke; }
load  () { run_stage load  -e SCENARIO=load  -e TARGET_TPS="$TARGET_TPS"; }
burst () { run_stage burst -e SCENARIO=burst -e TARGET_TPS="$BURST_TPS" -e BURST_FACTOR="$BURST_FACTOR"; }

echo "Cible : $BASE_URL | clé : ${API_KEY:0:6}… | résultats : $OUT_DIR"

case "$STAGE" in
  smoke) smoke ;;
  load)  load ;;
  burst) burst ;;
  all)
    smoke
    echo; echo "-> Si l'étape 'smoke' montre des 401/403, arrêtez (Ctrl-C) et corrigez API_KEY."
    load
    burst
    ;;
  *)
    echo "Étape inconnue : '$STAGE' (attendu : smoke | load | burst | all)" >&2
    exit 1
    ;;
esac

echo
echo "Terminé. Résumés : $OUT_DIR/{smoke,load,burst}.txt (+ .json)"
