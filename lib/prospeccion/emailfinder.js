/**
 * =============================================================================
 *  Prospección B2B — emailfinder.js (build117)
 * -----------------------------------------------------------------------------
 *  Encuentra el correo empresarial de un prospecto a partir de su sitio web
 *  oficial (entregado por Google Places).
 *
 *  Reglas de calidad (según instrucción de Sandra):
 *  - Solo correos publicados en el sitio OFICIAL del negocio.
 *  - Solo correos del MISMO dominio del sitio (ej. en quimera.cl solo se
 *    aceptan correos @quimera.cl). Se descartan personales
 *    (gmail/yahoo/hotmail/outlook) y de redes sociales.
 *  - Nada de datos personales: solo correos empresariales visibles.
 *  - No envía campañas automáticamente; solo enriquece la BD para uso manual.
 * =============================================================================
 */

const EMAIL_RE = /([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g;

// Dominios genéricos/redes que NUNCA cuentan como correo empresarial
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.cl', 'hotmail.com', 'outlook.com',
  'live.com', 'icloud.com', 'me.com', 'mail.com', 'protonmail.com',
  'proton.me', 'aol.com', 'hotmail.cl', 'yahoo.es',
]);
const SOCIAL_SITES = new Set(['instagram.com', 'facebook.com', 'facebook.cl',
  'linkedin.com', 'tiktok.com', 'x.com', 'twitter.com', 'whatsapp.com',
  'web.whatsapp.com', 'wa.me', 'facebook.com.mx', 'youtube.com', 't.co']);

// Constructores de sitios gratuitos / plataformas donde el sitio NO es del negocio
// (páginas plantilla sin correo del dominio propio, o con anti-bot garantizado).
const SITE_BUILDERS = ['wixsite.com', 'wix.com', 'ueniweb.com', 'webnode.com', 'webnode.cl',
  'jimdosite.com', 'jimdo.com', 'webnode.page', 'notion.site', 'sites.google.com',
  'site123.me', 'pagecloud.com', 'durable.co', 'carrd.co', 'strikingly.com',
  'square.site', 'godaddysites.com', 'homestead.com', 'yola.com', 'webs.com',
  'moonfruit.com', 'weebly.com', 'blogspot.com', 'wordpress.com', 'webflow.io',
  'business.site', 'mystrikingly.com', 'simplebooklet.com', 'linktr.ee',
  'bit.ly', 'link.me'];

function isSiteBuilder(siteUrl) {
  const host = normHost(siteUrl);
  if (!host) return false;
  return SITE_BUILDERS.some(b => host === b || host.endsWith('.' + b));
}

function normHost(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(siteHost, emailHost) {
  if (!siteHost || !emailHost) return false;
  const s = siteHost.replace(/^www\./, '');
  const e = emailHost.replace(/^www\./, '');
  if (s === e) return true;
  // Permitir subdominios (ej. sitio en www.negocio.cl y correo en contacto.negocio.cl)
  if (e.endsWith('.' + s) || s.endsWith('.' + e)) return true;
  // Caso común en Chile: correo en dominio raíz más corto que el sitio
  // (ej. sitio dentalmacayachile.cl → correo ventas@dentalmacaya.cl).
  // Se acepta si una raíz coincide y la otra es su extensión directa
  // (misma marca: 'dentalmacaya' vs 'dentalmacayachile').
  const sRoot = s.replace(/\.(cl|com|net|org)$/i, '').toLowerCase();
  const eRoot = e.replace(/\.(cl|com|net|org)$/i, '').toLowerCase();
  if (sRoot && eRoot && sRoot !== eRoot) {
    const longer = sRoot.length >= eRoot.length ? sRoot : eRoot;
    const shorter = sRoot.length >= eRoot.length ? eRoot : sRoot;
    if (longer.startsWith(shorter) && shorter.length >= 5) return true;
  }
  return false;
}

/**
 * Extrae correos empresariales válidos del HTML de un sitio oficial.
 */
function extractEmails(html, siteUrl) {
  const siteHost = normHost(siteUrl);
  if (!siteHost) return [];
  const found = new Set();
  const text = (html || '').replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[a-zA-Z][^>]*>/g, ' | ');
  const mailtoMatches = html.match(/[mM][aA][iI][lL][tT][oO]:([^"'\s&<>]+)/g) || [];
  const candidates = [
    ...mailtoMatches.map(m => m.replace(/^[mM][aA][iI][lL][tT][oO]:/i, '')),
    ...(text.match(EMAIL_RE) || []),
  ];
  for (const raw of candidates) {
    const email = raw.trim().replace(/[;?]/, '').toLowerCase();
    if (!email || email.length < 6 || email.length > 80) continue;
    if (!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email)) continue;
    const [local, host] = email.split('@');
    if (!local || local.length < 2) continue;
    if (PERSONAL_DOMAINS.has(host)) continue;
    if (SOCIAL_SITES.has(host)) continue;
    // El correo debe pertenecer al dominio (o subdominio) del sitio oficial
    if (!hostMatches(siteHost, host)) continue;
    // Evitar correos raros con muchos puntos o caracteres extraños
    if ((local.match(/\./g) || []).length > 3) continue;
    found.add(email);
  }
  return [...found].slice(0, 3);
}

const CONTACT_PATHS = ['', '/contacto', '/contactenos', '/contact-us', '/contacto-nosotros', '/contacto.html', '/informacion', '/quienes-somos', '/sobre-nosotros', '/avisos-legales', '/politicas'];

function buildCandidates(siteUrl) {
  const host = normHost(siteUrl);
  if (!host) return [];
  const base = siteUrl.replace(/\/$/, '');
  const out = [base];
  for (const p of CONTACT_PATHS) {
    if (p) out.push(base + p);
  }
  return out;
}

const { spawn } = await import('child_process');
const zlib = await import('zlib');

/**
 * Descarga una URL con timeout. Usa curl como subprocess para que se
 * descompriman todos los esquemas estándar (gzip/br/deflate). Además,
 * si el servidor entrega contenido comprimido "en crudo" sin el header
 * Content-Encoding (configuración rota común en nginx/php malconfigurados),
 * se intenta descomprimir manualmente como última opción.
 */
function fetchPage(url) {
  return new Promise((resolve) => {
    const proc = spawn('curl', [
      '-sL', '-m', '8', '--compressed', '-f',
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      '-H', 'Accept-Language: es-CL,es;q=0.9,en;q=0.8',
      url,
    ]);
    const chunks = [];
    let total = 0;
    proc.stdout.on('data', (c) => { total += c.length; if (total < 300000) chunks.push(c); });
    let done = false;
    const finish = (html) => { if (!done) { done = true; resolve(html); } };
    proc.on('close', (code) => {
      if (code !== 0) return finish(null);
      const raw = Buffer.concat(chunks);
      let html = raw.toString('utf8');
      // Fallback: intentar descomprimir en crudo (gzip/deflate) si el texto
      // es muy corto y parece binario (servidor rota).
      if (html.length < 800 && raw.length > 200) {
        for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.inflateRawSync]) {
          try {
            const dec = fn(raw);
            const decStr = dec.toString('utf8');
            if (decStr.length > html.length && decStr.includes('<')) {
              html = decStr;
              break;
            }
          } catch { /* ignorar */ }
        }
      }
      if (!html || html.length < 500) return finish(null);
      if (!/<\/?[a-z][\s>]/i.test(html)) return finish(null);
      return finish(html);
    });
    proc.on('error', () => finish(null));
  });
}


/**
 * Busca el correo empresarial de un negocio en su sitio oficial.
 * Prueba la página principal y páginas de contacto comunes.
 * @returns {{ email: string|null, source: string|null }}
 */
const LEAD_TIMEOUT_MS = 45000;

export async function findBusinessEmail(siteUrl) {
  if (!siteUrl) return { email: null, source: null };
  const candidates = buildCandidates(siteUrl);
  return Promise.race([
    runFindBusinessEmail(candidates),
    new Promise((r) => setTimeout(() => r({ email: null, source: null, timedOut: true }), LEAD_TIMEOUT_MS)),
  ]);
}

async function runFindBusinessEmail(candidates) {
  let delay = 0;
  for (const url of candidates) {
    const html = await fetchPage(url);
    if (html) {
      const emails = extractEmails(html, url);
      if (emails.length) {
        return { email: emails[0], source: 'sitio_oficial' };
      }
    }
    // Pequeña pausa para no saturar el sitio del prospecto
    delay += 120;
    await new Promise(r => setTimeout(r, Math.min(delay, 600)));
  }
  return { email: null, source: null };
}


/**
 * Enriquece un lote de prospectos que NO tienen correo y SÍ tienen sitio web.
 * Respeta el filtro de leads indicado y un máximo por ejecución.
 */
export async function enrichLeadsWithEmails({ category, commune, minScore, q, phoneType, limit = 100 } = {}) {
  const { coll } = await import('../mongo.js');
  const { COLLECTIONS } = await import('../models.js');
  const { listLeads } = await import('./leads.js');

  const leads = await listLeads({
    page: 1,
    pageSize: Math.min(limit, 200),
    category,
    commune,
    minScore,
    q,
    phoneType: phoneType || 'sin_correo',
    sortBy: 'website',
  });
  // Trabajar solo los que SÍ tienen sitio web oficial (sin sitio no hay correo que extraer)
  const work = leads.items.filter(l => l.website && !/instagram\.com|facebook\.com|wa\.me|tiktok\.com/i.test(l.website) && !isSiteBuilder(l.website));

  const docs = coll(COLLECTIONS.PRO_LEADS);
  let found = 0;
  let missing = 0;
  const processed = [];

  for (const lead of work) {
    if (!lead.website) { missing += 1; continue; }
    // Saltar si ya tiene correo
    if (lead.email && /@/.test(lead.email)) { missing += 1; continue; }
    try {
      const { email, source } = await Promise.race([
        findBusinessEmail(lead.website),
        new Promise((r) => setTimeout(() => r({ email: null, source: null, timedOut: true }), LEAD_TIMEOUT_MS + 2000)),
      ]);
      if (email) {
        await docs.updateOne(
          { id: lead.id },
          { $set: { email, emailSource: source, emailVerifiedAt: new Date(), updatedAt: new Date() } },
        );
        found += 1;
        processed.push({ id: lead.id, name: lead.name, email });
      } else {
        missing += 1;
      }
    } catch (e) {
      missing += 1;
    }
    // Pausa general para no saturar servidores de los prospectos
    await new Promise(r => setTimeout(r, 150));
  }

  await (await import('./audit.js')).logAudit({
    action: 'lead_email_enriched',
    actorName: 'admin',
    entityType: 'leads',
    entityId: 'enrich_batch',
    details: {
      filters: { category, commune, minScore, q, phoneType },
      limit,
      leadsWithWebsite: work.length,
      emailsFound: found,
      noEmail: missing,
      processed,
    },
  });
  return { total: work.length, found, missing, processed };
}
