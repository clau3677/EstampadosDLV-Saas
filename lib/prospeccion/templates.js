/**
 * =============================================================================
 *  Prospección B2B — templates.js
 * -----------------------------------------------------------------------------
 *  Plantillas de mensaje por rubro (es-CL) con personalización por variables.
 *
 *  Variables soportadas:
 *   {{business_name}}       nombre del negocio
 *   {{commune}}             comuna
 *   {{category}}            rubro
 *   {{verified_signal}}     señal verificable (Maps, Instagram...)
 *   {{service_relevant}}    propuesta de valor adaptada al rubro
 *   {{sender_name}}         nombre de quien escribe (Sandra Vásquez)
 *   {{company_name}}        Estampados DLV
 *   {{calendar_link}}       enlace WhatsApp
 *   {{unsubscribe_link}}    enlace de baja
 *
 *  Estructura exigida (compliance anti-spam):
 *   1. Saludo personalizado
 *   2. Observación verificable (por qué les escribimos)
 *   3. Propuesta de valor específica del rubro
 *   4. UN solo CTA de baja fricción
 *   5. Identificación completa del remitente
 *   6. Enlace de baja visible
 *   7. Frase de no-molestia ("si no es el momento...")
 * =============================================================================
 */

export const TEMPLATE_VARIABLES = [
  'business_name', 'commune', 'category', 'verified_signal',
  'service_relevant', 'sender_name', 'company_name',
  'calendar_link', 'unsubscribe_link',
];

// Propuestas de valor específicas por rubro (relevantes para servicios de estampado DTF).
const SERVICE_BY_CATEGORY = {
  restaurantes: 'uniformes y poleras con tu marca para tu equipo, resistentes al lavado industrial',
  cafeterias: 'delantales y polerones con el logo de tu cafetería, que tus clientes fotografíen',
  bares: 'polerones y gorras con tu logo para el equipo y merchandising para tus clientes',
  alojamiento_turismo: 'uniformes con tu marca para recepción y housekeeping, y souvenirs estampados',
  salud_privada: 'clínicas y consultas: uniformes profesionales con tu logo bordado o estampado',
  educacion: 'polerones institucionales para alumnos y profesores, con tu diseño',
  gimnasios: 'poleras técnicas y polerones con tu marca para entrenadores y socios',
  automotor: 'uniformes resistentes para mecánicos con el logo de tu taller',
  retail: 'polerones y gorras con tu logo para tu equipo de venta',
  servicios_profesionales: 'poleras corporativas con tu marca para eventos y team building',
  construccion: 'polerones y ropa de trabajo con el logo de tu empresa, visibilidad en terreno',
  otros: 'poleras, polerones y gorras con tu diseño, impresas en DTF de alta calidad',
};

// Asuntos de email por rubro (tasa de apertura alta, sin spam triggers).
const SUBJECT_BY_CATEGORY = {
  restaurantes: '{{business_name}}: ¿viste cómo se ven los uniformes de tu equipo?',
  cafeterias: 'Delantales y polerones con el logo de {{business_name}}',
  bares: 'Gorras y polerones para el equipo de {{business_name}}',
  alojamiento_turismo: 'Uniformes y souvenirs para {{business_name}} en {{commune}}',
  salud_privada: 'Uniformes profesionales para el equipo de {{business_name}}',
  educacion: 'Polerones institucionales para {{business_name}}',
  gimnasios: 'La ropa técnica con tu marca para {{business_name}}',
  automotor: 'Uniformes resistentes para el taller {{business_name}}',
  retail: 'Polerones con tu logo para el equipo de {{business_name}}',
  servicios_profesionales: 'Poleras corporativas para {{business_name}}',
  construccion: 'Ropa de trabajo con el logo de {{business_name}}',
  otros: 'Una idea para el equipo de {{business_name}}',
};

// Plantilla base de email (es-CL, cumplimiento anti-spam).
export const EMAIL_TEMPLATE = {
  subject: (category, vars) => (SUBJECT_BY_CATEGORY[category] || SUBJECT_BY_CATEGORY.otros).replace(/\{\{business_name\}\}/g, vars.business_name || 'tu negocio').replace(/\{\{commune\}\}/g, vars.commune || ''),
  body: (category, vars) => {
    const svc = SERVICE_BY_CATEGORY[category] || SERVICE_BY_CATEGORY.otros;
    const signal = vars.verified_signal || 'una búsqueda local';
    return [
      `Hola equipo de ${vars.business_name || 'tu negocio'},`,
      '',
      `Te escribo porque encontré ${vars.business_name || 'tu negocio'} en ${signal} y vi que están en ${vars.commune || 'la Quinta Región'}. Somos vecinos: Estampados DLV, de Quilpué.`,
      '',
      `Hacemos estampados en DTF (impresión textil de alta calidad) y para negocios como el tuyo solemos hacer: ${svc}.`,
      '',
      `Si te hace sentido, te puedo mostrar 2-3 ejemplos de negocios similares en 15 minutos por WhatsApp, sin compromiso: ${vars.calendar_link}`,
      '',
      `— Sandra Vásquez\nEstampados DLV · Quilpué, Quinta Región\nhttps://estampadosdlv.com · +56 9 5416 9052`,
      '',
      `Si no es el momento o prefieres no recibir este tipo de mensajes, puedes darte de baja aquí: ${vars.unsubscribe_link}`,
    ].join('\n');
  },
};

// Plantilla para WhatsApp manual (guión para Sandra, no automatizado).
export const WHATSAPP_TEMPLATE = {
  body: (category, vars) => {
    const svc = SERVICE_BY_CATEGORY[category] || SERVICE_BY_CATEGORY.otros;
    const signal = vars.verified_signal || 'una búsqueda local';
    return [
      `Hola! 👋 Soy Sandra de Estampados DLV (Quilpué). Encontré a ${vars.business_name || 'tu negocio'} en ${signal}.`,
      '',
      `Para negocios como el tuyo hacemos: ${svc}.`,
      '',
      `¿Te gustaría ver algunos ejemplos? Te mando fotos sin compromiso. 😊`,
    ].join('\n');
  },
};

/**
 * Renderiza una plantilla con las variables de un prospecto.
 * @param {'email'|'whatsapp'} channel
 * @param {string} category rubro
 * @param {object} lead prospecto (name, commune, verifiedSignal...)
 * @param {object} [opts] { senderName, companyName, calendarLink, unsubscribeUrl }
 */
export function renderTemplate(channel, category, lead, opts = {}) {
  const vars = {
    business_name: lead.name || '',
    commune: lead.commune || '',
    category: category || lead.category || 'otros',
    verified_signal: lead.verifiedSignal || lead.verified_signal || '',
    service_relevant: SERVICE_BY_CATEGORY[category] || SERVICE_BY_CATEGORY.otros,
    sender_name: opts.senderName || 'Sandra Vásquez',
    company_name: opts.companyName || 'Estampados DLV',
    calendar_link: opts.calendarLink || 'https://wa.me/56954169052',
    unsubscribe_link: opts.unsubscribeUrl || 'https://estampadosdlv.com/baja',
  };
  if (channel === 'whatsapp') return WHATSAPP_TEMPLATE.body(category, vars);
  return {
    subject: EMAIL_TEMPLATE.subject(category, vars),
    body: EMAIL_TEMPLATE.body(category, vars),
  };
}

/** Lista los 12 rubros soportados con sus etiquetas. */
export function listCategories() {
  return Object.entries(SERVICE_BY_CATEGORY).map(([code, svc]) => ({ code, label: code.replace(/_/g, ' '), service: svc }));
}

export default {
  TEMPLATE_VARIABLES,
  EMAIL_TEMPLATE,
  WHATSAPP_TEMPLATE,
  renderTemplate,
  listCategories,
};
