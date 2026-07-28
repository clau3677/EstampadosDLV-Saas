// /app/lib/api/import/_shared.js
// -------------------------------------------------------------------------
// Helpers y factories reutilizados por los 3 handlers de importación:
//   - cottonext.js
//   - textilryu.js
//   - treck.js
//
// Contiene:
//   • Constantes (DEFAULT_STOCK_ON_DEMAND, SETTINGS_COLLECTION)
//   • Helpers de precio (roundChilean, applyMarkup)
//   • syncInventoryForVariants (crea/actualiza stock por variante)
//   • buildProductDoc (arma el documento Product a insertar en Mongo)
//   • importWithRaceProtection (loop con protección E11000)
//   • Factories de handlers comunes (history, imported list, sync-inventory,
//     refresh-prices, cron/settings, cron/precheck)
// -------------------------------------------------------------------------
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip, PRODUCT_CATEGORY } from '@/lib/models';
import { json, err } from '../_helpers';
import { downloadImage } from '@/lib/import/image-downloader';
import { paraphraseDescription } from '@/lib/import/paraphraser';
import { slugify } from '@/lib/import/cottonext';

export const SETTINGS_COLLECTION      = 'app_settings';
export const DEFAULT_STOCK_ON_DEMAND  = 99;

// -------------------------------------------------------------------------
// Etiqueta amigable por proveedor (para location del stock)
// -------------------------------------------------------------------------
function supplierLabelOf(supplierName) {
  return supplierName === 'cottonext' ? 'Cottonext'
       : supplierName === 'textilryu' ? 'Textil Ryu'
       : supplierName === 'treck'     ? 'Treck'
       : supplierName;
}

// -------------------------------------------------------------------------
// Crea o actualiza el commercial_stock para todas las variantes de un producto.
// GENÉRICO: acepta cualquier supplier. Idempotente: usa (productId, variantId).
// Retorna { created, updated }.
// -------------------------------------------------------------------------
export async function syncInventoryForVariants(db, product, sourceVariants = [], supplierName = 'unknown') {
  const stockColl = db.collection(COLLECTIONS.COMMERCIAL_STOCK);
  let created = 0, updated = 0;
  const now = new Date();
  const supplierLabel = supplierLabelOf(supplierName);

  for (const v of product.variants) {
    // Modelo de negocio: TODOS los productos de proveedores son "bajo pedido".
    // Mantenemos stock=99 siempre, independiente de la disponibilidad en el proveedor.
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
    const targetQty = DEFAULT_STOCK_ON_DEMAND; // siempre 99, bajo pedido

    // eslint-disable-next-line no-await-in-loop
    const existing = await stockColl.findOne({ productId: product.id, variantId: v.id });
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
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
      // eslint-disable-next-line no-await-in-loop
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
// Estrategia: redondear al múltiplo de 10 más cercano, con preferencia por xx90
// (que es el estándar en retail chileno).
// -------------------------------------------------------------------------
export function roundChilean(v) {
  if (v <= 0) return 0;
  const nearest10 = Math.round(v / 10) * 10;
  const lastTwo = nearest10 % 100;
  if (lastTwo === 0)                          return nearest10 - 10;   // 5500 → 5490
  if (lastTwo === 100)                        return nearest10 - 10;   // 5600 → 5590
  if (lastTwo <= 40)                          return nearest10 - lastTwo - 10; // 5430 → 5390
  if (lastTwo >= 50 && lastTwo <= 89)         return nearest10 + (90 - lastTwo); // 5450 → 5490
  return nearest10; // ya termina en 90
}

// -------------------------------------------------------------------------
// Aplica markup + redondeo comercial. Base = precio mayorista 10+.
// -------------------------------------------------------------------------
export function applyMarkup(basePrice, pct = 40) {
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
export async function buildProductDoc({ item, markupPercent, paraphrase, existingProduct, supplierName }) {
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
    description = await paraphraseDescription(item.descriptionText);
  }

  // 3. Calcular precio final desde precio mayorista
  const supplierPrice = item.priceWholesale || item.priceUnit || 0;
  const finalPrice = applyMarkup(supplierPrice, markupPercent);

  // 4. Construir variantes
  // Caso A: proveedor entrega variants[] con color+size (Cottonext, Treck)
  // Caso B: proveedor entrega solo colors[] (Textil Ryu — gorras unitalla)
  //
  // IMPORTANTE: Cuando existingProduct existe, preservamos los variant.id previos
  // usando (color, size) como natural key. Sin esto, cada re-import regenera IDs
  // y los stock records quedan huérfanos → POS muestra 0 stock.
  //
  // Cada variante puede tener su imagen específica (v.image URL remota). La descargamos
  // por separado y la asociamos a `variant.image` (path local). Esto permite que el POS
  // muestre la foto del COLOR correcto para cada card.
  const variants = [];
  const supplierPrefix = (supplierName || 'SUP').slice(0, 4).toUpperCase();
  const findExistingVariant = (color, size) => {
    if (!existingProduct?.variants?.length) return null;
    return existingProduct.variants.find(ev =>
      (ev.attributes?.color === color) && (ev.attributes?.size === size)
    ) || null;
  };

  // Cache: URL remota → path local (evita descargar la misma imagen múltiples veces)
  const remoteToLocal = new Map();
  for (const url of (item.images || [])) {
    if (typeof url === 'string' && url.startsWith('/uploads/')) {
      remoteToLocal.set(url, url); // ya es local
    }
  }
  const downloadVariantImage = async (remoteUrl) => {
    if (!remoteUrl) return null;
    if (remoteUrl.startsWith('/uploads/')) return remoteUrl;
    if (remoteToLocal.has(remoteUrl)) return remoteToLocal.get(remoteUrl);
    const local = await downloadImage(remoteUrl, supplierName || 'cottonext');
    if (local) remoteToLocal.set(remoteUrl, local);
    return local;
  };

  if (Array.isArray(item.variants) && item.variants.length > 0) {
    const variantMap = new Map();
    for (const v of item.variants) {
      const key = `${v.color}::${v.size}`;
      if (variantMap.has(key)) continue;
      const existingV = findExistingVariant(v.color, v.size);
      // eslint-disable-next-line no-await-in-loop
      const localImg = await downloadVariantImage(v.image);
      variantMap.set(key, {
        id: existingV?.id || uuidv4(),
        name: `${v.color} · ${v.size}`,
        sku: `${supplierPrefix}-${item.supplierProductId}-${slugify(v.color)}-${v.size}`.toUpperCase(),
        price: finalPrice,
        attributes: { size: v.size, color: v.color },
        image: localImg || existingV?.image || null,
        _supplierInStock: v.inStock,
      });
    }
    variants.push(...Array.from(variantMap.values()));
  } else if (Array.isArray(item.colors) && item.colors.length > 0) {
    for (const c of item.colors) {
      const existingV = findExistingVariant(c, 'única');
      variants.push({
        id: existingV?.id || uuidv4(),
        name: c,
        sku: `${supplierPrefix}-${item.supplierProductId}-${slugify(c)}`.toUpperCase(),
        price: finalPrice,
        attributes: { color: c, size: 'única' },
        image: existingV?.image || null,
        _supplierInStock: item.hasStock !== false,
      });
    }
  } else {
    // Sin variantes conocidas: crear una única "estándar"
    const existingV = findExistingVariant('estándar', 'única');
    variants.push({
      id: existingV?.id || uuidv4(),
      name: 'Estándar',
      sku: `${supplierPrefix}-${item.supplierProductId}`.toUpperCase(),
      price: finalPrice,
      attributes: { size: 'única', color: 'estándar' },
      image: existingV?.image || null,
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

// -------------------------------------------------------------------------
// Loop de importación con protección contra race-condition E11000.
// Recibe los items ya filtrados del scan y ejecuta upsert idempotente.
//
// Params:
//   • db, items[]
//   • supplierName ('cottonext' | 'textilryu' | 'treck')
//   • markupPercent, paraphrase (para buildProductDoc)
//   • extractSourceVariants(item) → array a pasar a syncInventoryForVariants
//   • decorateDoc(doc, item) → opcional, para inyectar metadata extra (ej: workwearType en Treck)
//
// Retorna stats { attempted, created, updated, failed, details }.
// -------------------------------------------------------------------------
export async function importWithRaceProtection({
  db,
  items,
  supplierName,
  markupPercent = 40,
  paraphrase = true,
  extractSourceVariants = () => [],
  decorateDoc = null,
}) {
  const stats = { attempted: items.length, created: 0, updated: 0, failed: 0, details: [] };
  const products = db.collection(COLLECTIONS.PRODUCTS);

  for (const item of items) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const existing = await products.findOne({
        supplier: supplierName,
        supplierProductId: String(item.supplierProductId),
      });

      // eslint-disable-next-line no-await-in-loop
      const doc = await buildProductDoc({
        item,
        markupPercent,
        paraphrase,
        existingProduct: existing,
        supplierName,
      });

      // Hook para metadata extra específica del proveedor
      if (typeof decorateDoc === 'function') decorateDoc(doc, item);

      const sourceVariants = extractSourceVariants(item);

      if (existing) {
        // eslint-disable-next-line no-await-in-loop
        await products.updateOne({ id: existing.id }, { $set: doc });
        // eslint-disable-next-line no-await-in-loop
        await syncInventoryForVariants(db, doc, sourceVariants, supplierName);
        stats.updated++;
        stats.details.push({ id: item.supplierProductId, name: doc.name, action: 'updated', productId: doc.id });
      } else {
        try {
          // eslint-disable-next-line no-await-in-loop
          await products.insertOne(doc);
          // eslint-disable-next-line no-await-in-loop
          await syncInventoryForVariants(db, doc, sourceVariants, supplierName);
          stats.created++;
          stats.details.push({ id: item.supplierProductId, name: doc.name, action: 'created', productId: doc.id });
        } catch (insertErr) {
          // Fallback anti race-condition: si dup key (E11000), re-consulta y hace update.
          // Ocurre cuando dos imports concurrentes procesan el mismo supplierProductId.
          if (insertErr?.code === 11000) {
            // eslint-disable-next-line no-await-in-loop
            const raced = await products.findOne({
              supplier: supplierName,
              supplierProductId: String(item.supplierProductId),
            });
            if (raced) {
              // Conservar el id original + createdAt para no duplicar
              const patch = { ...doc, id: raced.id, createdAt: raced.createdAt };
              // eslint-disable-next-line no-await-in-loop
              await products.updateOne({ id: raced.id }, { $set: patch });
              // eslint-disable-next-line no-await-in-loop
              await syncInventoryForVariants(db, patch, sourceVariants, supplierName);
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
      console.error(`[${supplierName}:import] failed for`, item.supplierProductId, e);
      stats.failed++;
      stats.details.push({ id: item.supplierProductId, name: item.shortName, action: 'failed', error: e.message });
    }
  }
  return stats;
}

// -------------------------------------------------------------------------
// Factory: refresh-prices handler
// Re-scrapea cada producto importado y actualiza SOLO su precio si cambió.
//
// Params:
//   • db, supplierName
//   • historyCollection
//   • scrapeSingleFn(supplierProductId) → { priceWholesale, priceUnit, ... } | null
//   • delayMs (rate limit entre productos)
// -------------------------------------------------------------------------
export async function refreshPricesGeneric({ db, supplierName, historyCollection, scrapeSingleFn, delayMs = 300, mapId = null }) {
  const products = db.collection(COLLECTIONS.PRODUCTS);
  const existing = await products.find({ supplier: supplierName }).toArray();
  if (existing.length === 0) return json({ ok: true, updated: 0, unchanged: 0 });

  let updated = 0, unchanged = 0, failed = 0;
  const details = [];

  for (const p of existing) {
    // Permite mapear el id que necesita el scraper (ej: TextilRyu usa slug)
    const scrapeArg = typeof mapId === 'function' ? mapId(p) : p.supplierProductId;
    // eslint-disable-next-line no-await-in-loop
    const fresh = await scrapeSingleFn(scrapeArg);
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
    await new Promise(r => setTimeout(r, delayMs));
  }

  await db.collection(historyCollection).insertOne({
    id: uuidv4(),
    type: 'refresh_prices',
    stats: { updated, unchanged, failed },
    details,
    createdAt: new Date(),
  });

  return json({ ok: true, updated, unchanged, failed, details });
}

// -------------------------------------------------------------------------
// Factory: /history handler (últimos 20 registros de una colección)
// -------------------------------------------------------------------------
export async function historyHandler(db, collectionName) {
  const rows = await db.collection(collectionName)
    .find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return json(strip(rows));
}

// -------------------------------------------------------------------------
// Factory: /imported handler (lista productos ya importados)
// -------------------------------------------------------------------------
export async function importedListHandler(db, supplierName, extraProjection = {}) {
  const baseProjection = {
    id: 1, name: 1, slug: 1, subcategory: 1, category: 1, supplierBrand: 1,
    supplierProductId: 1, supplierPrice: 1, basePrice: 1,
    markupPercent: 1, lastSyncedAt: 1, active: 1, images: 1,
  };
  const rows = await db.collection(COLLECTIONS.PRODUCTS)
    .find({ supplier: supplierName })
    .sort({ lastSyncedAt: -1 })
    .project({ ...baseProjection, ...extraProjection })
    .toArray();
  return json(strip(rows));
}

// -------------------------------------------------------------------------
// Factory: /sync-inventory handler (backfill de commercial_stock)
// -------------------------------------------------------------------------
export async function syncInventoryHandler(db, supplierName) {
  const products = db.collection(COLLECTIONS.PRODUCTS);
  const list = await products.find({ supplier: supplierName }).toArray();
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
      const r = await syncInventoryForVariants(db, p, syntheticSources, supplierName);
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

// -------------------------------------------------------------------------
// Factories para cron/settings + cron/precheck
// -------------------------------------------------------------------------
export async function cronSettingsGet({ db, settingsKey, historyCollection, schedule, humanSchedule }) {
  const s = await db.collection(SETTINGS_COLLECTION).findOne({ key: settingsKey });
  const lastRun = await db.collection(historyCollection).findOne(
    { type: 'refresh_prices' },
    { sort: { createdAt: -1 } }
  );
  return json({
    enabled: s ? !!s.value : true, // default ON
    schedule,
    humanSchedule,
    lastRunAt: lastRun?.createdAt || null,
    lastRunStats: lastRun?.stats || null,
    updatedAt: s?.updatedAt || null,
    updatedBy: s?.updatedBy || null,
  });
}

export async function cronSettingsPost({ db, request, settingsKey }) {
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const enabled = !!body.enabled;
  await db.collection(SETTINGS_COLLECTION).updateOne(
    { key: settingsKey },
    { $set: {
      key: settingsKey,
      value: enabled,
      updatedAt: new Date(),
    }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  return json({ ok: true, enabled });
}

export async function cronPrecheck({ db, settingsKey }) {
  const s = await db.collection(SETTINGS_COLLECTION).findOne({ key: settingsKey });
  const enabled = s ? !!s.value : true;
  return json({ runNow: enabled, enabled, reason: enabled ? 'enabled' : 'disabled_by_user' });
}

// Re-exports para conveniencia
export { json, err, strip, COLLECTIONS, uuidv4 };
