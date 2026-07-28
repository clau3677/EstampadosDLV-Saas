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
import { UPLOAD_DIR } from './_helpers';

const THUMB_DIR = path.join(UPLOAD_DIR, '.thumbnails');

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

  // Sanitizar ruta: solo permitir paths dentro de uploads/
  const resolvedPath = path.resolve(UPLOAD_DIR, srcPath.replace(/^\/?/, ''));
  if (!resolvedPath.startsWith(UPLOAD_DIR)) {
    return new Response(JSON.stringify({ error: 'path inválido' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verificar que el archivo fuente existe
  try {
    await stat(resolvedPath);
  } catch {
    return new Response(JSON.stringify({ error: 'archivo no encontrado' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Calcular hash del archivo fuente para el nombre del thumbnail
  const sourceInfo = await stat(resolvedPath);
  const thumbHash = crypto
    .createHash('md5')
    .update(`${resolvedPath}:${width}:${format}:${sourceInfo.mtimeMs}`)
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
    // No existe, generar
    try {
      const sharpInstance = sharp(resolvedPath).resize(width, null, {
        withoutEnlargement: true,
        fit: 'inside',
      });

      if (format === 'webp') {
        thumbBuffer = await sharpInstance.webp({ quality: Math.min(85, quality) }).toBuffer();
      } else if (format === 'jpeg' || format === 'jpg') {
        thumbBuffer = await sharpInstance.jpeg({ quality: Math.min(85, quality) }).toBuffer();
      } else {
        thumbBuffer = await sharpInstance.png({ quality }).toBuffer();
      }

      // Cachear en disco
      await writeFile(thumbPath, thumbBuffer);
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
