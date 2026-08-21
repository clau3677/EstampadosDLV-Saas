// Fulfillment logístico: entrega, retiro, despacho y seguimiento interno.
// Todos los endpoints administrativos requieren sesión con rol admin.
import { v4 as uuidv4 } from 'uuid';
import { randomInt } from 'node:crypto';
import { COLLECTIONS, FULFILLMENT_STATUS, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import { enqueueNotification } from './notification-queue';

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

// SLA interno inicial. No cambia la promesa comercial pública; sirve para
// detectar atrasos operativos antes de que impacten al cliente.
const SLA_CONFIG = {
  shipping: { overallHours: 120, stages: { pending: 24, packed: 12, handed_to_courier: 24, in_transit: 72, failed: 24, returned: 24 } },
  pickup: { overallHours: 72, stages: { pending: 24, packed: 24, ready_for_pickup: 48, failed: 24, returned: 24 } },
};

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursBetween(start, end) {
  const from = asDate(start);
  const to = asDate(end);
  if (!from || !to) return null;
  return Math.max(0, (to.getTime() - from.getTime()) / 3600000);
}

function statusStartedAt(row) {
  return row?.[{
    packed: 'packedAt',
    ready_for_pickup: 'readyForPickupAt',
    handed_to_courier: 'handedToCourierAt',
    in_transit: 'inTransitAt',
    delivered: 'deliveredAt',
    picked_up: 'pickedUpAt',
    failed: 'failedAt',
    returned: 'returnedAt',
  }[row?.status]] || row?.createdAt;
}

function requireAdmin(request) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return null;
  return user;
}

function now() {
  return new Date();
}

function generatePickupCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

async function createUniquePickupCode(db) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generatePickupCode();
    const exists = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({
      pickupCode: code,
      status: { $ne: FULFILLMENT_STATUS.CANCELLED },
    }, { projection: { id: 1 } });
    if (!exists) return code;
  }
  throw new Error('No se pudo generar un código de retiro único');
}

function normalizeProofUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return raw;
  } catch {}
  return undefined;
}

function normalizeProofType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  return ['photo', 'signature', 'document', 'other'].includes(raw) ? raw : undefined;
}

function deliveryMethodOf(order) {
  return order?.deliveryMethod === 'shipping' ? 'shipping' : 'pickup';
}

function canCustomerAccessOrder(order, user) {
  if (!order || !user) return false;
  if (user.role === 'admin' || user.role === 'operator') return true;
  const email = String(user.email || '').trim().toLowerCase();
  const orderEmail = String(order.customerSnapshot?.email || '').trim().toLowerCase();
  return Boolean(email && orderEmail && email === orderEmail) || order.customerId === user.id;
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

function validateTransition({ fulfillment, toStatus, carrier, trackingCode, pickupCode, pickupPersonName }) {
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
  if (toStatus === FULFILLMENT_STATUS.PICKED_UP) {
    if (String(pickupCode || '').trim() !== String(fulfillment.pickupCode || '').trim()) {
      return 'El código de retiro no coincide';
    }
    if (!String(pickupPersonName || '').trim()) {
      return 'Debes indicar quién retira el pedido';
    }
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
    proofType: null,
    proofUploadedAt: null,
    pickupCode: null,
    pickupCodeIssuedAt: null,
    pickupPersonName: null,
    pickupPersonId: null,
    pickupVerifiedAt: null,
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

  if (route === '/fulfillment/customer' && method === 'GET') {
    const user = getUserFromRequest(request);
    if (!user) return err('No autenticado', 401);
    const url = new URL(request.url);
    const orderId = url.searchParams.get('orderId');
    if (!orderId) return err('orderId requerido');
    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id: orderId });
    if (!order) return err('Pedido no encontrado', 404);
    if (!canCustomerAccessOrder(order, user)) return err('No tienes acceso a este pedido', 403);
    const fulfillment = await ensureFulfillmentForOrder(db, order, user);
    const eventRows = await db.collection(COLLECTIONS.FULFILLMENT_EVENTS)
      .find({ fulfillmentId: fulfillment.id }).sort({ createdAt: 1 }).limit(200).toArray();
    return json({
      order: strip({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        productionStatus: order.productionStatus,
        priority: order.priority,
        total: order.total,
        deliveryMethod: order.deliveryMethod,
        shippingAddress: order.shippingAddress || null,
        createdAt: order.createdAt,
      }),
      fulfillment: strip(fulfillment),
      events: strip(eventRows),
    });
  }

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

  if (route === '/fulfillment/metrics' && method === 'GET') {
    if (!requireAdmin(request)) return err('Sólo administradores', 403);
    const rows = await db.collection(COLLECTIONS.FULFILLMENTS).find({}).sort({ updatedAt: -1 }).limit(5000).toArray();
    const generatedAt = now();
    const byStatus = {};
    const byDeliveryMethod = {};
    const completedDurations = [];
    const completedByMethod = { shipping: [], pickup: [] };
    const overdueRows = [];
    let active = 0;
    let completed = 0;
    let onTime = 0;

    for (const row of rows) {
      const methodName = row.deliveryMethod === 'shipping' ? 'shipping' : 'pickup';
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      byDeliveryMethod[methodName] = (byDeliveryMethod[methodName] || 0) + 1;
      const isCompleted = row.status === FULFILLMENT_STATUS.DELIVERED || row.status === FULFILLMENT_STATUS.PICKED_UP;
      const isCancelled = row.status === FULFILLMENT_STATUS.CANCELLED;
      const endAt = row.status === FULFILLMENT_STATUS.DELIVERED ? row.deliveredAt : row.status === FULFILLMENT_STATUS.PICKED_UP ? row.pickedUpAt : null;
      const completionHours = isCompleted ? hoursBetween(row.createdAt, endAt) : null;
      if (isCompleted) {
        completed += 1;
        if (completionHours != null) {
          completedDurations.push(completionHours);
          completedByMethod[methodName].push(completionHours);
          if (completionHours <= SLA_CONFIG[methodName].overallHours) onTime += 1;
        }
      } else if (!isCancelled) {
        active += 1;
        const startedAt = statusStartedAt(row);
        const ageHours = hoursBetween(startedAt, generatedAt);
        const stageSla = SLA_CONFIG[methodName].stages[row.status] || SLA_CONFIG[methodName].overallHours;
        if (ageHours != null && ageHours > stageSla) {
          overdueRows.push({
            id: row.id,
            orderId: row.orderId,
            orderNumber: row.orderNumber,
            deliveryMethod: methodName,
            status: row.status,
            ageHours: Math.round(ageHours * 10) / 10,
            slaHours: stageSla,
            dueAt: new Date(asDate(startedAt).getTime() + stageSla * 3600000),
          });
        }
      }
    }

    const average = values => values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
    overdueRows.sort((a, b) => b.ageHours - a.ageHours);
    return json({
      total: rows.length,
      active,
      completed,
      overdueCount: overdueRows.length,
      onTimeRate: completed ? Math.round((onTime / completed) * 1000) / 10 : null,
      averageCompletionHours: average(completedDurations),
      averageCompletionByMethod: {
        shipping: average(completedByMethod.shipping),
        pickup: average(completedByMethod.pickup),
      },
      byStatus,
      byDeliveryMethod,
      topOverdue: strip(overdueRows.slice(0, 10)),
      slaConfig: SLA_CONFIG,
      updatedAt: generatedAt,
    });
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
    const { id, carrier, trackingCode, trackingUrl, proofUrl, proofType, notes, shippingAddress } = body;
    if (!id) return err('id requerido');
    const fulfillment = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    if (!fulfillment) return err('Registro logístico no encontrado', 404);
    if (FINAL_STATUSES.has(fulfillment.status)) return err('El fulfillment ya está cerrado', 400);
    const normalizedProof = proofUrl !== undefined ? normalizeProofUrl(proofUrl) : null;
    if (proofUrl !== undefined && normalizedProof === undefined) return err('La evidencia debe ser una URL http(s) o un archivo /uploads/', 400);
    const normalizedProofType = proofType !== undefined ? normalizeProofType(proofType) : null;
    if (proofType !== undefined && normalizedProofType === undefined) return err('Tipo de evidencia inválido', 400);
    const updates = {
      updatedAt: now(),
      ...(carrier !== undefined ? { carrier: String(carrier || '').trim() || null } : {}),
      ...(trackingCode !== undefined ? { trackingCode: String(trackingCode || '').trim() || null } : {}),
      ...(trackingUrl !== undefined ? { trackingUrl: String(trackingUrl || '').trim() || null } : {}),
      ...(proofUrl !== undefined ? { proofUrl: normalizedProof, proofUploadedAt: normalizedProof ? now() : null } : {}),
      ...(proofType !== undefined ? { proofType: normalizedProofType } : {}),
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

  if (route === '/fulfillment/pickup-code' && method === 'POST') {
    const user = requireAdmin(request);
    if (!user) return err('Sólo administradores', 403);
    const { id } = await request.json();
    if (!id) return err('id requerido');
    const fulfillment = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    if (!fulfillment) return err('Registro logístico no encontrado', 404);
    if (fulfillment.deliveryMethod !== 'pickup') return err('El código solo aplica a retiros en taller', 400);
    if (fulfillment.status !== FULFILLMENT_STATUS.READY_FOR_PICKUP) return err('El pedido debe estar listo para retiro', 400);
    const pickupCode = fulfillment.pickupCode || await createUniquePickupCode(db);
    const timestamp = fulfillment.pickupCodeIssuedAt || now();
    if (!fulfillment.pickupCode) {
      await db.collection(COLLECTIONS.FULFILLMENTS).updateOne(
        { id, status: FULFILLMENT_STATUS.READY_FOR_PICKUP },
        { $set: { pickupCode, pickupCodeIssuedAt: timestamp, updatedAt: now() } },
      );
      await addEvent(db, {
        fulfillmentId: id,
        orderId: fulfillment.orderId,
        fromStatus: fulfillment.status,
        toStatus: fulfillment.status,
        user,
        notes: 'Código de retiro generado',
        metadata: { pickupCodeIssuedAt: timestamp },
      });
    }
    return json({ ok: true, pickupCode, pickupCodeIssuedAt: timestamp });
  }

  if (route === '/fulfillment/pickup' && method === 'POST') {
    const user = requireAdmin(request);
    if (!user) return err('Sólo administradores', 403);
    const body = await request.json();
    const { id, pickupCode, pickupPersonName, proofUrl, proofType, notes } = body;
    if (!id || !pickupCode || !pickupPersonName) return err('id, código y persona que retira son requeridos');
    const fulfillment = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    if (!fulfillment) return err('Registro logístico no encontrado', 404);
    if (fulfillment.deliveryMethod !== 'pickup') return err('El registro no es un retiro en taller', 400);
    const transitionError = validateTransition({ fulfillment, toStatus: FULFILLMENT_STATUS.PICKED_UP, pickupCode, pickupPersonName });
    if (transitionError) return err(transitionError, 400);
    const normalizedProof = proofUrl !== undefined ? normalizeProofUrl(proofUrl) : null;
    if (proofUrl !== undefined && normalizedProof === undefined) return err('La evidencia debe ser una URL http(s) o un archivo /uploads/', 400);
    const normalizedProofType = proofType !== undefined ? normalizeProofType(proofType) : null;
    if (proofType !== undefined && normalizedProofType === undefined) return err('Tipo de evidencia inválido', 400);
    const timestamp = now();
    const updateSet = {
      status: FULFILLMENT_STATUS.PICKED_UP,
      updatedAt: timestamp,
      pickedUpAt: timestamp,
      pickupPersonName: String(pickupPersonName).trim(),
      pickupPersonId: user.email || user.id || 'admin',
      pickupVerifiedAt: timestamp,
      ...(proofUrl !== undefined ? { proofUrl: normalizedProof, proofUploadedAt: normalizedProof ? timestamp : null } : {}),
      ...(proofType !== undefined ? { proofType: normalizedProofType } : {}),
    };
    await db.collection(COLLECTIONS.FULFILLMENTS).updateOne({ id, status: fulfillment.status }, { $set: updateSet });
    await db.collection(COLLECTIONS.ORDERS).updateOne(
      { id: fulfillment.orderId },
      { $set: buildOrderStatusPatch(FULFILLMENT_STATUS.PICKED_UP, timestamp) },
    );
    await addEvent(db, {
      fulfillmentId: id,
      orderId: fulfillment.orderId,
      fromStatus: fulfillment.status,
      toStatus: FULFILLMENT_STATUS.PICKED_UP,
      user,
      notes: notes || `Retiro validado por ${String(pickupPersonName).trim()}`,
      metadata: { pickupPersonName: String(pickupPersonName).trim(), pickupVerifiedAt: timestamp },
    });
    enqueueNotification({
      orderId: fulfillment.orderId,
      event: 'order_delivered',
      payload: { proofUrl: normalizedProof },
    }).catch(e => console.error('[fulfillment] notify pickup error:', e.message));
    const updated = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    return json({ ok: true, fulfillment: strip(updated) });
  }

  if (route === '/fulfillment/transition' && method === 'POST') {
    const user = requireAdmin(request);
    if (!user) return err('Sólo administradores', 403);
    const body = await request.json();
    const { id, toStatus, notes, carrier, trackingCode, trackingUrl, proofUrl, proofType, pickupCode, pickupPersonName } = body;
    if (!id || !toStatus) return err('id y toStatus son requeridos');
    const fulfillment = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });
    if (!fulfillment) return err('Registro logístico no encontrado', 404);
    const transitionError = validateTransition({ fulfillment, toStatus, carrier, trackingCode, pickupCode, pickupPersonName });
    if (transitionError) return err(transitionError, 400);
    const normalizedProof = proofUrl !== undefined ? normalizeProofUrl(proofUrl) : null;
    if (proofUrl !== undefined && normalizedProof === undefined) return err('La evidencia debe ser una URL http(s) o un archivo /uploads/', 400);
    const normalizedProofType = proofType !== undefined ? normalizeProofType(proofType) : null;
    if (proofType !== undefined && normalizedProofType === undefined) return err('Tipo de evidencia inválido', 400);

    const timestamp = now();
    let issuedPickupCode = fulfillment.pickupCode || null;
    if (toStatus === FULFILLMENT_STATUS.READY_FOR_PICKUP && fulfillment.deliveryMethod === 'pickup' && !issuedPickupCode) {
      issuedPickupCode = await createUniquePickupCode(db);
    }
    const updateSet = {
      status: toStatus,
      updatedAt: timestamp,
      ...statusTimestamps(toStatus, timestamp),
      ...(carrier !== undefined ? { carrier: String(carrier || '').trim() || null } : {}),
      ...(trackingCode !== undefined ? { trackingCode: String(trackingCode || '').trim() || null } : {}),
      ...(trackingUrl !== undefined ? { trackingUrl: String(trackingUrl || '').trim() || null } : {}),
      ...(proofUrl !== undefined ? { proofUrl: normalizedProof, proofUploadedAt: normalizedProof ? timestamp : null } : {}),
      ...(proofType !== undefined ? { proofType: normalizedProofType } : {}),
      ...(issuedPickupCode ? { pickupCode: issuedPickupCode, pickupCodeIssuedAt: fulfillment.pickupCodeIssuedAt || timestamp } : {}),
      ...(toStatus === FULFILLMENT_STATUS.PICKED_UP ? {
        pickupPersonName: String(pickupPersonName).trim(),
        pickupPersonId: user.email || user.id || 'admin',
        pickupVerifiedAt: timestamp,
      } : {}),
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
          pickupCodeIssued: Boolean(updateSet.pickupCode && !fulfillment.pickupCode),
          pickupPersonName: updateSet.pickupPersonName || null,
        },
    });

    const updated = await db.collection(COLLECTIONS.FULFILLMENTS).findOne({ id });

    // Encolar notificaciones según el nuevo estado
    const notifyEvents = {
      [FULFILLMENT_STATUS.PACKED]: 'order_packed',
      [FULFILLMENT_STATUS.READY_FOR_PICKUP]: 'order_ready',
      [FULFILLMENT_STATUS.HANDED_TO_COURIER]: 'order_handed_to_courier',
      [FULFILLMENT_STATUS.IN_TRANSIT]: 'order_handed_to_courier',
      [FULFILLMENT_STATUS.DELIVERED]: 'order_delivered',
      [FULFILLMENT_STATUS.PICKED_UP]: 'order_delivered',
    };

    if (notifyEvents[toStatus]) {
      enqueueNotification({
        orderId: fulfillment.orderId,
        event: notifyEvents[toStatus],
        payload: {
          carrier: updateSet.carrier || fulfillment.carrier,
          trackingCode: updateSet.trackingCode || fulfillment.trackingCode,
          trackingUrl: updateSet.trackingUrl || fulfillment.trackingUrl,
          proofUrl: updateSet.proofUrl || fulfillment.proofUrl,
        }
      }).catch(e => console.error('[fulfillment] notify error:', e.message));
    }

    return json({ ok: true, fulfillment: strip(updated) });
  }

  return null;
}
