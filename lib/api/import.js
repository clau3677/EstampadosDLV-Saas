// /api/import/cottonext/* — Escaneo e importación del catálogo del proveedor Cottonext.
// /api/import/textilryu/*  — Escaneo e importación del catálogo del proveedor Textil Ryu.
// /api/import/treck/*      — Escaneo e importación del catálogo del proveedor Treck (VTEX).
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip, PRODUCT_CATEGORY } from '@/lib/models';
import { json, err } from './_helpers';
import { scanCatalog, scrapeProduct, slugify } from '@/lib/import/cottonext';
import { scanFullCatalog as scanTextilRyu, scrapeSingle as scrapeTextilRyu } from '@/lib/import/textilryu';
import {
  scanCatalog as scanTreck,
  scanFullCatalog as scanFullTreck,
  scrapeSingle as scrapeTreck,
} from '@/lib/import/treck';
import { downloadImage } from '@/lib/import/image-downloader';
import { paraphraseDescription } from '@/lib/import/paraphraser';

const SCAN_COLLECTION    = 'cottonext_scans';
const HISTORY_COLLECTION = 'cottonext_imports';
const SETTINGS_COLLECTION = 'app_settings';        // clave-valor global

// -------------------------------------------------------------------------
// Stock por defecto para productos importados: si Cottonext dice "en stock"
// asumimos disponibilidad on-demand (99 unidades). Si no hay stock, 0.
// -------------------------------------------------------------------------
const DEFAULT_STOCK_ON_DEMAND = 99;

// -------------------------------------------------------------------------
// Crea o actualiza el commercial_stock para todas las variantes de un producto.
// GENÉRICO: acepta cualquier supplier.
// Idempotente: usa (productId, variantId) como clave.
// Retorna { created, updated }
// -------------------------------------------------------------------------
async function syncInventoryForVariants(db, product, sourceVariants = [], supplierName = 'unknown') {
  const stockColl = db.collection(COLLECTIONS.COMMERCIAL_STOCK);
  let created = 0, updated = 0;
  const now = new Date();
  const supplierLabel = supplierName === 'cottonext' ? 'Cottonext'
                       : supplierName === 'textilryu' ? 'Textil Ryu'
                       : supplierName === 'treck' ? 'Treck'
                       : supplierName;

  for (const v of product.variants) {
    // Modelo de negocio: TODOS los productos de proveedores son "bajo pedido".
    // Mantenemos stock=99 (DEFAULT_STOCK_ON_DEMAND) siempre, independiente de la disponibilidad
    // en el proveedor. Cuando el cliente compra, se hace el pedido al proveedor.
    // Guardamos separadamente `supplierInStock` para mostrar advertencia opcional en UI
    // ("Sin stock en proveedor · pedido especial 5-7 días") pero permitiendo la venta.
    let supplierInStock = true;
    if (Array.isArray(sourceVariants) && sourceVariants.length > 0) {
      const src = sourceVariants.find(sv =>
        (sv.color === v.attributes?.color || !sv.color) &&
        (sv.size === v.attributes?.size || !sv.size || sv.size === 'única')
      );
      supplierInStock = src ? (src.inStock !== false) : true;
    }
    const targetQty = DEFAULT_STOCK_ON_DEMAND;  // siempre 99, bajo pedido

    const existing = await stockColl.findOne({ productId: product.id, variantId: v.id });
    if (existing) {
      await stockColl.updateOne(
        { id: existing.id },
        { $set: {
          // Rellenar quantity si estaba en 0 (caso de sync anterior con bug)
          ...(existing.quantity === 0 ? { quantity: targetQty } : {}),
          location: `Bajo pedido · ${supplierLabel}`,
          onDemand: true,
          supplier: supplierName,
          supplierInStock,
          updatedAt: now,
        }},
      );
      updated++;
    } else {
      await stockColl.insertOne({
        id: uuidv4(),
        productId: product.id,
        variantId: v.id,
        quantity: targetQty,
        reservedQuantity: 0,
        location: `Bajo pedido · ${supplierLabel}`,
        minStockAlert: 0,
        onDemand: true,
        supplier: supplierName,
        supplierInStock,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
  }
  return { created, updated };
}

// -------------------------------------------------------------------------
// Redondeo comercial chileno: precios naturalmente terminan en xx90 o xx490.
// Ejemplos:
//   5446 → 5490   (elegante, cerca del 40%)
//   6785 → 6790
//   12250 → 12490 (o 12990 si redondeamos arriba)
// Estrategia: redondear al múltiplo de 10 más cercano, con preferencia por xx90
// (que es el estándar en retail chileno).
// -------------------------------------------------------------------------
function roundChilean(v) {
  if (v <= 0) return 0;
  // Redondear al múltiplo de 10 más cercano
  const nearest10 = Math.round(v / 10) * 10;
  // Ajustar a xx90 (ej: 5490 en lugar de 5500)
  const lastTwo = nearest10 % 100;
  if (lastTwo === 0) return nearest10 - 10;      // 5500 → 5490
  if (lastTwo === 100) return nearest10 - 10;    // 5600 → 5590
  if (lastTwo <= 40) return nearest10 - lastTwo - 10; // 5430 → 5390
  if (lastTwo >= 50 && lastTwo <= 89) return nearest10 + (90 - lastTwo); // 5450 → 5490
  return nearest10; // ya termina en 90
}

// -------------------------------------------------------------------------
// Aplica markup + redondeo comercial. Base = precio mayorista 10+.
// -------------------------------------------------------------------------
function applyMarkup(basePrice, pct = 40) {
  const withMarkup = Math.round(basePrice * (1 + pct / 100));
  return roundChilean(withMarkup);
}

// -------------------------------------------------------------------------
// Construye el objeto Product a insertar en MongoDB desde un scraped item.
// GENÉRICO: acepta cualquier proveedor. El item debe tener:
//   supplier, supplierProductId, supplierUrl, supplierBrand, supplierCode?,
//   fullName, shortName, descriptionText, images[], variants[] o colors[]+sizes[],
//   priceWholesale, category?, subcategory?
// -------------------------------------------------------------------------
async function buildProductDoc({ item, markupPercent, paraphrase, existingProduct, supplierName }) {
  // 1. Descargar todas las imágenes (organizadas por proveedor)
  const localImages = [];
  for (const imgUrl of item.images) {
    // eslint-disable-next-line no-await-in-loop
    const local = await downloadImage(imgUrl, supplierName || 'cottonext');
    if (local) localImages.push(local);
  }

  // 2. Parafrasear descripción
  let description = item.descriptionText;
  if (paraphrase) {
    // eslint-disable-next-line no-await-in-loop
    description = await paraphraseDescription(item.descriptionText);
  }

  // 3. Calcular precio final desde precio mayorista
  const supplierPrice = item.priceWholesale || item.priceUnit || 0;
  const finalPrice = applyMarkup(supplierPrice, markupPercent);

  // 4. Construir variantes
  // Caso A: proveedor entrega variants[] con color+size (Cottonext)
  // Caso B: proveedor entrega solo colors[] (Textil Ryu — gorras unitalla)
  //
  // IMPORTANTE: Cuando existingProduct existe, preservamos los variant.id previos
  // usando (color, size) como natural key. Sin esto, cada re-import regenera IDs
  // y los stock records quedan huérfanos → POS muestra 0 stock.
  const variants = [];
  const supplierPrefix = (supplierName || 'SUP').slice(0, 4).toUpperCase();
  const findExistingVariantId = (color, size) => {
    if (!existingProduct?.variants?.length) return null;
    const match = existingProduct.variants.find(ev =>
      (ev.attributes?.color === color) && (ev.attributes?.size === size)
    );
    return match?.id || null;
  };

  if (Array.isArray(item.variants) && item.variants.length > 0) {
    const variantMap = new Map();
    for (const v of item.variants) {
      const key = `${v.color}::${v.size}`;
      if (variantMap.has(key)) continue;
      variantMap.set(key, {
        id: findExistingVariantId(v.color, v.size) || uuidv4(),
        name: `${v.color} · ${v.size}`,
        sku: `${supplierPrefix}-${item.supplierProductId}-${slugify(v.color)}-${v.size}`.toUpperCase(),
        price: finalPrice,
        attributes: { size: v.size, color: v.color },
        _supplierInStock: v.inStock,
      });
    }
    variants.push(...Array.from(variantMap.values()));
  } else if (Array.isArray(item.colors) && item.colors.length > 0) {
    for (const c of item.colors) {
      variants.push({
        id: findExistingVariantId(c, 'única') || uuidv4(),
        name: c,
        sku: `${supplierPrefix}-${item.supplierProductId}-${slugify(c)}`.toUpperCase(),
        price: finalPrice,
        attributes: { color: c, size: 'única' },
        _supplierInStock: item.hasStock !== false,
      });
    }
  } else {
    // Sin variantes conocidas: crear una única "estándar"
    variants.push({
      id: findExistingVariantId('estándar', 'única') || uuidv4(),
      name: 'Estándar',
      sku: `${supplierPrefix}-${item.supplierProductId}`.toUpperCase(),
      price: finalPrice,
      attributes: { size: 'única', color: 'estándar' },
      _supplierInStock: item.hasStock !== false,
    });
  }

  // 5. Slug + doc final
  const baseSlug = slugify(item.slug || item.shortName || item.fullName);
  const supplierSlugTag = (supplierName || 'sup').toLowerCase().replace(/[^a-z0-9]/g, '');
  const slug = existingProduct?.slug || `${baseSlug}-${supplierSlugTag}${item.supplierProductId}`;

  const now = new Date();
  const category = item.category || PRODUCT_CATEGORY.BLANK_APPAREL;
  const subcategory = item.subcategory || 'otros';

  const doc = {
    id: existingProduct?.id || uuidv4(),
    sku: existingProduct?.sku || `${supplierPrefix}-${item.supplierProductId}`,
    name: item.shortName || item.fullName,
    slug,
    category,
    subcategory,
    description,
    images: localImages,
    basePrice: finalPrice,
    cost: supplierPrice,
    variants,
    active: true,
    featured: existingProduct?.featured ?? false,
    seoMeta: {
      title: `${item.shortName} — ${item.supplierBrand} · Sin estampar`,
      description: description.slice(0, 160),
      keywords: [subcategory, item.supplierBrand.toLowerCase(), 'sin estampar'],
    },

    supplier: supplierName || 'unknown',
    supplierProductId: item.supplierProductId,
    supplierUrl: item.supplierUrl,
    supplierBrand: item.supplierBrand,
    supplierCode: item.supplierCode || '',
    supplierPrice,
    markupPercent,
    productType: 'blank',

    createdAt: existingProduct?.createdAt || now,
    updatedAt: now,
    lastSyncedAt: now,
  };

  return doc;
}

// =========================================================================
export default async function handleImport(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/import')) return null;

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
        supplier: 'cottonext',
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
      previewImage: it.images[0] || null,      // URL remota del proveedor (thumbnail)
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
      // Guardar también los items completos para no re-scrapear al importar
      _fullItems: items,
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

    const stats = { attempted: items.length, created: 0, updated: 0, failed: 0, details: [] };
    const products = db.collection(COLLECTIONS.PRODUCTS);

    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const existing = await products.findOne({
          supplier: 'cottonext',
          supplierProductId: String(item.supplierProductId),
        });

        // eslint-disable-next-line no-await-in-loop
        const doc = await buildProductDoc({
          item,
          markupPercent,
          paraphrase,
          existingProduct: existing,
          supplierName: 'cottonext',
        });

        if (existing) {
          // eslint-disable-next-line no-await-in-loop
          await products.updateOne({ id: existing.id }, { $set: doc });
          // eslint-disable-next-line no-await-in-loop
          await syncInventoryForVariants(db, doc, item.variants, 'cottonext');
          stats.updated++;
          stats.details.push({ id: item.supplierProductId, name: doc.name, action: 'updated', productId: doc.id });
        } else {
          try {
            // eslint-disable-next-line no-await-in-loop
            await products.insertOne(doc);
            // eslint-disable-next-line no-await-in-loop
            await syncInventoryForVariants(db, doc, item.variants, 'cottonext');
            stats.created++;
            stats.details.push({ id: item.supplierProductId, name: doc.name, action: 'created', productId: doc.id });
          } catch (insertErr) {
            // Fallback anti race-condition (2 imports concurrentes con mismo supplierProductId).
            if (insertErr?.code === 11000) {
              // eslint-disable-next-line no-await-in-loop
              const raced = await products.findOne({ supplier: 'cottonext', supplierProductId: String(item.supplierProductId) });
              if (raced) {
                const patch = { ...doc, id: raced.id, createdAt: raced.createdAt };
                // eslint-disable-next-line no-await-in-loop
                await products.updateOne({ id: raced.id }, { $set: patch });
                // eslint-disable-next-line no-await-in-loop
                await syncInventoryForVariants(db, patch, item.variants, 'cottonext');
                stats.updated++;
                stats.details.push({ id: item.supplierProductId, name: patch.name, action: 'updated_after_race', productId: raced.id });
              } else { throw insertErr; }
            } else { throw insertErr; }
          }
        }
      } catch (e) {
        console.error('[cottonext:import] failed for', item.supplierProductId, e);
        stats.failed++;
        stats.details.push({ id: item.supplierProductId, name: item.shortName, action: 'failed', error: e.message });
      }
    }

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
    const products = db.collection(COLLECTIONS.PRODUCTS);
    const existing = await products.find({ supplier: 'cottonext' }).toArray();
    if (existing.length === 0) return json({ ok: true, updated: 0, unchanged: 0 });

    let updated = 0, unchanged = 0, failed = 0;
    const details = [];

    for (const p of existing) {
      // eslint-disable-next-line no-await-in-loop
      const fresh = await scrapeProduct(parseInt(p.supplierProductId, 10));
      if (!fresh) { failed++; continue; }

      const newSupplierPrice = fresh.priceWholesale || fresh.priceUnit || 0;
      const newFinal = applyMarkup(newSupplierPrice, p.markupPercent || 40);

      if (newSupplierPrice === p.supplierPrice) {
        unchanged++;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await products.updateOne({ id: p.id }, {
        $set: {
          basePrice: newFinal,
          supplierPrice: newSupplierPrice,
          'variants.$[].price': newFinal,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        },
      });
      updated++;
      details.push({
        id: p.id, name: p.name,
        oldSupplierPrice: p.supplierPrice, newSupplierPrice,
        oldFinal: p.basePrice, newFinal,
      });

      // Rate limit cortés
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 350));
    }

    await db.collection(HISTORY_COLLECTION).insertOne({
      id: uuidv4(),
      type: 'refresh_prices',
      stats: { updated, unchanged, failed },
      details,
      createdAt: new Date(),
    });

    return json({ ok: true, updated, unchanged, failed, details });
  }

  // -----------------------------------------------------------------------
  // GET /api/import/cottonext/history  — últimos 20 registros
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/history' && method === 'GET') {
    const rows = await db.collection(HISTORY_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    return json(strip(rows));
  }

  // -----------------------------------------------------------------------
  // GET /api/import/cottonext/imported  — lista productos ya importados
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/imported' && method === 'GET') {
    const rows = await db.collection(COLLECTIONS.PRODUCTS)
      .find({ supplier: 'cottonext' })
      .sort({ lastSyncedAt: -1 })
      .project({
        id: 1, name: 1, slug: 1, subcategory: 1, supplierBrand: 1,
        supplierProductId: 1, supplierPrice: 1, basePrice: 1,
        markupPercent: 1, lastSyncedAt: 1, active: 1, images: 1,
      })
      .toArray();
    return json(strip(rows));
  }

  // -----------------------------------------------------------------------
  // POST /api/import/cottonext/sync-inventory
  // Crea registros commercial_stock faltantes para productos ya importados.
  // Idempotente: no sobrescribe stock existente.
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/sync-inventory' && method === 'POST') {
    const products = db.collection(COLLECTIONS.PRODUCTS);
    const list = await products.find({ supplier: 'cottonext' }).toArray();
    if (list.length === 0) return json({ ok: true, message: 'No hay productos importados' });

    let totalCreated = 0, totalUpdated = 0, productsProcessed = 0;
    const failedProducts = [];

    for (const p of list) {
      // No tenemos las variantes fuente originales de Cottonext, así que
      // asumimos que todas las variantes están disponibles on-demand.
      // Generamos "sourceVariants" sintético con inStock=true.
      const syntheticSources = (p.variants || []).map(v => ({
        color: v.attributes?.color,
        size:  v.attributes?.size,
        inStock: true,
      }));
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await syncInventoryForVariants(db, p, syntheticSources, 'cottonext');
        totalCreated += r.created;
        totalUpdated += r.updated;
        productsProcessed++;
      } catch (e) {
        failedProducts.push({ id: p.id, name: p.name, error: e.message });
      }
    }

    return json({
      ok: true,
      productsProcessed,
      stockRecordsCreated: totalCreated,
      stockRecordsUpdated: totalUpdated,
      failed: failedProducts.length,
      failedProducts,
    });
  }

  // -----------------------------------------------------------------------
  // GET  /api/import/cottonext/cron/settings
  // POST /api/import/cottonext/cron/settings   { enabled: bool }
  // Controla si el cron diario está activo. Persiste en app_settings.
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/cron/settings' && method === 'GET') {
    const s = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'cottonext_cron_enabled' });
    // Última ejecución desde el historial
    const lastRun = await db.collection(HISTORY_COLLECTION)
      .findOne({ type: 'refresh_prices' }, { sort: { createdAt: -1 } });

    return json({
      enabled: s ? !!s.value : true,             // default ON
      schedule: '15 3 * * *',                     // 03:15 UTC = 00:15 Chile
      humanSchedule: 'Diariamente a las 00:15 hrs Chile',
      lastRunAt: lastRun?.createdAt || null,
      lastRunStats: lastRun?.stats || null,
      updatedAt: s?.updatedAt || null,
      updatedBy: s?.updatedBy || null,
    });
  }
  if (route === '/import/cottonext/cron/settings' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const enabled = !!body.enabled;
    const settings = db.collection(SETTINGS_COLLECTION);
    await settings.updateOne(
      { key: 'cottonext_cron_enabled' },
      { $set: {
        key: 'cottonext_cron_enabled',
        value: enabled,
        updatedAt: new Date(),
      }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    return json({ ok: true, enabled });
  }

  // -----------------------------------------------------------------------
  // GET /api/import/cottonext/cron/precheck
  // Endpoint interno usado por el cron script para saber si debe ejecutarse.
  // Retorna { runNow: bool, reason }
  // -----------------------------------------------------------------------
  if (route === '/import/cottonext/cron/precheck' && method === 'GET') {
    const s = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'cottonext_cron_enabled' });
    const enabled = s ? !!s.value : true;
    return json({ runNow: enabled, enabled, reason: enabled ? 'enabled' : 'disabled_by_user' });
  }

  // =========================================================================
  // TEXTIL RYU ENDPOINTS
  // =========================================================================
  const RYU_SCAN_COLL = 'textilryu_scans';
  const RYU_HIST_COLL = 'textilryu_imports';

  // -----------------------------------------------------------------------
  // POST /api/import/textilryu/scan  { force?: false }
  // Escanea /catalogo/ + detalles vía WooCommerce Store API.
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/scan' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }

    // Cache 30 min
    if (!body.force) {
      const recent = await db.collection(RYU_SCAN_COLL).findOne(
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
        supplier: 'textilryu',
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
    await db.collection(RYU_SCAN_COLL).insertOne({
      id: scanId,
      products,
      _fullItems: items,
      createdAt: new Date(),
    });

    return json({ scanId, products, cached: false, count: products.length });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/textilryu/import  { scanId, selectedIds, markupPercent?, paraphrase? }
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/import' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { scanId, selectedIds, markupPercent = 40, paraphrase = true } = body;

    if (!scanId) return err('scanId requerido');
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) return err('Selecciona al menos 1 producto');

    const scan = await db.collection(RYU_SCAN_COLL).findOne({ id: scanId });
    if (!scan) return err('scan no encontrado o expirado. Vuelve a escanear.', 404);

    const selectedSet = new Set(selectedIds.map(String));
    const items = (scan._fullItems || []).filter(it => selectedSet.has(String(it.supplierProductId)));
    if (items.length === 0) return err('ninguno de los IDs seleccionados está en el scan');

    const stats = { attempted: items.length, created: 0, updated: 0, failed: 0, details: [] };
    const products = db.collection(COLLECTIONS.PRODUCTS);

    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const existing = await products.findOne({
          supplier: 'textilryu',
          supplierProductId: String(item.supplierProductId),
        });

        // eslint-disable-next-line no-await-in-loop
        const doc = await buildProductDoc({
          item, markupPercent, paraphrase,
          existingProduct: existing,
          supplierName: 'textilryu',
        });

        if (existing) {
          // eslint-disable-next-line no-await-in-loop
          await products.updateOne({ id: existing.id }, { $set: doc });
          // eslint-disable-next-line no-await-in-loop
          await syncInventoryForVariants(db, doc, [], 'textilryu');
          stats.updated++;
          stats.details.push({ id: item.supplierProductId, name: doc.name, action: 'updated', productId: doc.id });
        } else {
          try {
            // eslint-disable-next-line no-await-in-loop
            await products.insertOne(doc);
            // eslint-disable-next-line no-await-in-loop
            await syncInventoryForVariants(db, doc, [], 'textilryu');
            stats.created++;
            stats.details.push({ id: item.supplierProductId, name: doc.name, action: 'created', productId: doc.id });
          } catch (insertErr) {
            // Fallback anti race-condition (2 imports concurrentes con mismo supplierProductId).
            if (insertErr?.code === 11000) {
              // eslint-disable-next-line no-await-in-loop
              const raced = await products.findOne({ supplier: 'textilryu', supplierProductId: String(item.supplierProductId) });
              if (raced) {
                const patch = { ...doc, id: raced.id, createdAt: raced.createdAt };
                // eslint-disable-next-line no-await-in-loop
                await products.updateOne({ id: raced.id }, { $set: patch });
                // eslint-disable-next-line no-await-in-loop
                await syncInventoryForVariants(db, patch, [], 'textilryu');
                stats.updated++;
                stats.details.push({ id: item.supplierProductId, name: patch.name, action: 'updated_after_race', productId: raced.id });
              } else { throw insertErr; }
            } else { throw insertErr; }
          }
        }
      } catch (e) {
        console.error('[textilryu:import] failed for', item.supplierProductId, e);
        stats.failed++;
        stats.details.push({ id: item.supplierProductId, name: item.shortName, action: 'failed', error: e.message });
      }
    }

    await db.collection(RYU_HIST_COLL).insertOne({
      id: uuidv4(), scanId, markupPercent, paraphrase, stats, createdAt: new Date(),
    });

    return json({ ok: true, ...stats });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/textilryu/refresh-prices
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/refresh-prices' && method === 'POST') {
    const products = db.collection(COLLECTIONS.PRODUCTS);
    const existing = await products.find({ supplier: 'textilryu' }).toArray();
    if (existing.length === 0) return json({ ok: true, updated: 0, unchanged: 0 });

    let updated = 0, unchanged = 0, failed = 0;
    const details = [];

    for (const p of existing) {
      // Re-scrapear cada producto individualmente por slug/URL
      // eslint-disable-next-line no-await-in-loop
      const fresh = await scrapeTextilRyu(p.slug?.split(`-textilryu${p.supplierProductId}`)[0] || null);
      if (!fresh) { failed++; continue; }

      const newSupplierPrice = fresh.priceWholesale || fresh.priceUnit || 0;
      const newFinal = applyMarkup(newSupplierPrice, p.markupPercent || 40);

      if (newSupplierPrice === p.supplierPrice) {
        unchanged++;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await products.updateOne({ id: p.id }, {
        $set: {
          basePrice: newFinal, supplierPrice: newSupplierPrice,
          'variants.$[].price': newFinal,
          updatedAt: new Date(), lastSyncedAt: new Date(),
        },
      });
      updated++;
      details.push({ id: p.id, name: p.name, oldSupplierPrice: p.supplierPrice, newSupplierPrice, oldFinal: p.basePrice, newFinal });
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 300));
    }

    await db.collection(RYU_HIST_COLL).insertOne({
      id: uuidv4(), type: 'refresh_prices', stats: { updated, unchanged, failed }, details, createdAt: new Date(),
    });

    return json({ ok: true, updated, unchanged, failed, details });
  }

  // -----------------------------------------------------------------------
  // GET /api/import/textilryu/history
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/history' && method === 'GET') {
    const rows = await db.collection(RYU_HIST_COLL).find({}).sort({ createdAt: -1 }).limit(20).toArray();
    return json(strip(rows));
  }

  // -----------------------------------------------------------------------
  // GET /api/import/textilryu/imported
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/imported' && method === 'GET') {
    const rows = await db.collection(COLLECTIONS.PRODUCTS)
      .find({ supplier: 'textilryu' })
      .sort({ lastSyncedAt: -1 })
      .project({
        id: 1, name: 1, slug: 1, subcategory: 1, category: 1, supplierBrand: 1,
        supplierProductId: 1, supplierPrice: 1, basePrice: 1,
        markupPercent: 1, lastSyncedAt: 1, active: 1, images: 1,
      })
      .toArray();
    return json(strip(rows));
  }

  // -----------------------------------------------------------------------
  // POST /api/import/textilryu/sync-inventory
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/sync-inventory' && method === 'POST') {
    const products = db.collection(COLLECTIONS.PRODUCTS);
    const list = await products.find({ supplier: 'textilryu' }).toArray();
    if (list.length === 0) return json({ ok: true, message: 'No hay productos importados' });

    let totalCreated = 0, totalUpdated = 0, productsProcessed = 0;
    const failedProducts = [];

    for (const p of list) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await syncInventoryForVariants(db, p, [], 'textilryu');
        totalCreated += r.created;
        totalUpdated += r.updated;
        productsProcessed++;
      } catch (e) {
        failedProducts.push({ id: p.id, name: p.name, error: e.message });
      }
    }

    return json({
      ok: true, productsProcessed,
      stockRecordsCreated: totalCreated, stockRecordsUpdated: totalUpdated,
      failed: failedProducts.length, failedProducts,
    });
  }

  // -----------------------------------------------------------------------
  // Cron settings + precheck (Textil Ryu)
  // -----------------------------------------------------------------------
  if (route === '/import/textilryu/cron/settings' && method === 'GET') {
    const s = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'textilryu_cron_enabled' });
    const lastRun = await db.collection(RYU_HIST_COLL).findOne({ type: 'refresh_prices' }, { sort: { createdAt: -1 } });
    return json({
      enabled: s ? !!s.value : true,
      schedule: '30 3 * * *',
      humanSchedule: 'Diariamente a las 00:30 hrs Chile',
      lastRunAt: lastRun?.createdAt || null,
      lastRunStats: lastRun?.stats || null,
    });
  }
  if (route === '/import/textilryu/cron/settings' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    await db.collection(SETTINGS_COLLECTION).updateOne(
      { key: 'textilryu_cron_enabled' },
      { $set: { key: 'textilryu_cron_enabled', value: !!body.enabled, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    return json({ ok: true, enabled: !!body.enabled });
  }
  if (route === '/import/textilryu/cron/precheck' && method === 'GET') {
    const s = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'textilryu_cron_enabled' });
    const enabled = s ? !!s.value : true;
    return json({ runNow: enabled, enabled, reason: enabled ? 'enabled' : 'disabled_by_user' });
  }

  // =========================================================================
  // TRECK ENDPOINTS  (VTEX Catalog Search API — ropa de trabajo/técnica/etc.)
  // =========================================================================
  const TRECK_SCAN_COLL = 'treck_scans';
  const TRECK_HIST_COLL = 'treck_imports';

  // -----------------------------------------------------------------------
  // POST /api/import/treck/scan  { from?: 0, to?: 49, category?: 'vestuario', full?: false, force?: false }
  // full=true → escanea TODO el catálogo (pagina automáticamente hasta el total)
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
      const recent = await db.collection(TRECK_SCAN_COLL).findOne(
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
        supplier: 'treck',
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
    await db.collection(TRECK_SCAN_COLL).insertOne({
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
  // POST /api/import/treck/import  { scanId, selectedIds, markupPercent?, paraphrase? }
  // -----------------------------------------------------------------------
  if (route === '/import/treck/import' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { scanId, selectedIds, markupPercent = 40, paraphrase = true } = body;

    if (!scanId) return err('scanId requerido');
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) return err('Selecciona al menos 1 producto');

    const scan = await db.collection(TRECK_SCAN_COLL).findOne({ id: scanId });
    if (!scan) return err('scan no encontrado o expirado. Vuelve a escanear.', 404);

    const selectedSet = new Set(selectedIds.map(String));
    const items = (scan._fullItems || []).filter(it => selectedSet.has(String(it.supplierProductId)));
    if (items.length === 0) return err('ninguno de los IDs seleccionados está en el scan');

    const stats = { attempted: items.length, created: 0, updated: 0, failed: 0, details: [] };
    const products = db.collection(COLLECTIONS.PRODUCTS);

    for (const item of items) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const existing = await products.findOne({
          supplier: 'treck',
          supplierProductId: String(item.supplierProductId),
        });

        // eslint-disable-next-line no-await-in-loop
        const doc = await buildProductDoc({
          item, markupPercent, paraphrase,
          existingProduct: existing,
          supplierName: 'treck',
        });

        // Guardar metadata extra específica de Treck
        if (item.workwearType) doc.workwearType = item.workwearType;
        if (item.categoriesPath) doc.categoriesPath = item.categoriesPath;

        if (existing) {
          // eslint-disable-next-line no-await-in-loop
          await products.updateOne({ id: existing.id }, { $set: doc });
          // eslint-disable-next-line no-await-in-loop
          await syncInventoryForVariants(db, doc, item.variants, 'treck');
          stats.updated++;
          stats.details.push({ id: item.supplierProductId, name: doc.name, action: 'updated', productId: doc.id });
        } else {
          try {
            // eslint-disable-next-line no-await-in-loop
            await products.insertOne(doc);
            // eslint-disable-next-line no-await-in-loop
            await syncInventoryForVariants(db, doc, item.variants, 'treck');
            stats.created++;
            stats.details.push({ id: item.supplierProductId, name: doc.name, action: 'created', productId: doc.id });
          } catch (insertErr) {
            // Fallback anti race-condition: si dup key (E11000), re-consulta y hace update.
            // Ocurre cuando dos imports concurrentes procesan el mismo supplierProductId.
            if (insertErr?.code === 11000) {
              // eslint-disable-next-line no-await-in-loop
              const raced = await products.findOne({ supplier: 'treck', supplierProductId: String(item.supplierProductId) });
              if (raced) {
                // Conservar el id original + createdAt para no duplicar
                const patch = { ...doc, id: raced.id, createdAt: raced.createdAt };
                // eslint-disable-next-line no-await-in-loop
                await products.updateOne({ id: raced.id }, { $set: patch });
                // eslint-disable-next-line no-await-in-loop
                await syncInventoryForVariants(db, patch, item.variants, 'treck');
                stats.updated++;
                stats.details.push({ id: item.supplierProductId, name: patch.name, action: 'updated_after_race', productId: raced.id });
              } else {
                throw insertErr;
              }
            } else {
              throw insertErr;
            }
          }
        }
      } catch (e) {
        console.error('[treck:import] failed for', item.supplierProductId, e);
        stats.failed++;
        stats.details.push({ id: item.supplierProductId, name: item.shortName, action: 'failed', error: e.message });
      }
    }

    await db.collection(TRECK_HIST_COLL).insertOne({
      id: uuidv4(), scanId, markupPercent, paraphrase, stats, createdAt: new Date(),
    });

    return json({ ok: true, ...stats });
  }

  // -----------------------------------------------------------------------
  // POST /api/import/treck/refresh-prices
  // -----------------------------------------------------------------------
  if (route === '/import/treck/refresh-prices' && method === 'POST') {
    const products = db.collection(COLLECTIONS.PRODUCTS);
    const existing = await products.find({ supplier: 'treck' }).toArray();
    if (existing.length === 0) return json({ ok: true, updated: 0, unchanged: 0 });

    let updated = 0, unchanged = 0, failed = 0;
    const details = [];

    for (const p of existing) {
      // eslint-disable-next-line no-await-in-loop
      const fresh = await scrapeTreck(p.supplierProductId);
      if (!fresh) { failed++; continue; }

      const newSupplierPrice = fresh.priceWholesale || fresh.priceUnit || 0;
      const newFinal = applyMarkup(newSupplierPrice, p.markupPercent || 40);

      if (newSupplierPrice === p.supplierPrice) {
        unchanged++;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await products.updateOne({ id: p.id }, {
        $set: {
          basePrice: newFinal, supplierPrice: newSupplierPrice,
          'variants.$[].price': newFinal,
          updatedAt: new Date(), lastSyncedAt: new Date(),
        },
      });
      updated++;
      details.push({
        id: p.id, name: p.name,
        oldSupplierPrice: p.supplierPrice, newSupplierPrice,
        oldFinal: p.basePrice, newFinal,
      });
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 250));
    }

    await db.collection(TRECK_HIST_COLL).insertOne({
      id: uuidv4(), type: 'refresh_prices',
      stats: { updated, unchanged, failed },
      details, createdAt: new Date(),
    });

    return json({ ok: true, updated, unchanged, failed, details });
  }

  // -----------------------------------------------------------------------
  // GET /api/import/treck/history
  // -----------------------------------------------------------------------
  if (route === '/import/treck/history' && method === 'GET') {
    const rows = await db.collection(TRECK_HIST_COLL).find({}).sort({ createdAt: -1 }).limit(20).toArray();
    return json(strip(rows));
  }

  // -----------------------------------------------------------------------
  // GET /api/import/treck/imported
  // -----------------------------------------------------------------------
  if (route === '/import/treck/imported' && method === 'GET') {
    const rows = await db.collection(COLLECTIONS.PRODUCTS)
      .find({ supplier: 'treck' })
      .sort({ lastSyncedAt: -1 })
      .project({
        id: 1, name: 1, slug: 1, subcategory: 1, category: 1,
        workwearType: 1,
        supplierBrand: 1, supplierProductId: 1,
        supplierPrice: 1, basePrice: 1,
        markupPercent: 1, lastSyncedAt: 1, active: 1, images: 1,
      })
      .toArray();
    return json(strip(rows));
  }

  // -----------------------------------------------------------------------
  // POST /api/import/treck/sync-inventory
  // -----------------------------------------------------------------------
  if (route === '/import/treck/sync-inventory' && method === 'POST') {
    const products = db.collection(COLLECTIONS.PRODUCTS);
    const list = await products.find({ supplier: 'treck' }).toArray();
    if (list.length === 0) return json({ ok: true, message: 'No hay productos importados' });

    let totalCreated = 0, totalUpdated = 0, productsProcessed = 0;
    const failedProducts = [];

    for (const p of list) {
      try {
        // Sintetizar sourceVariants desde las variantes del producto (todas asumidas in-stock)
        const syntheticSources = (p.variants || []).map(v => ({
          color: v.attributes?.color,
          size:  v.attributes?.size,
          inStock: true,
        }));
        // eslint-disable-next-line no-await-in-loop
        const r = await syncInventoryForVariants(db, p, syntheticSources, 'treck');
        totalCreated += r.created;
        totalUpdated += r.updated;
        productsProcessed++;
      } catch (e) {
        failedProducts.push({ id: p.id, name: p.name, error: e.message });
      }
    }

    return json({
      ok: true, productsProcessed,
      stockRecordsCreated: totalCreated, stockRecordsUpdated: totalUpdated,
      failed: failedProducts.length, failedProducts,
    });
  }

  // -----------------------------------------------------------------------
  // Cron settings + precheck (Treck)
  // -----------------------------------------------------------------------
  if (route === '/import/treck/cron/settings' && method === 'GET') {
    const s = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'treck_cron_enabled' });
    const lastRun = await db.collection(TRECK_HIST_COLL).findOne({ type: 'refresh_prices' }, { sort: { createdAt: -1 } });
    return json({
      enabled: s ? !!s.value : true,
      schedule: '45 3 * * *',
      humanSchedule: 'Diariamente a las 00:45 hrs Chile',
      lastRunAt: lastRun?.createdAt || null,
      lastRunStats: lastRun?.stats || null,
    });
  }
  if (route === '/import/treck/cron/settings' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    await db.collection(SETTINGS_COLLECTION).updateOne(
      { key: 'treck_cron_enabled' },
      { $set: { key: 'treck_cron_enabled', value: !!body.enabled, updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    return json({ ok: true, enabled: !!body.enabled });
  }
  if (route === '/import/treck/cron/precheck' && method === 'GET') {
    const s = await db.collection(SETTINGS_COLLECTION).findOne({ key: 'treck_cron_enabled' });
    const enabled = s ? !!s.value : true;
    return json({ runNow: enabled, enabled, reason: enabled ? 'enabled' : 'disabled_by_user' });
  }

  return null;
}
