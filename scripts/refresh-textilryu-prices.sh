#!/bin/sh
# /app/scripts/refresh-textilryu-prices.sh
# Cron entrypoint que refresca precios de productos Textil Ryu importados.
# Consulta /cron/precheck para saber si el admin lo tiene activo.

set -e
APP_URL="${APP_URL:-http://localhost:3000}"
LOG=/var/log/dlv-cron.log

printf '[%s] === Cron TEXTILRYU refresh-prices START ===\n' "$(date -Iseconds)" >> "$LOG"

PRECHECK=$(curl -sS -m 15 "$APP_URL/api/import/textilryu/cron/precheck" 2>/dev/null || echo '{"runNow":false,"reason":"api_unreachable"}')
RUN_NOW=$(printf '%s' "$PRECHECK" | grep -o '"runNow":[a-z]*' | cut -d':' -f2)

if [ "$RUN_NOW" != "true" ]; then
    REASON=$(printf '%s' "$PRECHECK" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
    printf '[%s] SKIPPED (%s)\n' "$(date -Iseconds)" "$REASON" >> "$LOG"
    printf '[%s] === END ===\n\n' "$(date -Iseconds)" >> "$LOG"
    exit 0
fi

HTTP_STATUS=$(curl -sS -o /tmp/dlv_cron_ryu_response.json -w "%{http_code}" \
    -X POST "$APP_URL/api/import/textilryu/refresh-prices" \
    -H "Content-Type: application/json" \
    -m 900 || echo "000")

printf '[%s] HTTP %s\n' "$(date -Iseconds)" "$HTTP_STATUS" >> "$LOG"
printf '[%s] Response: %s\n' "$(date -Iseconds)" "$(cat /tmp/dlv_cron_ryu_response.json 2>/dev/null | head -c 500)" >> "$LOG"
printf '[%s] === END ===\n\n' "$(date -Iseconds)" >> "$LOG"
