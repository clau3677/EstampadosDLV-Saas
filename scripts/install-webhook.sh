#!/bin/bash
# ============================================================================
# Instalador de Auto-deploy con GitHub Webhook — Estampados DLV
# ============================================================================
# Corre este script UNA VEZ como root en tu VPS de Hostinger.
# El script hace todo:
#   1. Copia deploy.sh a /home/dlv/ (permisos correctos)
#   2. Copia webhook-server.js a /home/dlv/
#   3. Genera un WEBHOOK_SECRET aleatorio
#   4. Registra el webhook-server bajo PM2 (usuario dlv)
#   5. Actualiza Nginx para proxear /webhook/github → localhost:9000
#   6. Recarga Nginx
#   7. Imprime la URL + secreto para configurar en GitHub
#
# Uso:
#   cd /var/www/estampadosdlv
#   sudo bash scripts/install-webhook.sh
# ============================================================================

set -e

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ---------- Verificaciones ----------
[ "$EUID" -eq 0 ] || err "Este script debe correrse como root (usa sudo)"
[ -d /home/dlv ] || err "El usuario 'dlv' no existe. Corre primero el deploy.sh principal."
[ -d /var/www/estampadosdlv ] || err "No encuentro /var/www/estampadosdlv"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
DEPLOY_SRC="$SCRIPT_DIR/deploy.sh"
WEBHOOK_SRC="$SCRIPT_DIR/webhook-server.js"

[ -f "$DEPLOY_SRC" ] || err "No encuentro $DEPLOY_SRC"
[ -f "$WEBHOOK_SRC" ] || err "No encuentro $WEBHOOK_SRC"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  🚀 Instalador Auto-deploy Estampados DLV"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ---------- 1. Copiar scripts a /home/dlv/ ----------
info "Copiando scripts a /home/dlv/..."
cp "$DEPLOY_SRC" /home/dlv/deploy.sh
cp "$WEBHOOK_SRC" /home/dlv/webhook-server.js
chown dlv:dlv /home/dlv/deploy.sh /home/dlv/webhook-server.js
chmod 750 /home/dlv/deploy.sh /home/dlv/webhook-server.js
log "Scripts copiados"

# ---------- 2. Generar o reutilizar WEBHOOK_SECRET ----------
SECRET_FILE=/home/dlv/.webhook-secret
if [ -f "$SECRET_FILE" ]; then
  info "Secreto existente detectado — reutilizando"
  WEBHOOK_SECRET=$(cat "$SECRET_FILE")
else
  info "Generando nuevo WEBHOOK_SECRET..."
  WEBHOOK_SECRET=$(openssl rand -hex 32)
  echo "$WEBHOOK_SECRET" > "$SECRET_FILE"
  chown dlv:dlv "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
  log "Secreto generado y guardado en $SECRET_FILE (chmod 600)"
fi

# ---------- 3. Registrar el webhook-server bajo PM2 ----------
info "Registrando webhook-server bajo PM2..."
sudo -u dlv bash -c "
  cd /home/dlv
  export WEBHOOK_SECRET='$WEBHOOK_SECRET'
  export WEBHOOK_PORT=9000
  export DEPLOY_SCRIPT=/home/dlv/deploy.sh
  export DEPLOY_BRANCH=main

  # Si ya existe, hacer restart en vez de start
  if pm2 describe dlv-webhook > /dev/null 2>&1; then
    pm2 delete dlv-webhook
  fi
  pm2 start /home/dlv/webhook-server.js \
      --name dlv-webhook \
      --update-env \
      --time \
      --max-memory-restart 100M \
      --log /home/dlv/.pm2/logs/dlv-webhook.log
  pm2 save
"
log "webhook-server corriendo bajo PM2"

# ---------- 4. Actualizar Nginx ----------
NGINX_CONF=$(ls /etc/nginx/sites-enabled/ | grep -v default | head -1)
if [ -z "$NGINX_CONF" ]; then
  err "No encuentro el archivo Nginx en /etc/nginx/sites-enabled/"
fi
NGINX_PATH="/etc/nginx/sites-enabled/$NGINX_CONF"
info "Actualizando Nginx config: $NGINX_PATH"

# Verificar si ya tiene el bloque de webhook
if grep -q "webhook/github" "$NGINX_PATH"; then
  warn "Nginx ya tiene el bloque de webhook — no re-modifico"
else
  # Backup
  cp "$NGINX_PATH" "/root/nginx-backup-webhook-$(date +%s).conf"
  log "Backup creado en /root/"

  # Insertar el location block ANTES del último } del bloque server SSL
  # Usamos python para hacer la sustitución de forma robusta
  python3 <<PYEOF
import re
path = "$NGINX_PATH"
with open(path, 'r') as f: content = f.read()

# Location block a insertar (dentro del bloque SSL server)
loc_block = '''
    # ---- GitHub Webhook para auto-deploy (webhook-server.js corre en :9000) ----
    location = /webhook/github {
        proxy_pass http://127.0.0.1:9000/webhook/github;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 15s;
    }
    # ---- Health check del webhook (opcional para debug) ----
    location = /webhook/health {
        proxy_pass http://127.0.0.1:9000/health;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
'''

# Insertar justo antes del último } del bloque "listen 443 ssl"
# Buscamos el server que tiene "listen 443 ssl"
pattern = r'(listen 443 ssl;[\s\S]*?)(\n\})'
def repl(m):
    body = m.group(1)
    if 'webhook/github' in body:
        return m.group(0)  # ya está, no tocar
    return body + loc_block + m.group(2)

new_content = re.sub(pattern, repl, content, count=1)
with open(path, 'w') as f: f.write(new_content)
print('OK — location /webhook/github insertado')
PYEOF
fi

# ---------- 5. Validar y recargar Nginx ----------
info "Validando sintaxis de Nginx..."
nginx -t
log "Sintaxis OK, recargando Nginx..."
systemctl reload nginx
log "Nginx recargado"

# ---------- 6. Verificar que el webhook responda ----------
info "Verificando health del webhook..."
sleep 2
if curl -sf http://localhost:9000/health > /dev/null; then
  log "Webhook responde en localhost:9000/health"
else
  warn "El webhook local no responde. Revisa: sudo -u dlv pm2 logs dlv-webhook --lines 20"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ INSTALACIÓN COMPLETADA"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}Ahora configura el webhook en GitHub:${NC}"
echo ""
echo -e "  1. Ve a: ${CYAN}https://github.com/clau3677/EstampadosDLV-Saas/settings/hooks${NC}"
echo -e "  2. Click en ${CYAN}Add webhook${NC}"
echo -e "  3. Payload URL:   ${YELLOW}https://estampadosdlv.com/webhook/github${NC}"
echo -e "  4. Content type:  ${YELLOW}application/json${NC}"
echo -e "  5. Secret:        ${YELLOW}$WEBHOOK_SECRET${NC}"
echo -e "  6. Which events?  ${YELLOW}Just the push event${NC}"
echo -e "  7. Active:        ${YELLOW}✓ marcado${NC}"
echo -e "  8. Click en ${CYAN}Add webhook${NC}"
echo ""
echo -e "${GREEN}Después de agregarlo, GitHub enviará un 'ping' automáticamente."
echo -e "Deberías ver en el hook page (abajo, sección 'Recent Deliveries')"
echo -e "un check verde ${GREEN}✓${NC} indicando que respondió 200 OK."
echo ""
echo -e "${CYAN}Comandos útiles después:${NC}"
echo "  # Ver logs del webhook:"
echo "  sudo -u dlv pm2 logs dlv-webhook --lines 30"
echo ""
echo "  # Ver logs del último deploy:"
echo "  tail -f /home/dlv/deploy.log"
echo ""
echo "  # Health check:"
echo "  curl -s http://localhost:9000/health"
echo "  curl -s https://estampadosdlv.com/webhook/health"
echo ""
echo -e "${YELLOW}⚠️  Guarda el WEBHOOK_SECRET en un lugar seguro:${NC}"
echo -e "     $WEBHOOK_SECRET"
echo ""
