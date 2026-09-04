// =============================================================================
// Compositor de imágenes de marketing — plantilla editorial DLV
// -----------------------------------------------------------------------------
// Genera piezas 1080×1080 listas para Facebook e Instagram usando únicamente
// la imagen real del catálogo. La plantilla evita el aspecto de ficha simple:
// integra producto, jerarquía tipográfica, tarjeta visual, categoría, beneficio,
// precio opcional y CTA de contacto.
// =============================================================================
import path from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import sharp from 'sharp';
import { formatCLP } from '@/lib/format';

const APP_ROOT = process.env.DLV_APP_ROOT || process.cwd();
const MARKETING_DIR = process.env.MARKETING_MEDIA_DIR || path.join(APP_ROOT, 'public', 'uploads', 'marketing');
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');
const SIZE = 1080;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function oneLine(value, max = 48) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trim()}…`;
}

function categoryLabel(category) {
  const labels = {
    caps_hats: 'GORRAS Y ACCESORIOS',
    workwear: 'ROPA DE TRABAJO',
    tshirts: 'POLERAS PERSONALIZADAS',
    hoodies: 'POLERONES PERSONALIZADOS',
    uv_dtf: 'DTF UV',
    dtf: 'IMPRESIÓN DTF',
  };
  return labels[String(category || '').toLowerCase()] || 'PERSONALIZACIÓN DTF';
}

function benefitFor(category) {
  const key = String(category || '').toLowerCase();
  if (key === 'caps_hats') return 'Calidad · Ajuste cómodo · Personalización DTF';
  if (key === 'workwear') return 'Resistencia · Imagen profesional · Personalización DTF';
  if (key === 'uv_dtf') return 'Colores intensos · Alta definición · Acabado premium';
  return 'Calidad · Personalización DTF · Atención personalizada';
}

async function loadSourceBuffer(sourceImage) {
  if (!sourceImage) throw new Error('Falta la imagen real del producto');

  if (/^https?:\/\//i.test(sourceImage)) {
    const res = await fetch(sourceImage);
    if (!res.ok) throw new Error(`No se pudo descargar la imagen origen (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  const rel = sourceImage.startsWith('/') ? sourceImage.slice(1) : sourceImage;
  const candidates = [
    path.join(APP_ROOT, 'public', rel),
    path.join('/var/www/estampadosdlv/public', rel),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch {
      // Intenta la siguiente ubicación.
    }
  }

  const publicUrl = `${BASE_URL}/${rel}`;
  const res = await fetch(publicUrl);
  if (!res.ok) throw new Error(`No se pudo cargar la imagen real del producto (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function buildTemplateSvg({ productImageDataUri, productName, priceClp, category, benefit, campaign, badge }) {
  const title = escapeXml(oneLine(productName, 34));
  const categoryText = escapeXml(oneLine(categoryLabel(category), 28));
  const benefitText = escapeXml(oneLine(benefit || benefitFor(category), 54));
  const campaignText = campaign ? escapeXml(oneLine(campaign, 28)) : '';
  const price = priceClp ? escapeXml(formatCLP(priceClp)) : '';
  const badgeText = escapeXml(oneLine(badge || 'ESTAMPADOSDLV.COM', 24).toUpperCase());

  return `
  <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#09111f"/>
        <stop offset="58%" stop-color="#111c31"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#fb923c"/>
        <stop offset="100%" stop-color="#f43f5e"/>
      </linearGradient>
      <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#f1f5f9"/>
      </linearGradient>
      <clipPath id="productClip"><rect x="108" y="171" width="864" height="507" rx="34"/></clipPath>
    </defs>

    <rect width="1080" height="1080" fill="url(#background)"/>
    <circle cx="1000" cy="80" r="220" fill="#f97316" opacity="0.08"/>
    <circle cx="80" cy="1040" r="190" fill="#fb7185" opacity="0.06"/>
    <path d="M0 126 H1080" stroke="#ffffff" stroke-opacity="0.08"/>

    <text x="72" y="67" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800" letter-spacing="2.5" fill="#ffffff">ESTAMPADOS DLV</text>
    <text x="72" y="98" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" letter-spacing="1.2" fill="#cbd5e1">${badgeText}</text>
    <rect x="850" y="52" width="158" height="42" rx="21" fill="url(#accent)"/>
    <text x="929" y="79" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800" fill="#ffffff">QUILPUÉ · CHILE</text>

    <rect x="93" y="156" width="894" height="537" rx="48" fill="#000000" opacity="0.30"/>
    <rect x="84" y="147" width="894" height="537" rx="48" fill="url(#card)" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2"/>
    <rect x="108" y="171" width="864" height="507" rx="34" fill="#ffffff"/>
    <image href="${productImageDataUri}" x="108" y="171" width="864" height="507" preserveAspectRatio="xMidYMid meet" clip-path="url(#productClip)"/>

    <rect x="72" y="727" width="342" height="40" rx="20" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.18"/>
    <text x="243" y="753" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="800" letter-spacing="1.2" fill="#fed7aa">${categoryText}</text>

    <text x="72" y="833" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800" fill="#ffffff">${title}</text>
    <rect x="72" y="856" width="76" height="7" rx="3.5" fill="url(#accent)"/>
    <text x="72" y="905" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="600" fill="#cbd5e1">${benefitText}</text>
    ${campaignText ? `<text x="72" y="944" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="600" fill="#94a3b8">${campaignText}</text>` : ''}

    ${price ? `
      <rect x="724" y="801" width="284" height="111" rx="24" fill="#ffffff"/>
      <text x="752" y="837" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="800" letter-spacing="1.4" fill="#64748b">DESDE</text>
      <text x="752" y="884" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#0f172a">${price}</text>
    ` : `
      <rect x="724" y="801" width="284" height="111" rx="24" fill="url(#accent)"/>
      <text x="866" y="849" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" fill="#ffffff">COTIZA HOY</text>
      <text x="866" y="883" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="#fff7ed">Respuesta personalizada</text>
    `}

    <rect x="72" y="984" width="936" height="2" fill="#ffffff" fill-opacity="0.16"/>
    <text x="72" y="1025" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="#ffffff">Personaliza tu idea con nosotros</text>
    <text x="1008" y="1025" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#fdba74">WhatsApp · +56 9 5416 9052</text>
  </svg>`;
}

/**
 * Compone una imagen publicable de 1080×1080 y la guarda en el directorio de
 * medios públicos. El archivo de origen siempre debe ser un asset real.
 *
 * @param {Object} opts
 * @param {string} opts.sourceImage — path local o URL pública del producto
 * @param {string} opts.productName
 * @param {number} [opts.priceClp]
 * @param {string} [opts.category]
 * @param {string} [opts.benefit]
 * @param {string} [opts.campaign]
 * @param {string} [opts.badge]
 * @param {string} opts.fileStem
 * @returns {{ relativeUrl: string, filePath: string }}
 */
export async function composePostImage({
  sourceImage,
  productName,
  priceClp,
  category,
  benefit,
  campaign,
  badge,
  fileStem,
}) {
  await mkdir(MARKETING_DIR, { recursive: true });

  const sourceBuffer = await loadSourceBuffer(sourceImage);
  const productPng = await sharp(sourceBuffer, { failOn: 'none' })
    .rotate()
    .resize(864, 507, {
      fit: 'contain',
      position: 'centre',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  const productImageDataUri = `data:image/png;base64,${productPng.toString('base64')}`;
  const svg = buildTemplateSvg({
    productImageDataUri,
    productName,
    priceClp,
    category,
    benefit,
    campaign,
    badge,
  });

  const out = await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();

  const fileName = `${fileStem}.jpg`;
  const filePath = path.join(MARKETING_DIR, fileName);
  await writeFile(filePath, out);
  return { relativeUrl: `/uploads/marketing/${fileName}`, filePath };
}
