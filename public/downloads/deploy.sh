#!/bin/bash
# ==========================================================================
# Estampados DLV — Script de deployment PRODUCCIÓN
# ==========================================================================
# Servidor:  VPS Hostinger Ubuntu 22.04 (root)
# Dominio:   estampadosdlv.com
# Autor:     Auto-generado por Emergent Agent
# ==========================================================================
#
# COMO USAR:
#   1. Copia este archivo a tu VPS:  scp deploy.sh root@187.77.40.78:/root/
#      —ó— pega el contenido en /root/deploy.sh con nano
#   2. Antes de configurar el dominio, agrega los registros A en Hostinger
#      (ver README-DEPLOY.md)
#   3. Ejecuta:  cd /root && bash deploy.sh
#
# El script es IDEMPOTENTE — puedes re-ejecutarlo sin problema.
# ==========================================================================

set -euo pipefail

# ==========================================================================
# CONFIGURACIÓN — revisa antes de ejecutar
# ==========================================================================
DOMAIN="estampadosdlv.com"
WWW_DOMAIN="www.estampadosdlv.com"
SSL_EMAIL="estampadosdlv@gmail.com"

GITHUB_REPO="https://github.com/clau3677/EstampadosDLV-Saas.git"
GITHUB_BRANCH="main"

APP_DIR="/var/www/estampadosdlv"
APP_USER="dlv"                              # usuario dedicado (no root)
APP_PORT=3000

# URLs de datos migrados (válidas ~48h desde el Emergent preview)
DUMP_URL="https://dtf-print-hub-2.preview.emergentagent.com/downloads/mongo-dump.tar.gz"
UPLOADS_URL="https://dtf-print-hub-2.preview.emergentagent.com/downloads/uploads.tar.gz"

# Colores para output
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "\n${BLUE}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}  ✔ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✖ $1${NC}"; exit 1; }

# ==========================================================================
# 0. VERIFICACIONES PREVIAS
# ==========================================================================
step "0/12 — Verificaciones"
[[ $EUID -eq 0 ]] || fail "Debes ejecutar como root:  sudo bash deploy.sh"
[[ -f /etc/os-release ]] && . /etc/os-release
[[ "$ID" == "ubuntu" ]] || warn "OS no es Ubuntu (detectado: $ID) — procedo pero puede haber diferencias"
ok  "root OK · OS: $PRETTY_NAME"

# ==========================================================================
# 1. ACTUALIZAR SISTEMA E INSTALAR DEPENDENCIAS BASE
# ==========================================================================
step "1/12 — Instalando dependencias del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget gnupg lsb-release ca-certificates \
  build-essential git ufw fail2ban \
  nginx certbot python3-certbot-nginx \
  cron
ok "Paquetes base instalados"

# ==========================================================================
# 2. NODE.JS 20 LTS + YARN
# ==========================================================================
step "2/12 — Instalando Node.js 20 LTS + Yarn"
if ! command -v node &>/dev/null || [[ $(node -v | grep -oP '\d+' | head -1) -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
npm install -g yarn pm2 >/dev/null 2>&1
ok "Node $(node -v) · Yarn $(yarn -v) · PM2 $(pm2 -v)"

# ==========================================================================
# 3. MONGODB 7
# ==========================================================================
step "3/12 — Instalando MongoDB 7.0"
if ! command -v mongod &>/dev/null; then
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
    gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
    tee /etc/apt/sources.list.d/mongodb-org-7.0.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq mongodb-org
fi
systemctl enable --now mongod >/dev/null 2>&1
sleep 3
systemctl is-active mongod >/dev/null && ok "MongoDB corriendo" || fail "MongoDB no arrancó"

# ==========================================================================
# 4. USUARIO DEDICADO 'dlv' (no root)
# ==========================================================================
step "4/12 — Creando usuario '$APP_USER'"
if ! id "$APP_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$APP_USER"
  usermod -aG sudo "$APP_USER"
fi
ok "Usuario $APP_USER listo"

# ==========================================================================
# 5. CLONAR EL CÓDIGO
# ==========================================================================
step "5/12 — Clonando código desde GitHub"
mkdir -p /var/www
# Marcar el destino como safe.directory para git (evita "dubious ownership")
sudo -u "$APP_USER" git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

if [[ -d "$APP_DIR/.git" ]]; then
  cd "$APP_DIR"
  sudo -u "$APP_USER" git fetch origin "$GITHUB_BRANCH"
  sudo -u "$APP_USER" git reset --hard "origin/$GITHUB_BRANCH"
else
  # Limpiar posible dir parcial de un run anterior fallido
  rm -rf "$APP_DIR"
  # Clonar como root (para que pueda crear el dir dentro de /var/www) y luego chown
  git clone -b "$GITHUB_BRANCH" "$GITHUB_REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
cd "$APP_DIR"
ok "Código en $APP_DIR ($(git log -1 --format=%h 2>/dev/null || echo 'unknown'))"

# ==========================================================================
# 6. VARIABLES DE ENTORNO (.env.production)
# ==========================================================================
step "6/12 — Creando .env de producción"
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
# ============================================================
# ESTAMPADOS DLV — Variables de PRODUCCIÓN
# ============================================================

# MongoDB local (Ubuntu 22.04)
MONGO_URL=mongodb://localhost:27017
DB_NAME=estampados_dlv

# URLs públicas
NEXT_PUBLIC_BASE_URL=https://estampadosdlv.com
CORS_ORIGINS=https://estampadosdlv.com,https://www.estampadosdlv.com

# JWT (nuevo, generado específicamente para producción)
JWT_SECRET=Q6I_eIsAVjEApau0dF0c7ltQhmkbnSwj18wd8u4GhQ1dz71t-v5w0bbwhylzRox8
JWT_EXPIRES_IN=7d
AUTH_COOKIE=dlv_token

# Transbank WebPay (SANDBOX — cambiar cuando tengas keys de producción)
TBK_ENV=integration
TBK_COMMERCE_CODE=597055555532
TBK_API_KEY_SECRET=579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C

# MercadoPago (bloqueado — dejar vacío por ahora)
MP_ACCESS_TOKEN=
MP_PUBLIC_KEY=
MP_WEBHOOK_SECRET=

# SMTP Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=estampadosdlv@gmail.com
SMTP_PASS=iekdystcakoivsqs
SMTP_FROM_NAME=Estampados DLV
SMTP_FROM_EMAIL=estampadosdlv@gmail.com

# MiniMax LLM
MINIMAX_API_KEY=sk-cp-c3ZQXz70x8L-XtaOQ2Y-5mFnxZb5zwnyAH-n-H01A8KXTZBMzGxdduEX5MHt66m6AoBoxkvlyGF_KlrX9h-7WcUWHrFpaaQ4jNMVgZivqScchyrH-75CvvY
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M2

# Directorios de trabajo
HOT_FOLDERS_BASE=/var/www/estampadosdlv/hot_folders

# Node.js
NODE_ENV=production
PORT=3000
APP_URL=http://localhost:3000
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok ".env creado"
else
  ok ".env ya existe (respetado)"
fi

# ==========================================================================
# 7. INSTALAR DEPENDENCIAS NODE
# ==========================================================================
step "7/12 — Instalando dependencias npm (esto tarda ~2-3 min)"
cd "$APP_DIR"
sudo -u "$APP_USER" yarn install --frozen-lockfile 2>&1 | tail -5
ok "Dependencias instaladas"

# ==========================================================================
# 8. BUILD PRODUCCIÓN
# ==========================================================================
step "8/12 — Build de Next.js (esto tarda ~1-2 min)"
sudo -u "$APP_USER" yarn build 2>&1 | tail -10 || fail "Build falló — revisa los errores arriba"
ok "Build completo"

# ==========================================================================
# 9. RESTAURAR DATOS (MongoDB + uploads/)
# ==========================================================================
step "9/12 — Restaurando datos migrados (585 productos + imágenes)"
RESTORE_MARKER="$APP_DIR/.data-restored"
if [[ ! -f "$RESTORE_MARKER" ]]; then
  # MongoDB dump
  echo "  Descargando dump MongoDB (~3 MB)..."
  curl -fsSL "$DUMP_URL" -o /tmp/mongo-dump.tar.gz || fail "No pude descargar el dump"
  tar xzf /tmp/mongo-dump.tar.gz -C /tmp/
  mongorestore --db estampados_dlv --drop /tmp/mongo-dump/estampados_dlv/ 2>&1 | tail -5
  rm -rf /tmp/mongo-dump /tmp/mongo-dump.tar.gz

  # Uploads (imágenes de proveedores) — usar wget que maneja mejor archivos grandes
  echo "  Descargando uploads.tar.gz (~723 MB, puede tomar 3-5 min)..."
  if ! wget --tries=5 --continue --quiet --show-progress "$UPLOADS_URL" -O /tmp/uploads.tar.gz; then
    warn "wget falló, intentando con curl HTTP/1.1..."
    curl -fL --http1.1 --retry 5 --retry-delay 5 "$UPLOADS_URL" -o /tmp/uploads.tar.gz \
      || fail "No pude descargar uploads.tar.gz — revisa conectividad"
  fi
  tar xzf /tmp/uploads.tar.gz -C "$APP_DIR" 2>&1 | tail -3
  rm -f /tmp/uploads.tar.gz
  chown -R "$APP_USER:$APP_USER" "$APP_DIR/public/uploads"

  touch "$RESTORE_MARKER"
  ok "Datos restaurados (productos + imágenes)"
else
  ok "Datos ya estaban restaurados (respetado)"
fi

# ==========================================================================
# 10. PM2 (proceso de aplicación)
# ==========================================================================
step "10/12 — Configurando PM2"
cd "$APP_DIR"
sudo -u "$APP_USER" pm2 delete dlv-nextjs 2>/dev/null || true
sudo -u "$APP_USER" HOME="/home/$APP_USER" pm2 start "yarn start" \
  --name dlv-nextjs \
  --cwd "$APP_DIR" \
  --time \
  --max-memory-restart 2G
sudo -u "$APP_USER" HOME="/home/$APP_USER" pm2 save

# Iniciar PM2 en boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" 2>&1 | tail -3
systemctl enable pm2-"$APP_USER" >/dev/null 2>&1 || true
ok "App corriendo en pm2 (dlv-nextjs)"

# ==========================================================================
# 11. NGINX + SSL con Let's Encrypt
# ==========================================================================
step "11/12 — Configurando Nginx + SSL"
cat > /etc/nginx/sites-available/estampadosdlv <<EOF
# ---- HTTP → HTTPS (Certbot lo reescribe automáticamente) ----
server {
    listen 80;
    server_name $DOMAIN $WWW_DOMAIN;
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # Cache agresivo para imágenes de proveedores
    location /uploads/ {
        alias $APP_DIR/public/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Cache para assets Next.js
    location /_next/static/ {
        alias $APP_DIR/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF
ln -sf /etc/nginx/sites-available/estampadosdlv /etc/nginx/sites-enabled/estampadosdlv
rm -f /etc/nginx/sites-enabled/default
nginx -t 2>&1 | tail -3
systemctl reload nginx
ok "Nginx configurado"

# SSL Certbot — valida que DNS ya apunta al VPS
if dig +short "$DOMAIN" | grep -q "$(curl -s ifconfig.me 2>/dev/null || echo x)" || \
   dig +short "$DOMAIN" | grep -q "$(hostname -I | awk '{print $1}')"; then
  echo "  DNS OK, obteniendo certificado SSL..."
  certbot --nginx -d "$DOMAIN" -d "$WWW_DOMAIN" \
    --non-interactive --agree-tos -m "$SSL_EMAIL" \
    --redirect 2>&1 | tail -8
  ok "SSL activo en https://$DOMAIN"
else
  warn "DNS aún no apunta al VPS. Configura los registros A y luego ejecuta:"
  warn "  certbot --nginx -d $DOMAIN -d $WWW_DOMAIN --agree-tos -m $SSL_EMAIL --redirect"
fi

# ==========================================================================
# 12. FIREWALL + BACKUP DIARIO
# ==========================================================================
step "12/12 — Firewall + backups"
ufw --force reset >/dev/null 2>&1
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ok "UFW: solo SSH + HTTP/HTTPS abiertos"

# Backup diario de MongoDB
cat > /etc/cron.d/mongo-backup <<EOF
# Backup diario de MongoDB a las 03:00 hrs
0 3 * * * root /usr/bin/mongodump --db estampados_dlv --archive=/root/backups/mongo-\$(date +\%Y\%m\%d).gz --gzip && find /root/backups/ -name "mongo-*.gz" -mtime +14 -delete
EOF
mkdir -p /root/backups
ok "Backup diario configurado (14 días retención en /root/backups)"

# ==========================================================================
# RESUMEN
# ==========================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                                                                    ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   🎉  ${GREEN}¡DEPLOYMENT COMPLETO!${NC}                                          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                    ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   URL:      https://$DOMAIN                                ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   Admin:    https://$DOMAIN/login                          ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     usuario: estampadosdlv@gmail.com                              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     pass:    EstampadosDLV2025!                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                    ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}   Comandos útiles:                                                ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     pm2 logs dlv-nextjs      — ver logs en vivo                    ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     pm2 restart dlv-nextjs   — reiniciar app                      ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     pm2 monit                 — monitor en vivo                    ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     systemctl status nginx   — estado Nginx                       ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     tail -f /var/log/nginx/access.log                              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                                    ${GREEN}║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
