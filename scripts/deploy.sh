#!/bin/bash
# ============================================================================
# Auto-deploy script — Estampados DLV (Next.js standalone mode)
# ============================================================================
# Se dispara vía webhook desde webhook-server.js cuando GitHub notifica un push
# al branch `main`. Corre como usuario `dlv`.
#
# Path esperado: /home/dlv/deploy.sh
# Log:           /home/dlv/deploy.log
#
# 2026-07-28: Actualizado para soportar next.config.js output:'standalone'.
# 2026-09-17: public/ se enlaza en vez de copiarse para evitar duplicar ~22 GB.
# ============================================================================

set -e   # aborta ante cualquier error

LOG=/home/dlv/deploy.log
APP_DIR=/var/www/estampadosdlv

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

# 4️⃣ POST-BUILD: copiar static y .env; enlazar public sin duplicar los medios.
echo "[$(date -Iseconds)] → copy static + link public + copy .env to .next/standalone/" >> "$LOG"
cp -r .next/static .next/standalone/.next/static >> "$LOG" 2>&1
rm -rf .next/standalone/public
ln -s ../../public .next/standalone/public
[ "$(readlink -f .next/standalone/public)" = "$APP_DIR/public" ]
cp .env .next/standalone/.env >> "$LOG" 2>&1

# 5️⃣ Reiniciar el proceso Node bajo PM2 (recarga env vars)
echo "[$(date -Iseconds)] → pm2 restart dlv-nextjs --update-env" >> "$LOG"
pm2 restart dlv-nextjs --update-env >> "$LOG" 2>&1

{
  echo "[$(date -Iseconds)] === ✅ Auto-deploy COMPLETADO ==="
  echo "════════════════════════════════════════════════════════════"
} >> "$LOG"
