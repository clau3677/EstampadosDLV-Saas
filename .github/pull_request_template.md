<!--
Este template se rellena automáticamente al crear un Pull Request.
Sigue las reglas de /COLLABORATION.md
-->

## 📝 Descripción

<!-- ¿Qué hace este PR? 2-3 líneas -->


## 🎯 Tipo de cambio

- [ ] 🟠 Feature Emergent (dominios: e-commerce, gang sheet, pagos, drive, imports)
- [ ] 🔵 Feature Manus (dominios: marketing, IA/automatización, cron)
- [ ] 🐛 Bug fix
- [ ] ♻️ Refactor (sin cambios funcionales)
- [ ] 📚 Documentación
- [ ] ⚙️ Config / CI

## ✅ Checklist obligatorio

- [ ] Branch tiene el prefijo correcto:
  - Emergent → `feat/emergent-*` o `fix/emergent-*`
  - Manus → `feat/manus-*` o `fix/manus-*`
- [ ] Solo modifiqué archivos de **mi dominio** (ver [`COLLABORATION.md`](../COLLABORATION.md))
- [ ] Si toqué un **hot spot** (route.js, sidebar-nav.jsx, orders.js, .env, etc.), seguí las reglas de la sección 3 de `COLLABORATION.md`
- [ ] Los tests backend pasan (usar `deep_testing_backend_nextjs`)
- [ ] Actualicé `/test_result.md` con el reporte de la sesión
- [ ] No hardcodée secretos, URLs o valores que deberían ir en `.env`
- [ ] `yarn build` compila sin errores

## 🗂️ Archivos hot spot modificados

<!-- Marcá TODOS los que aplican. Si marcás alguno, describí qué agregaste/cambiaste -->

- [ ] `/app/app/api/[[...path]]/route.js` → nuevo handler agregado AL FINAL de la lista
- [ ] `/app/components/sidebar-nav.jsx` → item agregado en mi sección (Sistema o Automatización)
- [ ] `/app/lib/api/orders.js` → cambio consensuado con el otro asistente
- [ ] `/app/lib/models.js` → nuevo campo/colección
- [ ] `/.env` → variables agregadas a mi bloque (`# --- Emergent ---` o `# --- Manus ---`)
- [ ] `/.env.example` → documenté las variables nuevas
- [ ] `/package.json` → dependencia agregada vía `yarn add`

**Describí cambios en hot spots:**


## 🧪 Testing

<!-- Cómo verificaste que funciona -->

- [ ] Backend testing agent → ✅ X/X tests pasaron
- [ ] Frontend visual → screenshots verificados
- [ ] Smoke test manual: `<endpoint o flujo>`


## 🚀 Deploy

- [ ] Este PR está listo para auto-deploy al VPS al mergear
- [ ] Requiere configuración manual post-deploy (ej: agregar env vars en VPS antes)

**Detalles del deploy:**


## 📸 Screenshots (si aplica)

<!-- Antes / Después de la UI -->


## 📎 Referencias

<!-- Links a issues, playbooks, docs -->
