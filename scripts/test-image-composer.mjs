// Prueba local del compositor de imágenes de marketing (sin Meta ni IA).
// Uso: node scripts/test-image-composer.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

// 1) Crear imagen de producto sintética
const src = path.join(process.cwd(), 'public', 'uploads', 'designs', 'test-product.png');
await mkdir(path.dirname(src), { recursive: true });
const testImg = await sharp({
  create: { width: 1400, height: 900, channels: 3, background: { r: 30, g: 120, b: 200 } },
}).png().toBuffer();
await writeFile(src, testImg);

// 2) Componer post — réplica de la lógica de lib/marketing/image-composer.js
// (el alias @/ de Next no resuelve en node puro, así que replicamos el flujo)
const SIZE = 1080;
const formatCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const escapeXml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const overlay = Buffer.from(`
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
  <text x="80" y="${SIZE - 160}" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" fill="#ffffff">${escapeXml('Polera Algodón Premium DTF')}</text>
  <text x="80" y="${SIZE - 92}" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" fill="#fdba74">${escapeXml(formatCLP(12990))}</text>
  <text x="${SIZE - 48}" y="${SIZE - 48}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600" fill="#e2e8f0">estampadosdlv.com</text>
</svg>`);

const outDir = path.join(process.cwd(), 'public', 'uploads', 'marketing');
await mkdir(outDir, { recursive: true });
const base = await sharp(src, { failOn: 'none' })
  .resize(SIZE, SIZE, { fit: 'cover', position: sharp.strategy.attention })
  .toBuffer();
const out = await sharp(base)
  .composite([{ input: overlay, top: 0, left: 0 }])
  .jpeg({ quality: 88, mozjpeg: true })
  .toBuffer();
const result = { filePath: path.join(outDir, 'test-post.jpg'), relativeUrl: '/uploads/marketing/test-post.jpg' };
await writeFile(result.filePath, out);
console.log('OK →', result);

const meta = await sharp(result.filePath).metadata();
console.log(`Dimensiones: ${meta.width}x${meta.height}, formato: ${meta.format}`);
if (meta.width !== 1080 || meta.height !== 1080 || meta.format !== 'jpeg') {
  console.error('FALLO: dimensiones o formato incorrectos');
  process.exit(1);
}
console.log('✅ Compositor de imágenes OK');
