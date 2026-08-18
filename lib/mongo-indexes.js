/**
 * Creación idempotente de índices MongoDB.
 * Se llama automáticamente la primera vez que se hace `getDb()`.
 *
 * Los índices están ordenados por prioridad (más consultados primero) e incluyen
 * todos los campos usados por WHERE, SORT y $match de los API endpoints existentes.
 *
 * Con estos índices los queries pasan de "collection scan O(N)" a "index seek O(log N)"
 * o "index range scan O(K)" — 10-100x más rápido a medida que crece la data.
 */

// Nota: los `id` (UUID v4) son la clave lógica del sistema y se usan constantemente
// en $eq / $in / updateOne / findOne. Todos deben ser únicos.
const INDEX_DEFINITIONS = [
  // --- Órdenes y pedidos ---
  { col: 'orders',           key: { id: 1 },                     opts: { unique: true, name: 'idx_id_unique' } },
  { col: 'orders',           key: { orderNumber: 1 },            opts: { unique: true, name: 'idx_orderNumber_unique' } },
  { col: 'orders',           key: { createdAt: -1 } },
  { col: 'orders',           key: { status: 1, createdAt: -1 } },
  { col: 'orders',           key: { productionStatus: 1 } },
  { col: 'orders',           key: { channel: 1, createdAt: -1 } },

  { col: 'order_items',      key: { id: 1 },       opts: { unique: true } },
  { col: 'order_items',      key: { orderId: 1 } },
  { col: 'order_items',      key: { type: 1 } },
  { col: 'order_items',      key: { gangSheetId: 1 } },

  // --- Cola de producción ---
  { col: 'production_queue', key: { id: 1 },                      opts: { unique: true } },
  { col: 'production_queue', key: { orderId: 1 } },
  { col: 'production_queue', key: { orderItemId: 1 } },
  { col: 'production_queue', key: { printer: 1, status: 1 } },
  { col: 'production_queue', key: { status: 1, priority: 1, createdAt: 1 } },

  // --- Catálogo ---
  { col: 'products',         key: { id: 1 },       opts: { unique: true } },
  { col: 'products',         key: { slug: 1 },     opts: { unique: true, sparse: true } },
  { col: 'products',         key: { active: 1 } },
  { col: 'products',         key: { category: 1 } },

  { col: 'taxonomies',       key: { id: 1 },       opts: { unique: true } },
  { col: 'taxonomies',       key: { type: 1, slug: 1 } },

  // --- Impresoras / máquinas ---
  { col: 'printers',         key: { id: 1 },       opts: { unique: true } },
  { col: 'printers',         key: { active: 1 } },

  // --- Inventario ---
  { col: 'commercial_stock', key: { id: 1 },       opts: { unique: true } },
  { col: 'commercial_stock', key: { productId: 1 } },
  { col: 'commercial_stock', key: { available: 1 } },

  { col: 'production_supplies', key: { id: 1 },       opts: { unique: true } },
  { col: 'production_supplies', key: { category: 1 } },
  { col: 'production_supplies', key: { currentStock: 1 } },

  { col: 'stock_movements',  key: { id: 1 },       opts: { unique: true } },
  { col: 'stock_movements',  key: { supplyId: 1, createdAt: -1 } },
  { col: 'stock_movements',  key: { productId: 1, createdAt: -1 } },
  { col: 'stock_movements',  key: { createdAt: -1 } },

  // --- Gang Sheets ---
  { col: 'gang_sheets',      key: { id: 1 },       opts: { unique: true } },
  { col: 'gang_sheets',      key: { orderId: 1 } },
  { col: 'gang_sheets',      key: { createdAt: -1 } },

  // --- Featured products ---
  { col: 'products',         key: { featured: 1, active: 1 } },

  // --- Usuarios ---
  { col: 'users',            key: { id: 1 },       opts: { unique: true } },
  { col: 'users',            key: { email: 1 },    opts: { unique: true, sparse: true } },
  { col: 'users',            key: { role: 1 } },

  // --- Clientes (CRM unificado web + POS + WhatsApp) ---
  { col: 'customers',        key: { id: 1 },        opts: { unique: true } },
  { col: 'customers',        key: { emailNorm: 1 }, opts: { sparse: true } },
  { col: 'customers',        key: { phoneNorm: 1 }, opts: { sparse: true } },
  { col: 'customers',        key: { rutNorm: 1 },   opts: { sparse: true } },
  { col: 'customers',        key: { tags: 1 } },
  { col: 'customers',        key: { createdAt: -1 } },

  // También referencia inversa: pedidos que tienen customerId asignado
  { col: 'orders',           key: { customerId: 1 } },

  // --- Clientes (contactos del agente) ---
  { col: 'agent_contacts',   key: { id: 1 },       opts: { unique: true } },
  { col: 'agent_contacts',   key: { phone: 1 },    opts: { sparse: true } },
  { col: 'agent_contacts',   key: { email: 1 },    opts: { sparse: true } },

  // --- Conversaciones y mensajes del agente ---
  { col: 'agent_conversations', key: { id: 1 },       opts: { unique: true } },
  { col: 'agent_conversations', key: { customerId: 1 } },
  { col: 'agent_conversations', key: { channel: 1, status: 1 } },
  { col: 'agent_conversations', key: { updatedAt: -1 } },

  { col: 'agent_messages',   key: { id: 1 },       opts: { unique: true } },
  { col: 'agent_messages',   key: { conversationId: 1, createdAt: 1 } },

  // --- WhatsApp / Email ---
  { col: 'whatsapp_messages', key: { id: 1 },       opts: { unique: true } },
  { col: 'whatsapp_messages', key: { phone: 1, createdAt: -1 } },
  { col: 'whatsapp_messages', key: { orderId: 1 } },

  { col: 'email_messages',   key: { id: 1 },       opts: { unique: true } },
  { col: 'email_messages',   key: { orderId: 1 } },
  { col: 'email_messages',   key: { createdAt: -1 } },

  // --- Mantenimiento ---
  { col: 'maintenance_logs', key: { id: 1 },       opts: { unique: true } },
  { col: 'maintenance_logs', key: { printerId: 1, scheduledAt: -1 } },
  { col: 'maintenance_logs', key: { status: 1 } },
  { col: 'maintenance_logs', key: { nextDueDate: 1 } },

  // --- Pre-Press exports ---
  { col: 'pre_press_exports', key: { id: 1 },       opts: { unique: true } },
  { col: 'pre_press_exports', key: { orderId: 1 } },
  { col: 'pre_press_exports', key: { createdAt: -1 } },

  // --- POS sessions ---
  { col: 'pos_sessions',     key: { id: 1 },       opts: { unique: true } },
  { col: 'pos_sessions',     key: { cashierId: 1, status: 1 } },
  { col: 'pos_sessions',     key: { openedAt: -1 } },

  // --- Landing pages ---
  { col: 'landing_pages',    key: { id: 1 },       opts: { unique: true } },
  { col: 'landing_pages',    key: { slug: 1 },     opts: { unique: true, sparse: true } },

  // --- Agent knowledge base ---
  { col: 'agent_knowledge',  key: { id: 1 },       opts: { unique: true } },
  { col: 'agent_knowledge',  key: { active: 1, category: 1 } },

  // --- Módulo Prospección B2B Quinta Región (build91) ---
  { col: 'campaigns',            key: { id: 1 },              opts: { unique: true } },
  { col: 'campaigns',            key: { status: 1 } },
  { col: 'campaigns',            key: { status: 1, createdAt: -1 } },

  { col: 'leads',                key: { id: 1 },              opts: { unique: true } },
  { col: 'leads',                key: { sourceId: 1 } },
  { col: 'leads',                key: { territory: 1, category: 1 } },
  { col: 'leads',                key: { category: 1 } },
  { col: 'leads',                key: { state: 1 } },
  { col: 'leads',                key: { 'score.final': -1 } },
  { col: 'leads',                key: { 'score.final': -1, state: 1 } },
  { col: 'leads',                key: { emailLower: 1 },      opts: { sparse: true } },
  { col: 'leads',                key: { emailDomain: 1 },     opts: { sparse: true } },
  { col: 'leads',                key: { phoneNormalized: 1 }, opts: { sparse: true } },
  { col: 'leads',                key: { nameNormalized: 1, commune: 1 }, opts: { sparse: true } },

  { col: 'lead_sources',         key: { id: 1 },              opts: { unique: true } },
  { col: 'lead_sources',         key: { name: 1 },            opts: { unique: true } },
  { col: 'lead_sources',         key: { enabled: 1 } },

  { col: 'campaign_leads',       key: { id: 1 },              opts: { unique: true } },
  { col: 'campaign_leads',       key: { campaignId: 1, leadId: 1 }, opts: { unique: true } },
  { col: 'campaign_leads',       key: { campaignId: 1, state: 1 } },
  { col: 'campaign_leads',       key: { leadId: 1 } },

  { col: 'contacts',             key: { id: 1 },              opts: { unique: true } },
  { col: 'contacts',             key: { leadId: 1 } },
  { col: 'contacts',             key: { leadId: 1, isPrimary: 1 } },

  { col: 'message_templates',    key: { id: 1 },              opts: { unique: true } },
  { col: 'message_templates',    key: { category: 1, locale: 1, channel: 1 } },
  { col: 'message_templates',    key: { locale: 1 } },

  { col: 'messages',             key: { id: 1 },              opts: { unique: true } },
  { col: 'messages',             key: { campaignId: 1 } },
  { col: 'messages',             key: { campaignLeadId: 1 } },
  { col: 'messages',             key: { status: 1 } },
  { col: 'messages',             key: { status: 1, createdAt: -1 } },
  { col: 'messages',             key: { emailLower: 1 },      opts: { sparse: true } },

  { col: 'suppressions',         key: { id: 1 },              opts: { unique: true } },
  { col: 'suppressions',         key: { kind: 1, valueLower: 1 }, opts: { unique: true, sparse: true } },
  { col: 'suppressions',         key: { active: 1 } },

  { col: 'jobs',                 key: { id: 1 },              opts: { unique: true } },
  { col: 'jobs',                 key: { type: 1, status: 1 } },
  { col: 'jobs',                 key: { status: 1, runAt: 1 } },
  { col: 'jobs',                 key: { uniqueKey: 1 },       opts: { sparse: true } },

  { col: 'audit_events',         key: { id: 1 },              opts: { unique: true } },
  { col: 'audit_events',         key: { createdAt: -1 } },
  { col: 'audit_events',         key: { actorId: 1, createdAt: -1 } },
  { col: 'audit_events',         key: { entityType: 1, entityId: 1, createdAt: -1 } },
  { col: 'audit_events',         key: { action: 1 } },

  { col: 'enrichment_tasks',     key: { id: 1 },              opts: { unique: true } },
  { col: 'enrichment_tasks',     key: { leadId: 1 } },
  { col: 'enrichment_tasks',     key: { status: 1 } },
];

let _indexesEnsured = false;

/**
 * Crea todos los índices en paralelo. Es idempotente: si ya existen, no falla.
 * Se ejecuta una sola vez por lifecycle del proceso Node.
 */
export async function ensureIndexes(db) {
  if (_indexesEnsured) return;
  _indexesEnsured = true;

  const started = Date.now();
  const results = await Promise.allSettled(
    INDEX_DEFINITIONS.map(async ({ col, key, opts = {} }) => {
      try {
        await db.collection(col).createIndex(key, opts);
        return { ok: true, col, key };
      } catch (e) {
        // Errores frecuentes: duplicate key en índice unique (data pre-existente),
        // conflicto de opts entre versiones. Los logueamos pero no rompemos.
        return { ok: false, col, key, error: e?.message };
      }
    })
  );

  const okCount = results.filter(r => r.status === 'fulfilled' && r.value?.ok).length;
  const errors = results
    .filter(r => r.status === 'fulfilled' && !r.value?.ok)
    .map(r => r.value);

  const took = Date.now() - started;
  console.log(`[mongo-indexes] ${okCount}/${INDEX_DEFINITIONS.length} índices asegurados en ${took}ms`);
  if (errors.length) {
    console.warn(`[mongo-indexes] ${errors.length} índices con warning:`);
    errors.slice(0, 5).forEach(e => console.warn(`  - ${e.col} [${JSON.stringify(e.key)}] → ${e.error}`));
  }
}

export default ensureIndexes;
