// ============================================================================
// Herramientas (Tools) del Agente Vendedor
//
// Cada tool declara:
//   - schema: JSON Schema OpenAI-compatible (name, description, parameters)
//   - handler: función async que recibe (args, ctx) y retorna JSON-serializable
//
// ctx contiene { db, conversationId, contactId, source } para que las tools
// puedan actuar contextualizadas.
//
// Filosofía: las tools son *conservadoras* — nunca cobran, nunca envían mensajes
// automáticos al cliente sin confirmación, nunca modifican inventario. Solo
// consultan datos y arman "borradores" que un humano (o el flujo estándar de
// checkout) confirma después.
// ============================================================================
import { COLLECTIONS, strip } from '@/lib/models';
import { formatCLP } from '@/lib/format';

// ---------------------------------------------------------------------------
// 1) search_products — busca en el catálogo por texto libre
// ---------------------------------------------------------------------------
const searchProducts = {
  schema: {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Busca productos del catálogo por nombre, categoría o palabra clave. Retorna productos con nombre, precio, categoría, tallas y colores disponibles. Úsalo cuando el cliente pregunte por prendas específicas (poleras, polerones, hoodies, etc.) o por catálogo en general.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Texto libre a buscar (nombre, categoría, tipo de prenda). Ej: "poleras", "hoodie negro", "algodón".',
          },
          limit: {
            type: 'integer',
            description: 'Máximo de resultados (default 5, máx 10)',
            default: 5,
          },
        },
        required: ['query'],
      },
    },
  },
  async handler({ query, limit = 5 }, { db }) {
    const lim = Math.min(10, Math.max(1, limit));
    const q = String(query || '').trim();
    if (!q) return { products: [], message: 'query vacío' };

    const regex = new RegExp(q.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    const rows = await db.collection(COLLECTIONS.PRODUCTS).find({
      active: { $ne: false },
      $or: [
        { name: regex },
        { description: regex },
        { category: regex },
        { tags: regex },
      ],
    }).limit(lim).toArray();

    return {
      count: rows.length,
      products: rows.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        priceRangeCLP: p.variants?.length
          ? { min: Math.min(...p.variants.map(v => v.price || p.basePrice || 0)),
              max: Math.max(...p.variants.map(v => v.price || p.basePrice || 0)) }
          : { min: p.basePrice || 0, max: p.basePrice || 0 },
        priceRangeLabel: p.variants?.length
          ? formatCLP(Math.min(...p.variants.map(v => v.price || p.basePrice || 0))) +
            (Math.max(...p.variants.map(v => v.price || p.basePrice || 0)) !==
             Math.min(...p.variants.map(v => v.price || p.basePrice || 0))
              ? ' – ' + formatCLP(Math.max(...p.variants.map(v => v.price || p.basePrice || 0)))
              : '')
          : formatCLP(p.basePrice || 0),
        colors: [...new Set((p.variants || []).map(v => v.color).filter(Boolean))],
        sizes: [...new Set((p.variants || []).map(v => v.size).filter(Boolean))],
        totalStock: (p.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0),
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// 2) get_product_details — detalles + variantes de un producto específico
// ---------------------------------------------------------------------------
const getProductDetails = {
  schema: {
    type: 'function',
    function: {
      name: 'get_product_details',
      description: 'Obtiene detalles completos de un producto, incluidas todas sus variantes (talla/color) con precio y stock. Úsalo después de search_products si el cliente muestra interés en un producto específico.',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'UUID del producto' },
        },
        required: ['productId'],
      },
    },
  },
  async handler({ productId }, { db }) {
    const p = await db.collection(COLLECTIONS.PRODUCTS).findOne({ id: productId });
    if (!p) return { error: 'Producto no encontrado' };
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      variants: (p.variants || []).map(v => ({
        id: v.id,
        color: v.color,
        size: v.size,
        priceCLP: v.price || p.basePrice,
        priceLabel: formatCLP(v.price || p.basePrice || 0),
        stock: v.stock || 0,
        available: (v.stock || 0) > 0,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// 3) quote_gang_sheet — cotiza un gang sheet DTF por dimensiones
// ---------------------------------------------------------------------------
const quoteGangSheet = {
  schema: {
    type: 'function',
    function: {
      name: 'quote_gang_sheet',
      description: 'Cotiza un metro de gang sheet DTF por dimensiones. Úsalo cuando el cliente quiera imprimir sus propios diseños en DTF (planchas de vinilo textil). Retorna precio total y por metro lineal según la impresora asignada. IMPRESORAS DISPONIBLES: 31cm (Epson) y 33cm (Prestige) para DTF textil, más DTF UV para superficies rígidas.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['dtf_textil', 'dtf_uv'],
            description: 'Tipo de impresión: dtf_textil (poleras, tela) o dtf_uv (superficies duras: madera, acrílico, metal)',
          },
          widthCm: {
            type: 'number',
            description: 'Ancho del gang sheet en centímetros. Debe respetar los anchos disponibles: 31 (Epson) o 33 (Prestige) para textil. UV es hasta 60cm.',
          },
          lengthMm: {
            type: 'number',
            description: 'Largo del gang sheet en milímetros (mínimo 100mm, máximo 10000mm = 10 metros).',
          },
        },
        required: ['type', 'widthCm', 'lengthMm'],
      },
    },
  },
  async handler({ type, widthCm, lengthMm }, { db }) {
    const w = Number(widthCm);
    const l = Number(lengthMm);
    if (!w || !l) return { error: 'widthCm y lengthMm son requeridos' };
    if (l < 100) return { error: 'El largo mínimo es 100mm (10cm)' };
    if (l > 10000) return { error: 'El largo máximo es 10000mm (10m)' };

    // Buscar impresora compatible por tipo + ancho
    const printers = await db.collection(COLLECTIONS.PRINTERS).find({
      active: true,
      type: type,
    }).toArray();

    const compatible = printers
      .filter(p => Math.abs((p.maxPrintWidthMm / 10) - w) < 1) // margen 1cm
      .sort((a, b) => (a.pricePerMm || 0) - (b.pricePerMm || 0));

    if (!compatible.length) {
      const available = printers.map(p => `${p.maxPrintWidthMm / 10}cm (${p.name})`).join(', ');
      return {
        error: `No hay impresora ${type} de ${w}cm de ancho.`,
        available_widths_cm: printers.map(p => p.maxPrintWidthMm / 10),
        note: available ? `Anchos disponibles: ${available}` : 'Sin impresoras activas',
      };
    }

    const printer = compatible[0];
    const pricePerMm = printer.pricePerMm || 0;
    const totalPrice = Math.round(l * pricePerMm);
    const pricePerMeter = Math.round(1000 * pricePerMm);

    return {
      ok: true,
      type,
      widthCm: w,
      lengthMm: l,
      lengthMeters: (l / 1000).toFixed(2),
      printer: {
        code: printer.code,
        name: printer.name,
        maxPrintWidthCm: printer.maxPrintWidthMm / 10,
      },
      pricing: {
        pricePerMmCLP: pricePerMm,
        pricePerMeterCLP: pricePerMeter,
        pricePerMeterLabel: formatCLP(pricePerMeter),
        totalCLP: totalPrice,
        totalLabel: formatCLP(totalPrice),
      },
      dpi_recommended: 300,
      turnaround_days: type === 'dtf_uv' ? '4-5 días hábiles' : '2-3 días hábiles',
    };
  },
};

// ---------------------------------------------------------------------------
// 4) check_stock — stock actual de una variante específica
// ---------------------------------------------------------------------------
const checkStock = {
  schema: {
    type: 'function',
    function: {
      name: 'check_stock',
      description: 'Consulta el stock disponible de una variante específica (talla + color). Úsalo cuando el cliente quiera saber si algo está disponible en X talla/color.',
      parameters: {
        type: 'object',
        properties: {
          variantId: { type: 'string', description: 'UUID de la variante' },
        },
        required: ['variantId'],
      },
    },
  },
  async handler({ variantId }, { db }) {
    // Buscar el producto que contiene esta variante
    const p = await db.collection(COLLECTIONS.PRODUCTS).findOne({ 'variants.id': variantId });
    if (!p) return { error: 'Variante no encontrada' };
    const v = (p.variants || []).find(vv => vv.id === variantId);
    return {
      variantId,
      productName: p.name,
      color: v.color,
      size: v.size,
      stock: v.stock || 0,
      available: (v.stock || 0) > 0,
      priceCLP: v.price || p.basePrice || 0,
      priceLabel: formatCLP(v.price || p.basePrice || 0),
    };
  },
};

// ---------------------------------------------------------------------------
// 5) create_order_draft — crea un BORRADOR de pedido (no lo cobra)
// ---------------------------------------------------------------------------
const createOrderDraft = {
  schema: {
    type: 'function',
    function: {
      name: 'create_order_draft',
      description: 'Crea un BORRADOR de pedido con ítems que el cliente confirmó. NO cobra ni compromete stock. Genera un link de checkout. Úsalo SOLO cuando el cliente haya confirmado explícitamente los ítems y quiera avanzar al pago.',
      parameters: {
        type: 'object',
        properties: {
          customerName: { type: 'string', description: 'Nombre del cliente' },
          customerPhone: { type: 'string', description: 'Teléfono (formato chileno, ej +56 9 XXXX XXXX)' },
          customerEmail: { type: 'string', description: 'Email (opcional)' },
          items: {
            type: 'array',
            description: 'Ítems del pedido. Cada uno DEBE ser variant (producto de catálogo) O gang_sheet (impresión).',
            items: {
              type: 'object',
              properties: {
                kind: {
                  type: 'string',
                  enum: ['variant', 'gang_sheet'],
                  description: 'variant = producto de catálogo · gang_sheet = servicio de impresión DTF',
                },
                // Cuando kind='variant'
                variantId: { type: 'string', description: 'UUID de la variante (SOLO si kind=variant)' },
                quantity: { type: 'integer', description: 'Cantidad', minimum: 1 },
                // Cuando kind='gang_sheet'
                gsType: { type: 'string', enum: ['dtf_textil', 'dtf_uv'], description: 'Tipo (SOLO si kind=gang_sheet)' },
                widthCm: { type: 'number', description: 'Ancho en cm (SOLO si kind=gang_sheet)' },
                lengthMm: { type: 'number', description: 'Largo en mm (SOLO si kind=gang_sheet)' },
              },
              required: ['kind', 'quantity'],
            },
          },
          deliveryMethod: {
            type: 'string',
            enum: ['pickup', 'shipping'],
            description: 'pickup = retiro en tienda, shipping = envío a domicilio',
          },
          notes: { type: 'string', description: 'Notas u observaciones (opcional)' },
        },
        required: ['customerName', 'items', 'deliveryMethod'],
      },
    },
  },
  async handler({ customerName, customerPhone, customerEmail, items, deliveryMethod, notes }, { db, conversationId }) {
    if (!items?.length) return { error: 'Debe incluir al menos 1 ítem' };

    const lines = [];
    let total = 0;

    for (const it of items) {
      const qty = Math.max(1, Number(it.quantity) || 1);

      if (it.kind === 'variant') {
        if (!it.variantId) { return { error: 'variantId requerido para kind=variant' }; }
        const p = await db.collection(COLLECTIONS.PRODUCTS).findOne({ 'variants.id': it.variantId });
        if (!p) { return { error: `Variante ${it.variantId} no encontrada` }; }
        const v = (p.variants || []).find(vv => vv.id === it.variantId);
        const unitPrice = v.price || p.basePrice || 0;
        const lineTotal = unitPrice * qty;
        total += lineTotal;
        lines.push({
          kind: 'variant',
          productName: p.name,
          variantLabel: `${v.color || ''} · ${v.size || ''}`.trim().replace(/^·\s*/, '').replace(/\s*·\s*$/, ''),
          quantity: qty,
          unitPriceCLP: unitPrice,
          totalCLP: lineTotal,
        });
      } else if (it.kind === 'gang_sheet') {
        const w = Number(it.widthCm);
        const l = Number(it.lengthMm);
        if (!w || !l || !it.gsType) { return { error: 'gang_sheet requiere gsType, widthCm y lengthMm' }; }

        // Cotización oficial vía impresora activa
        const printers = await db.collection(COLLECTIONS.PRINTERS).find({
          active: true, type: it.gsType,
        }).toArray();
        const compat = printers
          .filter(p => Math.abs((p.maxPrintWidthMm / 10) - w) < 1)
          .sort((a, b) => (a.pricePerMm || 0) - (b.pricePerMm || 0));
        if (!compat.length) return { error: `No hay impresora ${it.gsType} de ${w}cm activa` };

        const printer = compat[0];
        const unitPrice = Math.round(l * (printer.pricePerMm || 0)); // precio por unidad (1 metro con ese largo)
        const lineTotal = unitPrice * qty;
        total += lineTotal;
        lines.push({
          kind: 'gang_sheet',
          productName: `Gang sheet ${it.gsType === 'dtf_uv' ? 'DTF UV' : 'DTF Textil'} ${w}cm × ${(l / 10).toFixed(1)}cm`,
          variantLabel: `Impresora ${printer.name}`,
          quantity: qty,
          unitPriceCLP: unitPrice,
          totalCLP: lineTotal,
          spec: { type: it.gsType, widthCm: w, lengthMm: l, printerCode: printer.code },
        });
      } else {
        return { error: `kind desconocido: ${it.kind}` };
      }
    }

    // Guardar draft
    const draftId = `draft_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await db.collection('agent_order_drafts').insertOne({
      id: draftId,
      conversationId,
      customer: { name: customerName, phone: customerPhone, email: customerEmail },
      items,
      lines,
      deliveryMethod,
      notes,
      totalCLP: total,
      status: 'pending_confirmation',
      createdAt: new Date(),
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    const checkoutUrl = `${baseUrl}/checkout?draft=${draftId}&delivery=${deliveryMethod}`;

    return {
      ok: true,
      draftId,
      lines,
      totalCLP: total,
      totalLabel: formatCLP(total),
      deliveryMethod,
      checkoutUrl,
      message: `Borrador creado. El cliente debe abrir ${checkoutUrl} para confirmar y pagar.`,
    };
  },
};

// ---------------------------------------------------------------------------
// 6) get_business_info — info del negocio (dirección, horario, plazos, envío)
// ---------------------------------------------------------------------------
const getBusinessInfo = {
  schema: {
    type: 'function',
    function: {
      name: 'get_business_info',
      description: 'Retorna información del negocio: dirección, horario, plazos de entrega, métodos de pago, políticas de envío, contacto humano. Úsalo cuando el cliente pregunte por logística, horarios, ubicación o formas de pago.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: ['address', 'hours', 'shipping', 'payment', 'turnaround', 'contact', 'all'],
            description: 'Tema específico o "all" para todo',
            default: 'all',
          },
        },
      },
    },
  },
  async handler({ topic = 'all' }, { db }) {
    const cfg = await db.collection('agent_config').findOne({ id: 'default' });
    const info = cfg?.businessInfo || {};

    const all = {
      address: info.address || 'Dirección aún no configurada',
      hours: info.hours || 'Lun–Vie: 09:00 – 18:00 · Sáb: 10:00 – 14:00',
      shipping: info.shipping || 'Envíos a todo Chile vía Chilexpress / Starken. Costo según destino.',
      payment: info.payment || 'Transferencia bancaria, efectivo (retiro), WebPay Plus, MercadoPago',
      turnaround: info.turnaround || 'DTF Textil: 2–3 días hábiles · DTF UV: 4–5 días hábiles',
      contact: info.contact || 'WhatsApp: +56 9 XXXX XXXX · Email: estampadosdlv@gmail.com',
      instagram: info.instagram || '@estampadosdlv',
    };

    if (topic === 'all') return all;
    return { [topic]: all[topic] || 'Sin información' };
  },
};

// ---------------------------------------------------------------------------
// 7) search_knowledge — busca en la KB del agente (Q&A + bloques)
// ---------------------------------------------------------------------------
const searchKnowledge = {
  schema: {
    type: 'function',
    function: {
      name: 'search_knowledge',
      description: 'Busca en la base de conocimiento del negocio (Q&A + notas). Úsalo cuando el cliente pregunte algo que no está en los otros tools (políticas, garantías, materiales, curiosidades, etc.).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Pregunta o palabras clave a buscar' },
        },
        required: ['query'],
      },
    },
  },
  async handler({ query }, { db }) {
    const q = String(query || '').trim();
    if (!q) return { results: [] };
    const regex = new RegExp(q.split(/\s+/).slice(0, 5).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
    const rows = await db.collection('agent_knowledge').find({
      active: { $ne: false },
      $or: [{ question: regex }, { answer: regex }, { tags: regex }, { title: regex }, { body: regex }],
    }).limit(5).toArray();
    return {
      count: rows.length,
      results: rows.map(r => ({
        type: r.type,
        title: r.title || r.question,
        content: r.answer || r.body,
        tags: r.tags,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// 8) escalate_to_human — pasa la conversación a un humano
// ---------------------------------------------------------------------------
const escalateToHuman = {
  schema: {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Marca la conversación para que un humano la atienda. Úsalo cuando: (1) el cliente lo pida explícitamente, (2) detectes enojo o frustración, (3) el pedido sea grande (>$50000 CLP), (4) haya duda regulatoria/legal, (5) no puedas responder algo importante. NUNCA lo uses para preguntas simples que sabes contestar.',
      parameters: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            enum: ['customer_request', 'complaint', 'large_order', 'unknown_question', 'confirmation_needed', 'other'],
            description: 'Razón del handoff',
          },
          summary: { type: 'string', description: 'Resumen breve para el operador humano' },
        },
        required: ['reason', 'summary'],
      },
    },
  },
  async handler({ reason, summary }, { db, conversationId }) {
    await db.collection('agent_conversations').updateOne(
      { id: conversationId },
      {
        $set: {
          aiEnabled: false,
          humanTakeoverAt: new Date(),
          escalationReason: reason,
          escalationSummary: summary,
          stage: 'human_takeover',
        },
      }
    );
    return {
      ok: true,
      message: 'Conversación escalada. Un agente humano te contactará pronto.',
      reason,
    };
  },
};

// ---------------------------------------------------------------------------
// Registry (exportado)
// ---------------------------------------------------------------------------
export const TOOLS = [
  searchProducts,
  getProductDetails,
  quoteGangSheet,
  checkStock,
  createOrderDraft,
  getBusinessInfo,
  searchKnowledge,
  escalateToHuman,
];

/** Retorna los schemas para pasar al LLM */
export function toolSchemas() {
  return TOOLS.map(t => t.schema);
}

/** Ejecuta una tool por nombre. Retorna string JSON (para pasar al LLM). */
export async function runTool(name, argsJson, ctx) {
  const tool = TOOLS.find(t => t.schema.function.name === name);
  if (!tool) {
    return JSON.stringify({ error: `Tool desconocida: ${name}` });
  }
  let args = {};
  try { args = typeof argsJson === 'string' ? JSON.parse(argsJson || '{}') : (argsJson || {}); }
  catch (e) { return JSON.stringify({ error: `args inválidos: ${e.message}` }); }
  try {
    const result = await tool.handler(args, ctx);
    return JSON.stringify(result ?? { ok: true });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
