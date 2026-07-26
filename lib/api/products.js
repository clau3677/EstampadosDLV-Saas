// /api/products GET · POST · PATCH · DELETE · /api/products/bulk POST
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err, slugify } from './_helpers';

export default async function handleProducts(ctx) {
  const { method, route, db, request } = ctx;

  // GET /api/products — catálogo público
  if (route === '/products' && method === 'GET') {
    const items = await db.collection(COLLECTIONS.PRODUCTS).find({}).sort({ createdAt: -1 }).toArray();
    return json(strip(items));
  }

  // POST /api/products — crear producto con variantes
  if (route === '/products' && method === 'POST') {
    const body = await request.json();
    const { name, sku, category, subcategory, description, basePrice, cost, variants } = body;
    if (!name || !category) return err('name y category son requeridos');

    const now = new Date();
    const productId = uuidv4();
    const slug = slugify(name);
    const baseSku = sku || `PRD-${Date.now()}`;
    const processedVariants = (Array.isArray(variants) && variants.length > 0 ? variants : [
      { name: 'Único', attributes: {}, initialStock: 0 },
    ]).map((v, i) => ({
      id: uuidv4(),
      name: v.name || `Variante ${i + 1}`,
      sku: v.sku || `${baseSku}-${i + 1}`,
      price: Number(v.price) || Number(basePrice) || 0,
      attributes: v.attributes || {},
      _initialStock: Number(v.initialStock) || 0,
    }));

    const productDoc = {
      id: productId,
      sku: baseSku,
      name,
      slug,
      category,
      subcategory: subcategory || '',
      description: description || '',
      images: [],
      basePrice: Number(basePrice) || 0,
      cost: Number(cost) || 0,
      variants: processedVariants.map(({ _initialStock, ...v }) => v),
      active: true,
      seoMeta: { title: name, description: description || '', keywords: [] },
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.PRODUCTS).insertOne(productDoc);

    const stockRows = processedVariants.map(v => ({
      id: uuidv4(),
      productId,
      variantId: v.id,
      quantity: v._initialStock || 0,
      reservedQuantity: 0,
      location: 'Bodega Principal',
      minStockAlert: 5,
      updatedAt: now,
    }));
    if (stockRows.length > 0) {
      await db.collection(COLLECTIONS.COMMERCIAL_STOCK).insertMany(stockRows);
      for (const s of stockRows) {
        if (s.quantity > 0) {
          await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
            id: uuidv4(),
            type: 'commercial_in',
            reference: 'manual',
            referenceId: s.id,
            itemType: 'product_variant',
            itemId: s.variantId,
            quantity: s.quantity,
            balanceAfter: s.quantity,
            operatorId: null,
            reason: `Creación inicial de "${name}"`,
            createdAt: now,
          });
        }
      }
    }

    return json({ ok: true, product: strip(productDoc), stockRows: stockRows.length });
  }

  // PATCH /api/products — editar producto (con reemplazo de variantes)
  if (route === '/products' && method === 'PATCH') {
    const body = await request.json();
    const { id, variants, ...rest } = body;
    if (!id) return err('id requerido');

    const existing = await db.collection(COLLECTIONS.PRODUCTS).findOne({ id });
    if (!existing) return err('producto no encontrado', 404);

    const updates = { ...rest, updatedAt: new Date() };
    delete updates.createdAt;

    if (Array.isArray(variants)) {
      const newVariants = variants.map((v, i) => ({
        id: v.id || uuidv4(),
        name: v.name || `Variante ${i + 1}`,
        sku: v.sku || `${rest.sku || existing.sku}-${i + 1}`,
        price: Number(v.price) || Number(rest.basePrice) || existing.basePrice,
        attributes: v.attributes || {},
      }));
      updates.variants = newVariants;

      const existingVariantIds = new Set(existing.variants.map(v => v.id));
      const newVariantIds = new Set(newVariants.map(v => v.id));

      const toDelete = [...existingVariantIds].filter(vid => !newVariantIds.has(vid));
      if (toDelete.length) {
        await db.collection(COLLECTIONS.COMMERCIAL_STOCK).deleteMany({
          productId: id, variantId: { $in: toDelete },
        });
      }

      const toCreate = newVariants.filter(v => !existingVariantIds.has(v.id));
      if (toCreate.length) {
        const rows = toCreate.map(v => ({
          id: uuidv4(),
          productId: id,
          variantId: v.id,
          quantity: Number(v._initialStock) || 0,
          reservedQuantity: 0,
          location: 'Bodega Principal',
          minStockAlert: 5,
          updatedAt: new Date(),
        }));
        await db.collection(COLLECTIONS.COMMERCIAL_STOCK).insertMany(rows);
      }
    }

    await db.collection(COLLECTIONS.PRODUCTS).updateOne({ id }, { $set: updates });
    const updated = await db.collection(COLLECTIONS.PRODUCTS).findOne({ id });
    return json({ ok: true, product: strip(updated) });
  }

  // DELETE /api/products — soft (default) o hard con cascada
  if (route === '/products' && method === 'DELETE') {
    const body = await request.json();
    const { id, hard = false } = body;
    if (!id) return err('id requerido');
    if (hard) {
      const orderItems = await db.collection(COLLECTIONS.ORDER_ITEMS).countDocuments({ productId: id });
      if (orderItems > 0) {
        return err(`No se puede eliminar: tiene ${orderItems} línea(s) de pedido asociada(s). Puedes desactivarlo en su lugar.`);
      }
      await db.collection(COLLECTIONS.PRODUCTS).deleteOne({ id });
      await db.collection(COLLECTIONS.COMMERCIAL_STOCK).deleteMany({ productId: id });
    } else {
      await db.collection(COLLECTIONS.PRODUCTS).updateOne({ id }, { $set: { active: false, updatedAt: new Date() } });
    }
    return json({ ok: true, mode: hard ? 'hard' : 'soft' });
  }

  // POST /api/products/bulk — import masivo de productos
  if (route === '/products/bulk' && method === 'POST') {
    const body = await request.json();
    const { items } = body;
    if (!Array.isArray(items) || items.length === 0) return err('items requerido (array)');
    const now = new Date();
    let created = 0;
    const errors = [];

    for (const item of items) {
      try {
        if (!item.name || !item.category) {
          errors.push({ item: item.name || '(sin nombre)', error: 'name y category requeridos' });
          continue;
        }
        const productId = uuidv4();
        const slug = slugify(item.name);
        const baseSku = item.sku || `PRD-${Date.now()}-${created}`;
        const rawVariants = Array.isArray(item.variants) && item.variants.length > 0
          ? item.variants
          : [{ name: 'Único', attributes: {}, initialStock: 0 }];
        const processedVariants = rawVariants.map((v, i) => ({
          id: uuidv4(),
          name: v.name || `Variante ${i + 1}`,
          sku: v.sku || `${baseSku}-${i + 1}`,
          price: Number(v.price) || Number(item.basePrice) || 0,
          attributes: v.attributes || {},
          _initialStock: Number(v.initialStock) || 0,
        }));

        await db.collection(COLLECTIONS.PRODUCTS).insertOne({
          id: productId, sku: baseSku, name: item.name, slug,
          category: item.category, subcategory: item.subcategory || '',
          description: item.description || '', images: item.images || [],
          basePrice: Number(item.basePrice) || 0, cost: Number(item.cost) || 0,
          variants: processedVariants.map(({ _initialStock, ...v }) => v),
          active: true,
          seoMeta: { title: item.name, description: item.description || '', keywords: [] },
          createdAt: now, updatedAt: now,
        });

        const stockRows = processedVariants.map(v => ({
          id: uuidv4(), productId, variantId: v.id,
          quantity: v._initialStock, reservedQuantity: 0,
          location: 'Bodega Principal', minStockAlert: 5, updatedAt: now,
        }));
        if (stockRows.length) await db.collection(COLLECTIONS.COMMERCIAL_STOCK).insertMany(stockRows);
        created++;
      } catch (e) {
        errors.push({ item: item.name || '?', error: e.message });
      }
    }

    return json({ ok: true, created, errors, total: items.length });
  }

  return null;
}
