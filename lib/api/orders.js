// /api/orders GET · /api/orders/lookup GET · /api/orders/public POST
// /api/orders/cancel POST (admin) · /api/orders/delete POST (admin)
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, ORDER_STATUS, PRODUCTION_STATUS, PRIORITY, SALES_CHANNEL, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import { notifyOrderConfirmation } from '@/lib/whatsapp/notifications';
import { notifyOrderConfirmationByEmail } from '@/lib/email/notifications';
import { upsertCustomerFromSnapshot } from './customers';

// Devuelve el stock reservado por un pedido cancelado a `available` (reservedQuantity -= qty).
async function releaseReservedStockForOrder(db, orderId, orderNumber) {
  const items = await db.collection(COLLECTIONS.ORDER_ITEMS).find({ orderId }).toArray();
  const now = new Date();
  for (const it of items) {
    if (it.type !== 'product' || !it.productId || !it.variantId) continue;
    const stockRow = await db.collection(COLLECTIONS.COMMERCIAL_STOCK)
      .findOne({ productId: it.productId, variantId: it.variantId });
    if (!stockRow) continue;
    const newReserved = Math.max(0, (stockRow.reservedQuantity || 0) - (it.quantity || 0));
    await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
      { id: stockRow.id },
      { $set: { reservedQuantity: newReserved, updatedAt: now } },
    );
    await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
      id: uuidv4(),
      type: 'commercial_in',            // ingreso (liberación)
      reference: 'order_cancel',
      referenceId: orderId,
      itemType: 'product_variant',
      itemId: it.variantId,
      quantity: it.quantity || 0,       // positivo = ingreso
      balanceAfter: stockRow.quantity - newReserved,
      operatorId: null,
      reason: `Liberación por cancelación de pedido ${orderNumber}`,
      createdAt: now,
    });
  }
}

export default async function handleOrders(ctx) {
  const { method, route, db, request } = ctx;

  // GET /api/orders — lista admin o filtrada por customerEmail (portal cliente)
  if (route === '/orders' && method === 'GET') {
    const url = new URL(request.url);
    const customerEmail = url.searchParams.get('customerEmail');
    const q = customerEmail
      ? { 'customerSnapshot.email': customerEmail.toLowerCase() }
      : {};
    const rows = await db.collection(COLLECTIONS.ORDERS).find(q).sort({ createdAt: -1 }).limit(200).toArray();
    return json(strip(rows));
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
    const { customer, deliveryMethod, shippingAddress, paymentMethod, items, notes } = body;

    if (!customer?.name || !customer?.email) return err('Nombre y email son obligatorios');
    if (!Array.isArray(items) || items.length === 0) return err('El carrito está vacío');
    if (!['pickup', 'shipping'].includes(deliveryMethod)) return err('Método de entrega inválido');

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
    const shipping = deliveryMethod === 'shipping' ? 3990 : 0;
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
      shippingAddress: deliveryMethod === 'shipping' ? (shippingAddress || null) : null,
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

    for (const r of resolvedItems) {
      if (r.stockRow) {
        const newReserved = (r.stockRow.reservedQuantity || 0) + r.quantity;
        await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
          { id: r.stockRow.id },
          { $set: { reservedQuantity: newReserved, updatedAt: now } }
        );
        await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
          id: uuidv4(),
          type: 'commercial_out',
          reference: 'order',
          referenceId: orderId,
          itemType: 'product_variant',
          itemId: r.variant.id,
          quantity: -r.quantity,
          balanceAfter: r.stockRow.quantity - newReserved,
          operatorId: null,
          reason: `Reserva por pedido web ${orderNumber}`,
          createdAt: now,
        });
      }
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

  return null;
}
