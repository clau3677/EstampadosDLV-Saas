// /api/products GET · POST · PATCH · DELETE · /api/products/bulk POST
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err, slugify } from './_helpers';

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\[\]\\]/g, '\\$&');
}

function applyCatalogFilters(url, { includeActive = true } = {}) {
  const query = {};
  if (includeActive) query.active = true;
  const category = url.searchParams.get('category') || url.searchParams.get('cat');
  const subcategory = url.searchParams.get('subcategory') || url.searchParams.get('sub');
  const supplier = url.searchParams.get('supplier');
  const q = url.searchParams.get('q') || url.searchParams.get('search');
  if (category && category !== 'all') query.category = category;
  if (subcategory && subcategory !== 'all') query.subcategory = subcategory;
  if (supplier) {
    const supplierRegex = new RegExp(`^${escapeRegex(supplier)}$`, 'i');
    query.$or = [
      { supplier: supplierRegex },
      { supplierName: supplierRegex },
      { supplierBrand: supplierRegex },
      { supplierCode: supplierRegex },
    ];
  }
  if (q?.trim()) {
    const regex = new RegExp(escapeRegex(q.trim()), 'i');
    query.$and = [...(query.$and || []), { $or: [{ name: regex }, { description: regex }, { sku: regex }, { supplierBrand: regex }] }];
  }
  return query;
}

function buildProductFacets(rows) {
  const categories = {};
  const subcategories = {};
  for (const row of rows) {
    const category = row._id?.category;
    const subcategory = row._id?.subcategory;
    if (category) categories[category] = (categories[category] || 0) + row.count;
    if (subcategory) subcategories[subcategory] = (subcategories[subcategory] || 0) + row.count;
  }
  return { categories, subcategories };
}

export default async function handleProducts(ctx) {
  const { method, route, db, request } = ctx;

  // GET /api/products — catálogo público
  // ?lite=true — solo campos esenciales (para mockup editor)
  if (route === '/products' && method === 'GET') {
    const url = new URL(request.url);
    const lite = url.searchParams.get('lite') === 'true';
    if (lite) {
      const includeVariants = url.searchParams.get('includeVariants') === 'true';
      const paginated = url.searchParams.has('page') || url.searchParams.has('limit') || url.searchParams.get('paginated') === 'true';
      const page = positiveInt(url.searchParams.get('page'), 1);
      const limit = Math.min(MAX_PAGE_SIZE, positiveInt(url.searchParams.get('limit'), 100));
      const query = applyCatalogFilters(url, { includeActive: true });
      const projection = { id: 1, sku: 1, name: 1, slug: 1, category: 1, subcategory: 1, images: 1, basePrice: 1, active: 1, supplier: 1, supplierBrand: 1, ...(includeVariants ? { variants: 1 } : {}) };
      const cursor = db.collection(COLLECTIONS.PRODUCTS).find(query, { projection }).sort({ name: 1 });
      const items = paginated ? await cursor.skip((page - 1) * limit).limit(limit).toArray() : await cursor.toArray();
      const mapped = includeVariants ? items.map(p => ({ ...strip(p), variants: (p.variants || []).map(v => ({ id: v.id, name: v.name, sku: v.sku, price: Number(v.price) || 0, attributes: v.attributes || {} })) })) : strip(items);
      if (!paginated) return json(mapped);
      const total = await db.collection(COLLECTIONS.PRODUCTS).countDocuments(query);
      return json({ items: mapped, total, page, limit, pageCount: Math.max(1, Math.ceil(total / limit)), hasMore: page * limit < total });
    }
    // ?shop=true — para la tienda: solo campos necesarios para las tarjetas de producto
    const shop = url.searchParams.get('shop') === 'true';
    if (shop) {
      const paginated = url.searchParams.has('page') || url.searchParams.has('limit') || url.searchParams.get('paginated') === 'true';
      const query = applyCatalogFilters(url, { includeActive: true });
      const projection = { id: 1, name: 1, slug: 1, category: 1, subcategory: 1, images: 1, basePrice: 1, description: 1, featured: 1, active: 1, variants: { $slice: 1 } };
      const cursor = db.collection(COLLECTIONS.PRODUCTS).find(query, { projection }).sort({ featured: -1, createdAt: -1, name: 1 });
      if (!paginated) {
        const items = await cursor.toArray();
        return json(items.map(p => ({
          id: p.id, name: p.name, slug: p.slug, category: p.category, subcategory: p.subcategory,
          images: p.images, basePrice: p.basePrice, description: p.description, featured: p.featured, active: p.active,
          variantCount: p.variants?.length || 1, minPrice: p.variants?.[0]?.price || p.basePrice,
        })));
      }
      const page = positiveInt(url.searchParams.get('page'), 1);
      const limit = Math.min(MAX_PAGE_SIZE, positiveInt(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE));
      const facetQuery = { ...applyCatalogFilters(url, { includeActive: true }) };
      delete facetQuery.category;
      delete facetQuery.subcategory;
      const categoryFacetQuery = applyCatalogFilters(url, { includeActive: true });
      delete categoryFacetQuery.subcategory;
      const [items, total, categoryRows, subcategoryRows] = await Promise.all([
        cursor.skip((page - 1) * limit).limit(limit).toArray(),
        db.collection(COLLECTIONS.PRODUCTS).countDocuments(query),
        db.collection(COLLECTIONS.PRODUCTS).aggregate([
          { $match: facetQuery },
          { $group: { _id: { category: '$category', subcategory: '$subcategory' }, count: { $sum: 1 } } },
        ]).toArray(),
        db.collection(COLLECTIONS.PRODUCTS).aggregate([
          { $match: categoryFacetQuery },
          { $group: { _id: { category: '$category', subcategory: '$subcategory' }, count: { $sum: 1 } } },
        ]).toArray(),
      ]);
      const mapItem = (p) => ({
        id: p.id, name: p.name, slug: p.slug, category: p.category, subcategory: p.subcategory,
        images: p.images, basePrice: p.basePrice, description: p.description, featured: p.featured, active: p.active,
        variantCount: p.variants?.length || 1, minPrice: p.variants?.[0]?.price || p.basePrice,
      });
      const categoryFacets = buildProductFacets(categoryRows);
      const subcategoryFacets = buildProductFacets(subcategoryRows);
      return json({
        items: items.map(mapItem), total, page, limit,
        pageCount: Math.max(1, Math.ceil(total / limit)), hasMore: page * limit < total,
        facets: { categories: categoryFacets.categories, subcategories: subcategoryFacets.subcategories },
      });
    }
    const paginated = url.searchParams.has('page') || url.searchParams.has('limit') || url.searchParams.get('paginated') === 'true';
    if (paginated) {
      const page = positiveInt(url.searchParams.get('page'), 1);
      const limit = Math.min(MAX_PAGE_SIZE, positiveInt(url.searchParams.get('limit'), 50));
      const query = applyCatalogFilters(url, { includeActive: false });
      const projection = { id: 1, sku: 1, name: 1, slug: 1, category: 1, subcategory: 1, supplier: 1, supplierBrand: 1, supplierProductId: 1, images: { $slice: 1 }, basePrice: 1, cost: 1, featured: 1, active: 1, variants: 1, updatedAt: 1 };
      const [items, total] = await Promise.all([
        db.collection(COLLECTIONS.PRODUCTS).find(query, { projection }).sort({ updatedAt: -1, name: 1 }).skip((page - 1) * limit).limit(limit).toArray(),
        db.collection(COLLECTIONS.PRODUCTS).countDocuments(query),
      ]);
      return json({ items: strip(items), total, page, limit, pageCount: Math.max(1, Math.ceil(total / limit)), hasMore: page * limit < total });
    }
    const items = await db.collection(COLLECTIONS.PRODUCTS).find({}).sort({ createdAt: -1 }).toArray();
    return json(strip(items));
  }

  // POST /api/products — crear producto con variantes
  if (route === '/products' && method === 'POST') {
    const body = await request.json();
    const { name, sku, category, subcategory, description, basePrice, cost, variants, images } = body;
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
      images: Array.isArray(images) ? images : [],
      basePrice: Number(basePrice) || 0,
      cost: Number(cost) || 0,
      variants: processedVariants.map(({ _initialStock, ...v }) => v),
      active: true,
      featured: !!body.featured, // ⭐ destacado en landings/tienda
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
