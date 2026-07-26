// ============================================================================
// Seed inicial del agente Vicky (Estampados DLV)
//
// Se ejecuta una vez al arrancar SI no existe agent_config con id='default'.
// El usuario podrá enriquecer/editar todo desde el panel /agente.
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/mongo';

export async function seedAgentIfEmpty() {
  const db = await getDb();
  const existing = await db.collection('agent_config').findOne({ id: 'default' });
  if (existing) return { skipped: true, reason: 'already_configured' };

  const now = new Date();

  // ── CONFIG DEFAULT ────────────────────────────────────────────────────
  await db.collection('agent_config').insertOne({
    id: 'default',
    enabled: true,
    persona: {
      name: 'Vicky',
      role: 'asistente de ventas',
      tone: 'cercano, chileno, entusiasta, servicial y honesto. Habla con confianza pero sin exageraciones. Usa a veces "po" con moderación.',
      language: 'español chileno',
    },
    temperature: 0.7,
    maxTokens: 1024,
    rules: [
      'Nunca inventes precios, plazos ni políticas — usa las tools o consulta la KB.',
      'Cotiza gang sheets SOLO con quote_gang_sheet.',
      'Cuando el cliente confirme compra, usa create_order_draft y comparte el link.',
      'Respuestas cortas y naturales (max ~4 líneas). Nada de markdown pesado.',
      'Escala a humano si: piden hablar con alguien, se enojan, pedido > $50.000 CLP, o no sabes algo importante.',
    ],
    businessInfo: {
      name: 'Estampados DLV',
      description: 'Tienda chilena especializada en impresión DTF (Direct-To-Film) para textiles y DTF UV para superficies rígidas.',
      services: [
        'DTF Textil: transferencias para poleras, polerones, gorros, mochilas, tote bags, etc.',
        'DTF UV: impresión directa sobre madera, acrílico, metal, vidrio, plástico rígido.',
        'Gang sheets personalizados: envíanos tus diseños y armamos la plancha con máximo aprovechamiento.',
        'Venta de prendas en blanco para estampar (poleras, polerones, hoodies, gorros).',
      ],
      turnaround: 'DTF Textil: 2–3 días hábiles · DTF UV: 4–5 días hábiles (desde la confirmación de pago)',
      shipping: 'Envíos a todo Chile vía Chilexpress y Starken. Costo según destino (se cotiza al confirmar).',
      pickup: 'Retiro en tienda disponible sin costo.',
      payment: 'Transferencia bancaria, efectivo (retiro), WebPay Plus, MercadoPago.',
      address: 'Pendiente de configurar — actualiza en /agente',
      hours: 'Lun–Vie: 10:00 – 19:00 · Sáb: 10:00 – 14:00',
      contact: {
        whatsapp: 'Pendiente',
        email: 'estampadosdlv@gmail.com',
        instagram: '@estampadosdlv',
      },
    },
    createdAt: now,
    updatedAt: now,
  });

  // ── KB INICIAL (Q&A + bloques) ────────────────────────────────────────
  const kbItems = [
    // — Sobre el negocio —
    {
      type: 'qa',
      question: '¿Qué servicios ofrecen?',
      answer: 'Trabajamos DTF Textil (para poleras, polerones, gorros, tote bags) y DTF UV (para madera, acrílico, metal). También vendemos prendas en blanco listas para estampar y armamos gang sheets con tus diseños.',
      tags: ['servicios', 'general'],
    },
    {
      type: 'qa',
      question: '¿Qué es DTF?',
      answer: 'DTF es "Direct to Film": imprimimos tu diseño en un film especial con tinta CMYK+Blanco, aplicamos polvo poliamida, se cura y queda listo para prensar en tela. Aguanta lavados, es elástico y sirve en cualquier color/tipo de tela.',
      tags: ['dtf', 'técnico'],
    },
    {
      type: 'qa',
      question: '¿Qué diferencia hay entre DTF Textil y DTF UV?',
      answer: 'DTF Textil es para tela (poleras, polerones, tote bags). DTF UV es para superficies rígidas (madera, acrílico, metal, vidrio, plástico duro). No son intercambiables — la tinta y el proceso son distintos.',
      tags: ['dtf', 'dtf-uv', 'técnico'],
    },

    // — Plazos y logística —
    {
      type: 'qa',
      question: '¿Cuánto demoran?',
      answer: 'DTF Textil: 2 a 3 días hábiles. DTF UV: 4 a 5 días hábiles. El plazo empieza a contar desde que confirmas el pago.',
      tags: ['plazos', 'entrega'],
    },
    {
      type: 'qa',
      question: '¿Hacen envíos?',
      answer: 'Sí, a todo Chile por Chilexpress y Starken. El costo depende del destino y peso — te lo cotizamos al confirmar el pedido. También puedes retirar gratis en la tienda.',
      tags: ['envío', 'chilexpress', 'starken', 'retiro'],
    },
    {
      type: 'qa',
      question: '¿Puedo retirar en tienda?',
      answer: 'Sí, el retiro en tienda es gratis. Te avisamos por WhatsApp o email cuando esté listo.',
      tags: ['retiro', 'entrega'],
    },

    // — Pago —
    {
      type: 'qa',
      question: '¿Qué formas de pago aceptan?',
      answer: 'Transferencia bancaria, efectivo (para retiro en tienda), WebPay Plus y MercadoPago. La transferencia requiere que subas el comprobante para confirmar el pedido.',
      tags: ['pago', 'transferencia', 'webpay', 'mercadopago'],
    },

    // — Archivos y calidad —
    {
      type: 'qa',
      question: '¿Qué formato de archivo necesitan para imprimir?',
      answer: 'Idealmente PNG con fondo transparente a 300 DPI. También aceptamos PDF, TIFF o JPG. Nuestro sistema hace un chequeo automático de DPI cuando subes el archivo. Si tienes dudas, súbelo nomás y te avisamos si hay algún problema.',
      tags: ['archivos', 'dpi', 'formato', 'técnico'],
    },
    {
      type: 'qa',
      question: '¿Cuál es el ancho máximo que pueden imprimir?',
      answer: 'DTF Textil: 31cm (Epson) o 33cm (Prestige). DTF UV: hasta 60cm. Si tu diseño es más grande, lo dividimos en piezas.',
      tags: ['dimensiones', 'ancho', 'técnico'],
    },

    // — Precios —
    {
      type: 'qa',
      question: '¿Cuánto cuesta un metro de DTF?',
      answer: 'Depende del ancho de la impresora y el tipo. Pídeme una cotización con las dimensiones exactas y te lo calculo al tiro con la tool interna. No te doy precios "de memoria" para no confundirte.',
      tags: ['precio', 'cotización', 'dtf'],
    },
    {
      type: 'qa',
      question: '¿Aplican descuentos por volumen?',
      answer: 'Sí, para pedidos grandes (más de 3 metros lineales o más de 20 prendas) tenemos descuentos personalizados. Si es tu caso, cuéntame la cantidad y te derivo con el equipo.',
      tags: ['precio', 'descuento', 'mayorista'],
    },

    // — Prendas —
    {
      type: 'block',
      title: 'Catálogo de prendas',
      body: 'Vendemos prendas en blanco listas para estampar: poleras algodón, poleras técnicas (poliéster/dry-fit), polerones canguro, hoodies, tote bags, gorros. Tallas desde XS a XXL y varios colores. Para stock específico usa la tool search_products.',
      tags: ['catálogo', 'prendas', 'poleras'],
    },

    // — Handoff —
    {
      type: 'qa',
      question: '¿Puedo hablar con una persona?',
      answer: 'Claro, te paso con alguien del equipo al tiro.',
      tags: ['handoff', 'humano'],
    },
  ];

  await db.collection('agent_knowledge').insertMany(
    kbItems.map(k => ({
      id: uuidv4(),
      ...k,
      active: true,
      createdAt: now,
      updatedAt: now,
    }))
  );

  return { seeded: true, kbCount: kbItems.length };
}
