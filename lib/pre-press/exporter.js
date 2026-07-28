// ============================================================================
// Pre-Press Exporter — Zero-Click PNG/TIFF generator con Sharp
//
// Toma un `gang_sheet` (con designs posicionados en mm) y genera un PNG
// transparente a 300 DPI listo para el hot folder del RIP (Digital Factory,
// Cadlink, etc.). Todo el proceso es 100% local — no depende de servicios
// externos.
//
// Convención de tamaños:
//   canvasWidthCm  →  ancho en cm (ej 31, 33, 60)
//   canvasLengthMm →  largo en mm (calculado desde el diseño)
//   DPI            →  300 (estándar DTF/DTF UV)
//
// Cada diseño lleva xMm, yMm, widthMm, heightMm, rotation (°), imageUrl.
// imageUrl puede ser:
//   - "/uploads/designs/<uuid>.png"  → lee de /app/public/uploads/designs/
//   - "data:image/png;base64,..."     → decodifica base64
//   - "http(s)://..."                 → fetch
// ============================================================================
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';

export const DPI = 300;

/** Convierte mm → píxeles a la DPI configurada */
export const mmToPx = (mm, dpi = DPI) => Math.round((Number(mm) || 0) * dpi / 25.4);

/**
 * Resuelve el `imageUrl` de un design a un Buffer con los bytes de la imagen.
 * Soporta rutas locales, data URLs y URLs remotas.
 */
export async function resolveImageBuffer(imageUrl) {
  if (!imageUrl) throw new Error('imageUrl vacío');

  // data:image/...;base64,XXXX
  if (imageUrl.startsWith('data:')) {
    const comma = imageUrl.indexOf(',');
    if (comma < 0) throw new Error('data URL malformada');
    const b64 = imageUrl.slice(comma + 1);
    return Buffer.from(b64, 'base64');
  }

  // URL absoluta
  if (/^https?:\/\//.test(imageUrl)) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`fetch ${imageUrl}: ${res.status}`);
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  // Ruta local relativa a /app/public
  const rel = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
  const abs = path.join(process.cwd(), 'public', rel);
  return fs.readFile(abs);
}

/**
 * Renderiza un design (Buffer + metadata) a un Buffer PNG con las dimensiones
 * pixel exactas requeridas y aplica rotación si corresponde.
 * 
 * (Q) Si la imagen fuente tiene DPI efectivo < 300, aplica upscaling inteligente
 * con lanczos3 antes de redimensionar para mejorar la calidad de impresión.
 */
async function renderDesign(buf, { widthPx, heightPx, rotation = 0 }) {
  // (Q) Pre-upscaling: si la imagen fuente es pequeña para las dimensiones destino,
  // la escalamos primero con lanczos3 para preservar calidad
  let srcSharp = sharp(buf, { limitInputPixels: false });
  const srcMeta = await srcSharp.metadata();
  const srcW = srcMeta.width || 0;
  const srcH = srcMeta.height || 0;

  // Escalar primero si los píxeles destino superan significativamente los de la fuente
  // (umbral: 1.5x → indica que DPI efectivo sería < ~200)
  const upscaleRatio = Math.max(widthPx / Math.max(srcW, 1), heightPx / Math.max(srcH, 1));
  if (upscaleRatio > 1.5) {
    srcSharp = srcSharp.resize(Math.max(srcW, widthPx), Math.max(srcH, heightPx), {
      fit: 'inside',
      kernel: 'lanczos3',
    });
  }

  // Redimensiona a las dimensiones destino (fit=fill para respetar mm exactos)
  let pipe = srcSharp
    .resize(widthPx, heightPx, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true });

  if (rotation && Math.abs(rotation) % 360 !== 0) {
    // rotate() amplía el bounding box si es necesario (background transparente)
    pipe = pipe.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  return pipe.toBuffer();
}

/**
 * Genera el PNG del gang sheet completo.
 * @param {Object} gs      documento gang_sheet con { canvasWidthCm, canvasLengthMm, designs[], type }
 * @param {Object} [opts]  { dpi }
 * @returns {Promise<{ buffer: Buffer, widthPx, heightPx, widthMm, heightMm, dpi }>}
 */
export async function renderGangSheet(gs, opts = {}) {
  const dpi = opts.dpi || DPI;
  const widthMm = (Number(gs.canvasWidthCm) || 33) * 10;
  const heightMm = Number(gs.canvasLengthMm) || 300;
  const widthPx = mmToPx(widthMm, dpi);
  const heightPx = mmToPx(heightMm, dpi);

  // Canvas transparente base
  const base = sharp({
    create: {
      width: widthPx,
      height: heightPx,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  // Prepara todas las capas en paralelo
  const composites = await Promise.all(
    (gs.designs || []).map(async (d) => {
      const src = await resolveImageBuffer(d.imageUrl);
      const wPx = mmToPx(d.widthMm, dpi);
      const hPx = mmToPx(d.heightMm, dpi);
      const rendered = await renderDesign(src, {
        widthPx: wPx,
        heightPx: hPx,
        rotation: d.rotation || 0,
      });
      // Después de rotar, el bounding box puede ser mayor: leemos las nuevas dims
      const meta = await sharp(rendered).metadata();
      const finalW = meta.width || wPx;
      const finalH = meta.height || hPx;
      // Centro deseado: (xMm + widthMm/2, yMm + heightMm/2)
      // Top-left del bbox rotado = centro - finalDims/2
      const centerXpx = mmToPx(d.xMm + d.widthMm / 2, dpi);
      const centerYpx = mmToPx(d.yMm + d.heightMm / 2, dpi);
      let top = Math.round(centerYpx - finalH / 2);
      let left = Math.round(centerXpx - finalW / 2);
      // Clamp para no exceder el canvas
      if (top < 0) top = 0;
      if (left < 0) left = 0;
      if (top + finalH > heightPx) top = Math.max(0, heightPx - finalH);
      if (left + finalW > widthPx) left = Math.max(0, widthPx - finalW);

      return { input: rendered, top, left };
    })
  );

  // (Q) Inyección forzada de 300 DPI en el PNG final para que el software RIP
  // lea correctamente la densidad de la imagen de pre-prensa
  const buffer = await base
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true, force: true })
    .withMetadata({ density: dpi })
    .toBuffer();

  return { buffer, widthPx, heightPx, widthMm, heightMm, dpi };
}
