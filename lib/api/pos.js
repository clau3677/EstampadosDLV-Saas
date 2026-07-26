// ============================================================================
// POS MODULE — Punto de Venta (tienda física)
//
// Endpoints:
//   GET  /api/pos/sessions/current?operatorId=X   → sesión abierta o null
//   POST /api/pos/sessions/open                    → { operatorId, openingCash, notes? }
//   POST /api/pos/sessions/close                   → { sessionId, closingCash, notes? }
//   GET  /api/pos/sessions                         → historial (ordenado desc)
//   GET  /api/pos/sessions/[id]                    → detalle
//   POST /api/pos/sales                            → { sessionId, items[], payments[], customer?, notes? }
//   GET  /api/pos/sales?sessionId=X                → ventas de una sesión
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, ORDER_STATUS, PRODUCTION_STATUS, PRIORITY, SALES_CHANNEL, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { notifyOrderConfirmation } from '@/lib/whatsapp/notifications';

// Métodos de pago permitidos en POS (efectivo + tarjeta + transferencia)
const VALID_POS_PAYMENTS = ['cash', 'card', 'transfer'];

// ============================================================================
// SESSIONS
// ============================================================================

async function handleSessionsCurrent(ctx) {
  const { request, db } = ctx;
  const url = new URL(request.url);
  const operatorId = url.searchParams.get('operatorId');
  if (!operatorId) return err('operatorId requerido');
  const session = await db.collection(COLLECTIONS.POS_SESSIONS)
    .findOne({ operatorId, status: 'open' });
  return json(session ? strip(session) : null);
}

async function handleSessionsOpen(ctx) {
  const { request, db } = ctx;
  const body = await request.json();
  const { operatorId, openingCash, notes } = body;
  if (!operatorId) return err('operatorId requerido');
  const cash = Number(openingCash);
  if (Number.isNaN(cash) || cash < 0) return err('openingCash inválido');

  // Solo puede haber UNA sesión abierta por operador
  const existing = await db.collection(COLLECTIONS.POS_SESSIONS)
    .findOne({ operatorId, status: 'open' });
  if (existing) return err('Ya tienes una caja abierta. Ciérrala antes de abrir otra.', 409);

  // Validar que el operador existe
  const operator = await db.collection(COLLECTIONS.USERS).findOne({ id: operatorId });
  if (!operator) return err('operator no encontrado', 404);

  const now = new Date();
  const doc = {
    id: uuidv4(),
    operatorId,
    operatorName: operator.fullName || operator.email,
    openedAt: now,
    closedAt: null,
    openingCash: cash,
    closingCash: null,
    expectedCash: cash,
    difference: null,
    status: 'open',
    salesCount: 0,
    totalSales: 0,
    totalCash: 0,
    totalCard: 0,
    totalTransfer: 0,
    notes: notes || '',
    createdAt: now,
  };
  await db.collection(COLLECTIONS.POS_SESSIONS).insertOne(doc);
  return json(strip(doc));
}

async function handleSessionsClose(ctx) {
  const { request, db } = ctx;
  const body = await request.json();
  const { sessionId, closingCash, notes } = body;
  if (!sessionId) return err('sessionId requerido');
  const cash = Number(closingCash);
  if (Number.isNaN(cash) || cash < 0) return err('closingCash inválido');

  const session = await db.collection(COLLECTIONS.POS_SESSIONS).findOne({ id: sessionId });
  if (!session) return err('sesión no encontrada', 404);
  if (session.status !== 'open') return err('la sesión ya está cerrada');

  const expected = (session.openingCash || 0) + (session.totalCash || 0);
  const difference = cash - expected;

  const now = new Date();
  await db.collection(COLLECTIONS.POS_SESSIONS).updateOne(
    { id: sessionId },
    {
      $set: {
        status: 'closed',
        closedAt: now,
        closingCash: cash,
        expectedCash: expected,
        difference,
        notes: notes ? (session.notes ? `${session.notes}\n---\n${notes}` : notes) : session.notes,
      },
    }
  );
  const updated = await db.collection(COLLECTIONS.POS_SESSIONS).findOne({ id: sessionId });
  return json(strip(updated));
}

async function handleSessionsList(ctx) {
  const { request, db } = ctx;
  const url = new URL(request.url);
  const operatorId = url.searchParams.get('operatorId');
  const q = operatorId ? { operatorId } : {};
  const rows = await db.collection(COLLECTIONS.POS_SESSIONS)
    .find(q).sort({ openedAt: -1 }).limit(100).toArray();
  return json(strip(rows));
}

async function handleSessionDetail(ctx, sessionId) {
  const { db } = ctx;
  const session = await db.collection(COLLECTIONS.POS_SESSIONS).findOne({ id: sessionId });
  if (!session) return err('sesión no encontrada', 404);
  // Cargar todas las ventas asociadas a la sesión
  const sales = await db.collection(COLLECTIONS.ORDERS)
    .find({ posSessionId: sessionId })
    .sort({ createdAt: -1 })
    .toArray();
  return json({ session: strip(session), sales: strip(sales) });
}

// ============================================================================
// SALES (crea una orden con channel=POS, descuenta stock, actualiza sesión)
// ============================================================================

async function handleSalesCreate(ctx) {
  const { request, db } = ctx;
  const body = await request.json();
  const { sessionId, items, payments, customer, notes } = body;
  if (!sessionId) return err('sessionId requerido');
  if (!Array.isArray(items) || items.length === 0) return err('items requeridos');
  if (!Array.isArray(payments) || payments.length === 0) return err('payments requeridos');

  // Validar sesión abierta
  const session = await db.collection(COLLECTIONS.POS_SESSIONS).findOne({ id: sessionId });
  if (!session) return err('sesión no encontrada', 404);
  if (session.status !== 'open') return err('la caja está cerrada');

  // Validar productos + stock
  const productIds = [...new Set(items.map(i => i.productId))];
  const products = await db.collection(COLLECTIONS.PRODUCTS).find({ id: { $in: productIds } }).toArray();
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  const resolved = [];
  for (const it of items) {
    const p = productMap[it.productId];
    if (!p) return err(`Producto no encontrado: ${it.productId}`);
    const v = p.variants.find(x => x.id === it.variantId);
    if (!v) return err(`Variante no encontrada en ${p.name}`);

    const stockRow = await db.collection(COLLECTIONS.COMMERCIAL_STOCK)
      .findOne({ productId: p.id, variantId: v.id });
    const available = stockRow ? (stockRow.quantity - (stockRow.reservedQuantity || 0)) : 0;
    const qty = Number(it.quantity) || 1;
    if (qty > available) {
      return err(`Stock insuficiente: "${p.name} · ${v.name}" disponible ${available}, solicitado ${qty}`);
    }
    resolved.push({ product: p, variant: v, stockRow, quantity: qty });
  }

  // Calcular totales
  const subtotalWithTax = resolved.reduce((s, r) => s + r.variant.price * r.quantity, 0);
  const net = Math.round(subtotalWithTax / 1.19);
  const tax = subtotalWithTax - net;
  const total = subtotalWithTax;

  // Validar payments mixtos
  const cleanPayments = [];
  let paid = 0;
  let cashPaid = 0, cardPaid = 0, transferPaid = 0;
  for (const p of payments) {
    if (!VALID_POS_PAYMENTS.includes(p.method)) return err(`Método de pago inválido: ${p.method}`);
    const amount = Number(p.amount);
    if (Number.isNaN(amount) || amount <= 0) return err(`amount inválido en pago ${p.method}`);
    cleanPayments.push({
      method: p.method,
      amount: Math.round(amount),
      cardBrand: p.method === 'card' ? (p.cardBrand || null) : null,
      last4: p.method === 'card' ? (p.last4 || null) : null,
      reference: p.reference || null,
    });
    paid += amount;
    if (p.method === 'cash') cashPaid += amount;
    else if (p.method === 'card') cardPaid += amount;
    else if (p.method === 'transfer') transferPaid += amount;
  }
  paid = Math.round(paid);
  if (paid < total) return err(`Pago insuficiente. Total ${total}, recibido ${paid}`);
  const change = paid - total; // vuelto (solo se devuelve en efectivo)

  // Crear orden
  const now = new Date();
  const orderCount = await db.collection(COLLECTIONS.ORDERS).countDocuments({});
  const orderNumber = `DLV-POS-${String(orderCount + 500).padStart(6, '0')}`;
  const orderId = uuidv4();

  const primaryMethod = cleanPayments.length === 1
    ? cleanPayments[0].method
    : (cashPaid >= cardPaid && cashPaid >= transferPaid ? 'cash' : (cardPaid >= transferPaid ? 'card' : 'transfer'));

  const order = {
    id: orderId,
    orderNumber,
    channel: SALES_CHANNEL.POS,
    posSessionId: sessionId,
    operatorId: session.operatorId,
    operatorName: session.operatorName,
    customerId: null,
    customerSnapshot: customer && customer.name
      ? { name: customer.name, email: customer.email || '', phone: customer.phone || '', rut: customer.rut || '' }
      : { name: 'Cliente presencial', email: '', phone: '', rut: '' },
    status: ORDER_STATUS.PAID,
    productionStatus: PRODUCTION_STATUS.NOT_STARTED,
    priority: PRIORITY.NORMAL,
    subtotal: net,
    discount: 0,
    tax,
    shipping: 0,
    total,
    paid,
    change,
    payments: cleanPayments,
    paymentMethod: primaryMethod,
    paymentStatus: 'paid',
    boleta: { number: `B${String(orderCount + 500).padStart(6, '0')}`, url: null },
    deliveryMethod: 'pickup',
    shippingAddress: null,
    notes: notes || '',
    createdAt: now,
    paidAt: now,
    deliveredAt: now,
  };
  await db.collection(COLLECTIONS.ORDERS).insertOne(order);

  // Order items + descuento de stock (real, no reserva — venta ya cobrada)
  const orderItems = resolved.map(r => ({
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
  await db.collection(COLLECTIONS.ORDER_ITEMS).insertMany(orderItems);

  for (const r of resolved) {
    if (r.stockRow) {
      const newQty = r.stockRow.quantity - r.quantity;
      await db.collection(COLLECTIONS.COMMERCIAL_STOCK).updateOne(
        { id: r.stockRow.id },
        { $set: { quantity: newQty, updatedAt: now } }
      );
      await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
        id: uuidv4(),
        type: 'commercial_out',
        reference: 'pos_sale',
        referenceId: orderId,
        itemType: 'product_variant',
        itemId: r.variant.id,
        quantity: -r.quantity,
        balanceAfter: newQty,
        operatorId: session.operatorId,
        reason: `Venta POS ${orderNumber}`,
        createdAt: now,
      });
    }
  }

  // Actualizar sesión (contadores)
  await db.collection(COLLECTIONS.POS_SESSIONS).updateOne(
    { id: sessionId },
    {
      $inc: {
        salesCount: 1,
        totalSales: total,
        totalCash: Math.round(cashPaid - change), // el vuelto sale de la caja
        totalCard: Math.round(cardPaid),
        totalTransfer: Math.round(transferPaid),
      },
    }
  );

  return json({
    ok: true,
    order: strip(order),
    items: strip(orderItems),
    change,
  });
}

async function handleSalesList(ctx) {
  const { request, db } = ctx;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  const q = { channel: SALES_CHANNEL.POS };
  if (sessionId) q.posSessionId = sessionId;
  const rows = await db.collection(COLLECTIONS.ORDERS)
    .find(q).sort({ createdAt: -1 }).limit(200).toArray();
  return json(strip(rows));
}

// ============================================================================
// ROUTER MODULE
// ============================================================================

export default async function handlePos(ctx) {
  const { method, route } = ctx;

  if (!route.startsWith('/pos')) return null;

  // Sessions
  if (route === '/pos/sessions/current' && method === 'GET') return handleSessionsCurrent(ctx);
  if (route === '/pos/sessions/open' && method === 'POST') return handleSessionsOpen(ctx);
  if (route === '/pos/sessions/close' && method === 'POST') return handleSessionsClose(ctx);
  if (route === '/pos/sessions' && method === 'GET') return handleSessionsList(ctx);

  // Session detail: /pos/sessions/<id>
  if (route.startsWith('/pos/sessions/') && method === 'GET') {
    const id = route.replace('/pos/sessions/', '');
    if (id && !id.includes('/')) return handleSessionDetail(ctx, id);
  }

  // Sales
  if (route === '/pos/sales' && method === 'POST') return handleSalesCreate(ctx);
  if (route === '/pos/sales' && method === 'GET') return handleSalesList(ctx);

  return null;
}
