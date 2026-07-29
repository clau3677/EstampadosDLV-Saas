// ============================================================================
// Pricing API — Ajuste masivo de margen de ganancia por proveedor
// Rutas:
//   GET  /api/pricing/summary  — Resumen de productos por proveedor + markup actual
//   GET  /api/pricing/rules    — Reglas de markup globales y por proveedor
//   POST /api/pricing/adjust   — Aplica nuevo markup a productos seleccionados
// ============================================================================
import { NextResponse } from 'next/server';
import { COLLECTIONS } from '@/lib/models';
import { applyMarkup, roundChilean } from '@/lib/api/import/_shared.js';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function err(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export default async function handlePricing(ctx) {
  const { method, route, db } = ctx;
  const productsColl = db.collection(COLLECTIONS.PRODUCTS);

  // --------------------------------------------------------------------------
  // GET /api/pricing/summary — Resumen de productos por proveedor
  // --------------------------------------------------------------------------
  if (method === 'GET' && route === '/pricing/summary') {
    const docs = await productsColl.find({ active: true }).toArray();

    const bySupplier = {};
    let manualCount = 0;
    let manualTotalPrice = 0;
    let totalVariants = 0;

    for (const doc of docs) {
      const supplier = doc.supplier || 'manual';
      if (!bySupplier[supplier]) {
        bySupplier[supplier] = { count: 0, prices: [], markups: [] };
      }
      bySupplier[supplier].count++;
      bySupplier[supplier].prices.push(doc.basePrice || 0);
      if (doc.markupPercent !== undefined) {
        bySupplier[supplier].markups.push(doc.markupPercent);
      }
      if (doc.supplier) {
        totalVariants += (doc.variants || []).length;
      }
      if (!doc.supplier) {
        manualCount++;
        manualTotalPrice += doc.basePrice || 0;
      }
    }

    const summary = {
      totalProducts: docs.length,
      totalVariants,
      manual: {
        count: manualCount,
        avgPrice: manualCount > 0 ? Math.round(manualTotalPrice / manualCount) : 0,
      },
      bySupplier: Object.entries(bySupplier)
        .filter(([k]) => k !== 'manual')
        .map(([supplier, data]) => {
          const prices = data.prices.filter(p => p > 0);
          const markups = data.markups.length > 0 ? data.markups : [40];
          return {
            supplier,
            count: data.count,
            avgMarkup: Math.round(markups.reduce((a, b) => a + b, 0) / markups.length),
            avgPrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
            minPrice: prices.length > 0 ? Math.min(...prices) : 0,
            maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
          };
        }),
    };

    return json(summary);
  }

  // --------------------------------------------------------------------------
  // GET /api/pricing/rules — Reglas de markup globales y por proveedor
  // --------------------------------------------------------------------------
  if (method === 'GET' && route === '/pricing/rules') {
    const settingsColl = db.collection('app_settings');
    const settings = await settingsColl.findOne({ key: 'pricing_rules' });
    const rules = settings?.value || { global: 40 };
    return json({ rules });
  }

  // --------------------------------------------------------------------------
  // POST /api/pricing/adjust — Aplica nuevo markup
  // Body: { newMarkup: number, applyTo: 'suppliers' | 'all', providers: string[] }
  // --------------------------------------------------------------------------
  if (method === 'POST' && route === '/pricing/adjust') {
    const body = await ctx.request.json();
    const { newMarkup, applyTo, providers } = body;

    if (newMarkup === undefined || newMarkup < 0 || newMarkup > 500) {
      return err('Markup debe ser entre 0 y 500');
    }

    const filter = {};
    if (applyTo === 'suppliers') {
      const providerList = Array.isArray(providers) && providers.length > 0
        ? providers
        : ['cottonext', 'textilryu', 'treck'];
      filter.supplier = { $in: providerList };
    }
    // applyTo === 'all' => no filtro, actualiza todos

    const docs = await productsColl.find(filter).toArray();
    let updated = 0;
    const now = new Date();

    for (const doc of docs) {
      const supplierPrice = doc.supplierPrice || doc.cost || 0;
      if (supplierPrice <= 0) continue;

      const newPrice = applyMarkup(supplierPrice, newMarkup);
      const update = {
        markupPercent: newMarkup,
        basePrice: newPrice,
        updatedAt: now,
      };

      // Tambien actualizar el precio de cada variante
      const variantUpdates = (doc.variants || []).map(v => ({
        ...v,
        price: newPrice,
      }));
      if (variantUpdates.length > 0) {
        update.variants = variantUpdates;
      }

      // eslint-disable-next-line no-await-in-loop
      await productsColl.updateOne({ id: doc.id }, { $set: update });

      // Tambien actualizar el commercial_stock si existe
      const stockColl = db.collection(COLLECTIONS.COMMERCIAL_STOCK);
      for (const v of doc.variants || []) {
        // eslint-disable-next-line no-await-in-loop
        await stockColl.updateOne(
          { productId: doc.id, variantId: v.id },
          { $set: { price: newPrice, updatedAt: now } },
        );
      }

      updated++;
    }

    // Guardar las reglas
    const settingsColl = db.collection('app_settings');
    const currentRules = (await settingsColl.findOne({ key: 'pricing_rules' }))?.value || { global: 40 };
    const newRules = { ...currentRules, global: newMarkup };
    if (Array.isArray(providers) && providers.length > 0) {
      providers.forEach(p => { newRules[p] = newMarkup; });
    }
    // eslint-disable-next-line no-await-in-loop
    await settingsColl.updateOne(
      { key: 'pricing_rules' },
      { $set: { value: newRules, updatedAt: now } },
      { upsert: true },
    );

    return json({
      updated,
      newMarkup,
      providers: applyTo === 'all' ? 'all' : providers,
    });
  }

  return null; // no aplica
}
