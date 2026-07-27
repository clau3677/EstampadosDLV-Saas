// Descarga imágenes de URL remota y las guarda localmente en /public/uploads/proveedor/<supplier>/.
// Devuelve la ruta pública local (para usar en <img src>).
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const BASE_DIR = path.join(process.cwd(), 'public', 'uploads', 'proveedor');

// Kept for backward compatibility (older code imports IMAGES_DIR)
export const IMAGES_DIR = path.join(BASE_DIR, 'cottonext');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Descarga una imagen y la guarda con nombre determinista (sha1 del URL + extensión) dentro
 * de /public/uploads/proveedor/<supplier>/. Idempotente.
 *
 * @param {string} url         URL absoluta de la imagen remota
 * @param {string} supplier    Nombre del proveedor (default 'cottonext' por retrocompat).
 */
export async function downloadImage(url, supplier = 'cottonext') {
  if (!url) return null;
  const safeSupplier = String(supplier || 'cottonext').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const dir = path.join(BASE_DIR, safeSupplier);
  await ensureDir(dir);

  // Nombre determinista basado en la URL
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const cleanExt = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 4);
  const filename = `${hash}.${cleanExt}`;
  const filepath = path.join(dir, filename);
  const publicUrl = `/uploads/proveedor/${safeSupplier}/${filename}`;

  // Skip si ya existe
  try {
    await fs.stat(filepath);
    return publicUrl;
  } catch { /* not exists → download */ }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 DLV-Importer/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null; // imagen sospechosamente pequeña
    await fs.writeFile(filepath, buf);
    return publicUrl;
  } catch (e) {
    console.error(`[${safeSupplier}] image download failed for ${url}:`, e.message);
    return null;
  }
}

/**
 * Descarga múltiples imágenes en paralelo con límite de concurrencia.
 */
export async function downloadImagesBatch(urls, concurrency = 4, supplier = 'cottonext') {
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    // eslint-disable-next-line no-await-in-loop
    const rs = await Promise.all(chunk.map(u => downloadImage(u, supplier)));
    results.push(...rs.filter(Boolean));
  }
  return results;
}
