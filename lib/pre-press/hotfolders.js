// ============================================================================
// Hot Folders — gestión de directorios locales por impresora/tecnología
//
// Estructura convencional:
//   /app/hot_folders/
//     epson_r1390/       ← DTF Textil 31cm (Epson)
//     prestige_r2_pro/   ← DTF Textil 33cm (Prestige)
//     dtf_uv/            ← DTF UV Rígidos
//     <printer_code>/    ← cualquier impresora nueva creada dinámicamente
//
// El path base es configurable con env `HOT_FOLDERS_BASE`, por defecto
// `/app/hot_folders`. Cada archivo exportado se llama:
//   <orderNumber>_<gangSheetId8>.png    (ej: DLV-2025-000200_a3f9b1e2.png)
//
// El pipeline es simple:
//   1) genera el PNG en memoria (buffer)
//   2) escribe el archivo en el hot folder correspondiente
//   3) crea un registro auditable en `pre_press_exports` con el path completo
// ============================================================================
import path from 'path';
import fs from 'fs/promises';

export const HOT_FOLDERS_BASE =
  process.env.HOT_FOLDERS_BASE || path.join(process.cwd(), 'hot_folders');

/**
 * Sanitiza el `printerCode` para usarlo como nombre de carpeta.
 * Solo alfanuméricos y guion bajo.
 */
export function sanitizePrinterCode(code) {
  return String(code || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 60);
}

/**
 * Devuelve el path absoluto del hot folder para una impresora, creándolo si no existe.
 */
export async function ensureHotFolder(printerCode) {
  const clean = sanitizePrinterCode(printerCode);
  const dir = path.join(HOT_FOLDERS_BASE, clean);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Construye el nombre de archivo de salida para un gang sheet.
 */
export function buildOutputName({ orderNumber, gangSheetId, ext = 'png' }) {
  const short = String(gangSheetId || '').slice(0, 8);
  const safeOrder = String(orderNumber || 'noorder').replace(/[^\w.-]+/g, '_');
  return `${safeOrder}_${short}.${ext}`;
}

/**
 * Escribe el buffer al hot folder de la impresora y devuelve metadata útil.
 */
export async function writeToHotFolder({ printerCode, orderNumber, gangSheetId, buffer, ext = 'png' }) {
  const dir = await ensureHotFolder(printerCode);
  const filename = buildOutputName({ orderNumber, gangSheetId, ext });
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, buffer);
  const st = await fs.stat(abs);
  return {
    absPath: abs,
    filename,
    dir,
    printerCode: sanitizePrinterCode(printerCode),
    size: st.size,
  };
}

/**
 * Lista los archivos actualmente presentes en el hot folder de una impresora.
 */
export async function listHotFolder(printerCode) {
  const dir = path.join(HOT_FOLDERS_BASE, sanitizePrinterCode(printerCode));
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => {
          const abs = path.join(dir, e.name);
          const st = await fs.stat(abs);
          return { name: e.name, size: st.size, modifiedAt: st.mtime };
        })
    );
    files.sort((a, b) => (b.modifiedAt > a.modifiedAt ? 1 : -1));
    return { dir, files };
  } catch (e) {
    if (e.code === 'ENOENT') return { dir, files: [] };
    throw e;
  }
}
