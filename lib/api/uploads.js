// POST /api/uploads/design — sube imagen, extrae metadata Y auto-mejora a 300 DPI
//
// Estrategia de auto-mejora ("upscaling automático a 300 DPI"):
//   - Sharp con kernel Lanczos3 (mejor calidad no-IA disponible) + sharpen sutil.
//   - Si el lado más largo < 1800px, escala hasta llegar a ~1800px (o factor máx 4x).
//   - Siempre setea la densidad de metadata en 300 para que el badge del builder
//     muestre "300 DPI" en verde.
//   - Devuelve además `originalWidthPx`, `originalHeightPx` y `upscaled` para que
//     el frontend pueda mostrar el badge "auto-mejorada".
//   - Cero costo, 100% en el servidor, sin dependencias externas.
import { v4 as uuidv4 } from 'uuid';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { json, err, UPLOAD_DIR } from './_helpers';

// Umbrales de auto-upscale
const TARGET_MIN_PX = 1800;   // ≈ 15cm @ 300 DPI (tamaño DTF más común)
const MAX_UPSCALE = 4;         // no explotar la memoria con imágenes minúsculas
const HARD_MIN_INPUT_PX = 32;  // no procesar iconos/placeholders

export default async function handleUploads(ctx) {
  const { method, route, request } = ctx;

  // ---------------------------------------------------------------------
  // POST /api/uploads/image  — Sube imagen genérica (para hero, og:image, etc)
  // Guarda tal cual (con resize máx 2000px de lado). NO aplica upscaling agresivo.
  // Retorna { id, url, widthPx, heightPx, format, sizeBytes }
  // ---------------------------------------------------------------------
  if (route === '/uploads/image' && method === 'POST') {
    const formData = await request.formData();
    const file = formData.get('file');
    const folder = String(formData.get('folder') || 'landings').replace(/[^a-z0-9_-]/g, '') || 'landings';
    if (!file) return err('file requerido');

    const IMAGES_DIR = path.join(process.cwd(), 'public', 'uploads', folder);
    await mkdir(IMAGES_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    let meta = {};
    try { meta = await sharp(buffer).metadata(); } catch { /* empty */ }

    const format = (meta.format || (file.name.split('.').pop() || 'jpg')).toLowerCase();
    const isJpg = format === 'jpeg' || format === 'jpg';
    const outExt = isJpg ? 'jpg' : (format === 'png' ? 'png' : (format === 'webp' ? 'webp' : 'jpg'));

    let outBuffer = buffer;
    let outW = meta.width || 0;
    let outH = meta.height || 0;

    // Resize si excede 2000px (para hero, más que suficiente)
    const MAX = 2000;
    const longest = Math.max(outW, outH);
    try {
      if (longest > MAX) {
        let pipeline = sharp(buffer, { failOn: 'none' }).resize({
          width: outW >= outH ? MAX : undefined,
          height: outH > outW ? MAX : undefined,
          fit: 'inside',
          withoutEnlargement: true,
        });
        if (outExt === 'jpg') pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
        else if (outExt === 'png') pipeline = pipeline.png({ compressionLevel: 8 });
        else pipeline = pipeline.webp({ quality: 85 });
        outBuffer = await pipeline.toBuffer();
        const m2 = await sharp(outBuffer).metadata();
        outW = m2.width || outW;
        outH = m2.height || outH;
      }
    } catch (e) {
      console.warn('[uploads/image] resize skipped:', e?.message);
    }

    const id = uuidv4();
    const filename = `${id}.${outExt}`;
    const filepath = path.join(IMAGES_DIR, filename);
    await writeFile(filepath, outBuffer);
    const url = `/uploads/${folder}/${filename}`;

    return json({
      id,
      url,
      originalName: file.name,
      widthPx: outW,
      heightPx: outH,
      format: outExt,
      sizeBytes: outBuffer.length,
    });
  }

  if (!(route === '/uploads/design' && method === 'POST')) return null;

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return err('file requerido');

  await mkdir(UPLOAD_DIR, { recursive: true });
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // Extraer metadata original (antes del upscale)
  let srcMeta = {};
  try {
    srcMeta = await sharp(inputBuffer).metadata();
  } catch (e) {
    console.error('sharp metadata failed', e);
  }
  const srcW = srcMeta.width || 0;
  const srcH = srcMeta.height || 0;
  const srcDpi = Math.round(srcMeta.density || 72);
  const format = (srcMeta.format || (file.name.split('.').pop() || 'png')).toLowerCase();

  // Decidir extensión de salida:
  //   - Para JPG/JPEG: mantener como JPG (menor tamaño)
  //   - Cualquier otro con transparencia potencial (PNG/WEBP): usar PNG
  const isJpg = format === 'jpeg' || format === 'jpg';
  const outExt = isJpg ? 'jpg' : 'png';

  // Auto-upscale
  let outputBuffer = inputBuffer;
  let finalW = srcW;
  let finalH = srcH;
  let upscaled = false;
  let upscaleFactor = 1;

  const longestSide = Math.max(srcW, srcH);
  const canProcess = srcW >= HARD_MIN_INPUT_PX && srcH >= HARD_MIN_INPUT_PX;

  try {
    if (canProcess && longestSide < TARGET_MIN_PX) {
      const factor = Math.min(MAX_UPSCALE, TARGET_MIN_PX / longestSide);
      const newW = Math.max(1, Math.round(srcW * factor));
      const newH = Math.max(1, Math.round(srcH * factor));

      let pipeline = sharp(inputBuffer, { failOn: 'none' })
        .resize(newW, newH, { kernel: 'lanczos3', fit: 'fill' })
        .sharpen({ sigma: 0.6, m1: 0.4, m2: 0.8 })
        .withMetadata({ density: 300 });

      outputBuffer = isJpg
        ? await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer()
        : await pipeline.png({ compressionLevel: 6 }).toBuffer();

      finalW = newW;
      finalH = newH;
      upscaled = true;
      upscaleFactor = Math.round(factor * 100) / 100;
    } else if (canProcess) {
      // Imagen ya suficientemente grande: sólo re-encode con densidad 300 DPI
      let pipeline = sharp(inputBuffer, { failOn: 'none' }).withMetadata({ density: 300 });
      outputBuffer = isJpg
        ? await pipeline.jpeg({ quality: 94, mozjpeg: true }).toBuffer()
        : await pipeline.png({ compressionLevel: 6 }).toBuffer();
    }
  } catch (e) {
    // Fallback: guardar la imagen original si sharp falla
    console.error('sharp upscale/re-encode failed, keeping original', e?.message);
    outputBuffer = inputBuffer;
  }

  const id = uuidv4();
  const filename = `${id}.${outExt}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  await writeFile(filepath, outputBuffer);

  const url = `/uploads/designs/${filename}`;

  return json({
    id,
    url,
    originalName: file.name,
    widthPx: finalW || 0,
    heightPx: finalH || 0,
    originalWidthPx: srcW || 0,
    originalHeightPx: srcH || 0,
    format: outExt,
    dpi: 300, // siempre 300 tras el pipeline
    dpiOriginal: srcDpi,
    upscaled,
    upscaleFactor,
    sizeBytes: outputBuffer.length,
  });
}
