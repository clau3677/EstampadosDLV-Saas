// Cottonext scraper — extrae producto por ID desde https://www.cottonext.cl/producto.php?idProducto=<n>
// El sitio guarda toda la data de variantes en un atributo color='{...JSON...}' en cada .itemColor.
import * as cheerio from 'cheerio';

const BASE = 'https://www.cottonext.cl';
const UA   = 'Mozilla/5.0 (compatible; DLV-Importer/1.0; +https://estampadosdlv.cl)';

// Rango razonable a escanear.
export const DEFAULT_ID_RANGE = { from: 1, to: 100 };

async function fetchHtml(url) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    // Cache negativo: siempre traer fresh
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return html;
}

/**
 * Detecta la marca desde el logo (Cottonext, Old Brits, ONE, Yazbek, Gildan, OB).
 */
function detectBrand($) {
  const logo = $('img[src*="/img/marcas/"]').first().attr('src') || '';
  const lower = logo.toLowerCase();
  if (lower.includes('cottonext')) return 'Cottonext';
  if (lower.includes('oldbrits')) return 'Old Brits';
  if (lower.includes('yazbek')) return 'Yazbek';
  if (lower.includes('gildan')) return 'Gildan';
  if (lower.includes('one')) return 'ONE';
  if (lower.includes('ob')) return 'OB';
  return 'Cottonext';
}

/**
 * Detecta la categoría basado en el nombre del producto.
 * poleras: polera, tank top, sublima, dry fit, lycra
 * polerones: poleron, canguro, hoodie, bomber, crew, micropolar (aunque es polar)
 * pantalones: jogger, short, buzo, pantalon
 * camisas: camisa
 * accesorios: gorro, gorra
 * otros: micropolar (si no encaja mejor)
 */
export function detectSubcategory(name = '', description = '') {
  const s = (name + ' ' + description).toLowerCase();
  if (/\b(camisa)\b/.test(s)) return 'camisas';
  if (/\b(jogger|pantal[oó]n|buzo)\b/.test(s)) return 'pantalones';
  if (/\b(short)\b/.test(s)) return 'shorts';
  if (/\b(canguro|hoodie|poler[oó]n|bomber|crew)\b/.test(s)) return 'polerones';
  if (/\b(micropolar|polar)\b/.test(s)) return 'polerones';
  if (/\b(polera|tank top|dry fit|sublima|lycra|raglan)\b/.test(s)) return 'poleras';
  return 'otros';
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
 * Parsea un HTML de producto y retorna la estructura normalizada.
 * Retorna null si no existe (redirect, 404 implícito).
 */
export function parseProductHtml(html, id) {
  const $ = cheerio.load(html);

  const h1 = $('h1').first().text().trim();
  if (!h1) return null;

  // Buscar el nombre corto del producto: está en el `<img class="imagenProducto">` alt o cerca del logo.
  // Alternativa: extraer del script `_fbProductoNom` que está en el HTML.
  const fbMatch = html.match(/_fbProductoNom\s*=\s*"([^"]+)"/);
  const productName = fbMatch
    ? fbMatch[1].replace(/\\u00[a-f0-9]{2}/gi, (m) => JSON.parse(`"${m}"`))
    : h1;

  // Buscar el código del producto (ej: "Cottonext Raglan 1800") — aparece en el listado como el h2/h3 principal.
  // En la ficha suele estar como el título mostrado en el h1 largo. Vamos a extraer el código del script `_fbProductoCod`.
  const codMatch = html.match(/_fbProductoCod\s*=\s*"([^"]+)"/);
  const productCode = codMatch
    ? codMatch[1].replace(/\\u00[a-f0-9]{2}/gi, (m) => JSON.parse(`"${m}"`))
    : '';

  // Descripción larga (limpia)
  const description = $('.descripcion[mostrar="especificaciones"]').first().html() || '';
  const descriptionText = $('.descripcion[mostrar="especificaciones"]').first().text().replace(/\s+/g, ' ').trim();

  // Marca
  const brand = detectBrand($);

  // Variantes: iterar .itemColor con atributo color=<json>
  const colorEls = $('.itemColor').toArray();
  const variants = [];
  const allImages = new Set();
  let anyStock = false;
  let priceUnit = 0;
  let priceWholesale = 0;

  for (const el of colorEls) {
    const raw = $(el).attr('color');
    if (!raw) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch { continue; }

    const colorName = data.nombre || '';
    const tallas = Array.isArray(data.tallas) ? data.tallas : [];

    for (const t of tallas) {
      const pu = parseInt(t.precioUnitario || '0', 10) || 0;
      const pm = parseInt(t.precioMayorista || '0', 10) || 0;
      const inStock = String(t.enStock || '0') !== '0';
      if (inStock) anyStock = true;
      if (pu > priceUnit) priceUnit = pu;
      if (pm > priceWholesale) priceWholesale = pm;

      const img1000 = t.imagen1000 || t.imagen360 || '';
      if (img1000) allImages.add(BASE + img1000);

      variants.push({
        color: colorName,
        size: t.nombre || '',
        priceUnit: pu,           // precio 1-9 unidades
        priceWholesale: pm,      // precio 10+ unidades
        minWholesale: parseInt(t.minMayorista || '10', 10) || 10,
        image: img1000 ? (BASE + img1000) : null,
        inStock,
      });
    }
  }

  if (variants.length === 0) return null; // página existe pero sin data (poco probable)

  const subcategory = detectSubcategory(productName, descriptionText);

  return {
    supplierProductId: String(id),
    supplierUrl: `${BASE}/producto.php?idProducto=${id}`,
    supplierBrand: brand,
    supplierCode: productCode,               // ej "Cottonext Raglan 1800"
    fullName: h1,                             // ej "Polera ML Raglan Cottonext 100% Algodón 180 Grs"
    shortName: productName || h1,
    descriptionHtml: description,
    descriptionText,
    subcategory,
    priceUnit,                                // mayor precio unitario encontrado
    priceWholesale,                           // mayor precio mayorista encontrado (10+)
    images: Array.from(allImages),
    variants,
    hasStock: anyStock,
  };
}

/**
 * Descarga y parsea un producto por ID. Retorna null si HTTP falla o no hay data.
 */
export async function scrapeProduct(id) {
  try {
    const html = await fetchHtml(`${BASE}/producto.php?idProducto=${id}`);
    return parseProductHtml(html, id);
  } catch (e) {
    return null;
  }
}

/**
 * Escanea rango de IDs, con rate limit. onProgress(current, total, product|null).
 * Retorna array de productos válidos.
 */
export async function scanCatalog({ from = 1, to = 100, delayMs = 400, onProgress } = {}) {
  const results = [];
  for (let id = from; id <= to; id++) {
    // eslint-disable-next-line no-await-in-loop
    const p = await scrapeProduct(id);
    if (p) results.push(p);
    onProgress?.(id - from + 1, to - from + 1, p);
    // eslint-disable-next-line no-await-in-loop
    if (id < to) await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}

export const COTTONEXT = { BASE };
