#!/usr/bin/env bash
# Déploiement production complet — Cash collect First sur VPS (Docker Compose + SSL Caddy).
#
# Prérequis serveur :
#   - Ubuntu 22.04+ / Debian 12+
#   - Docker Engine + Compose plugin
#   - DNS : esign.afbdei.com → IP publique du serveur
#   - Ports 80 et 443 ouverts (pare-feu + cloud security group)
#
# Usage (depuis la racine du dépôt cloné sur le serveur) :
#   chmod +x infrastructure/scripts/deploy-production.sh
#   sudo ./infrastructure/scripts/deploy-production.sh
#
# Variables optionnelles :
#   DEPLOY_DIR=/opt/firstpay-studio  — répertoire cible si clone automatique
#   SKIP_CLONE=1                     — ne pas cloner (déjà dans le repo)
#   GIT_REPO=git@github.com:org/firstpay-studio.git
#   REVERSE_PROXY=nginx              — nginx hôte + Certbot (ports 14200/18080), sans Caddy
#   REVERSE_PROXY=caddy              — Caddy sur 80/443 (défaut)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/firstpay-studio}"
DOMAIN="${DOMAIN:-esign.afbdei.com}"
SSL_EMAIL="${SSL_EMAIL:-admin@afbdei.com}"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-firstpay-studio}"
REVERSE_PROXY="${REVERSE_PROXY:-caddy}"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/compose-prod.sh"

refresh_compose_cmd

log() { echo "[deploy] $*"; }
die() { echo "[deploy] ERREUR: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Commande '$1' introuvable. Installez-la avant de continuer."
}

install_docker_if_missing() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return 0
  fi
  log "Installation de Docker…"
  require_cmd curl
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
}

ensure_project_tree() {
  if [[ "${SKIP_CLONE:-0}" == "1" ]] || [[ -f "${PROJECT_ROOT}/docker-compose.yml" ]]; then
    cd "${PROJECT_ROOT}"
    return 0
  fi
  if [[ -n "${GIT_REPO:-}" ]]; then
    log "Clone du dépôt vers ${DEPLOY_DIR}…"
    mkdir -p "$(dirname "${DEPLOY_DIR}")"
    if [[ ! -d "${DEPLOY_DIR}/.git" ]]; then
      git clone "${GIT_REPO}" "${DEPLOY_DIR}"
    fi
    cd "${DEPLOY_DIR}"
    PROJECT_ROOT="${DEPLOY_DIR}"
    return 0
  fi
  cd "${PROJECT_ROOT}"
  [[ -f docker-compose.yml ]] || die "docker-compose.yml introuvable. Lancez depuis la racine du projet ou définissez GIT_REPO."
}

ensure_env_file() {
  local reverse_proxy_cli="${REVERSE_PROXY:-}"
  if [[ ! -f .env ]]; then
    log "Création de .env depuis .env.production.example…"
    cp .env.production.example .env
    JWT=$(openssl rand -base64 48 | tr -d '\n')
    DBP=$(openssl rand -base64 32 | tr -d '\n')
    ITK=$(openssl rand -base64 32 | tr -d '\n')
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT}|" .env
    sed -i "s|DB_PASS=.*|DB_PASS=${DBP}|" .env
    sed -i "s|INTERNAL_TOKEN=.*|INTERNAL_TOKEN=${ITK}|" .env
    sed -i "s|DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
    sed -i "s|SSL_EMAIL=.*|SSL_EMAIL=${SSL_EMAIL}|" .env
    sed -i "s|FRONTEND_ORIGIN=.*|FRONTEND_ORIGIN=https://${DOMAIN}|" .env
    sed -i "s|PAYMENT_WEBHOOK_BASE=.*|PAYMENT_WEBHOOK_BASE=https://${DOMAIN}/webhooks/trustpayway|" .env
    if [[ -n "${reverse_proxy_cli}" ]]; then
      sed -i "s|REVERSE_PROXY=.*|REVERSE_PROXY=${reverse_proxy_cli}|" .env
    fi
    log "Secrets générés automatiquement dans .env — sauvegardez ce fichier en lieu sûr."
  fi
  # shellcheck disable=SC1091
  set -a && source .env && set +a
  if [[ -n "${reverse_proxy_cli}" ]]; then
    REVERSE_PROXY="${reverse_proxy_cli}"
  else
    REVERSE_PROXY="${REVERSE_PROXY:-caddy}"
  fi
  COMPOSE="docker compose -p ${COMPOSE_PROJECT_NAME} $(compose_prod_file_args | tr '\n' ' ')"
  if [[ -z "${INTERNAL_TOKEN:-}" || "${INTERNAL_TOKEN}" == REMPLACER* ]]; then
    ITK=$(openssl rand -base64 32 | tr -d '\n')
    if grep -q '^INTERNAL_TOKEN=' .env 2>/dev/null; then
      sed -i "s|^INTERNAL_TOKEN=.*|INTERNAL_TOKEN=${ITK}|" .env
    else
      echo "INTERNAL_TOKEN=${ITK}" >> .env
    fi
    set -a && source .env && set +a
    log "INTERNAL_TOKEN généré/mis à jour dans .env"
  fi
  [[ -n "${JWT_SECRET:-}" && "${#JWT_SECRET}" -ge 32 ]] || die "JWT_SECRET trop court dans .env (min. 32 caractères)"
  [[ -n "${DB_PASS:-}" ]] || die "DB_PASS manquant dans .env"
  [[ -n "${INTERNAL_TOKEN:-}" ]] || die "INTERNAL_TOKEN manquant dans .env"
  DOMAIN="${DOMAIN:-esign.afbdei.com}"
  SSL_EMAIL="${SSL_EMAIL:-admin@afbdei.com}"
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/lib/public-url.sh"
  warn_domain_origin_mismatch
  PUBLIC_BASE_URL="$(public_base_url)"
}

render_caddyfile() {
  log "Génération du Caddyfile pour ${DOMAIN}…"
  export DOMAIN SSL_EMAIL
  envsubst '${DOMAIN} ${SSL_EMAIL}' \
    < infrastructure/caddy/Caddyfile.template \
    > infrastructure/caddy/Caddyfile
}

ensure_reverse_proxy_ports() {
  if [[ "${REVERSE_PROXY}" == "nginx" ]]; then
    log "Mode nginx hôte — conservation de nginx sur 80/443 (pas de libération de ports)."
    return 0
  fi
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/lib/ensure-ports.sh"
  ensure_reverse_proxy_ports
}

check_dns() {
  log "Vérification DNS pour ${DOMAIN}…"
  if command -v dig >/dev/null 2>&1; then
    RESOLVED=$(dig +short "${DOMAIN}" A | head -1 || true)
    PUBLIC_IP=$(curl -sf --max-time 5 https://ifconfig.me 2>/dev/null || curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || true)
    if [[ -n "${RESOLVED}" && -n "${PUBLIC_IP}" && "${RESOLVED}" != "${PUBLIC_IP}" ]]; then
      log "ATTENTION : ${DOMAIN} → ${RESOLVED}, IP serveur → ${PUBLIC_IP}"
      log "Le certificat SSL Let's Encrypt échouera si le DNS ne pointe pas vers ce serveur."
      if [[ -t 0 ]]; then
        read -r -p "Continuer quand même ? [y/N] " ans
        [[ "${ans:-N}" =~ ^[Yy]$ ]] || exit 1
      else
        log "Mode non interactif — poursuite automatique."
      fi
    else
      log "DNS OK (${DOMAIN} → ${RESOLVED:-?})"
    fi
  else
    log "dig absent — vérifiez manuellement que ${DOMAIN} pointe vers ce serveur."
  fi
}

build_and_start() {
  log "Build des images (peut prendre 15–30 min au premier déploiement)…"
  local attempt=1
  until ${COMPOSE} build --parallel; do
    if [[ $attempt -ge 3 ]]; then
      die "Build Docker échoué après 3 tentatives (réseau Maven instable ?). Relancez le script."
    fi
    log "Build échoué — nouvelle tentative ($((attempt + 1))/3) dans 15 s…"
    sleep 15
    attempt=$((attempt + 1))
  done

  log "Démarrage de la stack production (projet ${COMPOSE_PROJECT_NAME})…"
  stop_conflicting_stacks
  verify_compose_port_bindings || die "Configuration Compose invalide (ports en double). Voir docker-compose.prod.yml."
  ensure_reverse_proxy_ports
  ${COMPOSE} up -d

  log "Attente du service transaction-service (max 3 min)…"
  local i=0
  while [[ $i -lt 36 ]]; do
    STATUS=$(${COMPOSE} ps transaction-service --format '{{.Health}}' 2>/dev/null || echo "")
    if [[ "${STATUS}" == "healthy" ]]; then
      log "transaction-service healthy"
      break
    fi
    sleep 5
    i=$((i + 1))
  done
}

post_deploy_info() {
  local base="${PUBLIC_BASE_URL:-$(public_base_url 2>/dev/null || echo "https://${DOMAIN}")}"
  local api_hint="" local_hint=""
  if [[ "${REVERSE_PROXY}" == "nginx" ]]; then
    local_hint="
║  Docker (local) : http://127.0.0.1:${NGINX_FRONTEND_PORT:-14200}
║  Config nginx   : infrastructure/nginx/esign.afbdei.com.conf"
    api_hint="
║  Doc API (Swagger) : ${base}/swagger-ui/index.html
║  Test login API    : curl -X POST ${base}/api/v1/auth/login \\
║      -H 'Content-Type: application/json' \\
║      -d '{\"email\":\"jospinleunou@softtech.cm\",\"password\":\"demo\"}'"
  else
    api_hint="
║  Doc API (Swagger) : ${base}/swagger-ui/index.html
║  ( /api/v1/ n'est pas une page web — utiliser Swagger ou curl )"
  fi
  cat <<EOF

╔══════════════════════════════════════════════════════════════════╗
║  Cash collect First — déploiement terminé                           ║
╠══════════════════════════════════════════════════════════════════╣
║  Application : ${base}
${api_hint}
║  Webhooks    : ${base}/webhooks/trustpayway/{network}
${local_hint}
╠══════════════════════════════════════════════════════════════════╣
║  Connexion portail (mot de passe : demo)
║    Admin banque    : admin.banque@afrilandfirstbank.com
║    Caissière       : caisse.bonanjo@afrilandfirstbank.com
║    Admin partenaire: jospinleunou@softtech.cm
║    Gestionnaire    : marie.ngono@softtech.cm
║    Comptable       : d.essomba@softtech.cm
╠══════════════════════════════════════════════════════════════════╣
║  Vérification :
║    ./infrastructure/scripts/verify-production.sh
║
║  Mise à jour ultérieure :
║    ./infrastructure/scripts/update-production.sh
╠══════════════════════════════════════════════════════════════════╣
║  Admin banque : Paramètres plateforme → config SMTP + TrustPayWay
║  Recette (seed démo, sans SSL) :
║    sudo ./infrastructure/scripts/deploy-demo.sh
╚══════════════════════════════════════════════════════════════════╝

EOF
}

main() {
  [[ "${EUID:-0}" -eq 0 ]] || die "Exécutez avec sudo pour Docker et les ports 80/443."

  require_cmd git
  require_cmd openssl
  require_cmd envsubst || apt-get install -y gettext-base 2>/dev/null || true

  install_docker_if_missing
  ensure_project_tree
  ensure_env_file
  if [[ "${REVERSE_PROXY}" == "nginx" ]]; then
    log "Mode REVERSE_PROXY=nginx — Caddy désactivé, frontend sur 127.0.0.1:${NGINX_FRONTEND_PORT:-14200}"
  else
    render_caddyfile
  fi
  check_dns
  build_and_start

  if [[ -x infrastructure/scripts/verify-production.sh ]]; then
    PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-$(public_base_url)}"
    DOMAIN="${DOMAIN}" GATEWAY_URL="${PUBLIC_BASE_URL}" FRONTEND_URL="${PUBLIC_BASE_URL}" \
      infrastructure/scripts/verify-production.sh || log "Vérification partielle — relancez verify-production.sh dans 2 min."
  fi

  post_deploy_info
}

main "$@"
