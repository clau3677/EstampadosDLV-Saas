// /api/orders GET · /api/orders/lookup GET · /api/orders/public POST
// /api/orders/cancel POST (admin) · /api/orders/delete POST (admin)
// /api/orders/upload-receipt POST (público) · /api/orders/confirm-payment POST (admin) · /api/orders/reject-payment POST (admin)
// /api/orders/sweep-expired POST (admin, cancela pedidos sin comprobante > 24h)
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { COLLECTIONS, ORDER_STATUS, PRODUCTION_STATUS, PRIORITY, SALES_CHANNEL, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import {
  notifyOrderConfirmation,
  notifyPaymentApproved, notifyPaymentRejected,
} from '@/lib/whatsapp/notifications';
import {
  notifyOrderConfirmationByEmail,
  notifyPaymentApprovedByEmail, notifyPaymentRejectedByEmail,
} from '@/lib/email/notifications';
import { upsertCustomerFromSnapshot } from './customers';
import { ensureFulfillmentForOrder, cancelFulfillmentForOrder } from './fulfillment';
import { buildShippingQuote } from './shipping';
import { loadCompany } from './settings';

// Ventana en horas que dejamos abierta la subida del comprobante antes de auto-cancelar
const RECEIPT_TIMEOUT_HOURS = 24;

// Throttle del sweep automático (se ejecuta como máximo cada 30 min cuando algún admin carga /api/orders)
let lastAutoSweepAt = 0;
const AUTO_SWEEP_INTERVAL_MS = 30 * 60 * 1000; // 30 min

async function maybeAutoSweep(db) {
  if (Date.now() - lastAutoSweepAt < AUTO_SWEEP_INTERVAL_MS) return;
  lastAutoSweepAt = Date.now();
  const cutoff = new Date(Date.now() - RECEIPT_TIMEOUT_HOURS * 60 * 60 * 1000);
  try {
    const expired = await db.collection(COLLECTIONS.ORDERS).find({
      status: ORDER_STATUS.PENDING,
      paymentMethod: 'transfer',
      receiptUrl: { $in: [null, undefined, ''] },
      createdAt: { $lt: cutoff },
    }).limit(50).toArray();
    for (const order of expired) {
      await db.collection(COLLECTIONS.ORDERS).updateOne(
        { id: order.id },
        {
          $set: {
            status: ORDER_STATUS.CANCELLED,
            productionStatus: PRODUCTION_STATUS.NOT_STARTED,
            cancelReason: `Auto-cancelado: no se subió comprobante en ${RECEIPT_TIMEOUT_HOURS}h`,
            cancelledAt: new Date(),
            cancelledBy: 'system',
          },
        },
      );
      try { await releaseReservedStockForOrder(db, order.id, order.orderNumber); } catch { /* noop */ }
      await db.collection(COLLECTIONS.PRODUCTION_QUEUE).deleteMany({ orderId: order.id });
      await cancelFulfillmentForOrder(db, order.id, null, 'Pedido auto-cancelado por comprobante vencido');
    }
    if (expired.length > 0) {
      console.log(`[orders][auto-sweep] cancelled ${expired.length} expired transfer orders`);
    }
  } catch (e) {
    console.warn('[orders][auto-sweep] failed:', e.message);
  }
}

// Extensiones y mime types aceptados para comprobantes
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const RECEIPTS_DIR = path.join(process.cwd(), 'public', 'uploads', 'receipts');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function extFromMime(mime) {
  return {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }[mime] || 'jpg';
}

// Reserva stock con compare-and-set: nunca permite que dos pedidos consuman
// simultáneamente la misma disponibilidad. Si una línea falla, revierte las
// reservas anteriores del mismo pedido y deja una bitácora compensatoria.
async function reserveStockForOrder(db, resolvedItems, orderId, orderNumber) {
  const reserved = [];
  const now = new Date();
  try {
    for (const item of resolvedItems) {
      if (!item.stockRow || !item.product?.id || !item.variant?.id) continue;
      const qty = Math.max(0, Number(item.quantity) || 0);
      if (!qty) continue;
      const result = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
        {
          id: item.stockRow.id,
          $expr: {
            $gte: [
              { $subtract: ['$quantity', { $ifNull: ['$reservedQuantity', 0] }] },
              qty,
            ],
          },
        },
        { $inc: { reservedQuantity: qty }, $set: { updatedAt: now } },
      );
      if (result.matchedCount !== 1) {
        throw new Error(`Stock insuficiente para "${item.product.name} · ${item.variant.name}"`);
      }
      const updated = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ id: item.stockRow.id });
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(),
        type: 'commercial_out',
        reference: 'order',
        referenceId: orderId,
        itemType: 'product_variant',
        itemId: item.variant.id,
        quantity: -qty,
        balanceAfter: (updated?.quantity || 0) - (updated?.reservedQuantity || 0),
        operatorId: null,
        reason: `Reserva atómica por pedido ${orderNumber}`,
        createdAt: now,
      });
      reserved.push({ stockId: item.stockRow.id, variantId: item.variant.id, quantity: qty });
    }
    await db.collection(COLLECTIONS.ORDERS).updateOne(
      { id: orderId },
      { $set: { stockReservationStatus: 'reserved', stockReservedAt: now, updatedAt: now } },
    );
    return reserved;
  } catch (error) {
    for (const entry of reserved.reverse()) {
      const rollbackAt = new Date();
      const rollback = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
        { id: entry.stockId, reservedQuantity: { $gte: entry.quantity } },
        { $inc: { reservedQuantity: -entry.quantity }, $set: { updatedAt: rollbackAt } },
      );
      if (rollback.matchedCount === 1) {
        const current = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ id: entry.stockId });
        await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
          id: uuidv4(),
          type: 'commercial_in',
          reference: 'order_reservation_rollback',
          referenceId: orderId,
          itemType: 'product_variant',
          itemId: entry.variantId,
          quantity: entry.quantity,
          balanceAfter: (current?.quantity || 0) - (current?.reservedQuantity || 0),
          operatorId: null,
          reason: `Rollback de reserva por pedido ${orderNumber}`,
          createdAt: rollbackAt,
        });
      }
    }
    throw error;
  }
}

// Consume la reserva al confirmar el pago. La operación reclama el pedido
// atómicamente para que webhooks repetidos no descuenten stock dos veces.
export async function consumeReservedStockForOrder(db, orderId, orderNumber) {
  const orders = db.collection(COLLECTIONS.ORDERS);
  const order = await orders.findOne({ id: orderId });
  if (!order || order.stockReservationStatus === 'consumed') return { ok: true, alreadyConsumed: true };

  const claimAt = new Date();
  const claim = await orders.updateOne(
    { id: orderId, stockReservationStatus: { $in: [null, '', 'reserved'] } },
    { $set: { stockReservationStatus: 'consuming', stockConsumptionClaimedAt: claimAt, updatedAt: claimAt } },
  );
  if (claim.matchedCount !== 1) {
    const latest = await orders.findOne({ id: orderId });
    if (latest?.stockReservationStatus === 'consumed' || latest?.stockReservationStatus === 'consuming') {
      return { ok: true, skipped: true, status: latest.stockReservationStatus };
    }
    throw new Error(`No se pudo reclamar el consumo de stock del pedido ${orderNumber}`);
  }

  const items = await db.collection(COLLECTIONS.ORDER_ITEMS).find({ orderId }).toArray();
  const consumed = [];
  const now = new Date();
  try {
    for (const it of items) {
      if (it.type !== 'product' || !it.productId || !it.variantId) continue;
      const qty = Math.max(0, Number(it.quantity) || 0);
      if (!qty) continue;
      const stockRow = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ productId: it.productId, variantId: it.variantId });
      if (!stockRow) continue;
      const result = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
        { id: stockRow.id, quantity: { $gte: qty }, reservedQuantity: { $gte: qty } },
        { $inc: { quantity: -qty, reservedQuantity: -qty }, $set: { updatedAt: now } },
      );
      if (result.matchedCount !== 1) throw new Error(`Reserva insuficiente para consumir ${it.variantId}`);
      const updated = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ id: stockRow.id });
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(), type: 'commercial_out', reference: 'order_paid', referenceId: orderId,
        itemType: 'product_variant', itemId: it.variantId, quantity: -qty,
        balanceAfter: updated?.quantity || 0, operatorId: null,
        reason: `Consumo atómico de stock por pedido pagado ${orderNumber}`, createdAt: now,
      });
      consumed.push({ stockId: stockRow.id, variantId: it.variantId, quantity: qty });
    }
    await orders.updateOne(
      { id: orderId, stockReservationStatus: 'consuming' },
      { $set: { stockReservationStatus: 'consumed', stockConsumedAt: now, updatedAt: now }, $unset: { stockConsumptionClaimedAt: '' } },
    );
    return { ok: true, consumed: true };
  } catch (error) {
    for (const entry of consumed.reverse()) {
      const rollbackAt = new Date();
      await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
        { id: entry.stockId },
        { $inc: { quantity: entry.quantity, reservedQuantity: entry.quantity }, $set: { updatedAt: rollbackAt } },
      );
      const current = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ id: entry.stockId });
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(), type: 'commercial_in', reference: 'order_consume_rollback', referenceId: orderId,
        itemType: 'product_variant', itemId: entry.variantId, quantity: entry.quantity,
        balanceAfter: current?.quantity || 0, operatorId: null,
        reason: `Rollback de consumo por pedido ${orderNumber}`, createdAt: rollbackAt,
      });
    }
    await orders.updateOne(
      { id: orderId, stockReservationStatus: 'consuming' },
      { $set: { stockReservationStatus: 'reserved', updatedAt: new Date() }, $unset: { stockConsumptionClaimedAt: '' } },
    );
    throw error;
  }
}

// Libera solo una reserva que aún esté activa. Nunca aumenta el stock físico.
async function releaseReservedStockForOrder(db, orderId, orderNumber) {
  const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id: orderId });
  if (!order || order.stockReservationStatus === 'consumed' || order.stockReservationStatus === 'released') return;
  const items = await db.collection(COLLECTIONS.ORDER_ITEMS).find({ orderId }).toArray();
  const now = new Date();
  for (const it of items) {
    if (it.type !== 'product' || !it.productId || !it.variantId) continue;
    const qty = Math.max(0, Number(it.quantity) || 0);
    if (!qty) continue;
    const stockRow = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ productId: it.productId, variantId: it.variantId });
    if (!stockRow) continue;
    const result = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
      { id: stockRow.id, reservedQuantity: { $gte: qty } },
      { $inc: { reservedQuantity: -qty }, $set: { updatedAt: now } },
    );
    if (result.matchedCount !== 1) continue;
    const current = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ id: stockRow.id });
    await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
      id: uuidv4(), type: 'commercial_in', reference: 'order_cancel', referenceId: orderId,
      itemType: 'product_variant', itemId: it.variantId, quantity: qty,
      balanceAfter: (current?.quantity || 0) - (current?.reservedQuantity || 0), operatorId: null,
      reason: `Liberación atómica por cancelación de pedido ${orderNumber}`, createdAt: now,
    });
  }
  await db.collection(COLLECTIONS.ORDERS).updateOne(
    { id: orderId },
    { $set: { stockReservationStatus: 'released', stockReleasedAt: now, updatedAt: now } },
  );
}

export async function consumeStockForPosSale(db, resolvedItems, orderId, orderNumber, operatorId = null) {
  const now = new Date();
  const consumed = [];
  try {
    for (const item of resolvedItems) {
      if (!item.stockRow || !item.variant?.id) continue;
      const qty = Math.max(0, Number(item.quantity) || 0);
      if (!qty) continue;
      const result = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
        {
          id: item.stockRow.id,
          $expr: {
            $gte: [
              { $subtract: ['$quantity', { $ifNull: ['$reservedQuantity', 0] }] },
              qty,
            ],
          },
        },
        { $inc: { quantity: -qty }, $set: { updatedAt: now } },
      );
      if (result.matchedCount !== 1) {
        throw new Error(`Stock insuficiente para "${item.product.name} · ${item.variant.name}"`);
      }
      const updated = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ id: item.stockRow.id });
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(), type: 'commercial_out', reference: 'pos_sale', referenceId: orderId,
        itemType: 'product_variant', itemId: item.variant.id, quantity: -qty,
        balanceAfter: (updated?.quantity || 0) - (updated?.reservedQuantity || 0),
        operatorId, reason: `Venta POS atómica ${orderNumber}`, createdAt: now,
      });
      consumed.push({ stockId: item.stockRow.id, variantId: item.variant.id, quantity: qty });
    }
    await db.collection(COLLECTIONS.ORDERS).updateOne(
      { id: orderId },
      { $set: { stockReservationStatus: 'consumed', stockConsumedAt: now, updatedAt: now } },
    );
  } catch (error) {
    for (const entry of consumed.reverse()) {
      const rollbackAt = new Date();
      await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
        { id: entry.stockId },
        { $inc: { quantity: entry.quantity }, $set: { updatedAt: rollbackAt } },
      );
      const current = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).findOne({ id: entry.stockId });
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(), type: 'commercial_in', reference: 'pos_consume_rollback', referenceId: orderId,
        itemType: 'product_variant', itemId: entry.variantId, quantity: entry.quantity,
        balanceAfter: (current?.quantity || 0) - (current?.reservedQuantity || 0),
        operatorId, reason: `Rollback de venta POS ${orderNumber}`, createdAt: rollbackAt,
      });
    }
    throw error;
  }
}

export default async function handleOrders(ctx) {
  const { method, route, db, request } = ctx;

  // GET /api/orders — lista admin o filtrada por customerEmail (portal cliente)
  if (route === '/orders' && method === 'GET') {
    const url = new URL(request.url);
    const customerEmail = url.searchParams.get('customerEmail');
    // Auto-sweep de pedidos expirados (throttled a 30 min) — sólo cuando admin lista
    if (!customerEmail) {
      maybeAutoSweep(db).catch(() => { /* silent */ });
    }
    const q = customerEmail
      ? { 'customerSnapshot.email': customerEmail.toLowerCase() }
      : {};
    const rows = await db.collection(COLLECTIONS.ORDERS).find(q).sort({ createdAt: -1 }).limit(200).toArray();
    // Embeber items de cada pedido para poder identificar el tipo (producto vs gang_sheet)
    const orderIds = rows.map(r => r.id);
    const itemsByOrder = {};
    if (orderIds.length > 0) {
      const allItems = await db.collection(COLLECTIONS.ORDER_ITEMS).find({ orderId: { $in: orderIds } }).toArray();
      for (const it of allItems) {
        if (!itemsByOrder[it.orderId]) itemsByOrder[it.orderId] = [];
        itemsByOrder[it.orderId].push({ type: it.type, gangSheetSpec: it.gangSheetSpec });
      }
    }
    const enriched = rows.map(r => ({ ...r, items: itemsByOrder[r.id] || [] }));
    return json(strip(enriched));
  }

  // GET /api/orders/lookup?number=DLV-2025-XXXXXX  — consulta pública por número
  if (route === '/orders/lookup' && method === 'GET') {
    const url = new URL(request.url);
    const number = url.searchParams.get('number');
    if (!number) return err('number requerido');
    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ orderNumber: number });
    if (!order) return err('no encontrado', 404);
    const orderItems = await db.collection(COLLECTIONS.ORDER_ITEMS).find({ orderId: order.id }).toArray();
    return json({ order: strip(order), items: strip(orderItems) });
  }

  // POST /api/orders/public  — checkout desde la tienda web
  if (route === '/orders/public' && method === 'POST') {
    const body = await request.json();
    const { customer, deliveryMethod, shippingAddress, shippingMethodKey, paymentMethod, items, notes } = body;

    if (!customer?.name || !customer?.email) return err('Nombre y email son obligatorios');
    if (!Array.isArray(items) || items.length === 0) return err('El carrito está vacío');
    if (!['pickup', 'shipping'].includes(deliveryMethod)) return err('Método de entrega inválido');
    if (deliveryMethod === 'shipping' && (!shippingAddress?.street || !shippingAddress?.comuna || !shippingAddress?.region)) {
      return err('Dirección, comuna y región son obligatorias para despacho', 400);
    }

    const productIds = [...new Set(items.map(i => i.productId))];
    const products = await db.collection(COLLECTIONS.PRODUCTS).find({ id: { $in: productIds } }).toArray();
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    const resolvedItems = [];
    for (const it of items) {
      const p = productMap[it.productId];
      if (!p) return err(`Producto no encontrado: ${it.productId}`);
      const v = p.variants.find(v => v.id === it.variantId);
      if (!v) return err(`Variante no encontrada en ${p.name}`);

      const stockRow = await db.collection(COLLECTIONS.COMMERCIAL_STOCK)
        .findOne({ productId: p.id, variantId: v.id });
      const available = stockRow ? (stockRow.quantity - (stockRow.reservedQuantity || 0)) : 0;
      const qty = Number(it.quantity) || 1;
      if (qty > available) {
        return err(`Stock insuficiente para "${p.name} · ${v.name}". Disponible: ${available}, solicitado: ${qty}.`);
      }

      resolvedItems.push({ product: p, variant: v, stockRow, quantity: qty });
    }

    const subtotal = resolvedItems.reduce((sum, r) => sum + r.variant.price * r.quantity, 0);
    const company = await loadCompany(db);
    const shippingQuote = buildShippingQuote(company, {
      deliveryMethod,
      shippingMethodKey,
      region: shippingAddress?.region,
      comuna: shippingAddress?.comuna,
    });
    if (!shippingQuote.ok) return err(shippingQuote.error, 400);
    const shipping = shippingQuote.cost;
    const netAmount = subtotal + shipping;
    const tax = Math.round((netAmount / 1.19) * 0.19);
    const total = netAmount;

    const now = new Date();
    const orderCount = await db.collection(COLLECTIONS.ORDERS).countDocuments({});
    const orderNumber = `DLV-2025-${String(orderCount + 300).padStart(6, '0')}`;
    const orderId = uuidv4();

    const validPayment = ['cash', 'card', 'transfer', 'webpay', 'mercadopago'];
    const pm = validPayment.includes(paymentMethod) ? paymentMethod : 'transfer';

    const order = {
      id: orderId,
      orderNumber,
      channel: SALES_CHANNEL.WEB,
      customerId: null,
      customerSnapshot: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || '',
        rut: customer.rut || '',
      },
      status: ORDER_STATUS.PENDING,
      productionStatus: PRODUCTION_STATUS.NOT_STARTED,
      priority: PRIORITY.NORMAL,
      subtotal: Math.round(subtotal / 1.19),
      discount: 0,
      tax,
      shipping,
      total,
      paymentMethod: pm,
      paymentStatus: 'pending',
      boleta: null,
      deliveryMethod,
      shippingAddress: deliveryMethod === 'shipping' ? {
        street: String(shippingAddress?.street || '').trim(),
        comuna: String(shippingAddress?.comuna || '').trim(),
        city: String(shippingAddress?.city || '').trim(),
        region: String(shippingAddress?.region || '').trim(),
      } : null,
      shippingDetails: shippingQuote,
      notes: notes || '',
      createdAt: now, paidAt: null, deliveredAt: null,
    };

    // Upsert del cliente en la colección `customers` (CRM unificado)
    try {
      const customerDoc = await upsertCustomerFromSnapshot(db, order.customerSnapshot, {
        source: SALES_CHANNEL.WEB,
        channels: [SALES_CHANNEL.WEB],
      });
      if (customerDoc?.id) order.customerId = customerDoc.id;
    } catch (e) {
      console.warn('[orders] upsertCustomerFromSnapshot failed:', e?.message);
    }

    await db.collection(COLLECTIONS.ORDERS).insertOne(order);
    await ensureFulfillmentForOrder(db, order);

    const orderItemsDocs = resolvedItems.map(r => ({
      id: uuidv4(),
      orderId,
      type: 'product',
      productId: r.product.id,
      variantId: r.variant.id,
      gangSheetId: null,
      name: `${r.product.name} · ${r.variant.name}`,
      quantity: r.quantity,
      unitPrice: r.variant.price,
      discount: 0,
      totalPrice: r.variant.price * r.quantity,
      gangSheetSpec: null,
    }));
    await db.collection(COLLECTIONS.ORDER_ITEMS).insertMany(orderItemsDocs);

    try {
      await reserveStockForOrder(db, resolvedItems, orderId, orderNumber);
    } catch (stockError) {
      // Si la reserva atómica pierde la carrera con otro pedido, eliminar el
      // pedido recién creado y sus líneas para no dejar una orden inválida.
      await db.collection(COLLECTIONS.ORDER_ITEMS).deleteMany({ orderId });
      await db.collection(COLLECTIONS.FULFILLMENT_EVENTS).deleteMany({ orderId });
      await db.collection(COLLECTIONS.FULFILLMENTS).deleteMany({ orderId });
      await db.collection(COLLECTIONS.ORDERS).deleteOne({ id: orderId });
      return err(stockError.message || 'No se pudo reservar el stock', 409);
    }

    // Notificación WhatsApp (best-effort, no bloquea la respuesta)
    notifyOrderConfirmation({ order, items: orderItemsDocs })
      .catch((e) => console.warn('[wa] confirmation dispatch failed:', e.message));

    // Notificación Email (best-effort, no bloquea la respuesta)
    notifyOrderConfirmationByEmail({ order, items: orderItemsDocs })
      .catch((e) => console.warn('[email] confirmation dispatch failed:', e.message));

    return json({
      ok: true,
      orderId,
      orderNumber,
      total,
      paymentMethod: pm,
      deliveryMethod,
      shippingDetails: shippingQuote,
    });
  }

  // POST /api/orders/cancel  — cancela un pedido (admin), libera stock y remueve del Kanban
  if (route === '/orders/cancel' && method === 'POST') {
    const user = getUserFromRequest(request);
    if (!user || user.role !== 'admin') return err('Sólo administradores pueden cancelar pedidos', 403);

    const { id, reason } = await request.json();
    if (!id) return err('id requerido');

    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id });
    if (!order) return err('Pedido no encontrado', 404);
    if (order.status === ORDER_STATUS.CANCELLED) return err('El pedido ya está cancelado', 400);
    if (order.status === ORDER_STATUS.DELIVERED) return err('No se puede cancelar un pedido ya entregado', 400);

    const now = new Date();

    // 1. Marcar pedido como cancelado
    await db.collection(COLLECTIONS.ORDERS).updateOne(
      { id },
      {
        $set: {
          status: ORDER_STATUS.CANCELLED,
          productionStatus: PRODUCTION_STATUS.NOT_STARTED,
          cancelReason: (reason || '').trim(),
          cancelledAt: now,
          cancelledBy: user.email || user.id,
        },
      },
    );

    // 2. Liberar stock reservado (silencioso si no hay items)
    try {
      await releaseReservedStockForOrder(db, id, order.orderNumber);
    } catch (e) {
      console.warn('[orders/cancel] releaseReservedStock failed:', e?.message);
    }

    // 3. Remover items de la cola de producción (ya no se imprime)
    await db.collection(COLLECTIONS.PRODUCTION_QUEUE).deleteMany({ orderId: id });
    await cancelFulfillmentForOrder(db, id, user, (reason || '').trim() || 'Pedido cancelado por administrador');

    return json({ ok: true, id, cancelledAt: now });
  }

  // POST /api/orders/delete  — elimina permanentemente un pedido cancelado (admin)
  // Requiere que esté en estado 'cancelled' para evitar borrados accidentales.
  if (route === '/orders/delete' && method === 'POST') {
    const user = getUserFromRequest(request);
    if (!user || user.role !== 'admin') return err('Sólo administradores pueden eliminar pedidos', 403);

    const { id, force } = await request.json();
    if (!id) return err('id requerido');

    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id });
    if (!order) return err('Pedido no encontrado', 404);

    // Guardarraíl: sólo permitir borrar si está cancelado, salvo que se pase force=true
    if (order.status !== ORDER_STATUS.CANCELLED && !force) {
      return err('Debes cancelar el pedido primero antes de eliminarlo. Envía force=true para saltarte esta validación.', 400);
    }

    // Si force=true y no estaba cancelado, liberar stock igual
    if (force && order.status !== ORDER_STATUS.CANCELLED && order.status !== ORDER_STATUS.DELIVERED) {
      try { await releaseReservedStockForOrder(db, id, order.orderNumber); } catch { /* noop */ }
    }

    // Borrar items, cola de producción y el pedido en cascada
    await db.collection(COLLECTIONS.ORDER_ITEMS).deleteMany({ orderId: id });
    await db.collection(COLLECTIONS.PRODUCTION_QUEUE).deleteMany({ orderId: id });
    await db.collection(COLLECTIONS.ORDERS).deleteOne({ id });

    return json({ ok: true, id, deleted: true });
  }

  // POST /api/orders/upload-receipt  — Público. Cliente sube el comprobante de transferencia.
  // Multipart form-data: orderNumber + email + file (JPG/PNG/WebP hasta 5MB)
  if (route === '/orders/upload-receipt' && method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return err('Content-Type debe ser multipart/form-data', 400);
    }

    let form;
    try {
      form = await request.formData();
    } catch (e) {
      return err('No se pudo leer el formulario: ' + e.message, 400);
    }

    const orderNumber = String(form.get('orderNumber') || '').trim();
    const email = String(form.get('email') || '').trim().toLowerCase();
    const file = form.get('file');

    if (!orderNumber) return err('orderNumber requerido', 400);
    if (!email) return err('email requerido para verificar identidad', 400);
    if (!file || typeof file === 'string') return err('Archivo requerido en el campo "file"', 400);

    // Buscar el pedido y verificar que el email coincide (guardarraíl anti-abuso)
    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ orderNumber });
    if (!order) return err('Pedido no encontrado', 404);
    const orderEmail = (order.customerSnapshot?.email || '').toLowerCase();
    if (orderEmail && orderEmail !== email) {
      return err('El email no coincide con el pedido', 403);
    }

    // Validar estados válidos para subir comprobante
    if (order.status === ORDER_STATUS.CANCELLED) return err('El pedido está cancelado', 400);
    if (order.status === ORDER_STATUS.PAID
       || order.status === ORDER_STATUS.IN_PRODUCTION
       || order.status === ORDER_STATUS.READY
       || order.status === ORDER_STATUS.DELIVERED) {
      return err('El pedido ya fue confirmado, no es necesario subir otro comprobante', 400);
    }

    // Validaciones de archivo
    if (!ALLOWED_MIME.includes(file.type)) {
      return err('Solo se aceptan imágenes JPG, PNG o WebP', 400);
    }
    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      return err(`El archivo excede el tamaño máximo (${(MAX_RECEIPT_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB)`, 400);
    }
    if (file.size < 1024) {
      return err('El archivo parece corrupto o vacío', 400);
    }

    // Guardar en disco: /public/uploads/receipts/{orderId}/{uuid}.{ext}
    const orderDir = path.join(RECEIPTS_DIR, order.id);
    await ensureDir(orderDir);
    const ext = extFromMime(file.type);
    const fileName = `${uuidv4()}.${ext}`;
    const fullPath = path.join(orderDir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(fullPath, buffer);
    const publicUrl = `/uploads/receipts/${order.id}/${fileName}`;

    const now = new Date();
    await db.collection(COLLECTIONS.ORDERS).updateOne(
      { id: order.id },
      {
        $set: {
          status: ORDER_STATUS.AWAITING_PAYMENT,
          receiptUrl: publicUrl,
          receiptUploadedAt: now,
          receiptMime: file.type,
          receiptSize: file.size,
          // Limpiar cualquier rechazo anterior para que el flujo se resetee
          paymentRejectionReason: null,
          paymentRejectedAt: null,
          paymentRejectedBy: null,
        },
      },
    );

    return json({ ok: true, receiptUrl: publicUrl });
  }

  // POST /api/orders/confirm-payment  — Admin aprueba el pago (transferencia validada)
  if (route === '/orders/confirm-payment' && method === 'POST') {
    const user = getUserFromRequest(request);
    if (!user || user.role !== 'admin') return err('Sólo administradores pueden confirmar pagos', 403);

    const { id, notes } = await request.json();
    if (!id) return err('id requerido');

    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id });
    if (!order) return err('Pedido no encontrado', 404);
    if (order.status === ORDER_STATUS.CANCELLED) return err('El pedido está cancelado', 400);
    if (order.status === ORDER_STATUS.PAID
      || order.status === ORDER_STATUS.IN_PRODUCTION
      || order.status === ORDER_STATUS.READY
      || order.status === ORDER_STATUS.DELIVERED) {
      return err('Este pedido ya fue confirmado', 400);
    }

    const now = new Date();
    await db.collection(COLLECTIONS.ORDERS).updateOne(
      { id },
      {
        $set: {
          status: ORDER_STATUS.PAID,
          paymentStatus: 'paid',
          paidAt: now,
          paymentConfirmedAt: now,
          paymentConfirmedBy: user.email || user.id,
          paymentConfirmationNotes: (notes || '').trim() || null,
          // Limpiar rechazo previo si lo había
          paymentRejectionReason: null,
          paymentRejectedAt: null,
        },
      },
    );

    // Recargar orden actualizada para las notificaciones
    const updatedOrder = await db.collection(COLLECTIONS.ORDERS).findOne({ id });

    // Consumir stock reservado → stock físico (pago confirmado)
    try {
      await consumeReservedStockForOrder(db, id, order.orderNumber);
    } catch (e) {
      console.warn('[orders/confirm-payment] consumeReservedStock failed:', e?.message);
    }

    // Notificar al cliente (best-effort)
    notifyPaymentApproved({ order: updatedOrder })
      .catch(e => console.warn('[wa] payment_approved dispatch failed:', e.message));
    notifyPaymentApprovedByEmail({ order: updatedOrder })
      .catch(e => console.warn('[email] payment_approved dispatch failed:', e.message));

    return json({ ok: true, id, paidAt: now });
  }

  // POST /api/orders/reject-payment  — Admin rechaza el comprobante, cliente debe resubir
  if (route === '/orders/reject-payment' && method === 'POST') {
    const user = getUserFromRequest(request);
    if (!user || user.role !== 'admin') return err('Sólo administradores pueden rechazar pagos', 403);

    const { id, reason } = await request.json();
    if (!id) return err('id requerido');
    if (!reason?.trim()) return err('Debes indicar un motivo del rechazo', 400);

    const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id });
    if (!order) return err('Pedido no encontrado', 404);
    if (order.status === ORDER_STATUS.CANCELLED) return err('El pedido está cancelado', 400);
    if (order.status !== ORDER_STATUS.AWAITING_PAYMENT) {
      return err('Solo se puede rechazar un pedido que esté esperando confirmación de pago', 400);
    }

    const now = new Date();
    await db.collection(COLLECTIONS.ORDERS).updateOne(
      { id },
      {
        $set: {
          status: ORDER_STATUS.PENDING,           // vuelve a pending para que el cliente pueda resubir
          paymentRejectionReason: reason.trim(),
          paymentRejectedAt: now,
          paymentRejectedBy: user.email || user.id,
          // Preservamos el receiptUrl histórico? No — lo limpiamos para que el cliente suba uno nuevo
          receiptUrl: null,
          receiptUploadedAt: null,
        },
      },
    );

    const updatedOrder = await db.collection(COLLECTIONS.ORDERS).findOne({ id });

    // Notificar al cliente (best-effort)
    notifyPaymentRejected({ order: updatedOrder, reason: reason.trim() })
      .catch(e => console.warn('[wa] payment_rejected dispatch failed:', e.message));
    notifyPaymentRejectedByEmail({ order: updatedOrder, reason: reason.trim() })
      .catch(e => console.warn('[email] payment_rejected dispatch failed:', e.message));

    return json({ ok: true, id, rejectedAt: now });
  }

  // POST /api/orders/sweep-expired  — Auto-cancel de pedidos con transferencia
  // que no subieron comprobante en RECEIPT_TIMEOUT_HOURS horas.
  // Se puede llamar manualmente por el admin o programáticamente cada X min.
  if (route === '/orders/sweep-expired' && method === 'POST') {
    const user = getUserFromRequest(request);
    if (!user || user.role !== 'admin') return err('Sólo administradores', 403);

    const cutoff = new Date(Date.now() - RECEIPT_TIMEOUT_HOURS * 60 * 60 * 1000);

    // Buscar pedidos pending con paymentMethod=transfer y sin comprobante subido, más antiguos que cutoff
    const expired = await db.collection(COLLECTIONS.ORDERS).find({
      status: ORDER_STATUS.PENDING,
      paymentMethod: 'transfer',
      receiptUrl: { $in: [null, undefined, ''] },
      createdAt: { $lt: cutoff },
    }).toArray();

    let cancelledCount = 0;
    for (const order of expired) {
      try {
        await db.collection(COLLECTIONS.ORDERS).updateOne(
          { id: order.id },
          {
            $set: {
              status: ORDER_STATUS.CANCELLED,
              productionStatus: PRODUCTION_STATUS.NOT_STARTED,
              cancelReason: `Auto-cancelado: no se subió comprobante en ${RECEIPT_TIMEOUT_HOURS}h`,
              cancelledAt: new Date(),
              cancelledBy: 'system',
            },
          },
        );
        try { await releaseReservedStockForOrder(db, order.id, order.orderNumber); } catch { /* noop */ }
        await db.collection(COLLECTIONS.PRODUCTION_QUEUE).deleteMany({ orderId: order.id });
      await cancelFulfillmentForOrder(db, order.id, null, 'Pedido auto-cancelado por comprobante vencido');
        cancelledCount++;
      } catch (e) {
        console.warn(`[orders/sweep] failed for ${order.orderNumber}:`, e.message);
      }
    }

    return json({
      ok: true,
      cutoff: cutoff.toISOString(),
      found: expired.length,
      cancelled: cancelledCount,
      cancelledNumbers: expired.slice(0, cancelledCount).map(o => o.orderNumber),
    });
  }

  return null;
}
