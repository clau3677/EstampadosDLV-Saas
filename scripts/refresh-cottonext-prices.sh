#!/bin/sh
# /app/scripts/refresh-cottonext-prices.sh
# Cron entrypoint que refresca los precios de todos los productos importados de Cottonext.
# Ejecutado diariamente por /etc/cron.d/estampados-dlv-cron.
#
# Antes de correr, consulta /cron/precheck para saber si el admin lo tiene activo.
# Si el toggle está OFF, salta con exit 0 (no error, sólo skip).

set -e
APP_URL="${APP_URL:-http://localhost:3000}"
LOG=/var/log/dlv-cron.log

printf '[%s] === Cron refresh-prices START ===\n' "$(date -Iseconds)" >> "$LOG"

# --- Precheck: ¿está el cron habilitado? ---
PRECHECK=$(curl -sS -m 15 "$APP_URL/api/import/cottonext/cron/precheck" 2>/dev/null || echo '{"runNow":false,"reason":"api_unreachable"}')
RUN_NOW=$(printf '%s' "$PRECHECK" | grep -o '"runNow":[a-z]*' | cut -d':' -f2)

if [ "$RUN_NOW" != "true" ]; then
    REASON=$(printf '%s' "$PRECHECK" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
    printf '[%s] SKIPPED (%s)\n' "$(date -Iseconds)" "$REASON" >> "$LOG"
    printf '[%s] === END ===\n\n' "$(date -Iseconds)" >> "$LOG"
    exit 0
fi

# --- Ejecutar refresh ---
HTTP_STATUS=$(curl -sS -o /tmp/dlv_cron_response.json -w "%{http_code}" \
    -X POST "$APP_URL/api/import/cottonext/refresh-prices" \
    -H "Content-Type: application/json" \
    -m 900 || echo "000")

printf '[%s] HTTP %s\n' "$(date -Iseconds)" "$HTTP_STATUS" >> "$LOG"
printf '[%s] Response: %s\n' "$(date -Iseconds)" "$(cat /tmp/dlv_cron_response.json 2>/dev/null | head -c 500)" >> "$LOG"
printf '[%s] === END ===\n\n' "$(date -Iseconds)" >> "$LOG"
