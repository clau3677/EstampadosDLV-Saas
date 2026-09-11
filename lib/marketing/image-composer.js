// =============================================================================
// Compositor de imágenes de marketing — plantilla industrial premium DLV
// -----------------------------------------------------------------------------
// Genera piezas cuadradas 1248×1248 para Facebook e Instagram.
// La composición sigue el JSON de referencia: fondo negro, diagonal naranja,
// halftone, producto aislado a la derecha, información a la izquierda e
// iconografía/banda de beneficios en la zona inferior.
// =============================================================================
import path from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';
import sharp from 'sharp';

const APP_ROOT = process.env.DLV_APP_ROOT || process.cwd();
const MARKETING_DIR = process.env.MARKETING_MEDIA_DIR || path.join(APP_ROOT, 'public', 'uploads', 'marketing');
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');
const SIZE = 1248;
const FONT = 'Arial, Helvetica, sans-serif';
const COLORS = {
  black: '#060B18',
  orange: '#FF9E2C',
  white: '#F8FAFC',
  red: '#FF566B',
  navy: '#0C1630',
  gray: '#17243C',
  line: '#4B5A74',
  muted: '#D9E1EE',
};

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function upper(value) {
  return cleanText(value).toUpperCase();
}

function oneLine(value, max = 48) {
  const clean = cleanText(value);
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

function categoryKey(category) {
  return String(category || '').toLowerCase().trim();
}

function defaultClaim(category) {
  const key = categoryKey(category);
  if (key === 'workwear') return 'COMODIDAD Y DURABILIDAD';
  if (key === 'caps_hats') return 'ESTILO Y PERSONALIZACIÓN';
  if (key === 'hoodies') return 'ABRIGO, ESTILO Y CALIDAD';
  if (key === 'uv_dtf') return 'COLOR Y ALTA DEFINICIÓN';
  return 'DISEÑO QUE HABLA POR TI';
}

function defaultFeatures(category) {
  const key = categoryKey(category);
  if (key === 'workwear') {
    return [
      { icon: 'layers', title: 'CALIDAD DE PRENDA', description: 'Material seleccionado para una presentación cómoda y profesional.' },
      { icon: 'shield', title: 'IMAGEN PROFESIONAL', description: 'Una prenda pensada para representar mejor a tu equipo.' },
      { icon: 'shirt', title: 'DISEÑO FUNCIONAL', description: 'Corte y estilo adecuados para el uso diario.' },
      { icon: 'check', title: 'PARA TU EQUIPO', description: 'Ideal para empresas, marcas, eventos y uniformes.' },
    ];
  }
  if (key === 'caps_hats') {
    return [
      { icon: 'layers', title: 'ACABADO DE CALIDAD', description: 'Una base lista para personalizar con tu identidad.' },
      { icon: 'spark', title: 'DISEÑO ÚNICO', description: 'Convierte tu idea en una pieza que destaca.' },
      { icon: 'shirt', title: 'USO VERSÁTIL', description: 'Ideal para marcas, equipos, eventos y regalos.' },
      { icon: 'check', title: 'PERSONALIZACIÓN DTF', description: 'Colores y detalles para comunicar tu estilo.' },
    ];
  }
  if (key === 'uv_dtf') {
    return [
      { icon: 'spark', title: 'ALTA DEFINICIÓN', description: 'Detalles nítidos y colores intensos para tu proyecto.' },
      { icon: 'layers', title: 'ACABADO PREMIUM', description: 'Ideal para superficies rígidas y merchandising.' },
      { icon: 'shield', title: 'RESULTADO DURABLE', description: 'Personalización pensada para el uso diario.' },
      { icon: 'check', title: 'PARA TU MARCA', description: 'Haz que tus productos hablen por tu negocio.' },
    ];
  }
  return [
    { icon: 'spark', title: 'ESTAMPADO DTF', description: 'Colores intensos y detalles definidos para tu diseño.' },
    { icon: 'layers', title: 'DESDE 1 UNIDAD', description: 'Personaliza una pieza o prepara un pedido por volumen.' },
    { icon: 'shirt', title: 'DISEÑO A TU MEDIDA', description: 'Tu idea adaptada al producto que necesitas.' },
    { icon: 'check', title: 'ATENCIÓN LOCAL', description: 'Te ayudamos desde Quilpué a preparar tu pedido.' },
  ];
}

function defaultBottomBenefits(category) {
  const key = categoryKey(category);
  if (key === 'workwear') {
    return [
      ['IDEAL PARA', 'EQUIPOS Y EMPRESAS', 'user'],
      ['IMAGEN', 'PROFESIONAL', 'shield'],
      ['CÓMODA', 'PARA TU DÍA', 'check'],
      ['DISEÑO', 'A TU MEDIDA', 'spark'],
      ['ATENCIÓN', 'EN QUILPUÉ', 'helmet'],
    ];
  }
  return [
    ['CALIDAD', 'DTF FULL COLOR', 'spark'],
    ['PEDIDO', 'DESDE 1 UNIDAD', 'check'],
    ['DISEÑO', 'A TU MEDIDA', 'shirt'],
    ['ENTREGA', 'EN QUILPUÉ', 'pin'],
    ['MARCA', 'ESTILO PROPIO', 'shield'],
  ];
}

function splitTitle(productName, category) {
  const fallback = categoryKey(category) === 'workwear'
    ? ['POLERA', 'PIQUÉ M/CORTA', 'AZUL MARINO']
    : [upper(productName || categoryLabel(category))];
  const words = upper(productName).split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;

  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > 16) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function normaliseFeature(feature) {
  if (typeof feature === 'string') return { icon: 'check', title: upper(feature), description: '' };
  return {
    icon: feature?.icon || 'check',
    title: upper(feature?.title || feature?.name || ''),
    description: cleanText(feature?.description || feature?.detail || ''),
  };
}

function normaliseBottomBenefit(item) {
  if (Array.isArray(item)) return [upper(item[0]), upper(item[1]), item[2] || 'check'];
  return [upper(item?.title || ''), upper(item?.subtitle || ''), item?.icon || 'check'];
}

function iconSvg(type, cx, cy, radius = 20) {
  const x = Number(cx);
  const y = Number(cy);
  const r = Number(radius);
  const common = `fill="none" stroke="${COLORS.orange}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
  let shape = `<circle cx="${x}" cy="${y}" r="${r}" ${common}/>`;
  if (type === 'layers') {
    shape += `<path d="M${x - 10} ${y - 5}l10 -6 10 6-10 6zM${x - 10} ${y + 2}l10 6 10-6M${x - 10} ${y + 9}l10 6 10-6" ${common}/>`;
  } else if (type === 'shield' || type === 'helmet') {
    shape += `<path d="M${x} ${y - 11}l10 5v7c0 7-5 11-10 14-5-3-10-7-10-14v-7z" ${common}/><path d="M${x - 5} ${y + 1}l4 4 8-9" ${common}/>`;
  } else if (type === 'shirt') {
    shape += `<path d="M${x - 7} ${y - 10}l7 4 7-4 8 6-5 6-4-3v14h-12V-?" ${common}/>`;
    shape = shape.replace('v-?', 'v0');
  } else if (type === 'spark') {
    shape += `<path d="M${x} ${y - 12}l2.5 9.5L${x + 12} ${y}l-9.5 2.5L${x} ${y + 12}l-2.5-9.5L${x - 12} ${y}l9.5-2.5z" ${common}/>`;
  } else if (type === 'pin') {
    shape += `<path d="M${x} ${y + 12}s-8-8-8-14a8 8 0 1 1 16 0c0 6-8 14-8 14z" ${common}/><circle cx="${x}" cy="${y - 2}" r="2" fill="${COLORS.orange}"/>`;
  } else if (type === 'user') {
    shape += `<circle cx="${x}" cy="${y - 5}" r="4" ${common}/><path d="M${x - 9} ${y + 10}c1-7 17-7 18 0" ${common}/>`;
  } else {
    shape += `<path d="M${x - 8} ${y}l6 6 11-12" ${common}/>`;
  }
  return shape;
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
    try { return await readFile(candidate); } catch { /* siguiente ubicación */ }
  }
  const res = await fetch(`${BASE_URL}/${rel}`);
  if (!res.ok) throw new Error(`No se pudo cargar la imagen real del producto (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function removeNearWhiteBackground(buffer) {
  const image = sharp(buffer, { failOn: 'none' }).rotate().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 238 && g > 238 && b > 238) data[i + 3] = 0;
    else if (r > 220 && g > 220 && b > 220) data[i + 3] = Math.max(0, Math.round((255 - Math.max(r, g, b)) * 5));
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function buildTemplateSvg({ productImageDataUri, productName, category, benefit, campaign, badge, color, features, bottomBenefits, titleLines: suppliedTitleLines }) {
  const key = categoryKey(category);
  const titleLines = suppliedTitleLines?.length ? suppliedTitleLines.map(upper).slice(0, 3) : splitTitle(productName, category);
  const claim = upper(oneLine(benefit || defaultClaim(category), 28));
  const categoryText = upper(oneLine(categoryLabel(category), 28));
  const campaignText = campaign ? upper(oneLine(campaign, 28)) : '';
  // El precio se mantiene fuera de las piezas sociales. El feed de productos
  // conserva su precio comercial, pero el arte de Facebook/Instagram comunica
  // valor y derivación a cotización sin mostrar importes que puedan quedar
  // desactualizados o cubrir información del producto.
  const badgeText = upper(oneLine(badge || 'TALLER DTF Y DTF UV', 25));
  const accent = escapeXml(color || COLORS.orange);
  const featureItems = (features?.length ? features : defaultFeatures(category)).slice(0, 4).map(normaliseFeature);
  const bottomItems = (bottomBenefits?.length ? bottomBenefits : defaultBottomBenefits(category)).slice(0, 5).map(normaliseBottomBenefit);
  // Zonas seguras: título y beneficios quedan siempre antes del CTA.
  const titleStartY = 214;
  const titleLinesSvg = titleLines.map((line, index) => {
    const fill = index === 1 || (key === 'workwear' && index === 2) ? accent : COLORS.white;
    const size = index === 0 ? 62 : (line.length > 15 ? 48 : 58);
    return `<text x="56" y="${titleStartY + index * 62}" font-family="${FONT}" font-size="${size}" font-weight="900" letter-spacing="-1" fill="${fill}">${escapeXml(line)}</text>`;
  }).join('\n');
  const featureStartY = 548;
  const featureSvg = featureItems.map((item, index) => {
    const y = featureStartY + index * 76;
    return `${iconSvg(item.icon, 83, y - 5, 22)}
      <text x="120" y="${y - 5}" font-family="${FONT}" font-size="19" font-weight="900" letter-spacing="0.4" fill="${accent}">${escapeXml(oneLine(item.title, 27))}</text>
      <text x="120" y="${y + 19}" font-family="${FONT}" font-size="16" font-weight="500" fill="${COLORS.white}">${escapeXml(oneLine(item.description, 35))}</text>`;
  }).join('\n');
  const bottomSvg = bottomItems.map((item, index) => {
    const colX = 38 + index * 234;
    const separator = index ? `<line x1="${colX - 16}" y1="1041" x2="${colX - 16}" y2="1121" stroke="#6d6d6d" stroke-width="1"/>` : '';
    return `${separator}${iconSvg(item[2], colX + 18, 1079, 17)}
      <text x="${colX + 47}" y="1069" font-family="${FONT}" font-size="14" font-weight="900" fill="${accent}">${escapeXml(oneLine(item[0], 15))}</text>
      <text x="${colX + 47}" y="1092" font-family="${FONT}" font-size="12" font-weight="600" fill="${COLORS.white}">${escapeXml(oneLine(item[1], 18))}</text>`;
  }).join('\n');

  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="orangeDiagonal" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFB52E"/><stop offset="100%" stop-color="#F56B00"/></linearGradient>
      <linearGradient id="productGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.11"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="18"/><feOffset dy="18"/><feComponentTransfer><feFuncA type="linear" slope="0.42"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <pattern id="halftone" width="54" height="54" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r="3" fill="#000"/><circle cx="28" cy="8" r="5" fill="#000"/><circle cx="48" cy="8" r="7" fill="#000"/><circle cx="8" cy="30" r="5" fill="#000"/><circle cx="28" cy="30" r="7" fill="#000"/><circle cx="48" cy="30" r="9" fill="#000"/><circle cx="8" cy="50" r="7" fill="#000"/><circle cx="28" cy="50" r="9" fill="#000"/><circle cx="48" cy="50" r="11" fill="#000"/></pattern>
    </defs>
    <rect width="${SIZE}" height="${SIZE}" fill="${COLORS.navy}"/>
    <path d="M890 0 H1248 V1248 H820 L1088 600 Z" fill="url(#orangeDiagonal)"/>
    <path d="M1010 0 H1248 V760 L930 570 Z" fill="url(#halftone)" opacity="0.58"/>
    <path d="M0 0 H850 L778 176 H0 Z" fill="#071022" opacity="0.92"/>
    <path d="M0 1248 H900 L1040 1170 H0 Z" fill="#071022" opacity="0.9"/>

    <text x="56" y="63" font-family="${FONT}" font-size="31" font-weight="900" letter-spacing="2" fill="${COLORS.white}">ESTAMPADOS DLV</text>
    <text x="57" y="94" font-family="${FONT}" font-size="15" font-weight="800" letter-spacing="1.4" fill="${accent}">${escapeXml(badgeText)}</text>
    <rect x="56" y="112" width="164" height="7" rx="3" fill="${accent}"/>
    <rect x="226" y="112" width="70" height="7" rx="3" fill="${COLORS.red}"/>
    <rect x="1016" y="51" width="176" height="42" rx="21" fill="${accent}"/>
    <text x="1104" y="78" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="900" fill="${COLORS.black}">QUILPUÉ · CHILE</text>

    ${titleLinesSvg}
    <rect x="56" y="404" width="430" height="49" rx="10" fill="${accent}"/>
    <text x="271" y="436" text-anchor="middle" font-family="${FONT}" font-size="21" font-weight="900" fill="${COLORS.black}">${escapeXml(claim)}</text>
    <rect x="56" y="468" width="430" height="48" rx="7" fill="${COLORS.red}"/>
    <rect x="271" y="468" width="215" height="48" rx="0" fill="${COLORS.white}"/>
    <text x="163" y="499" text-anchor="middle" font-family="${FONT}" font-size="19" font-weight="900" fill="${COLORS.white}">CALIDAD</text>
    <text x="378" y="499" text-anchor="middle" font-family="${FONT}" font-size="19" font-weight="900" fill="${COLORS.black}">CONFIANZA</text>

    ${featureSvg}

    <rect x="610" y="132" width="560" height="620" rx="38" fill="${COLORS.white}" opacity="0.98"/>
    <g filter="url(#shadow)">
      <ellipse cx="885" cy="756" rx="214" ry="24" fill="#000000" opacity="0.5"/>
      <image href="${productImageDataUri}" x="620" y="146" width="540" height="590" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <rect x="742" y="162" width="286" height="70" rx="35" fill="url(#productGlow)" opacity="0.22"/>
    <text x="885" y="800" text-anchor="middle" font-family="${FONT}" font-size="17" font-weight="900" letter-spacing="1.2" fill="${COLORS.black}">${escapeXml(categoryText)}</text>
    ${campaignText ? `<text x="885" y="823" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="${COLORS.black}">${escapeXml(campaignText)}</text>` : ''}

    <g id="contact-cta">
      <rect x="56" y="822" width="430" height="122" rx="18" fill="${accent}"/>
      <rect x="56" y="822" width="10" height="122" rx="5" fill="${COLORS.red}"/>
      <text x="86" y="863" font-family="${FONT}" font-size="26" font-weight="900" letter-spacing="0.3" fill="${COLORS.black}">COTIZA HOY</text>
      <text x="86" y="895" font-family="${FONT}" font-size="16" font-weight="800" fill="${COLORS.black}">WhatsApp · +56 9 5416 9052</text>
      <text x="86" y="922" font-family="${FONT}" font-size="14" font-weight="600" fill="${COLORS.black}">Atención personalizada para tu proyecto</text>
    </g>
    <text x="56" y="980" font-family="${FONT}" font-size="17" font-weight="700" fill="${COLORS.white}">PERSONALIZA TU IDEA CON NOSOTROS</text>
    <text x="1192" y="980" text-anchor="end" font-family="${FONT}" font-size="16" font-weight="800" fill="${COLORS.orange}">estampadosdlv.com</text>

    <rect x="28" y="1018" width="1192" height="166" rx="28" fill="#050505" stroke="#777" stroke-width="2"/>
    ${bottomSvg}
  </svg>`;
}

/**
 * Compone una imagen publicable de 1248×1248 usando el producto real.
 * `features`, `bottomBenefits` y `titleLines` son opcionales y permiten que
 * cada categoría o producto tenga una comunicación propia sin inventar datos.
 */
export async function composePostImage({
  sourceImage,
  productName,
  category,
  benefit,
  campaign,
  badge,
  color,
  features,
  bottomBenefits,
  titleLines,
  removeBackground = true,
  fileStem,
}) {
  await mkdir(MARKETING_DIR, { recursive: true });
  const sourceBuffer = await loadSourceBuffer(sourceImage);
  const preparedSource = removeBackground ? await removeNearWhiteBackground(sourceBuffer) : sourceBuffer;
  const productPng = await sharp(preparedSource, { failOn: 'none' })
    .trim({ background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .resize(605, 754, { fit: 'contain', position: 'centre', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const productImageDataUri = `data:image/png;base64,${productPng.toString('base64')}`;
  const svg = buildTemplateSvg({ productImageDataUri, productName, category, benefit, campaign, badge, color, features, bottomBenefits, titleLines });
  const out = await sharp(Buffer.from(svg)).jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  const fileName = `${fileStem}.jpg`;
  const filePath = path.join(MARKETING_DIR, fileName);
  await writeFile(filePath, out);
  return { relativeUrl: `/uploads/marketing/${fileName}`, filePath };
}
