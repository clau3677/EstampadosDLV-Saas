# Guía de despliegue — Actualizaciones de auditoría + Módulo Marketing

**Rama:** `feature/audit-improvements-marketing` · **Fecha:** julio 2026

## 1. Resumen de cambios

### Fase 1 — Seguridad y catálogo público (crítico)
| Archivo | Cambio |
|---|---|
| `next.config.js` | Headers de seguridad endurecidos (X-Frame-Options, CSP de imágenes, Referrer-Policy) y CORS sin wildcard |
| `lib/api/_helpers.js` | Helper CORS: sin `CORS_ORIGINS` definido cae al dominio propio (nunca `*`) |
| `app/tienda/page.js` | Ahora es Server Component con SSR: los productos se renderizan en HTML indexable por Google, con metadatos y JSON-LD `ItemList` |
| `app/tienda/tienda-client.jsx` | Componente cliente (SWR con `fallbackData` del SSR) |
| `app/producto/[slug]/page.js` | SSR con `generateMetadata` (OG dinámico) + JSON-LD `Product` con precio |
| `lib/server/store-data.js` | Helper de datos servidor con caché para SSR |

### Fase 2 — SEO, redes sociales y reseñas
| Archivo | Cambio |
|---|---|
| `lib/constants/business.js` | URLs de redes sociales y reseñas (`BUSINESS.social`, `BUSINESS.reviews`) — **editar con las URLs reales** |
| `components/public-footer.jsx` | Iconos de Facebook/Instagram/TikTok/WhatsApp + CTA de reseña en Google |
| `app/layout.js` | Metadatos globales, Open Graph y JSON-LD `LocalBusiness` |
| `lib/whatsapp/notifications.js` · `lib/email/templates.js` · `lib/email/notifications.js` | Plantillas y dispatchers de solicitud de reseña post-venta |
| `lib/marketing/reviews.js` | Cola de reseñas: se programa +48h después de que el pedido queda listo; el cron la despacha |
| `lib/api/production.js` | Hook: al marcar pedido `ready` se encola la solicitud de reseña |

### Fases 3-4 — Módulo Marketing (nuevo)
| Archivo | Cambio |
|---|---|
| `lib/models.js` | 5 colecciones nuevas: `marketing_accounts`, `marketing_posts`, `marketing_campaigns`, `marketing_metrics`, `review_requests` |
| `lib/marketing/crypto.js` | Cifrado AES-256-GCM de tokens Meta |
| `lib/marketing/meta-client.js` | Cliente Graph API v25.0: OAuth, publicación FB/IG, Marketing API (campañas), insights |
| `lib/marketing/post-generator.js` | Generación de captions/hashtags/alt-text con MiniMax |
| `lib/marketing/image-composer.js` | Imagen 1080×1080 JPEG con overlay de marca (Sharp) |
| `lib/api/marketing.js` | Handler API completo (ver endpoints abajo) |
| `app/marketing/page.js` | Panel admin con 4 pestañas: Publicaciones, Anuncios, Métricas, Conexiones |
| `components/sidebar-nav.jsx` | Ítem "Marketing" en la sección Automatización |

## 2. Variables de entorno nuevas (VPS / .env)

```bash
# --- Módulo Marketing (obligatorias para activarlo) ---
META_APP_ID=<app id de developers.facebook.com>
META_APP_SECRET=<app secret>
META_API_VERSION=v25.0                      # opcional
MARKETING_ENCRYPTION_KEY=<openssl rand -hex 32>
MARKETING_CRON_SECRET=<openssl rand -hex 24>

# --- Reseñas (opcional) ---
REVIEW_REQUEST_DELAY_HOURS=48               # horas tras "pedido listo"

# --- Ya existentes, verificar ---
NEXT_PUBLIC_BASE_URL=https://estampadosdlv.com
CORS_ORIGINS=https://estampadosdlv.com,https://www.estampadosdlv.com
MINIMAX_API_KEY=sk-...                      # para el generador IA de posts
```

## 3. Configuración del lado de Meta (una sola vez)

1. **Crear la app** en [developers.facebook.com](https://developers.facebook.com) → tipo *Business*.
2. Añadir productos: **Facebook Login for Business** y **Marketing API**.
3. En Facebook Login → Settings → *Valid OAuth Redirect URIs* añadir:
   `https://estampadosdlv.com/api/marketing/oauth/callback`
4. Solicitar permisos (App Review si la app va a modo Live):
   `pages_manage_posts, pages_read_engagement, pages_show_list, instagram_basic, instagram_content_publish, ads_management, ads_read, business_management`
   - Mientras la app esté en **modo Development**, funciona sin App Review para los administradores/testers de la app (suficiente para uso propio del negocio).
5. La cuenta de **Instagram debe ser Business** y estar vinculada a la página de Facebook (Meta Business Suite → Configuración → Cuentas vinculadas).
6. Para anuncios de catálogo: Commerce Manager → Data Sources → *Scheduled feed* con la URL `https://estampadosdlv.com/api/marketing/feed.csv` (actualización diaria).

## 4. Cron del VPS (publicación automática + reseñas)

```bash
# crontab -e  (cada 10 minutos)
*/10 * * * * curl -s -X POST -H "x-cron-secret: TU_MARKETING_CRON_SECRET" https://estampadosdlv.com/api/marketing/dispatch >> /var/log/dlv-marketing.log 2>&1
```

El dispatch: publica posts `scheduled` vencidos, envía solicitudes de reseña con `dueAt` vencido y registra el resumen.

## 5. Endpoints nuevos

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/marketing/status` | admin | Estado del módulo y de la conexión |
| GET | `/api/marketing/oauth/start` | admin | URL del diálogo OAuth de Meta |
| GET | `/api/marketing/oauth/callback` | state | Callback OAuth (valida `state`) |
| POST | `/api/marketing/accounts/select` | admin | Elegir página / IG / ad account |
| DELETE | `/api/marketing/accounts` | admin | Desconectar |
| GET/PATCH/DELETE | `/api/marketing/posts` | admin | Listar / editar / borrar posts |
| POST | `/api/marketing/posts/generate` | admin | Generar post con IA (caption + imagen) |
| POST | `/api/marketing/posts/publish` | admin | Publicar ahora en FB/IG |
| GET/POST | `/api/marketing/campaigns` | admin | Listar / crear campañas (recetas, nacen en PAUSA) |
| POST | `/api/marketing/campaigns/status` | admin | Activar / pausar campaña |
| GET | `/api/marketing/metrics` | admin | Insights de posts y campañas |
| POST | `/api/marketing/dispatch` | cron secret | Publicación automática + reseñas |
| GET | `/api/marketing/feed.csv` | público | Feed de catálogo para Commerce Manager |

## 6. Pasos de despliegue

```bash
cd /ruta/al/proyecto
git fetch origin
git checkout feature/audit-improvements-marketing   # o mergear a main
yarn install
# añadir variables de entorno nuevas al .env
yarn build
pm2 restart estampadosdlv   # o el proceso que uses
```

Después del deploy:
1. Editar `lib/constants/business.js` con las **URLs reales** de Instagram/Facebook/TikTok y el enlace de reseña de Google (o dejar los placeholders y actualizar luego).
2. Entrar a `/marketing` → pestaña **Conexiones** → *Conectar con Meta*.
3. Configurar el cron del punto 4.
4. **Importante (auditoría):** cargar productos reales con imágenes en el catálogo — la colección `products` de producción está vacía y la tienda pública muestra 0 productos.

## 7. Verificación realizada

- `yarn build` de producción: OK (sin errores).
- Smoke tests locales con MongoDB 7: tienda SSR 200, `/api/products` público, feed CSV válido, `/api/marketing/*` protegido (403 sin admin), dispatch con `x-cron-secret` 200 / sin secret 401, `/marketing` redirige a login sin sesión y carga con sesión admin.
- Compositor de imágenes: genera JPEG 1080×1080 con overlay de marca correctamente.
