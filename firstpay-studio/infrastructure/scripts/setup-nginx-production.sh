#!/usr/bin/env bash
# Configure le serveur pour FirstPay Studio en mode production avec nginx hôte.
#
# Problème résolu : évite le conflit Caddy (80/443) quand nginx système est déjà actif.
# Met à jour .env, installe la config nginx (Studio + API + page payeur), démarre Docker.
#
# Usage (sur le VPS, depuis la racine du dépôt) :
#   chmod +x infrastructure/scripts/setup-nginx-production.sh
#   sudo DOMAIN=esign.afbdei.com ./infrastructure/scripts/setup-nginx-production.sh
#
# Options :
#   DOMAIN=esign.afbdei.com     domaine public (défaut : valeur .env ou esign.afbdei.com)
#   SKIP_BUILD=1                ne pas rebuild les images Docker
#   SKIP_NGINX=1                ne pas toucher à nginx
#   SKIP_DOCKER=1               ne pas démarrer Docker
#   RUN_CERTBOT=1               lancer certbot --nginx après installation
#   SSL_EMAIL=admin@example.com e-mail Let's Encrypt (RUN_CERTBOT=1)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-firstpay-studio}"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/compose-prod.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/public-url.sh"

log()  { echo "[setup-nginx] $*"; }
warn() { echo "[setup-nginx] ATTENTION: $*" >&2; }
die()  { echo "[setup-nginx] ERREUR: $*" >&2; exit 1; }

require_root() {
  [[ "${EUID:-0}" -eq 0 ]] || die "Exécutez avec sudo."
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Commande « $1 » introuvable."
}

ensure_env_file() {
  if [[ ! -f .env ]]; then
    log "Création de .env depuis .env.production.example…"
    cp .env.production.example .env
    if [[ -z "${JWT_SECRET:-}" || "${JWT_SECRET}" == REMPLACER* ]]; then
      local jwt dbp itk
      jwt=$(openssl rand -base64 48 | tr -d '\n')
      dbp=$(openssl rand -base64 32 | tr -d '\n')
      itk=$(openssl rand -base64 32 | tr -d '\n')
      sed -i "s|JWT_SECRET=.*|JWT_SECRET=${jwt}|" .env
      sed -i "s|DB_PASS=.*|DB_PASS=${dbp}|" .env
      sed -i "s|INTERNAL_TOKEN=.*|INTERNAL_TOKEN=${itk}|" .env
      log "Secrets générés dans .env — sauvegardez ce fichier."
    fi
  fi
}

set_env_var() {
  local key=$1 val=$2 file=.env
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$file"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

configure_env() {
  ensure_env_file
  # shellcheck disable=SC1091
  set -a && source .env && set +a

  DOMAIN="${DOMAIN:-esign.afbdei.com}"
  SSL_EMAIL="${SSL_EMAIL:-admin@afbdei.com}"

  local origin
  if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    origin="https://${DOMAIN}"
  else
    origin="http://${DOMAIN}"
  fi

  log "Configuration .env (REVERSE_PROXY=nginx, DOMAIN=${DOMAIN})…"
  set_env_var REVERSE_PROXY nginx
  set_env_var FREE_PORTS_ON_DEPLOY false
  set_env_var DOMAIN "${DOMAIN}"
  set_env_var SSL_EMAIL "${SSL_EMAIL}"
  set_env_var FRONTEND_ORIGIN "${origin}"
  set_env_var PAYMENT_WEBHOOK_BASE "${origin}/webhooks/trustpayway"
  set_env_var NGINX_FRONTEND_PORT "${NGINX_FRONTEND_PORT:-14200}"
  set_env_var NGINX_GATEWAY_PORT "${NGINX_GATEWAY_PORT:-18080}"
  set_env_var NGINX_PAYER_PORT "${NGINX_PAYER_PORT:-14300}"

  # shellcheck disable=SC1091
  set -a && source .env && set +a
  refresh_compose_cmd
}

stop_firstpay_caddy_only() {
  command -v docker >/dev/null 2>&1 || return 0
  local files
  files="$(compose_prod_file_args | tr '\n' ' ')"
  if docker compose -p "${COMPOSE_PROJECT_NAME}" ${files} ps -q caddy 2>/dev/null | grep -q .; then
    log "Arrêt du conteneur Caddy FirstPay (conflit 80/443 évité en mode nginx)…"
    docker compose -p "${COMPOSE_PROJECT_NAME}" ${files} stop caddy 2>/dev/null || true
    docker compose -p "${COMPOSE_PROJECT_NAME}" ${files} rm -f caddy 2>/dev/null || true
  fi
}

# Reload nginx en gérant les cas dégradés : service systemd inactif/failed
# (un master a été démarré manuellement) et /run/nginx.pid vide.
reload_nginx() {
  nginx -t || { warn "nginx -t a échoué — reload annulé."; return 1; }

  systemctl enable nginx 2>/dev/null || true

  # 1) Chemin nominal : systemd gère nginx.
  if systemctl is-active --quiet nginx 2>/dev/null; then
    systemctl reload nginx && { log "nginx rechargé via systemd."; return 0; }
  fi

  # 2) Un master tourne hors systemd → signal HUP direct au master.
  local master
  master=$(pgrep -f 'nginx: master process' | head -1 || true)
  if [[ -n "${master}" ]]; then
    if nginx -s reload 2>/dev/null; then
      log "nginx rechargé via 'nginx -s reload'."
      return 0
    fi
    kill -HUP "${master}" && { log "nginx rechargé (HUP → master ${master})."; return 0; }
  fi

  # 3) Aucun master → tentative de démarrage.
  systemctl start nginx 2>/dev/null && { log "nginx démarré via systemd."; return 0; }
  nginx && { log "nginx démarré."; return 0; }

  warn "Impossible de recharger/démarrer nginx — intervention manuelle requise."
  return 1
}

install_nginx_config() {
  require_cmd nginx
  require_cmd envsubst

  local domain="${DOMAIN}"
  local snippet_src="${PROJECT_ROOT}/infrastructure/nginx/snippets/firstpay-proxy.conf"
  local snippet_dst="/etc/nginx/snippets/firstpay-proxy.conf"
  local locations_src="${PROJECT_ROOT}/infrastructure/nginx/snippets/firstpay-locations.conf"
  local locations_dst="/etc/nginx/snippets/firstpay-locations.conf"
  local template_http="${PROJECT_ROOT}/infrastructure/nginx/firstpay-site.conf.template"
  local template_ssl="${PROJECT_ROOT}/infrastructure/nginx/firstpay-site-ssl.conf.template"
  local generated="${PROJECT_ROOT}/infrastructure/nginx/generated/${domain}.conf"
  local available="/etc/nginx/sites-available/${domain}"
  local enabled="/etc/nginx/sites-enabled/${domain}"

  [[ -f "$template_http" ]] || die "Template introuvable : ${template_http}"
  [[ -f "$template_ssl" ]]  || die "Template introuvable : ${template_ssl}"
  [[ -f "$snippet_src" ]]   || die "Snippet introuvable : ${snippet_src}"
  [[ -f "$locations_src" ]] || die "Snippet introuvable : ${locations_src}"

  mkdir -p "${PROJECT_ROOT}/infrastructure/nginx/generated"
  mkdir -p /etc/nginx/snippets

  log "Installation des snippets nginx…"
  cp "$snippet_src" "$snippet_dst"
  cp "$locations_src" "$locations_dst"

  # Choix du template : HTTPS si le certificat Let's Encrypt existe déjà, sinon
  # HTTP seul (bootstrap / avant émission certbot). Rend le HTTPS durable :
  # chaque régénération réinjecte le bloc 443 tant que le certificat est présent.
  local template
  if [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]]; then
    template="$template_ssl"
    log "Certificat détecté → génération avec bloc HTTPS (443 + redirection 80→443)."
  else
    template="$template_http"
    log "Aucun certificat pour ${domain} → génération HTTP seule (lancez certbot ensuite)."
  fi

  if [[ -f "$available" ]]; then
    cp "$available" "${available}.bak.$(date +%Y%m%d_%H%M%S)"
    log "Sauvegarde de l'ancienne config → ${available}.bak.*"
  fi

  log "Génération de la config nginx pour ${domain}…"
  export DOMAIN="${domain}"
  export NGINX_FRONTEND_PORT="${NGINX_FRONTEND_PORT:-14200}"
  export NGINX_GATEWAY_PORT="${NGINX_GATEWAY_PORT:-18080}"
  export NGINX_PAYER_PORT="${NGINX_PAYER_PORT:-14300}"
  envsubst '${DOMAIN} ${NGINX_FRONTEND_PORT} ${NGINX_GATEWAY_PORT} ${NGINX_PAYER_PORT}' \
    < "$template" > "$generated"

  log "Activation du site ${domain}…"
  cp "$generated" "$available"
  ln -sf "$available" "$enabled"

  if ! nginx -t; then
    die "nginx -t a échoué — vérifiez ${available}"
  fi

  reload_nginx
  log "nginx rechargé — ${available}"
}

run_certbot_if_requested() {
  [[ "${RUN_CERTBOT:-0}" == "1" ]] || return 0
  require_cmd certbot
  log "Obtention / renouvellement certificat Let's Encrypt pour ${DOMAIN}…"
  certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${SSL_EMAIL}" \
    || warn "Certbot a échoué — le site reste accessible en HTTP."
  # Régénère le site avec le bloc HTTPS maintenant que le certificat existe,
  # puis reload (certbot a pu modifier le fichier ; on repart du template).
  install_nginx_config
}

start_docker_stack() {
  require_cmd docker
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin requis."

  stop_firstpay_caddy_only
  stop_conflicting_stacks
  verify_compose_port_bindings || die "Ports Docker invalides — vérifiez docker-compose.nginx-prod.yml"

  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    log "Démarrage Docker (sans rebuild)…"
    ${COMPOSE} up -d
  else
    log "Build + démarrage Docker (peut prendre 15–30 min)…"
    ${COMPOSE} up -d --build
  fi

  log "Attente transaction-service (max 3 min)…"
  local i=0
  while [[ $i -lt 36 ]]; do
    local status
    status=$(${COMPOSE} ps transaction-service --format '{{.Health}}' 2>/dev/null || echo "")
    if [[ "${status}" == "healthy" ]]; then
      log "transaction-service healthy"
      break
    fi
    sleep 5
    i=$((i + 1))
  done
}

smoke_tests() {
  local fp="${NGINX_FRONTEND_PORT:-14200}"
  local gw="${NGINX_GATEWAY_PORT:-18080}"
  local pay="${NGINX_PAYER_PORT:-14300}"
  local err=0

  log "Tests de fumée locaux…"

  curl -sf -o /dev/null -w "  frontend :14200 → HTTP %{http_code}\n" "http://127.0.0.1:${fp}/" \
    || { warn "frontend inaccessible sur 127.0.0.1:${fp}"; err=1; }

  curl -sf -o /dev/null -w "  gateway :18080 → HTTP %{http_code}\n" "http://127.0.0.1:${gw}/actuator/health" \
    || { warn "gateway inaccessible sur 127.0.0.1:${gw}"; err=1; }

  curl -sf -o /dev/null -w "  payer :14300 → HTTP %{http_code}\n" "http://127.0.0.1:${pay}/" \
    || { warn "payer-frontend inaccessible sur 127.0.0.1:${pay}"; err=1; }

  if curl -sf "http://127.0.0.1:${gw}/public/p/SOFT/frais-scolarite-2025-2026" | grep -q '"name"'; then
    log "  API publique /public/p/SOFT/… → OK"
  else
    warn "API publique /public/p/SOFT/frais-scolarite-2025-2026 — échec (données démo absentes ?)"
    err=1
  fi

  local origin
  origin="$(public_base_url)"
  if curl -sf -o /dev/null "http://127.0.0.1:${pay}/SOFT/frais-scolarite-2025-2026"; then
    log "  page payeur locale /SOFT/frais-scolarite-2025-2026 → OK"
  fi

  if curl -sf -o /dev/null "http://${DOMAIN}/" 2>/dev/null; then
    log "  nginx public http://${DOMAIN}/ → OK"
  elif curl -sfk -o /dev/null "https://${DOMAIN}/" 2>/dev/null; then
    log "  nginx public https://${DOMAIN}/ → OK"
  else
    warn "Site public ${DOMAIN} inaccessible depuis ce serveur (DNS / pare-feu ?)"
  fi

  return "$err"
}

print_summary() {
  local base origin
  # shellcheck disable=SC1091
  set -a && source .env && set +a
  origin="$(public_base_url)"
  base="${origin}"

  cat <<EOF

╔══════════════════════════════════════════════════════════════════╗
║  FirstPay Studio — configuration nginx + Docker terminée       ║
╠══════════════════════════════════════════════════════════════════╣
║  Mode            : REVERSE_PROXY=nginx (Caddy désactivé)
║  Domaine         : ${DOMAIN}
║  Portail         : ${base}/
║  Page payeur     : ${base}/SOFT/frais-scolarite-2025-2026
║  API (Swagger)   : ${base}/swagger-ui/index.html
║  Docker local    : 127.0.0.1:${NGINX_FRONTEND_PORT:-14200} (studio)
║                    127.0.0.1:${NGINX_GATEWAY_PORT:-18080} (API)
║                    127.0.0.1:${NGINX_PAYER_PORT:-14300} (payeur)
╠══════════════════════════════════════════════════════════════════╣
║  Connexion démo (mot de passe : demo)
║    jospinleunou@softtech.cm
║    admin.banque@afrilandfirstbank.com
╠══════════════════════════════════════════════════════════════════╣
║  SSL : sudo RUN_CERTBOT=1 SSL_EMAIL=${SSL_EMAIL:-admin@…} \\
║          ./infrastructure/scripts/setup-nginx-production.sh
║  Mise à jour : sudo ./infrastructure/scripts/update-production.sh
╚══════════════════════════════════════════════════════════════════╝

EOF
}

main() {
  require_root
  require_cmd envsubst
  require_cmd curl
  require_cmd openssl

  configure_env

  [[ "${SKIP_NGINX:-0}" != "1" ]] && install_nginx_config
  [[ "${SKIP_DOCKER:-0}" != "1" ]] && start_docker_stack
  run_certbot_if_requested

  smoke_tests || warn "Certains tests ont échoué — vérifiez docker compose ps"
  print_summary
}

main "$@"
