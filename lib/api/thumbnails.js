// /app/lib/api/thumbnails.js
// ============================================================================
// Thumbnails on-demand para la Biblioteca de Diseños.
//
// GET /api/thumbnails?src=<url-encoded-path>&w=200
//   - Lee la imagen fuente del disco con Sharp.
//   - Redimensiona a w píxeles (manteniendo aspect ratio, máx w).
//   - Convierte a WebP (compresión agresiva, ~10x menor que PNG original).
//   - Cachea en navegador con ETag + max-age=30d.
//   - Si ya existe el thumbnail en disco, lo sirve directamente (evita re-procesar).
//
// Uso en el frontend:
//   <img src={`/api/thumbnails?src=${encodeURIComponent(item.imageUrl)}&w=300`} />
//   → en lugar de: <img src={item.imageUrl} />
// ============================================================================
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';

// El base es /public/uploads (no /public/uploads/designs) para que
// resuelva cualquier subcarpeta: library/, designs/, marketing/, etc.
const UPLOADS_ROOT = path.join('/var/www/estampadosdlv', 'public', 'uploads');
const THUMB_DIR = path.join(UPLOADS_ROOT, '.thumbnails');
// Comparte una única generación por archivo/tamaño entre solicitudes concurrentes.
const pendingThumbs = new Map();

export default async function handleThumbnails(ctx) {
  const { method, route, request } = ctx;

  // GET /api/thumbnails?src=...&w=200&format=webp
  if (route !== '/thumbnails' || method !== 'GET') return null;

  const url = new URL(request.url);
  const srcPath = url.searchParams.get('src');
  const width = Math.min(800, Math.max(50, parseInt(url.searchParams.get('w') || '300', 10)));
  const format = (url.searchParams.get('format') || 'webp').toLowerCase();
  const quality = parseInt(url.searchParams.get('q') || '80', 10);

  if (!srcPath) {
    return new Response(JSON.stringify({ error: 'src requerido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Sanitizar ruta: el imageUrl viene como /uploads/library/... o library/...
  // Normalizar: quitar /uploads/ prefix si viene, luego resolver desde UPLOADS_ROOT
  let normalizedSrc = srcPath.replace(/^\/?/, '');
  if (normalizedSrc.startsWith('uploads/')) {
    normalizedSrc = normalizedSrc.slice(8); // quitar 'uploads/'
  }
  const resolvedPath = path.resolve(UPLOADS_ROOT, normalizedSrc);
  if (!resolvedPath.startsWith(UPLOADS_ROOT)) {
    return new Response(JSON.stringify({ error: 'path inválido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verificar que el archivo fuente existe y obtener sus metadatos en una sola llamada.
  let sourceInfo;
  try {
    sourceInfo = await stat(resolvedPath);
  } catch {
    return new Response(JSON.stringify({ error: 'archivo no encontrado' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Incluir calidad en la clave para que el caché nunca entregue una variante incorrecta.
  const thumbHash = crypto
    .createHash('md5')
    .update(`${resolvedPath}:${width}:${format}:${quality}:${sourceInfo.mtimeMs}:${sourceInfo.size}`)
    .digest('hex');

  const thumbExt = format === 'png' ? 'png' : (format === 'jpeg' || format === 'jpg' ? 'jpg' : 'webp');
  const thumbFileName = `thumb_${width}_${thumbHash}.${thumbExt}`;

  // Crear directorio de thumbnails si no existe
  await mkdir(THUMB_DIR, { recursive: true });
  const thumbPath = path.join(THUMB_DIR, thumbFileName);

  // Verificar si el thumbnail ya existe en disco
  let thumbBuffer;
  try {
    await stat(thumbPath);
    thumbBuffer = await readFile(thumbPath);
  } catch {
    // No existe: compartir la misma promesa si varias tarjetas piden el mismo thumb.
    let generation = pendingThumbs.get(thumbPath);
    if (!generation) {
      generation = (async () => {
        const sharpInstance = sharp(resolvedPath, { failOn: 'none', sequentialRead: true }).resize(width, null, {
          withoutEnlargement: true,
          fit: 'inside',
        });
        let buffer;
        if (format === 'webp') {
          buffer = await sharpInstance.webp({ quality: Math.min(85, quality) }).toBuffer();
        } else if (format === 'jpeg' || format === 'jpg') {
          buffer = await sharpInstance.jpeg({ quality: Math.min(85, quality) }).toBuffer();
        } else {
          buffer = await sharpInstance.png({ quality }).toBuffer();
        }
        await writeFile(thumbPath, buffer);
        return buffer;
      })().finally(() => pendingThumbs.delete(thumbPath));
      pendingThumbs.set(thumbPath, generation);
    }
    try {
      thumbBuffer = await generation;
    } catch (err) {
      console.error('[thumbnails] Error generando thumbnail:', err.message);
      return new Response(JSON.stringify({ error: 'error procesando imagen' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const contentType = format === 'webp' ? 'image/webp' : (format === 'png' ? 'image/png' : 'image/jpeg');

  return new Response(thumbBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=2592000, immutable', // 30 días
      'Content-Length': thumbBuffer.length.toString(),
    },
  });
}
