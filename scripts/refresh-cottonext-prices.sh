#!/bin/sh
# /app/scripts/refresh-cottonext-prices.sh
# Cron entrypoint que refresca los precios de todos los productos importados de Cottonext.
# Ejecutado diariamente por /etc/cron.d/estampados-dlv-cron

set -e
APP_URL="${APP_URL:-http://localhost:3000}"
CRON_TOKEN="${CRON_TOKEN:-dlv_cron_default}"
LOG=/var/log/dlv-cron.log

printf '[%s] === Cron refresh-prices START ===\n' "$(date -Iseconds)" >> "$LOG"

HTTP_STATUS=$(curl -sS -o /tmp/dlv_cron_response.json -w "%{http_code}" \
    -X POST "$APP_URL/api/import/cottonext/refresh-prices" \
    -H "Content-Type: application/json" \
    -H "X-Cron-Token: $CRON_TOKEN" \
    -m 900 || echo "000")

printf '[%s] HTTP %s\n' "$(date -Iseconds)" "$HTTP_STATUS" >> "$LOG"
printf '[%s] Response: %s\n' "$(date -Iseconds)" "$(cat /tmp/dlv_cron_response.json 2>/dev/null | head -c 500)" >> "$LOG"
printf '[%s] === END ===\n\n' "$(date -Iseconds)" >> "$LOG"
