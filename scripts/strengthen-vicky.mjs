import fs from 'node:fs';
import { MongoClient } from 'mongodb';

function envValue(name) {
  const line = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).find((x) => x.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^['\"]|['\"]$/g, '') : '';
}

const mongoUrl = envValue('MONGO_URL');
const dbName = envValue('DB_NAME');
if (!mongoUrl || !dbName) throw new Error('MONGO_URL o DB_NAME no configurados');
const client = new MongoClient(mongoUrl);
await client.connect();
const db = client.db(dbName);
const now = new Date();

const additions = [
  {
    id: 'vicky-kb-commercial-discovery', type: 'block', title: 'Método de venta consultiva',
    body: 'Antes de recomendar, pregunta qué necesita el cliente, para qué rubro o uso, cantidad, tallas o medidas, colores, fecha requerida, comuna y si ya tiene diseño. Resume los datos confirmados y recién después sugiere una solución. Si falta un dato que cambia el precio, no inventes: solicítalo o deriva al equipo.',
    tags: ['ventas', 'descubrimiento', 'consultivo']
  },
  {
    id: 'vicky-kb-rubros-restaurante', type: 'qa', question: '¿Qué recomendar a un restaurante?',
    answer: 'Para restaurantes, prioriza poleras, poleras tipo polo, delantales, gorros y ropa laboral personalizada para el equipo. Pregunta cantidad, tallas, colores y logo. No ofrezcas DTF UV ni planchas textiles como primera opción si el cliente busca vestuario; esas soluciones se presentan solo cuando la necesidad corresponde.',
    tags: ['rubros', 'restaurante', 'ropa-laboral']
  },
  {
    id: 'vicky-kb-rubros-empresa', type: 'qa', question: '¿Qué recomendar a una empresa o negocio?',
    answer: 'Para empresas, pregunta si necesitan uniformes, ropa de trabajo, merchandising o regalos corporativos. Recomienda prendas y técnica según material, cantidad y uso; valida colores, tallas, logo y fecha. Para requisitos de seguridad, alta visibilidad o certificaciones, no garantices cumplimiento: deriva la validación técnica al equipo humano.',
    tags: ['rubros', 'empresa', 'uniformes']
  },
  {
    id: 'vicky-kb-techniques', type: 'block', title: 'Selección de técnica',
    body: 'DTF Textil se utiliza para prendas y textiles; DTF UV para superficies rígidas como madera, acrílico, metal, vidrio o plástico rígido. No son intercambiables. Si el material o el uso no está claro, pregunta antes de cotizar y evita prometer compatibilidad.',
    tags: ['dtf', 'dtf-textil', 'dtf-uv', 'técnica']
  },
  {
    id: 'vicky-kb-quote-flow', type: 'block', title: 'Flujo de cotización',
    body: 'Para cotizar reúne producto o servicio, técnica, medidas, cantidad, archivo o descripción del diseño, prendas si corresponde, fecha, comuna y modalidad de entrega. Usa las herramientas internas para precios y stock. La cotización debe distinguir subtotal, descuento autorizado, IVA, envío y validez; nunca cambies un precio manualmente ni prometas una reserva sin confirmación.',
    tags: ['cotización', 'precios', 'proceso']
  },
  {
    id: 'vicky-kb-pricing-guardrails', type: 'qa', question: '¿Cómo responder sobre precios?',
    answer: 'Explica que el valor depende de técnica, medidas, cantidad, prenda, urgencia y despacho. Solicita esos datos y usa la herramienta de cotización. No entregues precios memorizados si pueden haber cambiado y no apliques descuentos fuera de las reglas autorizadas.',
    tags: ['precio', 'cotización', 'seguridad']
  },
  {
    id: 'vicky-kb-quality-files', type: 'qa', question: '¿Qué debe saber el cliente sobre sus archivos?',
    answer: 'Idealmente debe enviar PNG con fondo transparente a 300 DPI; también se reciben PDF, TIFF o JPG para revisión. Si el archivo tiene baja resolución, fondo no deseado o dimensiones insuficientes, informa la observación y deriva a revisión; no prometas que quedará perfecto sin validarlo.',
    tags: ['archivos', 'calidad', 'dpi']
  },
  {
    id: 'vicky-kb-logistics', type: 'qa', question: '¿Cómo informar plazos y despacho?',
    answer: 'Los plazos de referencia configurados son DTF Textil 2–3 días hábiles y DTF UV 4–5 días hábiles desde la confirmación del pago. El despacho se realiza por Chilexpress o Starken según destino y el costo se confirma con los datos del pedido; también existe retiro en tienda. Si una fecha es crítica, escálala antes de prometerla.',
    tags: ['plazos', 'despacho', 'retiro']
  },
  {
    id: 'vicky-kb-followup', type: 'block', title: 'Seguimiento comercial',
    body: 'Después de entregar una cotización, registra la etapa y crea un seguimiento interno con fecha y motivo. No envíes mensajes automáticos sin autorización. Si el cliente muestra interés, confirma qué falta para cerrar: archivo, tallas, cantidad, pago o despacho. Si pide una persona, está molesto o la operación es compleja, deriva a Sandra Vásquez por WhatsApp +56 9 5416 9052.',
    tags: ['seguimiento', 'crm', 'humano']
  },
  {
    id: 'vicky-kb-handoff', type: 'qa', question: '¿Cuándo debe derivar a una persona?',
    answer: 'Deriva cuando el cliente lo solicita, hay molestia, falta información confiable, se requiere validar una especificación técnica, se pide una excepción o descuento, el pedido es de alto valor, o hay problemas de pago, producción, despacho o calidad. El contacto comercial de apoyo es Sandra Vásquez por WhatsApp +56 9 5416 9052.',
    tags: ['handoff', 'humano', 'seguridad']
  }
];

for (const item of additions) {
  await db.collection('agent_knowledge').updateOne(
    { id: item.id },
    { $set: { ...item, active: true, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
}

const config = await db.collection('agent_config').findOne({ id: 'default' });
if (config) {
  const currentRules = Array.isArray(config.rules) ? config.rules : [];
  const rules = [
    ...currentRules,
    'Sigue venta consultiva: descubre necesidad, cantidad, material, fecha y presupuesto antes de recomendar.',
    'Usa search_products y check_stock para confirmar catálogo y disponibilidad; nunca inventes variantes, tallas o colores.',
    'Para cotizaciones usa las herramientas internas y separa subtotal, descuento autorizado, IVA, despacho y validez.',
    'Registra datos confirmados y crea seguimiento interno cuando falte información o exista una cotización pendiente.',
    'No envíes mensajes, apliques descuentos, reserves stock ni crees pedidos sin la confirmación requerida.',
    'Deriva a Sandra Vásquez por WhatsApp +56 9 5416 9052 ante solicitud humana, molestia, excepción o duda técnica relevante.'
  ];
  const uniqueRules = [...new Set(rules)];
  await db.collection('agent_config').updateOne(
    { id: 'default' },
    {
      $set: {
        rules: uniqueRules,
        'businessInfo.contact.whatsapp': '+56 9 5416 9052',
        'businessInfo.contact.email': 'estampadosdlv@gmail.com',
        updatedAt: now
      }
    }
  );
}

const count = await db.collection('agent_knowledge').countDocuments({ active: true });
console.log(JSON.stringify({ ok: true, upserted: additions.length, activeKnowledge: count }));
await client.close();
process.exit(0);
