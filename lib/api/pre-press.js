// ============================================================================
// /api/pre-press/*  — Zero-Click Pre-Prensa (renderiza gang sheets a hot folders)
//
// Endpoints:
//   GET  /api/pre-press/status             → { hotFoldersBase, exportsToday, totalExports, foldersHealth[] }
//   GET  /api/pre-press/exports?limit=50   → últimos exports registrados
//   POST /api/pre-press/export             → { gangSheetId? | orderId? } exporta uno/varios
//   POST /api/pre-press/exports/:id/retry  → reintenta un export previo (por id o gangSheetId)
//   GET  /api/pre-press/file?id=<exportId> → descarga el PNG generado (stream)
//   GET  /api/pre-press/folder/:code       → lista archivos actualmente en el hot folder
// ============================================================================
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { renderGangSheet } from '@/lib/pre-press/exporter';
import { HOT_FOLDERS_BASE, writeToHotFolder, listHotFolder, sanitizePrinterCode } from '@/lib/pre-press/hotfolders';

const EXPORT_COLL = 'pre_press_exports';

/**
 * Exporta un único gang sheet: renderiza + escribe hot folder + registra log.
 * Retorna { ok, export?, error? }.
 */
async function exportOne(db, gs, { orderNumber, printerCode: overrideCode } = {}) {
  if (!gs) return { ok: false, error: 'gang_sheet no encontrado' };

  const printerCode = overrideCode || gs.printerTarget || 'unknown';
  const now = new Date();

  try {
    const { buffer, widthPx, heightPx, widthMm, heightMm, dpi } = await renderGangSheet(gs);
    const wrote = await writeToHotFolder({
      printerCode,
      orderNumber: orderNumber || gs.orderId || 'draft',
      gangSheetId: gs.id,
      buffer,
    });

    const record = {
      id: uuidv4(),
      gangSheetId: gs.id,
      orderId: gs.orderId || null,
      orderNumber: orderNumber || null,
      printerCode: wrote.printerCode,
      filename: wrote.filename,
      absPath: wrote.absPath,
      widthPx, heightPx,
      widthMm, heightMm,
      dpi,
      fileSize: wrote.size,
      status: 'sent_to_hotfolder',
      error: null,
      createdAt: now,
    };
    await db.collection(EXPORT_COLL).insertOne(record);

    // Actualiza el gang sheet con estado y path
    await db.collection(COLLECTIONS.GANG_SHEETS).updateOne(
      { id: gs.id },
      {
        $set: {
          exportedPngUrl: `/api/pre-press/file?id=${record.id}`,
          exportStatus: 'sent_to_hotfolder',
          hotFolderPath: wrote.absPath,
          exportedAt: now,
        },
      }
    );

    return { ok: true, export: strip(record) };
  } catch (e) {
    // Registrar fallo para diagnóstico
    const failRec = {
      id: uuidv4(),
      gangSheetId: gs.id,
      orderId: gs.orderId || null,
      orderNumber: orderNumber || null,
      printerCode: sanitizePrinterCode(printerCode),
      filename: null,
      absPath: null,
      widthPx: null, heightPx: null,
      widthMm: null, heightMm: null,
      dpi: null,
      fileSize: null,
      status: 'failed',
      error: e.message || String(e),
      createdAt: now,
    };
    await db.collection(EXPORT_COLL).insertOne(failRec).catch(() => {});
    console.warn('[pre-press] export failed:', e.message);
    return { ok: false, error: e.message, export: strip(failRec) };
  }
}

/**
 * Dispatcher auto-invocable desde otros módulos (production.js) al pasar
 * un ítem a 'printing'. Best-effort — nunca lanza.
 */
export async function autoExportForOrder(db, orderId) {
  if (!orderId) return { attempts: 0 };
  try {
    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id: orderId });
    const sheets = await db.collection(COLLECTIONS.GANG_SHEETS).find({ orderId }).toArray();
    let attempts = 0;
    for (const gs of sheets) {
      // Idempotente: si ya se exportó, no lo repetimos
      if (gs.exportStatus === 'sent_to_hotfolder' && gs.hotFolderPath) continue;
      await exportOne(db, gs, { orderNumber: order?.orderNumber });
      attempts += 1;
    }
    return { attempts };
  } catch (e) {
    console.warn('[pre-press] autoExportForOrder failed:', e.message);
    return { attempts: 0, error: e.message };
  }
}

export default async function handlePrePress(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/pre-press')) return null;

  // ── STATUS ─────────────────────────────────────────────────────────────
  if (route === '/pre-press/status' && method === 'GET') {
    const printers = await db.collection(COLLECTIONS.PRINTERS).find({ active: true }).toArray();
    const foldersHealth = await Promise.all(
      printers.map(async (p) => {
        const info = await listHotFolder(p.code);
        return {
          printerCode: p.code,
          printerLabel: p.label || p.name,
          dir: info.dir,
          fileCount: info.files.length,
        };
      })
    );
    const totalExports = await db.collection(EXPORT_COLL).countDocuments();
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const exportsToday = await db.collection(EXPORT_COLL).countDocuments({ createdAt: { $gte: midnight } });
    return json({ hotFoldersBase: HOT_FOLDERS_BASE, totalExports, exportsToday, foldersHealth });
  }

  // ── LIST EXPORTS ───────────────────────────────────────────────────────
  if (route === '/pre-press/exports' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const rows = await db.collection(EXPORT_COLL).find({}).sort({ createdAt: -1 }).limit(limit).toArray();
    return json(strip(rows));
  }

  // ── EXPORT (manual) ────────────────────────────────────────────────────
  if (route === '/pre-press/export' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { gangSheetId, orderId } = body || {};

    if (!gangSheetId && !orderId) return err('Debes indicar gangSheetId o orderId');

    if (gangSheetId) {
      const gs = await db.collection(COLLECTIONS.GANG_SHEETS).findOne({ id: gangSheetId });
      if (!gs) return err('gang_sheet no encontrado', 404);
      const order = gs.orderId ? await db.collection(COLLECTIONS.ORDERS).findOne({ id: gs.orderId }) : null;
      const res = await exportOne(db, gs, { orderNumber: order?.orderNumber });
      if (!res.ok) return err(res.error || 'export failed', 500);
      return json(res);
    }

    // orderId → exportar todos los gang sheets del pedido
    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id: orderId });
    if (!order) return err('pedido no encontrado', 404);
    const sheets = await db.collection(COLLECTIONS.GANG_SHEETS).find({ orderId }).toArray();
    if (!sheets.length) return err('el pedido no tiene gang sheets asociados', 404);

    const results = [];
    for (const gs of sheets) {
      const r = await exportOne(db, gs, { orderNumber: order.orderNumber });
      results.push(r);
    }
    return json({ ok: true, count: results.length, exports: results });
  }

  // ── RETRY (por export id) ──────────────────────────────────────────────
  if (route.startsWith('/pre-press/exports/') && route.endsWith('/retry') && method === 'POST') {
    const id = route.split('/')[3];
    const prev = await db.collection(EXPORT_COLL).findOne({ id });
    if (!prev) return err('export no encontrado', 404);
    const gs = await db.collection(COLLECTIONS.GANG_SHEETS).findOne({ id: prev.gangSheetId });
    if (!gs) return err('gang_sheet ya no existe', 404);
    const order = gs.orderId ? await db.collection(COLLECTIONS.ORDERS).findOne({ id: gs.orderId }) : null;
    const res = await exportOne(db, gs, { orderNumber: order?.orderNumber });
    if (!res.ok) return err(res.error || 'retry failed', 500);
    return json(res);
  }

  // ── DOWNLOAD FILE ──────────────────────────────────────────────────────
  if (route === '/pre-press/file' && method === 'GET') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return err('id requerido');
    const rec = await db.collection(EXPORT_COLL).findOne({ id });
    if (!rec || !rec.absPath) return err('archivo no encontrado', 404);
    try {
      const buf = await fs.readFile(rec.absPath);
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `inline; filename="${rec.filename}"`,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch (e) {
      return err(`no se pudo leer el archivo: ${e.message}`, 500);
    }
  }

  // ── LIST FOLDER ────────────────────────────────────────────────────────
  if (route.startsWith('/pre-press/folder/') && method === 'GET') {
    const code = route.split('/')[3];
    if (!code) return err('printer code requerido');
    const info = await listHotFolder(code);
    return json({
      printerCode: sanitizePrinterCode(code),
      dir: info.dir,
      count: info.files.length,
      files: info.files,
    });
  }

  return null;
}

// Path alias for orderNumber (kept internally)
export { exportOne };
