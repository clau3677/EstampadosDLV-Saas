// Treck scraper — Treck usa VTEX como plataforma e-commerce.
// API pública utilizada:
//   https://www.treck.cl/api/catalog_system/pub/products/search/vestuario?_from=X&_to=Y
// Devuelve JSON con la lista completa de productos + SKUs (items) + precios comerciales.
//
// Convenciones importantes de VTEX que aplicamos:
// - _from/_to son 0-indexed inclusive. Máximo 50 items por request.
// - Cada `item` (SKU) representa una combinación única de talla+color+atributo.
// - Precio final está en items[0].sellers[0].commertialOffer.Price.
// - Header 'resources' devuelve total: 'resources: 0-49/448'.
//
// Este scraper NO usa cheerio ni headless — solo fetch a un JSON API. Es rápido y estable.

const BASE = 'https://www.treck.cl';
const UA   = 'Mozilla/5.0 (compatible; DLV-Importer/1.0; +https://estampadosdlv.cl)';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
  // Sacar el header 'resources' que trae el total
  const resources = res.headers.get('resources') || '';
  const totalMatch = resources.match(/\/(\d+)$/);
  const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const rows = await res.json();
  return { rows, total };
}

/**
 * Convierte string a slug URL-safe (mismo criterio que otros scrapers).
 */
export function slugify(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Limpia HTML a texto plano (VTEX devuelve descripciones con `<h2>`, `<strong>`, `<ul>`, etc.).
 */
function cleanDescription(html) {
  return String(html || '')
    .replace(/<\/?(br|p|div|li|h[1-6])[^>]*>/gi, '\n')      // block-level tags → newline
    .replace(/<[^>]+>/g, ' ')                              // remove other tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')                               // collapse spaces
    .replace(/\n\s*\n\s*\n+/g, '\n\n')                     // max 1 empty line
    .split('\n').map(l => l.trim()).join('\n')
    .trim();
}

/**
 * Detecta el tipo de "workwear" desde el path de categorías VTEX (ej. "/Vestuario/Ropa Técnica/…").
 * Devuelve uno de: 'trabajo' | 'tecnica' | 'ignifuga' | 'outdoor' | 'otros'.
 *
 * IMPORTANT: Un producto puede estar cross-listado en varias categorías (ej. Primera Capa está
 * en "Ropa de trabajo" Y "Ropa Outdoor"). Priorizamos en este orden:
 *   trabajo > ignifuga > tecnica > outdoor
 * porque el negocio prioriza seguridad industrial sobre outdoor.
 */
export function detectWorkwearType(categories = []) {
  const joined = categories.join(' ').toLowerCase();
  if (/ropa\s*de\s*trabajo|\/trabajo\b/i.test(joined)) return 'trabajo';
  if (/ignif/i.test(joined))                            return 'ignifuga';
  if (/ropa\s*t[eé]cnica|\btecnica\b/i.test(joined))   return 'tecnica';
  if (/outdoor/i.test(joined))                          return 'outdoor';
  return 'otros';
}

/**
 * Detecta la subcategoría de negocio (uso interno del scraper).
 * Como todos los productos de Treck son PARA ESTAMPAR (sin estampado previo), asignamos
 * category='workwear' y subcategory según el tipo detectado desde VTEX.
 */
export function detectSubcategory(categories = []) {
  // Devuelve una subcategoría compatible con SUBCATEGORIES.workwear en models.js
  return detectWorkwearType(categories);
}

/**
 * Extrae los items (SKUs) de un producto VTEX y los normaliza a nuestra estructura.
 * VTEX: cada 'item' es una combinación única de Talla+Color.
 */
function extractVariantsFromItems(items = []) {
  const variants = [];
  const imagesSet = new Set();
  const colorsSet = new Set();
  const sizesSet  = new Set();

  for (const it of items) {
    const talla = (it.Talla && it.Talla[0]) || 'única';
    const color = (it.Color && it.Color[0]) || 'estándar';

    // Precio y disponibilidad del seller principal
    const seller = it.sellers?.[0];
    const offer = seller?.commertialOffer || {};
    const price = Math.round(offer.Price ?? offer.ListPrice ?? 0);
    const availableQty = offer.AvailableQuantity ?? 0;
    const isAvailable = offer.IsAvailable ?? (availableQty > 0);

    variants.push({
      color,
      size: talla,
      itemId: String(it.itemId),
      ean: it.ean || '',
      referenceId: (it.referenceId?.[0]?.Value) || '',
      price,
      availableQuantity: availableQty,
      inStock: !!isAvailable && availableQty > 0,
    });

    colorsSet.add(color);
    sizesSet.add(talla);

    // Imágenes (dedup por URL)
    for (const img of (it.images || [])) {
      const url = img.imageUrl;
      if (url) imagesSet.add(url);
    }
  }
  return {
    variants,
    images: Array.from(imagesSet).slice(0, 8),    // limitar a 8 fotos por producto
    colors: Array.from(colorsSet),
    sizes: Array.from(sizesSet),
  };
}

/**
 * Normaliza un producto VTEX a nuestra estructura estándar de importación.
 */
export function normalizeProduct(p) {
  if (!p || !p.productId) return null;

  const items = p.items || [];
  if (items.length === 0) return null;

  const { variants, images, colors, sizes } = extractVariantsFromItems(items);

  // El precio del proveedor es el mínimo entre variantes disponibles (VTEX puede tener precios
  // distintos por SKU en casos raros; para markup usamos el promedio ponderado o el mínimo).
  const availablePrices = variants.filter(v => v.price > 0).map(v => v.price);
  const priceWholesale = availablePrices.length > 0 ? Math.min(...availablePrices) : 0;

  // Alguna variante tiene stock?
  const hasStock = variants.some(v => v.inStock);

  // Categorías: preferimos las más específicas (últimas del path)
  const categoriesFlat = (p.categories || []).map(c => c.replace(/^\/+|\/+$/g, ''));
  const workwearType = detectWorkwearType(categoriesFlat);
  const subcategory  = detectSubcategory(categoriesFlat);

  // Link canónico
  const link = p.link || `${BASE}/${p.linkText || slugify(p.productName)}/p`;

  return {
    supplierProductId: String(p.productId),
    supplierUrl: link,
    supplierBrand: p.brand || 'Treck',
    supplierCode: p.productReferenceCode || p.productReference || '',
    slug: p.linkText || slugify(p.productName),
    fullName: p.productTitle || p.productName,
    shortName: p.productName,
    descriptionHtml: p.description || '',
    descriptionText: cleanDescription(p.description || p.metaTagDescription || ''),
    category: 'workwear',
    subcategory,       // trabajo | tecnica | ignifuga | outdoor | otros
    workwearType,
    categoriesPath: categoriesFlat,

    priceUnit: priceWholesale,          // en VTEX es el precio retail visible
    priceWholesale,                     // usado por buildProductDoc para aplicar markup

    images,
    colors,
    sizes,
    variants,
    hasStock,
    status: hasStock ? 'available' : 'out_of_stock',
  };
}

/**
 * Escanea un rango del catálogo VTEX (Vestuario) y devuelve productos normalizados.
 * @param {Object} opts
 * @param {number} opts.from       Offset inicial (default 0)
 * @param {number} opts.to         Offset final inclusive (default 49). Máx 49 por request.
 * @param {string} opts.category   Sub-path opcional (ej. 'vestuario', 'vestuario/ropa-de-trabajo')
 * @param {number} opts.delayMs    Delay entre paginas para no saturar VTEX (default 300).
 * @param {(done:number, total:number)=>void} opts.onProgress
 */
export async function scanCatalog({
  from = 0,
  to = 49,
  category = 'vestuario',
  delayMs = 300,
  onProgress,
} = {}) {
  const pageSize = 50;   // hard limit de VTEX
  const results = [];
  let cursor = from;
  let total = 0;
  const finalTo = Math.max(from, to);

  while (cursor <= finalTo) {
    const pageEnd = Math.min(cursor + pageSize - 1, finalTo);
    const url = `${BASE}/api/catalog_system/pub/products/search/${encodeURIComponent(category)}?_from=${cursor}&_to=${pageEnd}`;

    // eslint-disable-next-line no-await-in-loop
    const { rows, total: t } = await fetchJson(url);
    if (t && !total) total = t;
    if (!Array.isArray(rows) || rows.length === 0) break;

    for (const p of rows) {
      const norm = normalizeProduct(p);
      if (norm && norm.priceWholesale > 0) results.push(norm);
    }

    onProgress?.(results.length, Math.min(total || (finalTo - from + 1), finalTo - from + 1));

    cursor = pageEnd + 1;
    if (cursor > finalTo) break;
    if (delayMs > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { items: results, total };
}

/**
 * Escaneo completo del catálogo /vestuario (paginado internamente).
 * Devuelve todos los productos disponibles.
 */
export async function scanFullCatalog({ category = 'vestuario', delayMs = 300, onProgress } = {}) {
  // Primera página para obtener el total
  const first = await fetchJson(`${BASE}/api/catalog_system/pub/products/search/${encodeURIComponent(category)}?_from=0&_to=49`);
  const total = first.total || 0;

  if (total === 0) return { items: [], total: 0 };

  const { items } = await scanCatalog({
    from: 0,
    to: total - 1,
    category,
    delayMs,
    onProgress,
  });

  return { items, total };
}

/**
 * Re-scrapea UN producto por su productId (para refresh de precios).
 */
export async function scrapeSingle(productId) {
  if (!productId) return null;
  const url = `${BASE}/api/catalog_system/pub/products/search?fq=productId:${encodeURIComponent(productId)}`;
  try {
    const { rows } = await fetchJson(url);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return normalizeProduct(rows[0]);
  } catch (e) {
    console.warn(`[treck] scrapeSingle failed for ${productId}:`, e.message);
    return null;
  }
}

export const TRECK = { BASE };
