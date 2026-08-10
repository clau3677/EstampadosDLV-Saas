// =============================================================================
// Compositor de imágenes de marketing — Sharp (auditoría jul-2026)
// -----------------------------------------------------------------------------
// Genera la imagen cuadrada 1080×1080 JPEG del post a partir de la foto del
// producto + overlay de marca (franja inferior con nombre, precio y logo
// textual DLV). Instagram exige JPEG accesible por URL pública; se guarda en
// public/uploads/marketing/ y se sirve como {BASE_URL}/uploads/marketing/x.jpg
// =============================================================================
import path from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import sharp from 'sharp';
import { formatCLP } from '@/lib/format';

const MARKETING_DIR = path.join('/var/www/estampadosdlv', 'public', 'uploads', 'marketing');
const SIZE = 1080;

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** SVG overlay: franja inferior degradada con nombre del producto y precio. */
function buildOverlaySvg({ productName, priceClp, badge }) {
  const name = escapeXml(productName).slice(0, 48);
  const price = priceClp ? escapeXml(formatCLP(priceClp)) : '';
  const badgeText = escapeXml(badge || 'estampadosdlv.com');
  return Buffer.from(`
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#f43f5e"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${SIZE - 280}" width="${SIZE}" height="280" fill="url(#fade)"/>
  <rect x="48" y="${SIZE - 220}" width="8" height="120" rx="4" fill="url(#brand)"/>
  <text x="80" y="${SIZE - 160}" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" fill="#ffffff">${name}</text>
  ${price ? `<text x="80" y="${SIZE - 92}" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" fill="#fdba74">${price}</text>` : ''}
  <text x="${SIZE - 48}" y="${SIZE - 48}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600" fill="#e2e8f0">${badgeText}</text>
</svg>`);
}

/**
 * Compone la imagen del post y la guarda en public/uploads/marketing/.
 * @param {Object} opts
 * @param {string} opts.sourceImage  — path local (public/...) o URL http(s)
 * @param {string} opts.productName
 * @param {number} [opts.priceClp]
 * @param {string} [opts.badge]
 * @param {string} opts.fileStem     — nombre base sin extensión
 * @returns {{ relativeUrl: string, filePath: string }}
 */
export async function composePostImage({ sourceImage, productName, priceClp, badge, fileStem }) {
  await mkdir(MARKETING_DIR, { recursive: true });

  // Cargar buffer de origen (local o remoto)
  let buffer;
  if (/^https?:\/\//i.test(sourceImage)) {
    const res = await fetch(sourceImage);
    if (!res.ok) throw new Error(`No se pudo descargar la imagen origen (${res.status})`);
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    // Local path: puede ser /uploads/designs/... o /uploads/proveedor/...
    const rel = sourceImage.startsWith('/') ? sourceImage.replace(/^\//, '') : sourceImage;
    const local = path.join('/var/www/estampadosdlv', 'public', rel);
    try {
      buffer = await readFile(local);
    } catch (e) {
      // Fallback: intentar con la ruta absoluta del servidor
      const fallback = path.join('/var/www/estampadosdlv/public', rel);
      try {
        if (local !== fallback) buffer = await readFile(fallback);
        else throw e;
      } catch (e2) {
        // Último recurso: descargar desde la URL pública del sitio
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'https://estampadosdlv.com';
        const url = `${baseUrl}/${rel}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`No se pudo cargar la imagen (local: ${local})`);
        buffer = Buffer.from(await res.arrayBuffer());
      }
    }
  }

  // Cuadrado 1080×1080: cover + attention crop mantiene el sujeto centrado
  const base = await sharp(buffer, { failOn: 'none' })
    .resize(SIZE, SIZE, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer();

  const overlay = buildOverlaySvg({ productName, priceClp, badge });

  const out = await sharp(base)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  const fileName = `${fileStem}.jpg`;
  const filePath = path.join(MARKETING_DIR, fileName);
  await writeFile(filePath, out);
  return { relativeUrl: `/uploads/marketing/${fileName}`, filePath };
}
