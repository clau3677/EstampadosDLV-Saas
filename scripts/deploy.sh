#!/bin/bash
# ============================================================================
# Auto-deploy script — Estampados DLV
# ============================================================================
# Se dispara vía webhook desde webhook-server.js cuando GitHub notifica un push
# al branch `main`. Corre como usuario `dlv`.
#
# Path esperado (una vez copiado al VPS):
#   /home/dlv/deploy.sh
#
# Log de cada ejecución:
#   /home/dlv/deploy.log
# ============================================================================

set -e   # aborta el script ante cualquier error

LOG=/home/dlv/deploy.log
APP_DIR=/var/www/estampadosdlv

# Timestamps y separadores en el log
{
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "[$(date -Iseconds)] === 🚀 Auto-deploy INICIADO ==="
  echo "════════════════════════════════════════════════════════════"
} >> "$LOG"

cd "$APP_DIR"

# 1️⃣ Traer los cambios desde GitHub
echo "[$(date -Iseconds)] → git pull origin main" >> "$LOG"
git pull origin main >> "$LOG" 2>&1

# 2️⃣ Instalar dependencias si package.json cambió (idempotente)
echo "[$(date -Iseconds)] → yarn install --frozen-lockfile" >> "$LOG"
yarn install --frozen-lockfile >> "$LOG" 2>&1 || yarn install >> "$LOG" 2>&1

# 3️⃣ Borrar build anterior y regenerar
echo "[$(date -Iseconds)] → rm -rf .next && yarn build" >> "$LOG"
rm -rf .next
yarn build >> "$LOG" 2>&1

# 4️⃣ Reiniciar el proceso Node bajo PM2 (recarga env vars)
echo "[$(date -Iseconds)] → pm2 restart dlv-nextjs --update-env" >> "$LOG"
pm2 restart dlv-nextjs --update-env >> "$LOG" 2>&1

{
  echo "[$(date -Iseconds)] === ✅ Auto-deploy COMPLETADO ==="
  echo "════════════════════════════════════════════════════════════"
} >> "$LOG"
