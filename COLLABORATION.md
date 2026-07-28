# 🤝 Guía de Colaboración — Emergent DLV SaaS

**Última actualización**: 28 Julio 2026
**Propósito**: Coordinar el trabajo de múltiples asistentes de IA (Emergent y Manus)
sobre el mismo codebase sin generar conflictos ni pisarse cambios.

---

## 📌 Los 4 pilares del sistema

### 1) División por dominio

Cada asistente tiene **áreas exclusivas** para minimizar conflictos:

#### 🟠 Emergent (dominio principal: producto B2B/B2C)

| Área | Ruta | Descripción |
|------|------|-------------|
| E-Commerce & POS | `/app/tienda`, `/app/pos`, `/app/checkout`, `/app/checkout/**` | Storefront público, POS admin, checkout, retorno de pagos |
| Gang Sheet Builder | `/app/gang-sheet`, `/lib/gang-sheet-*`, `/lib/gang-sheet/**` | Canvas editor, sync engine, drafts, preview modal |
| Pagos | `/lib/api/payments.js`, `/lib/payments.js` | WebPay Plus (Transbank) + MercadoPago |
| Google Drive Integration | `/lib/api/drive/**`, `/app/admin/design-library` | OAuth + sync engine + panel admin |
| Proveedores/Import | `/lib/api/import/**`, `/lib/import/**` | Cottonext, TextilRyu, Treck + scraping |
| Producción Kanban | `/app/kanban`, `/lib/api/kanban.js` | Drag & drop de estados de producción |
| Inventario/ERP | `/app/inventario`, `/lib/api/inventory.js` | Commercial + production stock |
| Componentes UI base | `/components/ui/**`, `/components/gang-sheet-*`, `/components/payments-*` | shadcn/ui, componentes específicos de dominios Emergent |

#### 🔵 Manus (dominio principal: automatización + marketing)

| Área | Ruta | Descripción |
|------|------|-------------|
| Marketing | `/app/marketing`, `/lib/api/marketing/**`, `/app/api/marketing/**` | Módulo Meta/Facebook, posts, ads |
| IA/Automatización | `/lib/agent/`, `/lib/automation/`, `/lib/ai/` | Agentes, workflows automatizados |
| Auditoría | `/lib/audit/`, `/app/auditoria` | Logs, trazabilidad |
| Cron & Scheduled Jobs | `.emergent/cron/**`, `/lib/cron/**`, `/scripts/*-cron.js` | Tareas programadas, sweeps |
| Componentes de Marketing | `/components/marketing-*`, `/components/agent-*` | UI específica de dominios Manus |
| Constantes de negocio | `/lib/constants/business.js` | Info de la empresa, redes sociales |

#### ⚪ Compartidos (coordinar antes de tocar)

Estos archivos/carpetas son inevitables — ambos los editan. Ver **sección 3 (Hot Spots)**.

| Ruta | Motivo |
|------|--------|
| `/app/app/api/[[...path]]/route.js` | Router API único |
| `/app/components/sidebar-nav.jsx` | Nav lateral admin |
| `/app/lib/api/orders.js` | Modelo de negocio central |
| `/app/lib/models.js` | Schemas Mongo |
| `/.env`, `/.env.example` | Variables de entorno |
| `/package.json`, `/yarn.lock` | Dependencias |
| `/README.md` | Documentación general |
| `/test_result.md` | Log de tests |

---

### 2) Convención de branches (obligatorio)

```
main                                    ⛔ PROTEGIDO
│                                          Solo se actualiza vía PR merge
│
├── feat/emergent-{feature-name}        🟠 Emergent trabaja aquí
│   ├── feat/emergent-gsb-analytics
│   ├── feat/emergent-payments-refactor
│   └── fix/emergent-checkout-bug
│
├── feat/manus-{feature-name}           🔵 Manus trabaja aquí
│   ├── feat/manus-instagram-integration
│   ├── feat/manus-ai-agent-v2
│   └── fix/manus-cron-timeout
│
└── conflict_YYYYMMDD_HHMM              🚫 Auto-generados de Emergent
                                            (renombrar a feat/emergent-* al hacer PR)
```

**Regla absoluta**: **NUNCA hacer push directo a `main`**. Solo vía Pull Request con review.

---

### 3) Hot Spots — reglas de convivencia

Estos archivos SÍ los tocan ambos asistentes. Reglas específicas:

#### 🎯 `/app/app/api/[[...path]]/route.js`

**Regla**: Agregar handlers **al FINAL** de la lista de imports y del array de handlers. Nunca reordenar los existentes.

```javascript
// ✅ CORRECTO — agregar al final
import handleImport       from '@/lib/api/import';
import handleSettings     from '@/lib/api/settings';
import handlePayments     from '@/lib/api/payments';       // Emergent - existente
import handleDesignLib    from '@/lib/api/design-library'; // Emergent - existente
import handleDrive        from '@/lib/api/drive';          // Emergent - existente
import handleMarketing    from '@/lib/api/marketing';       // Manus - existente
import handleTuNuevoHandler from '@/lib/api/tu-modulo';    // ← NUEVO al final
```

#### 🎯 `/app/components/sidebar-nav.jsx`

**Regla**: Cada asistente agrega items **en su propia sección**.

- **Emergent** → sección `"Sistema"` (Configuración, Usuarios, Biblioteca GSB, etc.)
- **Manus** → sección `"Automatización"` (Agente IA, Bandeja, WhatsApp, Marketing, etc.)
- **Nuevas secciones** requieren acuerdo previo entre asistentes

Imports de íconos de `lucide-react`:
- Emergent agrega íconos al final del bloque en línea propia (ver ejemplo actual: `Library,`)
- Manus agrega íconos en la misma línea agrupados (ver ejemplo actual: `Megaphone,`)

#### 🎯 `/app/lib/api/orders.js`

**Regla**: Este archivo es el "corazón" del negocio. Antes de editarlo:
1. Anunciar en un comentario en el PR: `"Voy a tocar orders.js para X propósito"`
2. Preferir extender vía nuevos endpoints en otros archivos (ej: `/lib/api/orders-marketing.js`)
3. Si es imprescindible modificar orders.js → hacer PR aislado (solo ese archivo) para review rápido

#### 🎯 `/.env`

**Regla**: Cada asistente agrega variables en su **propio bloque comentado**:

```env
# --- Emergent variables ---
TBK_ENV=integration
TBK_COMMERCE_CODE=...
GOOGLE_CLIENT_ID=...

# --- Manus variables ---
META_APP_ID=...
META_APP_SECRET=...
MARKETING_ENCRYPTION_KEY=...

# --- Compartidas ---
MONGO_URL=...
NEXT_PUBLIC_BASE_URL=...
JWT_SECRET=...
```

#### 🎯 `/package.json`

**Regla**: yarn ordena automáticamente. Nunca editar manualmente el orden.

#### 🎯 `/test_result.md`

**Regla**: Cada sesión de trabajo agrega su reporte **al final** del archivo con formato:
```markdown
---
# YYYY-MM-DD · [Emergent|Manus] · Título de la feature/fix
...
```

Nunca borrar entradas previas.

---

### 4) Workflow por sesión

**Cada vez que arranca una sesión de asistente:**

```
┌────────────────────────────────────────────────────────────┐
│ 1. Nueva sesión de Emergent o Manus                        │
│    (garantiza que se clona el main actualizado)            │
├────────────────────────────────────────────────────────────┤
│ 2. Trabajar SOLO en el dominio asignado                    │
│    (revisar tabla de dominios arriba)                      │
├────────────────────────────────────────────────────────────┤
│ 3. Si necesitás tocar hot spot → seguir reglas sección 3   │
├────────────────────────────────────────────────────────────┤
│ 4. "Save to GitHub" → branch con prefijo correcto          │
│    Emergent: feat/emergent-{nombre}                        │
│    Manus:    feat/manus-{nombre}                           │
├────────────────────────────────────────────────────────────┤
│ 5. Ir a GitHub → crear PR base=main compare=tu-branch      │
├────────────────────────────────────────────────────────────┤
│ 6. Esperar 30 seg → GitHub verifica auto-merge             │
│    ✅ No conflicts (95% de los casos) → merge directo      │
│    ⚠️ Conflicts → resolver siguiendo sección 3             │
├────────────────────────────────────────────────────────────┤
│ 7. Merge → auto-deploy al VPS en ~4 min                    │
├────────────────────────────────────────────────────────────┤
│ 8. Branch se auto-elimina (config GitHub activada)         │
└────────────────────────────────────────────────────────────┘
```

**Regla anti-caos**: **NUNCA ambos asistentes activos al mismo tiempo**. Si estás con Emergent, cerrás sesión antes de abrir Manus. Idealmente separar por días.

---

## 🧪 Ejemplos prácticos

### Ejemplo 1: Emergent agrega feature de "Reseñas de clientes"

**Dominio**: parte de E-Commerce → **Emergent**

```
1. Nueva sesión de Emergent
2. Crea /app/lib/api/reviews.js + /app/app/reviews/page.js
3. Modifica route.js agregando handleReviews AL FINAL
4. Save to GitHub → branch: feat/emergent-customer-reviews
5. PR a main → auto-merge (sin conflicts esperados)
6. Merge → deploy
```

### Ejemplo 2: Manus agrega integración con Instagram

**Dominio**: Marketing → **Manus**

```
1. Nueva sesión de Manus
2. Crea /app/lib/api/marketing/instagram.js + panel en /app/marketing
3. Modifica route.js agregando handleInstagram AL FINAL
4. Modifica sidebar-nav.jsx: agrega link "Instagram" DENTRO de sección "Automatización"
5. Save to GitHub → branch: feat/manus-instagram-integration
6. PR a main → GitHub detecta que Emergent podría haber tocado route.js
   → 99% auto-merge OK porque ambos agregan al final
7. Merge → deploy
```

### Ejemplo 3: Ambos necesitan tocar orders.js el mismo día

**Coordinación obligatoria**:

```
1. Emergent hace su PR primero → merge a main
2. Manus abre nueva sesión (pull fresh main con cambios de Emergent)
3. Manus hace su PR sobre esa base actualizada
4. Merge sin problemas
```

**Nunca** hacer los 2 PRs en paralelo tocando el mismo archivo crítico.

---

## 🛠️ Configuración de GitHub (una vez)

El owner del repo (`clau3677`) debe configurar:

### A) Branch protection para `main`

`Settings → Branches → Add rule`:
- Branch name pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings (recomendado)

### B) Auto-delete branches after merge

`Settings → General → Pull Requests`:
- ✅ Automatically delete head branches

### C) Squash merging (opcional pero recomendado)

`Settings → General → Pull Requests → Merge button`:
- ✅ Allow squash merging (default)
- Preserva historial limpio en main

---

## 📎 Recursos

- **Playbook completo**: este archivo
- **Template de PR**: `.github/pull_request_template.md`
- **Code owners**: `.github/CODEOWNERS`
- **Registro de sesiones**: `test_result.md`

---

## 📞 Contacto

Owner del repo: [@clau3677](https://github.com/clau3677)
Repo: https://github.com/clau3677/EstampadosDLV-Saas

*Este documento debe actualizarse cada vez que se agrega un nuevo dominio o hot spot.*
