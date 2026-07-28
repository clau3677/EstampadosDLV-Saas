// /app/lib/api/import/textilryu.js
// -------------------------------------------------------------------------
// Endpoints /api/import/textilryu/*
// Escaneo e importación del catálogo Textil Ryu (WooCommerce Store API).
// -------------------------------------------------------------------------
import { COLLECTIONS } from '@/lib/models';
import {
  scanFullCatalog as scanTextilRyu,
  scrapeSingle as scrapeTextilRyu,
} from '@/lib/import/textilryu';
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

const SUPPLIER            = 'textilryu';
const SCAN_COLLECTION     = 'textilryu_scans';
const HISTORY_COLLECTION  = 'textilryu_imports';
const SETTINGS_KEY        = 'textilryu_cron_enabled';
const CRON_SCHEDULE       = '30 3 * * *';
const CRON_HUMAN          = 'Diariamente a las 00:30 hrs Chile';

// Helper: TextilRyu re-scrapea usando el slug del producto (no el ID numérico)
function mapIdForTextilRyu(product) {
  return product.slug?.split(`-textilryu${product.supplierProductId}`)[0] || null;
}

export default async function handleTextilRyu(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/import/textilryu/')) return null;

  // -----------------------------------------------------------------------
  // POST /api/import/textilryu/scan  { force?: false }
  // Escanea /catalogo/ + detalles vía WooCommerce Store API.
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/scan' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }

    // Cache 30 min
    if (!body.force) {
      const recent = await db.collection(SCAN_COLLECTION).findOne(
        { createdAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) } },
        { sort: { createdAt: -1 } }
      );
      if (recent) {
        return json({
          scanId: recent.id,
          products: recent.products,
          cached: true,
          scannedAt: recent.createdAt,
        });
      }
    }

    const items = await scanTextilRyu({ delayMs: 150 });

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
      shortName: it.shortName,
      fullName: it.fullName,
      category: it.category,
      subcategory: it.subcategory,
      priceUnit: it.priceUnit,
      priceWholesale: it.priceWholesale,
      finalPrice: applyMarkup(it.priceWholesale || it.priceUnit, 40),
      previewImage: it.images[0] || null,
      totalImages: it.images.length,
      colorsCount: it.colors.length,
      colors: it.colors,
      hasStock: it.hasStock,
      status: it.status,
      alreadyImported: existingIds.has(it.supplierProductId),
    }));

    const scanId = uuidv4();
    await db.collection(SCAN_COLLECTION).insertOne({
      id: scanId,
      products,
      _fullItems: items,
      createdAt: new Date(),
    });

    return json({ scanId, products, cached: false, count: products.length });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/textilryu/import
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/import' && method === 'POST') {
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
      extractSourceVariants: () => [], // TextilRyu no entrega variants con inStock por variante
    });

    await db.collection(HISTORY_COLLECTION).insertOne({
      id: uuidv4(), scanId, markupPercent, paraphrase, stats, createdAt: new Date(),
    });

    return json({ ok: true, ...stats });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/textilryu/refresh-prices
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/refresh-prices' && method === 'POST') {
    return refreshPricesGeneric({
      db,
      supplierName: SUPPLIER,
      historyCollection: HISTORY_COLLECTION,
      scrapeSingleFn: (slug) => scrapeTextilRyu(slug),
      mapId: mapIdForTextilRyu,
      delayMs: 300,
    });
  }

  // -----------------------------------------------------------------------
  // GET /api/import/textilryu/history
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/history' && method === 'GET') {
    return historyHandler(db, HISTORY_COLLECTION);
  }

  // -----------------------------------------------------------------------
  // GET /api/import/textilryu/imported
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/imported' && method === 'GET') {
    return importedListHandler(db, SUPPLIER);
  }

  // -----------------------------------------------------------------------
  // POST /api/import/textilryu/sync-inventory
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/sync-inventory' && method === 'POST') {
    return syncInventoryHandler(db, SUPPLIER);
  }

  // -----------------------------------------------------------------------
  // Cron settings + precheck (Textil Ryu)
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/cron/settings' && method === 'GET') {
    return cronSettingsGet({
      db, settingsKey: SETTINGS_KEY, historyCollection: HISTORY_COLLECTION,
      schedule: CRON_SCHEDULE, humanSchedule: CRON_HUMAN,
    });
  }
  if (route === '/import/textilryu/cron/settings' && method === 'POST') {
    return cronSettingsPost({ db, request, settingsKey: SETTINGS_KEY });
  }
  if (route === '/import/textilryu/cron/precheck' && method === 'GET') {
    return cronPrecheck({ db, settingsKey: SETTINGS_KEY });
  }

  return null;
}
