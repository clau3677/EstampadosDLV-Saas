/**
 * =============================================================================
 *  Prospección B2B — emailfinder.js (build132)
 * -----------------------------------------------------------------------------
 *  Encuentra el correo empresarial de un prospecto a partir de su sitio web
 *  oficial.
 *
 *  Mejoras build132 (root-cause: 0 correos tras 5.247 leads):
 *  - Memoria de intentos: marca emailTriedAt al fallar y emailFoundAt al
 *    encontrar, para nunca repetir el mismo lead (el runner repetía 23).
 *  - Extracción ampliada: busca correos también dentro de <script>, href,
 *    JSON embebido y datos de formularios (sitios React/WordPress/JS).
 *  - Más rutas de contacto (incluso variantes WordPress /index.php/...).
 *  - hostMatches más tolerante para dominios de marca larga.
 *
 *  Reglas de calidad (Sandra):
 *  - Solo correos publicados en el sitio OFICIAL del negocio.
 *  - Solo correos del MISMO dominio del sitio. Se descartan personales
 *    (gmail/yahoo/hotmail/outlook) y de redes sociales.
 *  - Nada de datos personales: solo correos empresariales visibles.
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

/**
 * Compara el host del sitio con el host del correo.
 * build132: más tolerante — acepta sufijos compartidos más cortos (≥ 4 chars)
 * y prefijo compartido en la raíz de marca (ej. negocio.cl ↔ negochile.cl).
 */
function hostMatches(siteHost, emailHost) {
  if (!siteHost || !emailHost) return false;
  const s = siteHost.replace(/^www\./, '');
  const e = emailHost.replace(/^www\./, '');
  if (s === e) return true;
  if (e.endsWith('.' + s) || s.endsWith('.' + e)) return true;
  const sRoot = s.replace(/\.(cl|com|net|org)$/i, '').toLowerCase();
  const eRoot = e.replace(/\.(cl|com|net|org)$/i, '').toLowerCase();
  if (sRoot && eRoot && sRoot !== eRoot) {
    const longer = sRoot.length >= eRoot.length ? sRoot : eRoot;
    const shorter = sRoot.length >= eRoot.length ? eRoot : sRoot;
    // build132: umbral 4 (antes 5) — correos como a@negocio.cl cuando el
    // sitio es un subdominio/negocioX.cl siguen siendo válidos.
    if (longer.startsWith(shorter) && shorter.length >= 4) return true;
    // Caso inverso: la raíz corta está contenida al final de la larga
    if (longer.endsWith(shorter) && shorter.length >= 6) return true;
  }
  return false;
}

/**
 * Extrae correos empresariales válidos del HTML de un sitio oficial.
 * build132: escanea TODO el documento (incluye <script>, href, JSON) y
 * extrae de mailto: y de texto visible.
 */
function extractEmails(html, siteUrl) {
  const siteHost = normHost(siteUrl);
  if (!siteHost) return [];
  const found = new Set();

  // Separar scripts de texto visible para extraer de ambos
  const scripts = [...(html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [])];
  const scriptsText = scripts.map(s => s.replace(/<script[^>]*>/i, '')).join(' ');
  const text = (html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<[a-zA-Z][^>]*>/g, ' | ');

  const mailtoMatches = html.match(/[mM][aA][iI][lL][tT][oO]:([^"'\s&<>]+)/g) || [];
  const candidates = [
    ...mailtoMatches.map(m => m.replace(/^[mM][aA][iI][lL][tT][oO]:/i, '')),
    ...(text.match(EMAIL_RE) || []),
    ...(scriptsText.match(EMAIL_RE) || []),
  ];
  for (const raw of candidates) {
    const email = raw.trim().replace(/[;?]/, '').toLowerCase();
    if (!email || email.length < 6 || email.length > 80) continue;
    if (!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email)) continue;
    const [local, host] = email.split('@');
    if (!local || local.length < 2) continue;
    if (PERSONAL_DOMAINS.has(host)) continue;
    if (SOCIAL_SITES.has(host)) continue;
    if (!hostMatches(siteHost, host)) continue;
    if ((local.match(/\./g) || []).length > 3) continue;
    // Locales sospechosos de tracking/waf (no son contactos)
    if (/^(cf-email|noreply|no-reply|newsletter|abuse)/i.test(local)) continue;
    found.add(email);
  }
  return [...found].slice(0, 3);
}

const CONTACT_PATHS = [
  '', '/contacto', '/contactenos', '/contact-us', '/contact', '/contacto-nosotros',
  '/contacto.html', '/informacion', '/quienes-somos', '/sobre-nosotros',
  '/avisos-legales', '/politicas', '/politica-de-privacidad',
  '/terminos-y-condiciones', '/index.php/contacto', '/index.php/contactenos',
  '/wp-login.php', '/tienda', '/pages/contact',
];

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
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
        // Priorizar correos de contacto sobre otros (ventas, info, contacto)
        const prio = emails.find(e => /^(ventas|info|contacto|contact|admin|ventas|reservas|pedidos)/i.test(e.split('@')[0])) || emails[0];
        return { email: prio, source: 'sitio_oficial' };
      }
    }
    delay += 80;
    await new Promise(r => setTimeout(r, Math.min(delay, 400)));
  }
  return { email: null, source: null };
}


/**
 * Enriquece un lote de prospectos que NO tienen correo y SÍ tienen sitio web.
 * build132: omite leads ya intentados (emailTriedAt, reintentables tras 30 días)
 * y marca cada lead procesado aunque no encuentre correo, para no repetir.
 */
export async function enrichLeadsWithEmails({ category, commune, minScore, q, phoneType, limit = 100 } = {}) {
  const { coll } = await import('../mongo.js');
  const { COLLECTIONS } = await import('../models.js');
  // build132c: raíz del bug anterior — sortBy 'score' devolvía primero los leads
  // SIN sitio web (el score suma 15 pts por "noWebsite"), por lo que el
  // filtro de trabajo quedaba siempre vacío. Se consulta la BD directamente
  // pidiendo leads SIN correo y CON sitio web, ordenados por score.
  const RETRY_MS = 30 * 24 * 3600 * 1000; // reintentar tras 30 días
  const now = Date.now();
  const leadsColl = await coll(COLLECTIONS.PRO_LEADS);
  const query = {
    $or: [{ email: { $exists: false } }, { email: null }, { email: '' }],
    website: { $exists: true, $nin: [null, ''], $not: /instagram\.com|facebook\.com|wa\.me|tiktok\.com/i },
    $and: [
      { $or: [
        { emailTriedAt: { $exists: false } },
        { emailTriedAt: { $lt: new Date(now - RETRY_MS) } },
      ] },
    ],
  };
  if (category) query.category = category;
  if (commune) query.commune = commune;
  if (minScore !== null && minScore !== undefined) query['score.final'] = { $gte: minScore };
  if (q) query.name = { $regex: q, $options: 'i' };
  const __dbgCount = await leadsColl.countDocuments(query);
  // eslint-disable-next-line no-console
  console.log('[enrich-debug2]', 'count:', __dbgCount, 'limit:', limit, 'cat:', category, 'com:', commune, 'q:', q);

  let leadsItems = [];
  try {
    leadsItems = await leadsColl
      .find(query)
      .sort({ 'score.final': -1, createdAt: -1 })
      .limit(Math.min(limit, 200))
      .toArray();
    // eslint-disable-next-line no-console
    console.log('[enrich-debug2b]', 'leadsItems:', leadsItems.length, 'firstWebsite:', leadsItems[0] ? String(leadsItems[0].website).slice(0, 60) : 'n/a');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log('[enrich-debug2b] ERROR en find:', err && err.message, err && err.codeName);
  }

  // build132: saltar constructores de sitios y redes sociales (igual que antes)
  const work = leadsItems.filter(l => l.website && !/instagram\.com|facebook\.com|wa\.me|tiktok\.com/i.test(l.website) && !isSiteBuilder(l.website));

  const docs = await coll(COLLECTIONS.PRO_LEADS);
  let found = 0;
  let missing = 0;
  const processed = [];

  // build123: procesamiento en paralelo (pool de 8 análisis simultáneos)
  const CONCURRENCY = 8;
  let idx = 0;
  async function worker() {
    while (idx < work.length) {
      const myIdx = idx++;
      const lead = work[myIdx];
      if (!lead.website) { missing += 1; continue; }
      if (lead.email && /@/.test(lead.email)) { missing += 1; continue; }
      try {
        const { email, source } = await Promise.race([
          findBusinessEmail(lead.website),
          new Promise((r) => setTimeout(() => r({ email: null, source: null, timedOut: true }), LEAD_TIMEOUT_MS + 2000)),
        ]);
        if (email) {
          await docs.updateOne(
            { id: lead.id },
            { $set: { email, emailSource: source, emailVerifiedAt: new Date(), emailTriedAt: new Date(), updatedAt: new Date() } },
          );
          found += 1;
          processed.push({ id: lead.id, name: lead.name, email });
        } else {
          // build132: registrar el intento para no volver a procesar este lead
          await docs.updateOne(
            { id: lead.id },
            { $set: { emailTriedAt: new Date(), updatedAt: new Date() } },
          );
          missing += 1;
        }
      } catch (e) {
        await docs.updateOne({ id: lead.id }, { $set: { emailTriedAt: new Date(), updatedAt: new Date() } }).catch(() => {});
        missing += 1;
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length || 1) }, () => worker()));

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
