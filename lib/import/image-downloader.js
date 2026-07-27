// Descarga una imagen de URL remota y la guarda localmente en /public/uploads/proveedor/cottonext/.
// Devuelve la ruta pública local (para usar en <img src>).
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const IMAGES_DIR = path.join(process.cwd(), 'public', 'uploads', 'proveedor', 'cottonext');

export async function ensureDir() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
}

/**
 * Descarga una imagen de una URL y la guarda con nombre determinista (sha1 del URL + extensión).
 * Si el archivo ya existe, no lo baja de nuevo (idempotente).
 * Retorna la ruta pública ("/uploads/proveedor/cottonext/xxx.png").
 */
export async function downloadImage(url) {
  if (!url) return null;
  await ensureDir();

  // Nombre determinista basado en la URL
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase().slice(0, 4);
  const filename = `${hash}.${ext}`;
  const filepath = path.join(IMAGES_DIR, filename);
  const publicUrl = `/uploads/proveedor/cottonext/${filename}`;

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
    console.error(`[cottonext] download failed for ${url}:`, e.message);
    return null;
  }
}

/**
 * Descarga múltiples imágenes en paralelo con límite de concurrencia.
 */
export async function downloadImagesBatch(urls, concurrency = 4) {
  const results = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    // eslint-disable-next-line no-await-in-loop
    const rs = await Promise.all(chunk.map(downloadImage));
    results.push(...rs.filter(Boolean));
  }
  return results;
}
