// /app/lib/api/import/treck.js
// -------------------------------------------------------------------------
// Endpoints /api/import/treck/*
// Escaneo e importación del catálogo Treck (VTEX Catalog Search API).
// Ropa de trabajo/técnica/ignifuga/outdoor.
// -------------------------------------------------------------------------
import { COLLECTIONS } from '@/lib/models';
import {
  scanCatalog as scanTreck,
  scanFullCatalog as scanFullTreck,
  scrapeSingle as scrapeTreck,
} from '@/lib/import/treck';
import {
  json, err, uuidv4,
  applyMarkup,
  importWithRaceProtection,
  refreshPricesGeneric,
  historyHandler,
  importedListHandler,
  syncInventoryHandler,
  cronSettingsGet, cronSettingsPost, cronPrecheck,
} from './_shared';

const SUPPLIER            = 'treck';
const SCAN_COLLECTION     = 'treck_scans';
const HISTORY_COLLECTION  = 'treck_imports';
const SETTINGS_KEY        = 'treck_cron_enabled';
const CRON_SCHEDULE       = '45 3 * * *';
const CRON_HUMAN          = 'Diariamente a las 00:45 hrs Chile';

// Hook para inyectar metadata extra específica de Treck en el doc del producto
function decorateTreckDoc(doc, item) {
  if (item.workwearType)   doc.workwearType   = item.workwearType;
  if (item.categoriesPath) doc.categoriesPath = item.categoriesPath;
}

export default async function handleTreck(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/import/treck/')) return null;

  // -----------------------------------------------------------------------
  // POST /api/import/treck/scan
  // { from?: 0, to?: 49, category?: 'vestuario', full?: false, force?: false }
  // full=true  → escanea TODO el catálogo (pagina automáticamente hasta el total)
  // full=false → escanea sólo el rango indicado (más rápido para preview)
  // -----------------------------------------------------------------------
  if (route === '/import/treck/scan' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const from = Math.max(0, parseInt(body.from ?? 0, 10));
    const to   = Math.max(from, parseInt(body.to ?? 49, 10));
    const category = String(body.category || 'vestuario');
    const fullScan = !!body.full;

    // Cache 30 min
    if (!body.force) {
      const recent = await db.collection(SCAN_COLLECTION).findOne(
        { createdAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) },
          rangeFrom: from, rangeTo: to, category, full: fullScan,
        },
        { sort: { createdAt: -1 } }
      );
      if (recent) {
        return json({
          scanId: recent.id,
          products: recent.products,
          cached: true,
          scannedAt: recent.createdAt,
          totalInCatalog: recent.totalInCatalog,
          count: recent.products.length,
        });
      }
    }

    let items = [];
    let totalInCatalog = 0;
    try {
      if (fullScan) {
        const r = await scanFullTreck({ category, delayMs: 250 });
        items = r.items;
        totalInCatalog = r.total;
      } else {
        const r = await scanTreck({ from, to, category, delayMs: 250 });
        items = r.items;
        totalInCatalog = r.total;
      }
    } catch (e) {
      console.error('[treck:scan] failed:', e);
      return err(`Error escaneando Treck: ${e.message}`, 500);
    }

    // Marcar los ya importados
    const existingIds = new Set();
    if (items.length) {
      const rows = await db.collection(COLLECTIONS.PRODUCTS).find({
        supplier: SUPPLIER,
        supplierProductId: { $in: items.map(i => String(i.supplierProductId)) },
      }, { projection: { supplierProductId: 1 } }).toArray();
      rows.forEach(r => existingIds.add(String(r.supplierProductId)));
    }

    const products = items.map(it => ({
      supplierProductId: it.supplierProductId,
      supplierUrl: it.supplierUrl,
      supplierBrand: it.supplierBrand,
      supplierCode: it.supplierCode,
      shortName: it.shortName,
      fullName: it.fullName,
      category: it.category,
      subcategory: it.subcategory,
      workwearType: it.workwearType,
      priceUnit: it.priceUnit,
      priceWholesale: it.priceWholesale,
      finalPrice: applyMarkup(it.priceWholesale || it.priceUnit, 40),
      previewImage: it.images[0] || null,
      totalImages: it.images.length,
      variantsCount: it.variants.length,
      colorsCount: it.colors.length,
      sizesCount: it.sizes.length,
      colors: it.colors,
      sizes: it.sizes,
      hasStock: it.hasStock,
      status: it.status,
      alreadyImported: existingIds.has(it.supplierProductId),
    }));

    const scanId = uuidv4();
    await db.collection(SCAN_COLLECTION).insertOne({
      id: scanId,
      rangeFrom: from,
      rangeTo: to,
      category,
      full: fullScan,
      totalInCatalog,
      products,
      _fullItems: items,
      createdAt: new Date(),
    });

    return json({
      scanId,
      products,
      cached: false,
      count: products.length,
      totalInCatalog,
    });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/treck/import
  // -----------------------------------------------------------------------
  if (route === '/import/treck/import' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { scanId, selectedIds, markupPercent = 40, paraphrase = true } = body;

    if (!scanId) return err('scanId requerido');
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) return err('Selecciona al menos 1 producto');

    const scan = await db.collection(SCAN_COLLECTION).findOne({ id: scanId });
    if (!scan) return err('scan no encontrado o expirado. Vuelve a escanear.', 404);

    const selectedSet = new Set(selectedIds.map(String));
    const items = (scan._fullItems || []).filter(it => selectedSet.has(String(it.supplierProductId)));
    if (items.length === 0) return err('ninguno de los IDs seleccionados está en el scan');

    const stats = await importWithRaceProtection({
      db,
      items,
      supplierName: SUPPLIER,
      markupPercent,
      paraphrase,
      extractSourceVariants: (item) => item.variants || [],
      decorateDoc: decorateTreckDoc,
    });

    await db.collection(HISTORY_COLLECTION).insertOne({
      id: uuidv4(), scanId, markupPercent, paraphrase, stats, createdAt: new Date(),
    });

    return json({ ok: true, ...stats });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/treck/refresh-prices
  // -----------------------------------------------------------------------
  if (route === '/import/treck/refresh-prices' && method === 'POST') {
    return refreshPricesGeneric({
      db,
      supplierName: SUPPLIER,
      historyCollection: HISTORY_COLLECTION,
      scrapeSingleFn: (supplierProductId) => scrapeTreck(supplierProductId),
      delayMs: 250,
    });
  }

  // -----------------------------------------------------------------------
  // GET /api/import/treck/history
  // -----------------------------------------------------------------------
  if (route === '/import/treck/history' && method === 'GET') {
    return historyHandler(db, HISTORY_COLLECTION);
  }

  // -----------------------------------------------------------------------
  // GET /api/import/treck/imported (proyección extendida con workwearType)
  // -----------------------------------------------------------------------
  if (route === '/import/treck/imported' && method === 'GET') {
    return importedListHandler(db, SUPPLIER, { workwearType: 1 });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/treck/sync-inventory
  // -----------------------------------------------------------------------
  if (route === '/import/treck/sync-inventory' && method === 'POST') {
    return syncInventoryHandler(db, SUPPLIER);
  }

  // -----------------------------------------------------------------------
  // Cron settings + precheck (Treck)
  // -----------------------------------------------------------------------
  if (route === '/import/treck/cron/settings' && method === 'GET') {
    return cronSettingsGet({
      db, settingsKey: SETTINGS_KEY, historyCollection: HISTORY_COLLECTION,
      schedule: CRON_SCHEDULE, humanSchedule: CRON_HUMAN,
    });
  }
  if (route === '/import/treck/cron/settings' && method === 'POST') {
    return cronSettingsPost({ db, request, settingsKey: SETTINGS_KEY });
  }
  if (route === '/import/treck/cron/precheck' && method === 'GET') {
    return cronPrecheck({ db, settingsKey: SETTINGS_KEY });
  }

  return null;
}
