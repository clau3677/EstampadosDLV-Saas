#!/bin/sh
# /app/scripts/install-crons.sh
# Instala/reinstala los cron jobs de Estampados DLV.
# Idempotente — safe re-run.

set -e
chmod 0755 /app/scripts/refresh-cottonext-prices.sh 2>/dev/null || true
touch /var/log/dlv-cron.log
chmod 0666 /var/log/dlv-cron.log

# Copiar cron a /etc/cron.d (persistente por sesión)
cp /app/scripts/estampados-dlv-cron /etc/cron.d/estampados-dlv-cron
chmod 0644 /etc/cron.d/estampados-dlv-cron

# Refresh cron daemon
if command -v service >/dev/null 2>&1; then
    service cron reload 2>/dev/null || true
else
    pkill -HUP -f cron 2>/dev/null || true
fi

echo "Cron jobs instalados:"
cat /etc/cron.d/estampados-dlv-cron | grep -v '^#'
echo
echo "Ver logs en: /var/log/dlv-cron.log"
