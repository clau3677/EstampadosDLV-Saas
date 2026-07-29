// /api/inventory/commercial GET · /api/inventory/supplies CRUD+bulk · /api/inventory/adjust POST · /api/stock-movements GET
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';

export default async function handleInventory(ctx) {
  const { method, route, db, request } = ctx;

  // GET /api/inventory/commercial?productId=<id>
  if (route === '/inventory/commercial' && method === 'GET') {
    const productId = request.nextUrl?.searchParams?.get('productId') || request.url.split('?productId=')[1]?.split('&')[0] || null;
    const filter = productId ? { productId } : {};
    const rows = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).find(filter).toArray();
    return json(strip(rows));
  }

  // GET /api/inventory/supplies
  if (route === '/inventory/supplies' && method === 'GET') {
    const rows = await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).find({}).sort({ name: 1 }).toArray();
    return json(strip(rows));
  }

  // POST /api/inventory/supplies
  if (route === '/inventory/supplies' && method === 'POST') {
    const body = await request.json();
    const { code, name, type, unit, currentQuantity, minAlert, cost, supplier } = body;
    if (!name || !type || !unit) return err('name, type y unit son requeridos');
    const now = new Date();
    const doc = {
      id: uuidv4(),
      code: code || `SUP-${Date.now()}`,
      name, type, unit,
      currentQuantity: Number(currentQuantity) || 0,
      minAlert: Number(minAlert) || 0,
      cost: Number(cost) || 0,
      supplier: supplier || '',
      lastRestockAt: Number(currentQuantity) > 0 ? now : null,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).insertOne(doc);
    if (doc.currentQuantity > 0) {
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(),
        type: 'supply_in',
        reference: 'manual',
        referenceId: doc.id,
        itemType: 'supply',
        itemId: doc.id,
        quantity: doc.currentQuantity,
        balanceAfter: doc.currentQuantity,
        operatorId: null,
        reason: 'Creación inicial de insumo',
        createdAt: now,
      });
    }
    return json(strip(doc));
  }

  // PATCH /api/inventory/supplies
  if (route === '/inventory/supplies' && method === 'PATCH') {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return err('id requerido');
    delete updates.currentQuantity;
    delete updates.id;
    updates.updatedAt = new Date();
    await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).updateOne({ id }, { $set: updates });
    return json({ ok: true });
  }

  // DELETE /api/inventory/supplies
  if (route === '/inventory/supplies' && method === 'DELETE') {
    const { id } = await request.json();
    if (!id) return err('id requerido');
    const doc = await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).findOne({ id });
    if (!doc) return err('no encontrado', 404);
    if (doc.currentQuantity > 0) {
      return err(`No se puede eliminar: aún hay ${doc.currentQuantity} ${doc.unit} en stock. Ajusta a 0 primero.`);
    }
    await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).deleteOne({ id });
    return json({ ok: true });
  }

  // POST /api/inventory/supplies/bulk
  if (route === '/inventory/supplies/bulk' && method === 'POST') {
    const body = await request.json();
    const { items } = body;
    if (!Array.isArray(items) || items.length === 0) return err('items requerido (array)');
    const now = new Date();
    let created = 0;
    const errors = [];

    for (const item of items) {
      try {
        if (!item.name || !item.type || !item.unit) {
          errors.push({ item: item.name || '(sin nombre)', error: 'name, type y unit requeridos' });
          continue;
        }
        const doc = {
          id: uuidv4(),
          code: item.code || `SUP-${Date.now()}-${created}`,
          name: item.name, type: item.type, unit: item.unit,
          currentQuantity: Number(item.currentQuantity) || 0,
          minAlert: Number(item.minAlert) || 0,
          cost: Number(item.cost) || 0,
          supplier: item.supplier || '',
          lastRestockAt: Number(item.currentQuantity) > 0 ? now : null,
          updatedAt: now,
        };
        await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).insertOne(doc);
        created++;
      } catch (e) {
        errors.push({ item: item.name || '?', error: e.message });
      }
    }

    return json({ ok: true, created, errors, total: items.length });
  }

  // POST /api/inventory/adjust
  if (route === '/inventory/adjust' && method === 'POST') {
    const { itemType, itemId, delta, reason } = await request.json();
    const numDelta = Number(delta);
    if (!itemType || !itemId || isNaN(numDelta) || numDelta === 0) return err('parámetros inválidos');
    if (!['supply', 'commercial'].includes(itemType)) return err('itemType inválido');

    const collName = itemType === 'supply' ? COLLECTIONS.PRODUCTION_SUPPLIES : COLLECTIONS.COMMERCIAL_STOCK;
    const qtyField = itemType === 'supply' ? 'currentQuantity' : 'quantity';

    const doc = await db.collection(collName).findOne({ id: itemId });
    if (!doc) return err('item no encontrado', 404);

    const currentQty = doc[qtyField] || 0;
    const newQty = currentQty + numDelta;
    if (newQty < 0) return err(`Stock no puede quedar negativo (${currentQty} + ${numDelta})`);

    // Si es un producto on-demand y el ajuste lo dejaría en 0, restaurar a DEFAULT_STOCK_ON_DEMAND
    // porque estos productos son "bajo pedido" y nunca deben agotarse en el inventario comercial.
    const DEFAULT_STOCK_ON_DEMAND = 99;
    if (itemType === 'commercial' && doc.onDemand && newQty === 0) {
      const now = new Date();
      await db.collection(collName).updateOne(
        { id: itemId },
        { $set: { [qtyField]: DEFAULT_STOCK_ON_DEMAND, updatedAt: now } }
      );
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(),
        type: 'commercial_in',
        reference: 'system',
        referenceId: itemId,
        itemType: 'product_variant',
        itemId,
        quantity: DEFAULT_STOCK_ON_DEMAND - currentQty,
        balanceAfter: DEFAULT_STOCK_ON_DEMAND,
        operatorId: null,
        reason: 'Auto-restauración: producto bajo pedido no puede quedar con 0 stock',
        createdAt: now,
      });
      return json({ ok: true, newQuantity: DEFAULT_STOCK_ON_DEMAND, previousQuantity: currentQty, autoRestored: true });
    }

    const now = new Date();
    const updateSet = { [qtyField]: newQty, updatedAt: now };
    if (itemType === 'supply' && numDelta > 0) updateSet.lastRestockAt = now;

    await db.collection(collName).updateOne({ id: itemId }, { $set: updateSet });

    await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
      id: uuidv4(),
      type: itemType === 'supply'
        ? (numDelta > 0 ? 'supply_in' : 'supply_out')
        : (numDelta > 0 ? 'commercial_in' : 'commercial_out'),
      reference: 'manual',
      referenceId: itemId,
      itemType: itemType === 'supply' ? 'supply' : 'product_variant',
      itemId,
      quantity: numDelta,
      balanceAfter: newQty,
      operatorId: null,
      reason: reason || 'Ajuste manual',
      createdAt: now,
    });

    return json({ ok: true, newQuantity: newQty, previousQuantity: currentQty });
  }

  // GET /api/stock-movements — bitácora
  if (route === '/stock-movements' && method === 'GET') {
    const rows = await db.collection(COLLECTIONS.STOCK_MOVEMENTS)
      .find({}).sort({ createdAt: -1 }).limit(200).toArray();
    return json(strip(rows));
  }

  return null;
}
