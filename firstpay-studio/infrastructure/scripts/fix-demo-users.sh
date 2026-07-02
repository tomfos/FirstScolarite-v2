#!/usr/bin/env bash
# Répare les comptes démo (admin banque, Sophie Mbarga, etc.) pour login avec mot de passe « demo ».
#
# Usage (sur le VPS) :
#   cd /opt/FirstScolarite-v2/firstpay-studio
#   sudo ./infrastructure/scripts/fix-demo-users.sh
#
# Options :
#   COMPOSE_PROJECT_NAME=firstpay-studio
#   VERIFY=1   teste les logins via curl après correction (défaut : 1)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-firstpay-studio}"
VERIFY="${VERIFY:-1}"
BASE_URL="${BASE_URL:-http://esign.afbdei.com}"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/compose-prod.sh"
refresh_compose_cmd

log() { echo "[fix-demo-users] $*"; }
die() { echo "[fix-demo-users] ERREUR: $*" >&2; exit 1; }

[[ "${EUID:-0}" -eq 0 ]] || die "Exécutez avec sudo."

SQL="${PROJECT_ROOT}/infrastructure/scripts/sql/fix-demo-users.sql"
[[ -f "$SQL" ]] || die "Fichier SQL introuvable : ${SQL}"

if ! ${COMPOSE} ps --status running postgres 2>/dev/null | grep -q .; then
  log "Démarrage de PostgreSQL…"
  ${COMPOSE} up -d postgres
  sleep 5
fi

log "Application du correctif SQL…"
${COMPOSE} exec -T postgres psql -U "${DB_USER:-firstpay}" -d firstpay < "$SQL"

if [[ "${VERIFY}" == "1" ]]; then
  log "Vérification des logins (mot de passe demo)…"
  for email in \
    admin.banque@afrilandfirstbank.com \
    s.mbarga@softtech.cm; do
    code=$(curl -sS -o /tmp/fdu.json -w '%{http_code}' --max-time 15 \
      -X POST "${BASE_URL}/api/v1/auth/login" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"${email}\",\"password\":\"demo\"}" || echo "000")
    if [[ "$code" == "200" ]] && grep -q '"token"' /tmp/fdu.json 2>/dev/null; then
      role=$(grep -o '"role":"[^"]*"' /tmp/fdu.json | head -1)
      log "  OK  ${email} → ${role}"
    else
      log "  KO  ${email} → HTTP ${code}"
    fi
  done
fi

log "Terminé. Connexion : http://esign.afbdei.com/login — mot de passe demo"
