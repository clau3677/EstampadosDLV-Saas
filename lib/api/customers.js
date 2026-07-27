// ============================================================================
// Módulo Clientes / CRM
// ----------------------------------------------------------------------------
// Base de datos unificada de contactos que vienen de:
//   - Web (checkout)
//   - POS (venta física)
//   - WhatsApp (agente Vicky)
//   - Gang Sheet Builder (subida directa)
//
// La colección `customers` guarda los datos maestros. Los pedidos siguen
// llevando `customerSnapshot` inline (para trazabilidad histórica) además
// del `customerId` cuando el cliente está identificado.
//
// Endpoints expuestos:
//   GET    /api/customers            → lista + KPIs derivados
//   GET    /api/customers/:id        → detalle + historial 360° (orders + gang_sheets)
//   POST   /api/customers            → crear cliente
//   PATCH  /api/customers/:id        → actualizar (name, notes, tags, address, phone, email)
//   DELETE /api/customers/:id        → eliminar (los pedidos quedan huérfanos con su snapshot)
//   POST   /api/customers/backfill   → reconstruye clientes desde los snapshots de orders
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';

// Etiquetas soportadas — el frontend puede sugerirlas pero acepta cualquier string.
export const CUSTOMER_TAGS = ['vip', 'mayorista', 'express', 'moroso', 'recurrente', 'nuevo'];

// Normalizadores para el matching de duplicados
const normEmail = (s) => String(s || '').trim().toLowerCase();
const normPhone = (s) => String(s || '').replace(/\D/g, '').replace(/^56/, ''); // Chile
const normRut = (s) => String(s || '').replace(/[^0-9kK]/gi, '').toUpperCase();

/**
 * Recomputa KPIs derivados de un cliente a partir de sus pedidos.
 * Devuelve el objeto plano con ordersCount, totalSpent, firstOrderAt, lastOrderAt.
 */
async function computeCustomerStats(db, customerId, snapshot = {}) {
  // Un cliente puede tener pedidos ligados por customerId (nueva forma) o por
  // matching del snapshot en pedidos antiguos.
  const orMatch = [{ customerId }];
  if (snapshot.email) orMatch.push({ 'customerSnapshot.email': snapshot.email });
  if (snapshot.phone) orMatch.push({ 'customerSnapshot.phone': snapshot.phone });
  if (snapshot.rut)   orMatch.push({ 'customerSnapshot.rut': snapshot.rut });

  const [agg] = await db.collection(COLLECTIONS.ORDERS).aggregate([
    { $match: { $or: orMatch, status: { $ne: 'cancelled' } } },
    { $group: {
        _id: null,
        c: { $sum: 1 },
        total: { $sum: '$total' },
        first: { $min: '$createdAt' },
        last: { $max: '$createdAt' },
        channels: { $addToSet: '$channel' },
      } },
  ]).toArray();

  return {
    ordersCount: agg?.c || 0,
    totalSpent: agg?.total || 0,
    firstOrderAt: agg?.first || null,
    lastOrderAt: agg?.last || null,
    channels: agg?.channels || [],
  };
}

/**
 * Busca un cliente existente por email/phone/rut (matching normalizado).
 * Devuelve el doc o null.
 */
async function findExisting(db, snapshot) {
  const emailN = normEmail(snapshot.email);
  const phoneN = normPhone(snapshot.phone);
  const rutN = normRut(snapshot.rut);

  const orMatch = [];
  if (emailN) orMatch.push({ emailNorm: emailN });
  if (phoneN) orMatch.push({ phoneNorm: phoneN });
  if (rutN)   orMatch.push({ rutNorm: rutN });

  if (!orMatch.length) return null;
  return await db.collection(COLLECTIONS.CUSTOMERS).findOne({ $or: orMatch });
}

/**
 * Upsert de cliente basado en un snapshot (name/email/phone/rut).
 * Se usa desde otros módulos (orders, POS) cuando se crea una venta.
 *
 * Regla clave: si no hay NINGÚN identificador (email/phone/rut) devuelve null
 * para evitar crear clientes anónimos duplicados ("Cliente Web" × 20).
 */
export async function upsertCustomerFromSnapshot(db, snapshot, extras = {}) {
  if (!snapshot) return null;

  const emailN = normEmail(snapshot.email);
  const phoneN = normPhone(snapshot.phone);
  const rutN = normRut(snapshot.rut);

  // Sin identificadores no se puede identificar → mejor no crear ficha CRM
  if (!emailN && !phoneN && !rutN) return null;

  const existing = await findExisting(db, snapshot);
  const now = new Date();

  const doc = {
    name:      snapshot.name || existing?.name || null,
    email:     snapshot.email || existing?.email || null,
    phone:     snapshot.phone || existing?.phone || null,
    rut:       snapshot.rut   || existing?.rut   || null,
    address:   snapshot.address || existing?.address || null,
    emailNorm: emailN || existing?.emailNorm || null,
    phoneNorm: phoneN || existing?.phoneNorm || null,
    rutNorm:   rutN   || existing?.rutNorm   || null,
    channels:  Array.from(new Set([...(existing?.channels || []), ...(extras.channels || [])])),
    updatedAt: now,
  };

  if (existing) {
    await db.collection(COLLECTIONS.CUSTOMERS).updateOne({ id: existing.id }, { $set: doc });
    return { ...existing, ...doc };
  }

  const id = uuidv4();
  const created = {
    id,
    ...doc,
    tags: extras.tags || [],
    notes: extras.notes || '',
    source: extras.source || 'unknown',
    createdAt: now,
  };
  await db.collection(COLLECTIONS.CUSTOMERS).insertOne(created);
  return created;
}

// ---------------------------------------------------------------------------
// Handler HTTP
// ---------------------------------------------------------------------------
export default async function handleCustomers(ctx) {
  const { method, route, request, db } = ctx;

  // -------- LIST --------
  if (route === '/customers' && method === 'GET') {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const tag = url.searchParams.get('tag');
    const sort = url.searchParams.get('sort') || 'lastOrderAt';
    const limit = Math.min(500, Number(url.searchParams.get('limit')) || 200);

    const filter = {};
    if (tag) filter.tags = tag;

    const customers = await db.collection(COLLECTIONS.CUSTOMERS).find(filter).limit(limit).toArray();

    // Enriquecer con KPIs derivados
    const enriched = await Promise.all(customers.map(async (c) => {
      const stats = await computeCustomerStats(db, c.id, {
        email: c.email, phone: c.phone, rut: c.rut,
      });
      return { ...strip(c), ...stats };
    }));

    // Filtrado por búsqueda (post-enriquecimiento para poder buscar en snapshot)
    const filtered = q
      ? enriched.filter(c =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q) ||
          (c.rut || '').toLowerCase().includes(q)
        )
      : enriched;

    // Ordenar según parámetro
    const sortField = sort === 'totalSpent' ? 'totalSpent'
                    : sort === 'ordersCount' ? 'ordersCount'
                    : sort === 'name' ? 'name'
                    : sort === 'createdAt' ? 'createdAt'
                    : 'lastOrderAt';
    filtered.sort((a, b) => {
      const va = a[sortField] ?? 0;
      const vb = b[sortField] ?? 0;
      if (sortField === 'name') return String(va).localeCompare(String(vb));
      return (new Date(vb).getTime() || vb) - (new Date(va).getTime() || va);
    });

    // KPIs globales
    const totalCustomers = filtered.length;
    const totalRevenue = filtered.reduce((s, c) => s + (c.totalSpent || 0), 0);
    const activeCustomers = filtered.filter(c => {
      if (!c.lastOrderAt) return false;
      const daysAgo = (Date.now() - new Date(c.lastOrderAt).getTime()) / 86400000;
      return daysAgo <= 90;
    }).length;
    const withOrders = filtered.filter(c => (c.ordersCount || 0) > 0).length;
    const avgLtv = withOrders > 0 ? Math.round(totalRevenue / withOrders) : 0;

    return json({
      customers: filtered,
      kpis: { totalCustomers, activeCustomers, totalRevenue, avgLtv, withOrders },
    });
  }

  // -------- DETAIL 360° --------
  const detailMatch = route.match(/^\/customers\/([\w-]+)$/);
  if (detailMatch && method === 'GET') {
    const id = detailMatch[1];
    const customer = await db.collection(COLLECTIONS.CUSTOMERS).findOne({ id });
    if (!customer) return err('cliente no encontrado', 404);

    const stats = await computeCustomerStats(db, customer.id, {
      email: customer.email, phone: customer.phone, rut: customer.rut,
    });

    // Historial 360° de pedidos (match por customerId OR snapshot)
    const orMatch = [{ customerId: customer.id }];
    if (customer.email) orMatch.push({ 'customerSnapshot.email': customer.email });
    if (customer.phone) orMatch.push({ 'customerSnapshot.phone': customer.phone });
    if (customer.rut)   orMatch.push({ 'customerSnapshot.rut': customer.rut });

    const orders = await db.collection(COLLECTIONS.ORDERS)
      .find({ $or: orMatch })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return json({ ...strip(customer), ...stats, orders: strip(orders) });
  }

  // -------- CREATE --------
  if (route === '/customers' && method === 'POST') {
    const body = await request.json();
    if (!body.name || !String(body.name).trim()) return err('name requerido');

    const created = await upsertCustomerFromSnapshot(db, {
      name: body.name.trim(),
      email: body.email || null,
      phone: body.phone || null,
      rut: body.rut || null,
      address: body.address || null,
    }, {
      tags: Array.isArray(body.tags) ? body.tags : [],
      notes: body.notes || '',
      source: body.source || 'manual',
      channels: ['manual'],
    });

    return json(strip(created), 201);
  }

  // -------- UPDATE --------
  if (detailMatch && method === 'PATCH') {
    const id = detailMatch[1];
    const body = await request.json();
    const now = new Date();

    const updates = { updatedAt: now };
    if (typeof body.name === 'string')    updates.name = body.name.trim();
    if (typeof body.email === 'string')   { updates.email = body.email || null; updates.emailNorm = normEmail(body.email); }
    if (typeof body.phone === 'string')   { updates.phone = body.phone || null; updates.phoneNorm = normPhone(body.phone); }
    if (typeof body.rut === 'string')     { updates.rut = body.rut || null; updates.rutNorm = normRut(body.rut); }
    if (typeof body.address === 'string') updates.address = body.address || null;
    if (typeof body.notes === 'string')   updates.notes = body.notes;
    if (Array.isArray(body.tags))         updates.tags = body.tags;

    const r = await db.collection(COLLECTIONS.CUSTOMERS).updateOne({ id }, { $set: updates });
    if (r.matchedCount === 0) return err('cliente no encontrado', 404);

    const updated = await db.collection(COLLECTIONS.CUSTOMERS).findOne({ id });
    return json(strip(updated));
  }

  // -------- DELETE --------
  if (detailMatch && method === 'DELETE') {
    const id = detailMatch[1];
    const r = await db.collection(COLLECTIONS.CUSTOMERS).deleteOne({ id });
    if (r.deletedCount === 0) return err('cliente no encontrado', 404);
    return json({ ok: true, deleted: id });
  }

  // -------- BACKFILL desde snapshots de órdenes --------
  if (route === '/customers/backfill' && method === 'POST') {
    // Agrupa órdenes por email/phone/rut y crea/actualiza clientes.
    // Idempotente: puede correrse múltiples veces sin duplicar.
    const orders = await db.collection(COLLECTIONS.ORDERS)
      .find({ customerSnapshot: { $exists: true, $ne: null } })
      .toArray();

    let created = 0, updated = 0, skipped = 0;

    for (const order of orders) {
      const snap = order.customerSnapshot || {};
      if (!snap.name && !snap.email && !snap.phone && !snap.rut) {
        skipped++;
        continue;
      }

      const existing = await findExisting(db, snap);
      const result = await upsertCustomerFromSnapshot(db, snap, {
        source: order.channel || 'unknown',
        channels: [order.channel || 'unknown'],
      });

      // Ligar el pedido al cliente para búsquedas futuras rápidas
      if (result?.id && !order.customerId) {
        await db.collection(COLLECTIONS.ORDERS).updateOne(
          { id: order.id },
          { $set: { customerId: result.id } }
        );
      }

      if (existing) updated++;
      else created++;
    }

    return json({ ok: true, created, updated, skipped, totalOrders: orders.length });
  }

  return null;
}
