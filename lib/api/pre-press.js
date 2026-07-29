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

    // (M2) Actualiza también el PRODUCTION_QUEUE con fileUrl para que el Kanban muestre indicador
    await db.collection(COLLECTIONS.PRODUCTION_QUEUE).updateOne(
      { id: gs.id },
      { $set: { fileUrl: `/api/pre-press/file?id=${record.id}`, fileStatus: 'ready' } },
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
      // (M4) Protección contra duplicados: si ya fue exportado, retornar el registro existente
      if (gs.exportStatus === 'sent_to_hotfolder' && gs.hotFolderPath) {
        const existing = await db.collection(EXPORT_COLL).findOne({ gangSheetId: gs.id, status: 'sent_to_hotfolder' }, { sort: { createdAt: -1 } });
        return json({ ok: true, alreadyExported: true, export: existing ? strip(existing) : null });
      }
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
      // (M4) Protección contra duplicados en export por orderId
      if (gs.exportStatus === 'sent_to_hotfolder' && gs.hotFolderPath) {
        const existing = await db.collection(EXPORT_COLL).findOne({ gangSheetId: gs.id, status: 'sent_to_hotfolder' }, { sort: { createdAt: -1 } });
        results.push({ ok: true, alreadyExported: true, export: existing ? strip(existing) : null });
        continue;
      }
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

  // ── DELETE EXPORT (cancelar/eliminar un trabajo) ───────────────────────
  if (route.startsWith('/pre-press/exports/') && route.endsWith('/delete') && method === 'DELETE') {
    const id = route.split('/')[3];
    if (!id) return err('id requerido', 400);
    const rec = await db.collection(EXPORT_COLL).findOne({ id });
    if (!rec) return err('export no encontrado', 404);
    // Intentar borrar el archivo físico (hot folder / local)
    if (rec.absPath) {
      try { await fs.unlink(rec.absPath).catch(() => {}); } catch { /* noop */ }
    }
    if (rec.hotFolderPath && rec.hotFolderPath !== rec.absPath) {
      try { await fs.unlink(rec.hotFolderPath).catch(() => {}); } catch { /* noop */ }
    }
    // Limpiar referencia en el gang sheet
    if (rec.gangSheetId) {
      await db.collection(COLLECTIONS.GANG_SHEETS).updateOne(
        { id: rec.gangSheetId },
        { $set: { exportStatus: 'deleted', exportedPngUrl: null, hotFolderPath: null, exportedAt: null } },
      );
    }
    await db.collection(EXPORT_COLL).deleteOne({ id });
    return json({ ok: true, id });
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

  // ── SCAN HOT FOLDERS (monitoreo RIP) ───────────────────────────────────
  // (M6) Escanea los hot folders y actualiza el estado de los archivos
  // que ya no existen (consumidos por el software RIP)
  if (route === '/pre-press/scan' && method === 'POST') {
    try {
      const printers = await db.collection(COLLECTIONS.PRINTERS).find({ active: true }).toArray();
      let scanned = 0, consumed = 0, stillPresent = 0;

      for (const printer of printers) {
        const code = printer.code;
        const folder = path.join(HOT_FOLDERS_BASE, code);
        try {
          const entries = await fs.readdir(folder);
          const existingFilenames = new Set(entries);

          // Buscar todas las exportaciones de esta impresora
          const exports = await db.collection(EXPORT_COLL).find({
            printerCode: code,
            status: 'sent_to_hotfolder',
          }).toArray();

          for (const exp of exports) {
            scanned += 1;
            if (exp.filename && !existingFilenames.has(exp.filename)) {
              // Archivo ya no existe en el hot folder = consumido por el RIP
              await db.collection(EXPORT_COLL).updateOne(
                { id: exp.id },
                { $set: { status: 'consumed_by_rip', consumedAt: new Date() } }
              );
              consumed += 1;
            } else {
              stillPresent += 1;
            }
          }
        } catch {
          // Hot folder no existe o no es accesible
        }
      }

      return json({ ok: true, scanned, consumed, stillPresent });
    } catch (e) {
      return err(`Error al escanear: ${e.message}`, 500);
    }
  }

  // ── REGENERATE ALL HOT FOLDERS ─────────────────────────────────────────
  // (M5) Regenera todos los gang sheets pendientes de exportar
  if (route === '/pre-press/regenerate-all' && method === 'POST') {
    try {
      // Busca todos los gang sheets que tienen orderId pero no han sido exportados
      const sheets = await db.collection(COLLECTIONS.GANG_SHEETS).find({
        orderId: { $exists: true, $ne: null },
        exportStatus: { $nin: ['sent_to_hotfolder', 'deleted'] },
      }).toArray();

      let exported = 0, skipped = 0, failed = 0;
      for (const gs of sheets) {
        const order = gs.orderId ? await db.collection(COLLECTIONS.ORDERS).findOne({ id: gs.orderId }) : null;
        // Idempotente: si el archivo físico existe, saltar
        if (gs.hotFolderPath) {
          try {
            await fs.access(gs.hotFolderPath);
            skipped += 1;
            continue;
          } catch { /* archivo no existe, regenerar */ }
        }
        const res = await exportOne(db, gs, { orderNumber: order?.orderNumber });
        if (res.ok) exported += 1;
        else failed += 1;
      }

      return json({ ok: true, total: sheets.length, exported, skipped, failed });
    } catch (e) {
      return err(`Error al regenerar: ${e.message}`, 500);
    }
  }

  return null;
}

// Path alias for orderNumber (kept internally)
export { exportOne };
