#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${DLV_APP_ROOT:-/var/www/estampadosdlv}"
APP_URL="${APP_URL:-http://127.0.0.1:3000}"
LOG="${DLV_CRON_LOG:-/var/log/dlv-cron.log}"

# Cron no hereda el entorno de PM2. Leemos únicamente el secreto necesario
# desde .env, en memoria, sin imprimirlo ni copiarlo a ningún archivo.
CRON_SECRET="${MARKETING_CRON_SECRET:-}"
if [ -z "$CRON_SECRET" ] && [ -f "$APP_ROOT/.env" ]; then
  CRON_SECRET=$(grep -m1 '^MARKETING_CRON_SECRET=' "$APP_ROOT/.env" | cut -d= -f2- || true)
  CRON_SECRET="${CRON_SECRET#\"}"
  CRON_SECRET="${CRON_SECRET%\"}"
  CRON_SECRET="${CRON_SECRET#\'}"
  CRON_SECRET="${CRON_SECRET%\'}"
fi

printf '[%s] === Review dispatch START ===\n' "$(date -Iseconds)" >> "$LOG"

if [ -z "$CRON_SECRET" ]; then
  printf '[%s] SKIPPED (MARKETING_CRON_SECRET no configurado)\n' "$(date -Iseconds)" >> "$LOG"
  printf '[%s] === END ===\n\n' "$(date -Iseconds)" >> "$LOG"
  exit 0
fi

STATUS=$(curl -sS -o /tmp/dlv_review_dispatch.json -w "%{http_code}" \
  -X POST "$APP_URL/api/marketing/dispatch" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  --max-time 90 || echo "000")

printf '[%s] HTTP %s\n' "$(date -Iseconds)" "$STATUS" >> "$LOG"
printf '[%s] Response: %s\n' "$(date -Iseconds)" "$(cat /tmp/dlv_review_dispatch.json 2>/dev/null | head -c 500)" >> "$LOG"
printf '[%s] === END ===\n\n' "$(date -Iseconds)" >> "$LOG"
rm -f /tmp/dlv_review_dispatch.json
