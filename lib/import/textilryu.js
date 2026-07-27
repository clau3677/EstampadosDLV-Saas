// Textil Ryu scraper — WordPress + WooCommerce en https://textilryu.cl
// Estrategia híbrida:
//   1. Scrape /catalogo/ HTML para obtener slug + PRECIO MAYORISTA (no está en la API pública)
//   2. Query WooCommerce Store API por slug para obtener imágenes, descripción, variaciones
import * as cheerio from 'cheerio';

const BASE = 'https://textilryu.cl';
const UA   = 'Mozilla/5.0 (compatible; DLV-Importer/1.0; +https://estampadosdlv.cl)';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
  return res.text();
}
async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
  return res.json();
}

/**
 * Convierte string a slug URL-safe.
 */
export function slugify(s = '') {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Detecta categoría + subcategoría desde el nombre del producto.
 * - gorra / beanie → caps_hats / lisa
 * - polera (mc/ml/premium) → blank_apparel / poleras
 * - otros → blank_apparel / otros
 */
export function detectCategoryAndSubcat(name = '') {
  const s = name.toLowerCase();
  if (/\bbeanie\b|gorra de lana|gorro de lana|gorro/.test(s)) return { category: 'caps_hats',     subcategory: 'lisa' };
  if (/\bgorra\b|\bcap\b|\bhat\b/.test(s))                    return { category: 'caps_hats',     subcategory: 'lisa' };
  if (/manga larga/.test(s))                                   return { category: 'blank_apparel', subcategory: 'poleras' };
  if (/polera/.test(s))                                        return { category: 'blank_apparel', subcategory: 'poleras' };
  if (/poler[oó]n|hoodie|canguro/.test(s))                     return { category: 'blank_apparel', subcategory: 'polerones' };
  return { category: 'blank_apparel', subcategory: 'otros' };
}

/**
 * Parsea /catalogo/ y retorna array de { slug, url, wholesalePrice, status }
 * (status = 'available' | 'out_of_stock' | 'coming_soon')
 */
export async function scanCatalog() {
  const html = await fetchText(`${BASE}/catalogo/`);
  const $ = cheerio.load(html);

  const results = [];
  const seen = new Set();

  // Cada producto está en un contenedor con un link a /producto/<slug>/ y el texto "Al mayor $X" cerca.
  // Estrategia robusta: buscar todos los <a href="...producto/..."> únicos y ubicar el precio en el
  // texto del ancestro más próximo.
  $('a[href*="/producto/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/\/producto\/([a-z0-9-]+)/);
    if (!m) return;
    const slug = m[1];
    if (seen.has(slug)) return;

    // Buscar el bloque contenedor (subir 5 niveles y tomar el más ancho que tenga "Al mayor" o "Ahora a")
    let block = $(el);
    let priceText = '';
    let statusText = '';
    for (let up = 0; up < 8 && !priceText; up++) {
      const scope = block.text();
      const priceMatch = scope.match(/(?:Al mayor|Ahora a)\s+\$\s*([\d.,]+)/i);
      if (priceMatch) {
        priceText = priceMatch[1];
        // status
        if (/AGOTADO/i.test(scope)) statusText = 'out_of_stock';
        else if (/PR[OÓ]XIMAMENTE/i.test(scope)) statusText = 'coming_soon';
        else statusText = 'available';
        break;
      }
      block = block.parent();
      if (!block || block.length === 0) break;
    }

    // Normalizar precio: "1.400" → 1400 ; "1,400" → 1400
    const price = priceText ? parseInt(priceText.replace(/[.,]/g, ''), 10) : 0;
    if (!price) return; // skip productos sin precio mayorista visible

    seen.add(slug);
    results.push({
      slug,
      url: `${BASE}/producto/${slug}/`,
      wholesalePrice: price,
      status: statusText || 'available',
    });
  });

  return results;
}

/**
 * Enriquece un item del scan con datos de la Store API (imágenes, descripción, variaciones).
 * Retorna null si el producto no está disponible en la API o si falla.
 */
export async function fetchProductDetails(slug, wholesalePrice, status) {
  try {
    const rows = await fetchJson(`${BASE}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}&per_page=1`);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const p = rows[0];

    const cleanDesc = (html) => String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Imagenes: reemplazar -scaled por versión no scaled si existe (mejor calidad)
    const images = (p.images || []).map(img => {
      const src = img.src || '';
      // Devuelve la URL directamente
      return src;
    }).filter(Boolean);

    // Colores desde variaciones (WooCommerce las serializa como attributes)
    const colors = new Set();
    for (const v of (p.variations || [])) {
      for (const a of (v.attributes || [])) {
        const attrName = (a.name || '').toLowerCase();
        if (attrName.includes('color')) colors.add(a.value);
      }
    }
    // Si no hay variaciones, mirar attributes top-level
    if (colors.size === 0) {
      for (const a of (p.attributes || [])) {
        const attrName = (a.name || '').toLowerCase();
        if (attrName.includes('color')) {
          for (const t of (a.terms || [])) colors.add(t.name);
        }
      }
    }

    const { category, subcategory } = detectCategoryAndSubcat(p.name);
    const descText = cleanDesc(p.short_description) || cleanDesc(p.description) || '';

    return {
      supplierProductId: String(p.id),
      supplierUrl: p.permalink || `${BASE}/producto/${slug}/`,
      supplierBrand: 'Textil Ryu',
      supplierCode: p.sku || '',
      slug,
      fullName: p.name,
      shortName: p.name,
      descriptionHtml: p.short_description || p.description || '',
      descriptionText: descText,
      category,
      subcategory,
      priceUnit: parseInt(p.prices?.price || '0', 10) || 0,       // precio retail visible
      priceWholesale: wholesalePrice,                             // precio "Al mayor" (real proveedor)
      images,
      colors: Array.from(colors),
      hasStock: status !== 'out_of_stock' && p.is_in_stock !== false,
      status,
    };
  } catch (e) {
    console.warn(`[textilryu] failed to fetch ${slug}:`, e.message);
    return null;
  }
}

/**
 * Escaneo completo: /catalogo/ + detalles vía API. Rate limit cortés.
 */
export async function scanFullCatalog({ delayMs = 250, onProgress } = {}) {
  const list = await scanCatalog();
  const results = [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    // eslint-disable-next-line no-await-in-loop
    const details = await fetchProductDetails(it.slug, it.wholesalePrice, it.status);
    if (details) results.push(details);
    onProgress?.(i + 1, list.length, details);
    if (i < list.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

/**
 * Re-scrapea UN producto para refresh de precios (usa scan + fetch details).
 */
export async function scrapeSingle(slug) {
  const list = await scanCatalog();
  const found = list.find(x => x.slug === slug);
  if (!found) return null;
  return fetchProductDetails(found.slug, found.wholesalePrice, found.status);
}

export const TEXTILRYU = { BASE };
