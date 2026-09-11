#!/bin/sh
# Ejecuta las automatizaciones de Marketing desde cron sin guardar secretos en Git.
# Uso: marketing-cron.sh dispatch | auto-schedule
set -eu

APP_DIR="${DLV_APP_DIR:-/var/www/estampadosdlv}"
ENV_FILE="${DLV_ENV_FILE:-$APP_DIR/.env}"
LOG_FILE="${DLV_MARKETING_LOG:-/var/log/dlv-marketing.log}"
BASE_URL="${DLV_BASE_URL:-https://estampadosdlv.com}"

if [ ! -r "$ENV_FILE" ]; then
  echo "[$(date -Iseconds)] ERROR: no se encuentra $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi

# Leer solo la variable necesaria. No evaluar el .env completo: puede contener
# contraseñas, URLs u otros valores que no sean sintaxis válida de shell.
read_env_value() {
  key="$1"
  value=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)
  case "$value" in
    \"*\") value=${value#\"}; value=${value%\"} ;;
    \'*\') value=${value#\'}; value=${value%\'} ;;
  esac
  printf '%s' "$value"
}

MARKETING_CRON_SECRET="$(read_env_value MARKETING_CRON_SECRET)"
if [ -z "$MARKETING_CRON_SECRET" ]; then
  echo "[$(date -Iseconds)] ERROR: MARKETING_CRON_SECRET no está configurado en $ENV_FILE" >> "$LOG_FILE"
  exit 1
fi

case "${1:-}" in
  dispatch)
    ENDPOINT="$BASE_URL/api/marketing/dispatch"
    ;;
  auto-schedule)
    ENDPOINT="$BASE_URL/api/marketing/auto/schedule"
    ;;
  *)
    echo "Uso: $0 dispatch|auto-schedule" >&2
    exit 2
    ;;
esac

curl --fail --silent --show-error --max-time 120 \
  -X POST \
  -H "x-cron-secret: $MARKETING_CRON_SECRET" \
  -H 'Content-Type: application/json' \
  "$ENDPOINT" >> "$LOG_FILE" 2>&1
printf '\n' >> "$LOG_FILE"
