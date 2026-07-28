// ============================================================================
// Trim transparent pixels de una imagen PNG.
// Utility client-side (usa Canvas API del navegador).
// Retorna { dataUrl, widthPx, heightPx, trimmedFromX, trimmedFromY,
//           originalWidthPx, originalHeightPx, savedPct }.
// ============================================================================

const ALPHA_THRESHOLD = 10; // píxeles con alpha < 10 se consideran transparentes

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Analiza una imagen y encuentra el bounding box de píxeles no transparentes.
 * @param {string} imageUrl - URL o dataURL de la imagen
 * @returns {Promise<Object|null>} datos del trim, o null si la imagen es 100% transparente
 */
export async function trimTransparentPixels(imageUrl) {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    // Tainted canvas (imagen de otro origen sin CORS) → no se puede trimear
    throw new Error('No se puede analizar la imagen (posible problema de CORS)');
  }
  const { data, width, height } = imageData;

  let minX = width, minY = height, maxX = -1, maxY = -1;

  // Escaneo por filas para encontrar el bbox de píxeles no-transparentes
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Imagen 100% transparente
  if (maxX < minX || maxY < minY) return null;

  const trimW = maxX - minX + 1;
  const trimH = maxY - minY + 1;

  // Si el trim es minúsculo (< 1% de píxeles ahorrados), no hacer nada
  const savedPct = 1 - (trimW * trimH) / (width * height);
  if (savedPct < 0.01) {
    return { skipped: true, savedPct };
  }

  // Recortar en un canvas nuevo
  const trimmed = document.createElement('canvas');
  trimmed.width = trimW;
  trimmed.height = trimH;
  const tctx = trimmed.getContext('2d');
  tctx.drawImage(canvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);

  return {
    skipped: false,
    dataUrl: trimmed.toDataURL('image/png'),
    widthPx: trimW,
    heightPx: trimH,
    trimmedFromX: minX,
    trimmedFromY: minY,
    originalWidthPx: width,
    originalHeightPx: height,
    savedPct,
  };
}

/**
 * Carga una imagen desde una dataURL en un HTMLImageElement (para Konva).
 * @param {string} dataUrl
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromDataUrl(dataUrl) {
  return loadImage(dataUrl);
}
