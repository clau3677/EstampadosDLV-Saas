/**
 * =============================================================================
 *  Prospección B2B — templates.js (build109)
 * -----------------------------------------------------------------------------
 *  Plantillas PROFESIONALES de Sandra para correo (HTML) y WhatsApp,
 *  adaptadas por rubro. Basadas en las plantillas oficiales de Estampados DLV.
 *
 *  Variables soportadas:
 *   {{business_name}} / {{nombre_negocio}}   nombre del negocio
 *   {{contact_name}}  / {{nombre_contacto}}  persona de contacto (nombre del lead)
 *   {{commune}}                              comuna
 *   {{category}}                             rubro
 *   {{occasion}}      / {{ocasión}}          ocasión (cumpleaños, aniversario,
 *                                            campañas, eventos...)
 *   {{need_detected}} / {{necesidad_detectada}} necesidad detectada para el negocio
 *   {{sender_name}}   / {{nombre_firma}}     Sandra Vásquez
 *
 *  Canales: 'email' (HTML completo) y 'whatsapp' (texto plano con emojis).
 *  El canal WhatsApp real se envía por la sesión Baileys vinculada; si la sesión
 *  no está conectada, el mensaje queda registrado como pendiente/advertido.
 *
 *  Cumplimiento anti-spam: remitente claro, asunto honesto, enlace/botón de baja,
 *  contacto directo WhatsApp visible.
 * =============================================================================
 */

export const TEMPLATE_VARIABLES = [
  'business_name', 'commune', 'category', 'verified_signal',
  'service_relevant', 'sender_name', 'company_name',
  'calendar_link', 'unsubscribe_link',
  'contact_name', 'occasion', 'need_detected',
];

export const COMPANY = {
  name: 'Estampados DLV',
  signature: 'Sandra Vásquez',
  phone: '+56 9 5416 9052',
  whatsapp: 'https://wa.me/56954169052',
  phoneLink: 'tel:+56954169052',
  email: 'estampadosdlv@gmail.com',
  address: 'Galleguillos 1870, Casa 1 · Quilpué',
  tienda: 'https://estampadosdlv.com/tienda',
  gangSheet: 'https://estampadosdlv.com/gang-sheet',
  website: 'https://estampadosdlv.com',
  region: 'Quilpué, Quinta Región · Despacho a todo Chile',
};

export const SERVICE_BY_CATEGORY = {
  restaurantes: 'uniformes y poleras con tu marca para tu equipo, resistentes al lavado industrial',
  cafeterias: 'delantales y polerones con el logo de tu cafetería, que tus clientes fotografíen',
  bares: 'polerones y gorras con tu logo para el equipo y merchandising para tus clientes',
  alojamiento_turismo: 'uniformes con tu marca para recepción y housekeeping, y souvenirs estampados',
  salud_privada: 'clínicas y consultas: uniformes profesionales con tu logo estampado',
  educacion: 'polerones institucionales para alumnos y profesores, con tu diseño',
  gimnasios: 'poleras técnicas y polerones con tu marca para entrenadores y socios',
  automotor: 'uniformes resistentes para mecánicos con el logo de tu taller',
  retail: 'polerones y gorras con tu logo para tu equipo de venta',
  servicios_profesionales: 'poleras corporativas con tu marca para eventos y team building',
  construccion: 'polerones y ropa de trabajo con el logo de tu empresa, visibilidad en terreno',
  otros: 'poleras, polerones, gorras y merchandising con tu diseño, impresas en DTF de alta calidad',
};

const OCCASION_BY_CATEGORY = {
  restaurantes: 'celebraciones, aniversarios o días especiales de tu local',
  cafeterias: 'aniversarios de tu cafetería o promociones de temporada',
  bares: 'eventos especiales o fechas de mayor afluencia en tu bar',
  alojamiento_turismo: 'temporada alta y souvenirs personalizados para tus huéspedes',
  salud_privada: 'aniversarios y celebraciones de tu consulta o clínica',
  educacion: 'aniversarios de tu escuela y días especiales para la comunidad',
  gimnasios: 'torneos, aniversarios y eventos deportivos de tu academia',
  automotor: 'aniversarios de tu taller y promociones de servicios',
  retail: 'aniversarios y campañas de tu tienda',
  servicios_profesionales: 'eventos y actividades internas de tu empresa',
  construccion: 'entregas de obra, aniversarios y actividades en terreno',
  otros: 'los momentos especiales de tu negocio',
};

const NEED_BY_CATEGORY = {
  restaurantes: 'uniformes con tu marca',
  cafeterias: 'delantales y polerones con tu logo',
  bares: 'polerones, gorras y merchandising con tu logo',
  alojamiento_turismo: 'uniformes y souvenirs con tu marca',
  salud_privada: 'uniformes profesionales con tu logo',
  educacion: 'polerones institucionales con tu diseño',
  gimnasios: 'prendas técnicas con tu marca',
  automotor: 'uniformes resistentes para tu taller',
  retail: 'polerones y gorras con tu logo',
  servicios_profesionales: 'poleras corporativas con tu marca',
  construccion: 'ropa de trabajo con el logo de tu empresa',
  otros: 'prendas y merchandising con tu diseño',
};

// -----------------------------------------------------------------------------
// Categorías de plantillas y asunto por rubro (correo)
// -----------------------------------------------------------------------------
// Plantillas de Sandra (numeradas):
//  1 Presentación general  → restaurantes, cafeterias, bares, otros
//  2 Marcas de ropa        → retail, construccion (empresas con marca propia)
//  3 Gimnasios y deporte   → gimnasios, educacion (equipos), salud_privada
//  4 Empresas y uniformes  → servicios_profesionales, salud_privada, alojamiento_turismo
//  5 Merchandising y regalos → retail, alojamiento_turismo, bares
//  6 Seguimiento comercial → usado en correos de seguimiento
// -----------------------------------------------------------------------------
function templateForCategory(category) {
  const map = {
    restaurantes: 'general',
    cafeterias: 'general',
    bares: 'general',
    otros: 'general',
    retail: 'marcas',
    construccion: 'marcas',
    automotor: 'marcas',
    gimnasios: 'deporte',
    educacion: 'deporte',
    salud_privada: 'empresas',
    servicios_profesionales: 'empresas',
    alojamiento_turismo: 'empresas',
  };
  return map[category] || 'general';
}

// Asuntos de email por rubro (honestos, sin spam triggers), basados en Sandra.
const SUBJECT_BY_TPL = {
  general: {
    subject: (v) => `Soluciones personalizadas para ${v.business_name}`,
  },
  marcas: {
    subject: (v) => `Lleva los diseños de ${v.business_name} a tus prendas`,
  },
  deporte: {
    subject: (v) => `Uniformes personalizados para ${v.business_name}`,
  },
  empresas: {
    subject: (v) => `Uniformes corporativos personalizados para ${v.business_name}`,
  },
  merchandising: {
    subject: (v) => `Merchandising personalizado para ${v.business_name}`,
  },
};

// -----------------------------------------------------------------------------
// Correo HTML — base (estilo verde Estampados DLV, responsive)
// -----------------------------------------------------------------------------
function emailHtml({ eyebrow, h2, intro, highlight, items, cta, signature, footer, pExtra }) {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{margin:0;background:#f5f7f6;color:#27332f;font-family:Arial,Helvetica,sans-serif;line-height:1.5}
  .template{max-width:560px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 3px 16px rgba(0,0,0,.08)}
  .brand{display:inline-block;background:#087d59;color:#fff;padding:8px 17px;border-radius:7px;font-weight:700;font-size:14px}
  .header{text-align:center;padding:20px 18px 8px}
  .content{padding:0 28px 28px}
  .eyebrow{text-align:center;color:#087d59;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:18px 0 10px}
  h2{font-size:25px;line-height:1.2;text-align:center;color:#096f51;margin:10px 0 18px}
  h3{font-size:17px;color:#087d59;margin:22px 0 8px}
  p{font-size:14px;margin:11px 0}
  .highlight{background:#d9fae9;border-radius:10px;padding:17px 18px;margin:18px 0;color:#1c654b}
  .highlight strong{display:block;color:#087d59;text-align:center;font-size:18px}
  ul{padding-left:22px;font-size:14px}
  li{margin:6px 0}
  .cta{text-align:center;margin:23px 0 10px}
  .button{display:inline-block;background:#08a86f;color:#fff;text-decoration:none;border-radius:7px;padding:12px 18px;font-size:14px;font-weight:700;margin:4px}
  .button.secondary{background:#fff;color:#087d59;border:1px solid #08a86f}
  .signature{border-top:1px solid #e7eeeb;margin-top:22px;padding-top:15px;color:#53615c;font-size:13px}
  .footer{text-align:center;color:#82908a;font-size:11px;padding:15px 20px 22px}
  .footer a{color:#087d59}
  .baja{color:#82908a;font-size:12px;text-align:center;margin:14px 0 0}
  @media(max-width:600px){.content{padding:0 20px 24px}h2{font-size:22px}}
</style></head>
<body>
<div class="template">
  <div class="header"><span class="brand">Estampados DLV</span></div>
  <div class="content">
    <div class="eyebrow">${eyebrow}</div>
    <h2>${h2}</h2>
    ${intro}
    ${highlight ? `<div class="highlight">${highlight}</div>` : ''}
    ${items ? `<h3>¿Qué podemos ofrecerte?</h3><ul>${items}</ul>` : ''}
    ${pExtra || ''}
    <div class="cta">${cta || ''}</div>
    <div class="signature">Saludos,<br><strong>Sandra Vásquez</strong><br>Estampados DLV<br>+56 9 5416 9052<br>estampadosdlv@gmail.com<br>Galleguillos 1870, Casa 1 · Quilpué</div>
  </div>
  <div class="footer">${footer}<br><a href="https://estampadosdlv.com/">estampadosdlv.com</a></div>
  <div class="baja">Si prefieres no recibir información comercial, responde este correo con la palabra <strong>BAJA</strong> y no volveremos a contactarte por esta vía.</div>
</div>
</body></html>`;
}

function itemsList(items) {
  return items.map((i) => `<li>${i}</li>`).join('');
}

// Cuerpos por plantilla de Sandra.
const EMAIL_BY_TPL = {
  general: (v) => emailHtml({
    eyebrow: 'DTF textil · DTF UV · Chile',
    h2: 'Soluciones personalizadas para tu negocio',
    intro: `<p>Hola <strong>${v.contact_name || v.business_name}</strong>,</p>
      <p>Soy <strong>Sandra Vásquez</strong>, de <strong>Estampados DLV</strong>. Ayudamos a negocios como <strong>${v.business_name}</strong> a crear prendas, productos y material promocional con diseños personalizados y terminaciones profesionales.</p>`,
    highlight: `<strong>Impresión profesional para marcas, empresas y emprendimientos</strong>
      <p>DTF textil, DTF UV, prendas personalizadas y pliegos DTF para optimizar tus diseños.</p>`,
    items: ['Poleras, polerones, gorras y buzos personalizados.',
      'Impresión DTF UV para llaveros, vasos, botellas y regalos.',
      'Pliegos DTF para subir y organizar tus propios diseños.',
      'Precios mayoristas y despacho a todo Chile.'],
    pExtra: `<p>Si estás buscando <strong>${v.need_detected}</strong>, podemos recomendarte una alternativa y preparar una cotización sin compromiso.</p>`,
    cta: `<a class="button" href="${COMPANY.tienda}">Ver catálogo</a><a class="button secondary" href="${COMPANY.whatsapp}">Cotizar por WhatsApp</a>`,
    signature: null,
    footer: `${COMPANY.region}`,
  }),
  marcas: (v) => emailHtml({
    eyebrow: 'Producción desde una unidad',
    h2: 'Convierte tus diseños en una colección',
    intro: `<p>Hola <strong>${v.contact_name || v.business_name}</strong>,</p>
      <p>Vimos el trabajo de <strong>${v.business_name}</strong> y creemos que podemos ayudarte a producir tus próximas prendas con colores vibrantes, tacto flexible y buena resistencia al lavado.</p>`,
    highlight: `<strong>Desde una unidad hasta producción masiva</strong>
      <p>Ideal para muestras, reposiciones y colecciones completas.</p>`,
    items: ['Poleras y polerones personalizados.',
      'Gorras y prendas para colecciones.',
      'Muestras antes de producir en volumen.',
      'Pliegos DTF para optimizar costos.'],
    pExtra: `<p>Si tienes una colección en preparación, responde este correo con tus diseños o escríbenos para revisar la mejor alternativa.</p>`,
    cta: `<a class="button" href="${COMPANY.gangSheet}">Subir un diseño</a><a class="button secondary" href="${COMPANY.whatsapp}">Hablar por WhatsApp</a>`,
    footer: '',
  }),
  deporte: (v) => emailHtml({
    eyebrow: 'Gimnasios · clubes · equipos',
    h2: 'Viste a tu equipo con sus propios colores',
    intro: `<p>Hola <strong>${v.contact_name || v.business_name}</strong>,</p>
      <p>En <strong>${v.business_name}</strong> seguramente necesitan prendas que representen al equipo y soporten el uso frecuente. En Estampados DLV realizamos uniformes y prendas deportivas personalizadas.</p>`,
    highlight: `<strong>Colores vibrantes y diseños personalizados</strong>
      <p>Nombres, números, logos y prendas para equipos, academias y eventos deportivos.</p>`,
    pExtra: `<p>Cuéntame cuántas prendas necesitas y para qué fecha. Te ayudaremos a definir la mejor combinación de prenda, diseño y cantidad.</p>`,
    cta: `<a class="button" href="${COMPANY.whatsapp}">Solicitar cotización</a><a class="button secondary" href="${COMPANY.tienda}">Ver prendas</a>`,
    footer: 'DTF textil profesional · Quilpué, Quinta Región',
  }),
  empresas: (v) => emailHtml({
    eyebrow: 'Uniformes corporativos',
    h2: 'Una imagen profesional para todo tu equipo',
    intro: `<p>Hola <strong>${v.contact_name || v.business_name}</strong>,</p>
      <p>En Estampados DLV ayudamos a empresas a reforzar su imagen con prendas personalizadas para equipos de trabajo, atención al público, eventos y campañas internas.</p>`,
    items: ['Poleras polo con logo corporativo.',
      'Poleras, polerones y buzos personalizados.',
      'Ropa para equipos de terreno y atención.',
      'Prendas para lanzamientos, ferias y actividades de empresa.',
      'Merchandising complementario mediante DTF UV.'],
    pExtra: `<p>Si me compartes el logo, la cantidad aproximada y la fecha de entrega, te preparo una recomendación personalizada.</p>`,
    cta: `<a class="button" href="${COMPANY.whatsapp}">Solicitar cotización</a><a class="button secondary" href="${COMPANY.tienda}">Ver productos</a>`,
    footer: '',
  }),
  merchandising: (v) => emailHtml({
    eyebrow: 'Regalos · eventos · productos promocionales',
    h2: 'Haz que tu marca se recuerde',
    intro: `<p>Hola <strong>${v.contact_name || v.business_name}</strong>,</p>
      <p>Si estás preparando <strong>${v.occasion}</strong>, podemos ayudarte a crear productos promocionales personalizados para tus clientes, colaboradores o comunidad.</p>`,
    highlight: `<strong>Impresión DTF UV de alta definición</strong>
      <p>Acabados brillantes o mate y detalles definidos para superficies rígidas.</p>`,
    pExtra: `<p>Trabajamos con llaveros, vasos, botellas, accesorios, regalos corporativos y otros productos personalizados. Cuéntame qué ocasión estás preparando y cuántas unidades necesitas. Te ayudaremos a elegir el producto más conveniente.</p>`,
    cta: `<a class="button" href="${COMPANY.tienda}">Ver catálogo</a><a class="button secondary" href="${COMPANY.whatsapp}">Cotizar ahora</a>`,
    footer: 'DTF UV profesional · Quilpué, Quinta Región',
  }),
};

// -----------------------------------------------------------------------------
// WhatsApp — plantillas de Sandra por categoría
// -----------------------------------------------------------------------------
const WA_BY_TPL = {
  general: (v) => [
    `Hola, ${v.contact_name || 'equipo de ' + v.business_name}. ¿Cómo estás? Soy Sandra Vásquez, de *Estampados DLV*.`,
    '',
    `Ayudamos a negocios como *${v.business_name}* con impresión DTF textil y DTF UV: poleras, polerones, gorras, uniformes, pliegos DTF, vasos, botellas, llaveros y merchandising personalizado.`,
    '',
    'Trabajamos desde una unidad, también con pedidos por volumen y despacho a todo Chile.',
    '',
    `¿Te gustaría que te enviara el catálogo y algunas opciones para tu negocio?`,
    '',
    `🌐 ${COMPANY.tienda}`,
  ].join('\n'),
  marcas: (v) => [
    `Hola, ${v.contact_name || 'equipo de ' + v.business_name}. Estuve viendo *${v.business_name}* y quería contarte que en *Estampados DLV* ayudamos a marcas a producir sus diseños desde una unidad hasta colecciones completas.`,
    '',
    'Podemos trabajar poleras, polerones, gorras y pliegos DTF para que optimices tus diseños y costos.',
    '',
    '¿Estás preparando una nueva colección o necesitas reposición de prendas?',
    '',
    `🎨 Puedes subir tus diseños aquí: ${COMPANY.gangSheet}`,
  ].join('\n'),
  deporte: (v) => [
    `Hola, ${v.contact_name || 'equipo de ' + v.business_name}. Soy Sandra Vásquez, de *Estampados DLV*.`,
    '',
    `Fabricamos prendas y uniformes personalizados para gimnasios, academias y equipos deportivos: logos, nombres, números y colores del equipo.`,
    '',
    `Si necesitas vestir a tu equipo, cuéntame cuántas prendas buscas y para qué fecha. Te preparo una cotización sin compromiso.`,
    '',
    `📲 WhatsApp: ${COMPANY.whatsapp}`,
  ].join('\n'),
  empresas: (v) => [
    `Hola, ${v.contact_name || 'equipo de ' + v.business_name}. ¿Cómo estás? En *Estampados DLV* ayudamos a empresas a personalizar poleras polo, poleras, polerones y buzos con su logo corporativo.`,
    '',
    'También podemos preparar prendas para equipos de trabajo, ferias, lanzamientos y actividades internas.',
    '',
    'Para recomendarte la mejor opción, ¿cuántas personas necesitan uniforme y para qué fecha?',
    '',
    `📲 Puedes responderme por aquí o revisar el catálogo: ${COMPANY.tienda}`,
  ].join('\n'),
  merchandising: (v) => [
    `Hola, ${v.contact_name || 'equipo de ' + v.business_name}. Para ${v.occasion} podemos ayudarte con merchandising personalizado para *${v.business_name}*.`,
    '',
    'Realizamos impresión DTF UV de alta definición sobre productos como vasos, botellas, llaveros, teléfonos, regalos corporativos y superficies rígidas.',
    '',
    '¿Ya tienes pensado el producto o quieres que te recomiende algunas alternativas según tu presupuesto?',
    '',
    `🎁 Catálogo: ${COMPANY.tienda}`,
  ].join('\n'),
};

/**
 * Asunto + cuerpo del correo (HTML) para un prospecto.
 */
export const EMAIL_TEMPLATE = {
  subject: (category, v) => {
    const tpl = templateForCategory(category);
    const gen = SUBJECT_BY_TPL[tpl];
    return (gen.subject || SUBJECT_BY_TPL.general.subject)(v);
  },
  body: (category, v) => {
    const tpl = templateForCategory(category);
    return (EMAIL_BY_TPL[tpl] || EMAIL_BY_TPL.general)(v);
  },
  /** Versión texto plano del correo (para clientes de correo sin HTML). */
  plainText: (category, v) => {
    return WA_BY_TPL[templateForCategory(category)](v)
      .replace(/\*([^*]+)\*/g, '$1')
      + `\n\n— Sandra Vásquez · Estampados DLV · ${COMPANY.phone}\n${COMPANY.whatsapp} · ${COMPANY.website}`
      + `\n\nSi prefieres no recibir información comercial, responde con la palabra BAJA.`;
  },
};

/**
 * Cuerpo del mensaje de WhatsApp para un prospecto.
 */
export const WHATSAPP_TEMPLATE = {
  body: (category, v) => {
    const tpl = templateForCategory(category);
    return (WA_BY_TPL[tpl] || WA_BY_TPL.general)(v)
      + `\n\nSi prefieres no recibir información comercial, responde *BAJA* y no volveremos a contactarte por este medio.`;
  },
};

/**
 * Renderiza las plantillas con las variables de un prospecto.
 * @param {'email'|'whatsapp'} channel
 * @param {string} category rubro
 * @param {object} lead prospecto (name, commune, phone...)
 * @param {object} [opts] { senderName, occasion, needDetected }
 */
export function renderTemplate(channel, category, lead, opts = {}) {
  const v = {
    business_name: lead.name || 'tu negocio',
    contact_name: (lead.contactName || lead.contact_name || lead.name || '').split(' ')[0] || lead.name || '',
    commune: lead.commune || '',
    category: category || lead.category || 'otros',
    verified_signal: lead.verifiedSignal || lead.verified_signal || '',
    service_relevant: SERVICE_BY_CATEGORY[category] || SERVICE_BY_CATEGORY.otros,
    occasion: opts.occasion || OCCASION_BY_CATEGORY[category] || 'los momentos especiales de tu negocio',
    need_detected: opts.needDetected || NEED_BY_CATEGORY[category] || 'soluciones de estampado',
    sender_name: opts.senderName || COMPANY.signature,
    company_name: COMPANY.name,
    calendar_link: COMPANY.whatsapp,
    unsubscribe_link: COMPANY.whatsapp + '?text=' + encodeURIComponent('BAJA'),
  };
  if (channel === 'whatsapp') {
    return { body: WHATSAPP_TEMPLATE.body(category, v) };
  }
  return {
    subject: EMAIL_TEMPLATE.subject(category, v),
    body: EMAIL_TEMPLATE.body(category, v),
    plainText: EMAIL_TEMPLATE.plainText(category, v),
  };
}

/** Lista los 12 rubros soportados con sus etiquetas. */
export function listCategories() {
  return Object.entries(SERVICE_BY_CATEGORY).map(([code, svc]) => ({ code, label: code.replace(/_/g, ' '), service: svc }));
}

export default {
  COMPANY,
  TEMPLATE_VARIABLES,
  EMAIL_TEMPLATE,
  WHATSAPP_TEMPLATE,
  renderTemplate,
  listCategories,
};
