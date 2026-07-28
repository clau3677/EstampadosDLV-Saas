// /app/lib/api/import/cottonext.js
// -------------------------------------------------------------------------
// Endpoints /api/import/cottonext/*
// Escaneo e importación del catálogo del proveedor Cottonext.
// -------------------------------------------------------------------------
import { COLLECTIONS } from '@/lib/models';
import { scanCatalog, scrapeProduct } from '@/lib/import/cottonext';
import {
  json, err, strip, uuidv4,
  applyMarkup,
  importWithRaceProtection,
  refreshPricesGeneric,
  historyHandler,
  importedListHandler,
  syncInventoryHandler,
  cronSettingsGet, cronSettingsPost, cronPrecheck,
} from './_shared';

const SUPPLIER          = 'cottonext';
const SCAN_COLLECTION   = 'cottonext_scans';
const HISTORY_COLLECTION = 'cottonext_imports';
const SETTINGS_KEY      = 'cottonext_cron_enabled';
const CRON_SCHEDULE     = '15 3 * * *';                       // 03:15 UTC = 00:15 Chile
const CRON_HUMAN        = 'Diariamente a las 00:15 hrs Chile';

export default async function handleCottonext(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/import/cottonext/')) return null;

  // -----------------------------------------------------------------------
  // POST /api/import/cottonext/scan
  // Body: { from?: 1, to?: 100, force?: false }
  // Escanea el rango, guarda en cache y retorna preview.
  // Duración: ~40-60s para 100 IDs (rate limit 400ms cada uno).
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/scan' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const from = Math.max(1, parseInt(body.from || 1, 10));
    const to   = Math.min(300, parseInt(body.to || 100, 10));
    if (to <= from) return err('rango inválido');

    // Ver si tenemos un scan reciente (últimos 30 min) para evitar re-scan innecesario
    if (!body.force) {
      const recent = await db.collection(SCAN_COLLECTION).findOne(
        { createdAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) } },
        { sort: { createdAt: -1 } }
      );
      if (recent && recent.rangeFrom === from && recent.rangeTo === to) {
        return json({
          scanId: recent.id,
          products: recent.products,
          cached: true,
          scannedAt: recent.createdAt,
        });
      }
    }

    // Escanear en vivo
    const items = await scanCatalog({ from, to, delayMs: 350 });

    // Marcar productos que ya existen en nuestra BD (por supplierProductId)
    const existingIds = new Set();
    if (items.length) {
      const rows = await db.collection(COLLECTIONS.PRODUCTS).find({
        supplier: SUPPLIER,
        supplierProductId: { $in: items.map(i => String(i.supplierProductId)) },
      }, { projection: { supplierProductId: 1, supplierPrice: 1, basePrice: 1 } }).toArray();
      rows.forEach(r => existingIds.add(String(r.supplierProductId)));
    }

    // Preview compacto (sin descripción larga)
    const products = items.map(it => ({
      supplierProductId: it.supplierProductId,
      supplierUrl: it.supplierUrl,
      supplierBrand: it.supplierBrand,
      supplierCode: it.supplierCode,
      shortName: it.shortName,
      fullName: it.fullName,
      subcategory: it.subcategory,
      priceUnit: it.priceUnit,
      priceWholesale: it.priceWholesale,
      finalPrice: applyMarkup(it.priceWholesale || it.priceUnit, 40),
      previewImage: it.images[0] || null, // URL remota del proveedor (thumbnail)
      totalImages: it.images.length,
      variantsCount: it.variants.length,
      colorsCount: new Set(it.variants.map(v => v.color)).size,
      sizesCount: new Set(it.variants.map(v => v.size)).size,
      hasStock: it.hasStock,
      alreadyImported: existingIds.has(it.supplierProductId),
    }));

    const scanId = uuidv4();
    await db.collection(SCAN_COLLECTION).insertOne({
      id: scanId,
      rangeFrom: from,
      rangeTo: to,
      products,
      _fullItems: items, // ítems completos para no re-scrapear al importar
      createdAt: new Date(),
    });

    return json({ scanId, products, cached: false, count: products.length });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/cottonext/import
  // Body: { scanId, selectedIds: string[], markupPercent?: 40, paraphrase?: true }
  // Importa los productos seleccionados. Idempotente (upsert).
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/import' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { scanId, selectedIds, markupPercent = 40, paraphrase = true } = body;

    if (!scanId) return err('scanId requerido');
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return err('Selecciona al menos 1 producto');
    }
    const selectedSet = new Set(selectedIds.map(String));

    // Recuperar el scan
    const scan = await db.collection(SCAN_COLLECTION).findOne({ id: scanId });
    if (!scan) return err('scan no encontrado o expirado. Vuelve a escanear.', 404);

    const items = (scan._fullItems || []).filter(it => selectedSet.has(String(it.supplierProductId)));
    if (items.length === 0) return err('ninguno de los IDs seleccionados está en el scan');

    const stats = await importWithRaceProtection({
      db,
      items,
      supplierName: SUPPLIER,
      markupPercent,
      paraphrase,
      extractSourceVariants: (item) => item.variants || [],
    });

    // Guardar registro histórico
    await db.collection(HISTORY_COLLECTION).insertOne({
      id: uuidv4(),
      scanId,
      markupPercent,
      paraphrase,
      stats,
      createdAt: new Date(),
    });

    return json({ ok: true, ...stats });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/cottonext/refresh-prices
  // Actualiza SOLO precios (basePrice + variants[].price) de productos importados,
  // re-scrapeando cada uno del proveedor. NO cambia descripciones ni imágenes.
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/refresh-prices' && method === 'POST') {
    return refreshPricesGeneric({
      db,
      supplierName: SUPPLIER,
      historyCollection: HISTORY_COLLECTION,
      scrapeSingleFn: (supplierProductId) => scrapeProduct(parseInt(supplierProductId, 10)),
      delayMs: 350,
    });
  }

  // -----------------------------------------------------------------------
  // GET /api/import/cottonext/history — últimos 20 registros
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/history' && method === 'GET') {
    return historyHandler(db, HISTORY_COLLECTION);
  }

  // -----------------------------------------------------------------------
  // GET /api/import/cottonext/imported — lista productos ya importados
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/imported' && method === 'GET') {
    return importedListHandler(db, SUPPLIER);
  }

  // -----------------------------------------------------------------------
  // POST /api/import/cottonext/sync-inventory
  // Crea registros commercial_stock faltantes para productos ya importados.
  // Idempotente: no sobrescribe stock existente.
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/sync-inventory' && method === 'POST') {
    return syncInventoryHandler(db, SUPPLIER);
  }

  // -----------------------------------------------------------------------
  // Cron settings + precheck
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/cron/settings' && method === 'GET') {
    return cronSettingsGet({
      db, settingsKey: SETTINGS_KEY, historyCollection: HISTORY_COLLECTION,
      schedule: CRON_SCHEDULE, humanSchedule: CRON_HUMAN,
    });
  }
  if (route === '/import/cottonext/cron/settings' && method === 'POST') {
    return cronSettingsPost({ db, request, settingsKey: SETTINGS_KEY });
  }
  if (route === '/import/cottonext/cron/precheck' && method === 'GET') {
    return cronPrecheck({ db, settingsKey: SETTINGS_KEY });
  }

  return null;
}

export const strip_unused = strip; // silencia warning si algún import queda sin uso
