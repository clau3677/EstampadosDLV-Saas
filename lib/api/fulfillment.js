// Fulfillment logístico: entrega, retiro, despacho y seguimiento interno.
// Todos los endpoints administrativos requieren sesión con rol admin.
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, FULFILLMENT_STATUS, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';

const TRANSITIONS = {
  [FULFILLMENT_STATUS.PENDING]: [
    FULFILLMENT_STATUS.PACKED,
    FULFILLMENT_STATUS.READY_FOR_PICKUP,
    FULFILLMENT_STATUS.CANCELLED,
  ],
  [FULFILLMENT_STATUS.PACKED]: [
    FULFILLMENT_STATUS.READY_FOR_PICKUP,
    FULFILLMENT_STATUS.HANDED_TO_COURIER,
    FULFILLMENT_STATUS.CANCELLED,
  ],
  [FULFILLMENT_STATUS.READY_FOR_PICKUP]: [
    FULFILLMENT_STATUS.PICKED_UP,
    FULFILLMENT_STATUS.CANCELLED,
  ],
  [FULFILLMENT_STATUS.HANDED_TO_COURIER]: [
    FULFILLMENT_STATUS.IN_TRANSIT,
    FULFILLMENT_STATUS.FAILED,
    FULFILLMENT_STATUS.RETURNED,
  ],
  [FULFILLMENT_STATUS.IN_TRANSIT]: [
    FULFILLMENT_STATUS.DELIVERED,
    FULFILLMENT_STATUS.FAILED,
    FULFILLMENT_STATUS.RETURNED,
  ],
  [FULFILLMENT_STATUS.FAILED]: [
    FULFILLMENT_STATUS.PACKED,
    FULFILLMENT_STATUS.HANDED_TO_COURIER,
    FULFILLMENT_STATUS.RETURNED,
  ],
  [FULFILLMENT_STATUS.RETURNED]: [
    FULFILLMENT_STATUS.PACKED,
    FULFILLMENT_STATUS.CANCELLED,
  ],
  [FULFILLMENT_STATUS.DELIVERED]: [],
  [FULFILLMENT_STATUS.PICKED_UP]: [],
  [FULFILLMENT_STATUS.CANCELLED]: [],
};

const FINAL_STATUSES = new Set([
  FULFILLMENT_STATUS.DELIVERED,
  FULFILLMENT_STATUS.PICKED_UP,
  FULFILLMENT_STATUS.CANCELLED,
]);

function requireAdmin(request) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return null;
  return user;
}

function now() {
  return new Date();
}

function deliveryMethodOf(order) {
  return order?.deliveryMethod === 'shipping' ? 'shipping' : 'pickup';
}

function initialFulfillmentStatus(order) {
  if (order?.status === 'cancelled') return FULFILLMENT_STATUS.CANCELLED;
  if (order?.status === 'delivered') return FULFILLMENT_STATUS.DELIVERED;
  if (order?.channel === 'pos' && order?.deliveredAt) return FULFILLMENT_STATUS.PICKED_UP;
  return FULFILLMENT_STATUS.PENDING;
}

function eventDoc({ fulfillmentId, orderId, fromStatus, toStatus, user, notes, metadata }) {
  return {
    id: uuidv4(),
    fulfillmentId,
    orderId,
    fromStatus: fromStatus || null,
    toStatus,
    notes: notes || '',
    metadata: metadata || {},
    actorId: user?.id || user?.email || 'system',
    actorName: user?.name || user?.email || 'Sistema',
    createdAt: now(),
  };
}

async function addEvent(db, args) {
  await db.collection(COLLECTIONS.FULFILLMENT_EVENTS).insertOne(eventDoc(args));
}

function statusTimestamps(status, timestamp) {
  const fields = {};
  if (status === FULFILLMENT_STATUS.PACKED) fields.packedAt = timestamp;
  if (status === FULFILLMENT_STATUS.READY_FOR_PICKUP) fields.readyForPickupAt = timestamp;
  if (status === FULFILLMENT_STATUS.HANDED_TO_COURIER) fields.handedToCourierAt = timestamp;
  if (status === FULFILLMENT_STATUS.IN_TRANSIT) fields.inTransitAt = timestamp;
  if (status === FULFILLMENT_STATUS.DELIVERED) fields.deliveredAt = timestamp;
  if (status === FULFILLMENT_STATUS.PICKED_UP) fields.pickedUpAt = timestamp;
  if (status === FULFILLMENT_STATUS.FAILED) fields.failedAt = timestamp;
  if (status === FULFILLMENT_STATUS.RETURNED) fields.returnedAt = timestamp;
  return fields;
}

function validateTransition({ fulfillment, toStatus, carrier, trackingCode }) {
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, toStatus)) {
    return 'Estado logístico inválido';
  }
  if (FINAL_STATUSES.has(fulfillment.status)) {
    return 'El fulfillment ya está cerrado y no puede modificarse';
  }
  if (fulfillment.deliveryMethod === 'pickup' && [
    FULFILLMENT_STATUS.HANDED_TO_COURIER,
    FULFILLMENT_STATUS.IN_TRANSIT,
    FULFILLMENT_STATUS.DELIVERED,
  ].includes(toStatus)) {
    return 'Un pedido de retiro debe cerrarse como retirado, no como despacho';
  }
  if (fulfillment.deliveryMethod === 'shipping' && [
    FULFILLMENT_STATUS.READY_FOR_PICKUP,
    FULFILLMENT_STATUS.PICKED_UP,
  ].includes(toStatus)) {
    return 'Un pedido con despacho debe seguir el flujo de courier';
  }
  if (toStatus === FULFILLMENT_STATUS.HANDED_TO_COURIER && !String(carrier || '').trim()) {
    return 'Debes indicar el courier antes de entregar el pedido';
  }
  if (toStatus === FULFILLMENT_STATUS.IN_TRANSIT && !String(trackingCode || '').trim()) {
    return 'Debes indicar el código de seguimiento antes de marcar en tránsito';
  }
  if (!TRANSITIONS[fulfillment.status].includes(toStatus)) {
    return `Transición no permitida: ${fulfillment.status} → ${toStatus}`;
  }
  return null;
}

export async function cancelFulfillmentForOrder(db, orderId, user = null, notes = 'Pedido cancelado') {
  if (!db || !orderId) return null;
  const fulfillment = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ orderId });
  if (!fulfillment || FINAL_STATUSES.has(fulfillment.status)) return fulfillment || null;
  const timestamp = now();
  await db.collection(COLLECTIONS.FULFILLMENTS).updateOne(
    { id: fulfillment.id },
    { $set: { status: FULFILLMENT_STATUS.CANCELLED, updatedAt: timestamp, cancelledAt: timestamp } },
  );
  await addEvent(db, {
    fulfillmentId: fulfillment.id,
    orderId,
    fromStatus: fulfillment.status,
    toStatus: FULFILLMENT_STATUS.CANCELLED,
    user,
    notes,
  });
  return db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id: fulfillment.id });
}

export async function ensureFulfillmentForOrder(db, order, user = null) {
  if (!db || !order?.id) return null;
  const existing = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ orderId: order.id });
  if (existing) return existing;

  const timestamp = now();
  const status = initialFulfillmentStatus(order);
  const doc = {
    id: uuidv4(),
    orderId: order.id,
    orderNumber: order.orderNumber || null,
    deliveryMethod: deliveryMethodOf(order),
    status,
    shippingAddress: order.shippingAddress || null,
    carrier: null,
    trackingCode: null,
    trackingUrl: null,
    proofUrl: null,
    notes: order.notes || '',
    packedAt: null,
    readyForPickupAt: null,
    handedToCourierAt: null,
    inTransitAt: null,
    deliveredAt: status === FULFILLMENT_STATUS.DELIVERED ? (order.deliveredAt || timestamp) : null,
    pickedUpAt: null,
    failedAt: null,
    returnedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(COLLECTIONS.FULFILLMENTS).insertOne(doc);
  await addEvent(db, {
    fulfillmentId: doc.id,
    orderId: doc.orderId,
    fromStatus: null,
    toStatus: doc.status,
    user,
    notes: 'Registro logístico creado',
    metadata: { deliveryMethod: doc.deliveryMethod },
  });
  await db.collection(COLLECTIONS.ORDERS).updateOne(
    { id: order.id },
    { $set: { fulfillmentStatus: doc.status, fulfillmentId: doc.id } },
  );
  return doc;
}

function buildOrderStatusPatch(status, timestamp) {
  if (status === FULFILLMENT_STATUS.DELIVERED || status === FULFILLMENT_STATUS.PICKED_UP) {
    return { status: 'delivered', deliveredAt: timestamp, fulfillmentStatus: status };
  }
  if (status === FULFILLMENT_STATUS.CANCELLED) {
    return { status: 'cancelled', fulfillmentStatus: status };
  }
  return { fulfillmentStatus: status };
}

async function enrichFulfillments(db, rows) {
  const orderIds = [...new Set(rows.map(row => row.orderId).filter(Boolean))];
  if (!orderIds.length) return rows.map(row => ({ ...row, order: null }));
  const orders = await db.collection(COLLECTIONS.ORDERS).find({ id: { $in: orderIds } }).toArray();
  const byId = Object.fromEntries(orders.map(order => [order.id, order]));
  return rows.map(row => {
    const order = byId[row.orderId];
    return {
      ...row,
      order: order ? {
        orderNumber: order.orderNumber,
        status: order.status,
        productionStatus: order.productionStatus,
        priority: order.priority,
        customerSnapshot: order.customerSnapshot,
        total: order.total,
        createdAt: order.createdAt,
      } : null,
    };
  });
}

export default async function handleFulfillment(ctx) {
  const { method, route, db, request } = ctx;

  if (route === '/fulfillment' && method === 'GET') {
    if (!requireAdmin(request)) return err('Sólo administradores', 403);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const deliveryMethod = url.searchParams.get('deliveryMethod');
    const orderId = url.searchParams.get('orderId');
    const q = {};
    if (status && status !== 'all') q.status = status;
    if (deliveryMethod && deliveryMethod !== 'all') q.deliveryMethod = deliveryMethod;
    if (orderId) q.orderId = orderId;
    const rows = await db.collection(COLLECTIONS.FULFILLMENTS)
      .find(q).sort({ updatedAt: -1 }).limit(500).toArray();
    return json(strip(await enrichFulfillments(db, rows)));
  }

  if (route === '/fulfillment/summary' && method === 'GET') {
    if (!requireAdmin(request)) return err('Sólo administradores', 403);
    const rows = await db.collection(COLLECTIONS.FULFILLMENTS).find({}).toArray();
    const byStatus = {};
    const byDeliveryMethod = {};
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      byDeliveryMethod[row.deliveryMethod] = (byDeliveryMethod[row.deliveryMethod] || 0) + 1;
    }
    return json({ total: rows.length, byStatus, byDeliveryMethod, updatedAt: now() });
  }

  if (route === '/fulfillment/events' && method === 'GET') {
    if (!requireAdmin(request)) return err('Sólo administradores', 403);
    const url = new URL(request.url);
    const fulfillmentId = url.searchParams.get('fulfillmentId');
    const orderId = url.searchParams.get('orderId');
    if (!fulfillmentId && !orderId) return err('fulfillmentId u orderId requerido');
    const q = fulfillmentId ? { fulfillmentId } : { orderId };
    const rows = await db.collection(COLLECTIONS.FULFILLMENT_EVENTS)
      .find(q).sort({ createdAt: 1 }).limit(200).toArray();
    return json(strip(rows));
  }

  if (route === '/fulfillment/backfill' && method === 'POST') {
    const user = requireAdmin(request);
    if (!user) return err('Sólo administradores', 403);
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 1000), 1), 5000);
    const orders = await db.collection(COLLECTIONS.ORDERS).find({}).sort({ createdAt: 1 }).limit(limit).toArray();
    let created = 0;
    let existing = 0;
    for (const order of orders) {
      const found = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ orderId: order.id });
      if (found) {
        existing += 1;
        continue;
      }
      await ensureFulfillmentForOrder(db, order, user);
      created += 1;
    }
    return json({ ok: true, inspected: orders.length, created, existing });
  }

  if (route === '/fulfillment/ensure' && method === 'POST') {
    const user = requireAdmin(request);
    if (!user) return err('Sólo administradores', 403);
    const { orderId } = await request.json();
    if (!orderId) return err('orderId requerido');
    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id: orderId });
    if (!order) return err('Pedido no encontrado', 404);
    const fulfillment = await ensureFulfillmentForOrder(db, order, user);
    return json({ ok: true, fulfillment: strip(fulfillment) });
  }

  if (route === '/fulfillment' && method === 'PATCH') {
    const user = requireAdmin(request);
    if (!user) return err('Sólo administradores', 403);
    const body = await request.json();
    const { id, carrier, trackingCode, trackingUrl, proofUrl, notes, shippingAddress } = body;
    if (!id) return err('id requerido');
    const fulfillment = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    if (!fulfillment) return err('Registro logístico no encontrado', 404);
    if (FINAL_STATUSES.has(fulfillment.status)) return err('El fulfillment ya está cerrado', 400);
    const updates = {
      updatedAt: now(),
      ...(carrier !== undefined ? { carrier: String(carrier || '').trim() || null } : {}),
      ...(trackingCode !== undefined ? { trackingCode: String(trackingCode || '').trim() || null } : {}),
      ...(trackingUrl !== undefined ? { trackingUrl: String(trackingUrl || '').trim() || null } : {}),
      ...(proofUrl !== undefined ? { proofUrl: String(proofUrl || '').trim() || null } : {}),
      ...(notes !== undefined ? { notes: String(notes || '').trim() } : {}),
      ...(shippingAddress !== undefined ? { shippingAddress: shippingAddress || null } : {}),
    };
    await db.collection(COLLECTIONS.FULFILLMENTS).updateOne({ id }, { $set: updates });
    await addEvent(db, {
      fulfillmentId: id,
      orderId: fulfillment.orderId,
      fromStatus: fulfillment.status,
      toStatus: fulfillment.status,
      user,
      notes: 'Datos logísticos actualizados',
      metadata: { fields: Object.keys(updates).filter(key => key !== 'updatedAt') },
    });
    const updated = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    return json({ ok: true, fulfillment: strip(updated) });
  }

  if (route === '/fulfillment/transition' && method === 'POST') {
    const user = requireAdmin(request);
    if (!user) return err('Sólo administradores', 403);
    const body = await request.json();
    const { id, toStatus, notes, carrier, trackingCode, trackingUrl, proofUrl } = body;
    if (!id || !toStatus) return err('id y toStatus son requeridos');
    const fulfillment = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    if (!fulfillment) return err('Registro logístico no encontrado', 404);
    const transitionError = validateTransition({ fulfillment, toStatus, carrier, trackingCode });
    if (transitionError) return err(transitionError, 400);

    const timestamp = now();
    const updateSet = {
      status: toStatus,
      updatedAt: timestamp,
      ...statusTimestamps(toStatus, timestamp),
      ...(carrier !== undefined ? { carrier: String(carrier || '').trim() || null } : {}),
      ...(trackingCode !== undefined ? { trackingCode: String(trackingCode || '').trim() || null } : {}),
      ...(trackingUrl !== undefined ? { trackingUrl: String(trackingUrl || '').trim() || null } : {}),
      ...(proofUrl !== undefined ? { proofUrl: String(proofUrl || '').trim() || null } : {}),
    };

    await db.collection(COLLECTIONS.FULFILLMENTS).updateOne({ id }, { $set: updateSet });
    await db.collection(COLLECTIONS.ORDERS).updateOne(
      { id: fulfillment.orderId },
      { $set: buildOrderStatusPatch(toStatus, timestamp) },
    );
    await addEvent(db, {
      fulfillmentId: id,
      orderId: fulfillment.orderId,
      fromStatus: fulfillment.status,
      toStatus,
      user,
      notes,
      metadata: {
        carrier: updateSet.carrier || fulfillment.carrier || null,
        trackingCode: updateSet.trackingCode || fulfillment.trackingCode || null,
      },
    });

    const updated = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    return json({ ok: true, fulfillment: strip(updated) });
  }

  return null;
}
