# 🚀 Deployment Estampados DLV — VPS Hostinger

Guía paso a paso para desplegar la app en tu VPS Hostinger. **Tiempo total: 15-20 min**.

---

## 📝 Antes de empezar

Tu VPS: **187.77.40.78** · Ubuntu 22.04 · 8 GB RAM  
Tu dominio: **estampadosdlv.com** (registrado en Hostinger)

---

## ⏳ Paso 1 — Configurar DNS en Hostinger (~2 min)

Esto tarda **hasta 30 min en propagarse**, así que lo hacemos primero.

1. Entra a [hpanel.hostinger.com](https://hpanel.hostinger.com) → **Dominios** → clic en `estampadosdlv.com`
2. Ve a **DNS / Nameservers** en la barra izquierda
3. Si dice "Actualmente usas nameservers externos", primero cambia a los de Hostinger:
   - Ve a **Nameservers** → **Cambiar nameservers**
   - Selecciona **"Usar los nameservers de Hostinger"** → Guardar
4. Cuando ya estés en el editor de DNS Records de Hostinger, agrega/edita estos 2 registros:

| Tipo | Nombre | Contenido       | TTL     |
|:-----|:-------|:----------------|:--------|
| A    | `@`    | `187.77.40.78`  | Auto/14400 |
| A    | `www`  | `187.77.40.78`  | Auto/14400 |

5. **Elimina** cualquier registro A o CNAME viejo que apunte a `dns-parking.com` o similar
6. Guarda cambios

### Verificar propagación DNS

Espera 5-10 minutos y ejecuta desde cualquier terminal:
```bash
dig estampadosdlv.com +short
# Debe devolver: 187.77.40.78
```

O usa [dnschecker.org](https://dnschecker.org) → pon `estampadosdlv.com` → verifica que devuelve `187.77.40.78` en varios continentes.

**⚠️ Si el DNS no está propagado, el paso de SSL en el script fallará, pero el resto sí funciona. Puedes correr `certbot` manualmente más tarde (el script te dice el comando exacto).**

---

## ⏳ Paso 2 — Conectarte al VPS por SSH (~1 min)

### Opción A — Terminal web de Hostinger (más fácil, cero setup)
1. [hpanel.hostinger.com](https://hpanel.hostinger.com) → **VPS** → tu servidor
2. En la barra superior: **Terminal del navegador** (o "Browser terminal")
3. Se abre una terminal ya logueada como `root`

### Opción B — SSH desde tu PC (más rápido a largo plazo)
```bash
# Windows (PowerShell) / Mac / Linux
ssh root@187.77.40.78
# Pide contraseña → la que configuraste en Hostinger
```

---

## ⏳ Paso 3 — Ejecutar el deploy (~15 min automatizados)

Una vez dentro del VPS, ejecuta estos 2 comandos:

```bash
# Descargar el script deploy.sh
wget https://dtf-print-hub-2.preview.emergentagent.com/downloads/deploy.sh

# Ejecutarlo
bash deploy.sh
```

El script hará 12 pasos automatizados:
1. ✅ Verificaciones (OS, root)
2. ✅ `apt install` de paquetes base (curl, git, nginx, certbot, etc.)
3. ✅ Instala **Node.js 20 LTS** + **Yarn** + **PM2**
4. ✅ Instala **MongoDB 7.0** y lo inicia
5. ✅ Crea usuario `dlv` (no ejecuta la app como root)
6. ✅ Clona tu código desde `github.com/clau3677/EstampadosDLV-Saas`
7. ✅ Crea `.env` con todas las variables de producción
8. ✅ `yarn install` (~2-3 min)
9. ✅ `yarn build` de Next.js (~1-2 min)
10. ✅ **Migra los datos**: descarga dump MongoDB + tarball de 723 MB de imágenes
11. ✅ Configura **Nginx** como reverse proxy + **SSL Let's Encrypt**
12. ✅ Firewall UFW (solo SSH + HTTP/HTTPS) + backup diario MongoDB

**Puedes irte a tomar un café** ☕ — la parte más lenta es la descarga del tarball (~5 min con buen ancho de banda).

---

## 🎉 Al terminar

El script imprime un banner con:

```
🎉 ¡DEPLOYMENT COMPLETO!
URL:      https://estampadosdlv.com
Admin:    https://estampadosdlv.com/login
  usuario: estampadosdlv@gmail.com
  pass:    EstampadosDLV2025!
```

---

## 🔧 Comandos útiles post-deploy

```bash
# Ver logs en tiempo real de la app
pm2 logs dlv-nextjs

# Reiniciar la app
pm2 restart dlv-nextjs

# Monitor visual (CPU, RAM, requests/s)
pm2 monit

# Ver estado de servicios
systemctl status nginx mongod

# Ver últimos accesos web
tail -f /var/log/nginx/access.log

# Ver backups de MongoDB
ls -lh /root/backups/

# Actualizar la app tras un push a Github
cd /var/www/estampadosdlv
sudo -u dlv git pull
sudo -u dlv yarn install
sudo -u dlv yarn build
pm2 restart dlv-nextjs
```

---

## 🚨 Troubleshooting

### ❌ "DNS aún no apunta al VPS"
El script omitió SSL pero todo lo demás está OK. Espera propagación DNS y ejecuta:
```bash
certbot --nginx -d estampadosdlv.com -d www.estampadosdlv.com --agree-tos -m estampadosdlv@gmail.com --redirect
```

### ❌ App no carga en el dominio
```bash
# 1. Verifica que Nextjs está corriendo
pm2 status
# Debe mostrar dlv-nextjs como "online"

# 2. Verifica que Nginx responde localmente
curl -I http://localhost

# 3. Verifica que el puerto 80/443 está abierto
sudo ufw status

# 4. Ver logs de errores
pm2 logs dlv-nextjs --err --lines 50
```

### ❌ "cannot find MongoDB"
```bash
systemctl status mongod
systemctl restart mongod
# Si el status muestra error, mira los logs:
journalctl -u mongod -n 50
```

### 🔒 Cambiar contraseña del admin
```bash
# En el VPS:
cd /var/www/estampadosdlv
sudo -u dlv node -e "
const { hash } = require('bcryptjs');
(async () => {
  console.log(await hash('TU_NUEVA_PASSWORD_AQUI', 10));
})();"
# Luego usa el hash en mongo shell:
mongosh estampados_dlv --eval 'db.users.updateOne({email:"estampadosdlv@gmail.com"},{\$set:{passwordHash:"PEGAR_HASH_AQUI"}})'
```

---

## 📈 Próximos pasos (opcional)

1. **API keys de producción**:
   - Transbank WebPay (actualmente sandbox) → [Portal Transbank](https://portaltransbank.cl)
   - MercadoPago (actualmente vacío) → [MercadoPago Devs](https://www.mercadopago.cl/developers)

2. **Email corporativo `contacto@estampadosdlv.com`**:
   - En Hostinger, activa el **Email profesional** que ya tienes en el checklist
   - Cambia `SMTP_USER` y `SMTP_PASS` en `/var/www/estampadosdlv/.env`

3. **Renovación SSL automática**: ya configurada por Certbot (cron diario)

4. **Monitoreo**: considera [Uptime Kuma](https://github.com/louislam/uptime-kuma) o [BetterUptime](https://betteruptime.com) para alertas por WhatsApp/email si la app se cae.

---

¡Cualquier duda, me avisas! 🛠️
