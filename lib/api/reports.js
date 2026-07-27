// ============================================================================
// /api/reports/*  — Analítica operacional y financiera del taller
//
// Endpoints:
//   GET /api/reports/overview?from=&to=         → KPIs generales del período
//   GET /api/reports/sales-timeseries?days=30   → serie temporal diaria de ventas
//   GET /api/reports/top-products?days=30&limit=10 → productos más vendidos
//   GET /api/reports/production?days=30         → throughput, tiempos, éxito pre-press
//   GET /api/reports/inventory-alerts           → supplies bajo mínimo + stock comercial 0
//   GET /api/reports/agent?days=30              → stats del agente IA
//   GET /api/reports/channels?days=30           → ventas por canal (web / pos / whatsapp)
// ============================================================================
import { COLLECTIONS } from '@/lib/models';
import { json, err } from './_helpers';

// ---------------------------------------------------------------------------
// Helpers de fecha
// ---------------------------------------------------------------------------
function parseRange(url) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const days = parseInt(url.searchParams.get('days') || '', 10);

  if (from && to) return { from: new Date(from), to: new Date(to) };
  const now = new Date();
  const n = Number.isFinite(days) && days > 0 ? days : 30;
  const fromD = new Date(now); fromD.setDate(fromD.getDate() - n); fromD.setHours(0, 0, 0, 0);
  return { from: fromD, to: now };
}

// ---------------------------------------------------------------------------
// Overview — KPIs generales
// ---------------------------------------------------------------------------
async function handleOverview(db, url) {
  const { from, to } = parseRange(url);

  const orders = await db.collection(COLLECTIONS.ORDERS)
    .find({ createdAt: { $gte: from, $lte: to } }).toArray();

  const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const orderCount = orders.length;
  const avgTicket = orderCount ? Math.round(revenue / orderCount) : 0;

  const byChannel = orders.reduce((acc, o) => {
    const ch = o.channel || 'web';
    acc[ch] = (acc[ch] || 0) + 1;
    return acc;
  }, {});

  const byStatus = orders.reduce((acc, o) => {
    const st = o.status || 'unknown';
    acc[st] = (acc[st] || 0) + 1;
    return acc;
  }, {});

  const paidRevenue = orders.filter(o => ['paid', 'in_production', 'ready', 'delivered'].includes(o.status))
    .reduce((s, o) => s + (o.total || 0), 0);

  // Comparativa período anterior (mismo largo)
  const spanMs = to - from;
  const prevFrom = new Date(from - spanMs);
  const prevOrders = await db.collection(COLLECTIONS.ORDERS)
    .find({ createdAt: { $gte: prevFrom, $lt: from } }).toArray();
  const prevRevenue = prevOrders.reduce((s, o) => s + (o.total || 0), 0);
  const revenueDelta = prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : (revenue > 0 ? 100 : 0);
  const orderDelta = prevOrders.length ? ((orderCount - prevOrders.length) / prevOrders.length) * 100 : (orderCount > 0 ? 100 : 0);

  // Producción activa
  const productionActive = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
    .countDocuments({ status: { $nin: ['ready', 'delivered'] } });

  // Impresoras activas
  const printers = await db.collection(COLLECTIONS.PRINTERS).countDocuments({ active: true });

  return json({
    period: { from, to, days: Math.round(spanMs / 86400000) },
    revenue,
    paidRevenue,
    orderCount,
    avgTicket,
    byChannel,
    byStatus,
    productionActive,
    printers,
    comparison: {
      previousRevenue: prevRevenue,
      previousOrderCount: prevOrders.length,
      revenueDeltaPct: Math.round(revenueDelta * 10) / 10,
      orderDeltaPct: Math.round(orderDelta * 10) / 10,
    },
  });
}

// ---------------------------------------------------------------------------
// Sales timeseries — buckets diarios
// ---------------------------------------------------------------------------
async function handleSalesTimeseries(db, url) {
  const { from, to } = parseRange(url);

  const pipeline = [
    { $match: { createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];
  const rows = await db.collection(COLLECTIONS.ORDERS).aggregate(pipeline).toArray();

  // Rellenar días sin ventas con 0 para que Recharts no tenga gaps
  const days = [];
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const row = rows.find(r => r._id === key);
    days.push({
      date: key,
      revenue: row?.revenue || 0,
      orders: row?.orders || 0,
    });
  }

  return json({ series: days });
}

// ---------------------------------------------------------------------------
// Top products
// ---------------------------------------------------------------------------
async function handleTopProducts(db, url) {
  const { from, to } = parseRange(url);
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)));

  const pipeline = [
    // Join order_items con orders para filtrar por fecha
    {
      $lookup: {
        from: COLLECTIONS.ORDERS,
        localField: 'orderId',
        foreignField: 'id',
        as: 'order',
      },
    },
    { $unwind: '$order' },
    { $match: { 'order.createdAt': { $gte: from, $lte: to } } },
    {
      $group: {
        _id: '$name',
        productName: { $first: '$name' },
        qty: { $sum: '$quantity' },
        revenue: { $sum: { $ifNull: ['$totalPrice', { $multiply: ['$unitPrice', '$quantity'] }] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ];
  const rows = await db.collection(COLLECTIONS.ORDER_ITEMS).aggregate(pipeline).toArray();
  return json({
    products: rows.map(r => ({
      name: r.productName,
      quantity: r.qty,
      revenue: r.revenue,
    })),
  });
}

// ---------------------------------------------------------------------------
// Production report
// ---------------------------------------------------------------------------
async function handleProduction(db, url) {
  const { from, to } = parseRange(url);

  // Throughput por impresora (items completados en el período)
  const throughputPipeline = [
    { $match: { updatedAt: { $gte: from, $lte: to }, status: 'ready' } },
    { $group: { _id: '$printer', completed: { $sum: 1 } } },
  ];
  const throughputRows = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
    .aggregate(throughputPipeline).toArray();

  // Estado actual del kanban (todos los ítems)
  const stateNow = await db.collection(COLLECTIONS.PRODUCTION_QUEUE).aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).toArray();

  // Pre-press: exitos vs fallos
  const prePressAggr = await db.collection('pre_press_exports').aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).toArray();

  return json({
    throughput: throughputRows.map(r => ({ printer: r._id, completed: r.completed })),
    kanbanState: stateNow.map(r => ({ status: r._id, count: r.count })),
    prePress: prePressAggr.map(r => ({ status: r._id, count: r.count })),
  });
}

// ---------------------------------------------------------------------------
// Inventory alerts
// ---------------------------------------------------------------------------
async function handleInventoryAlerts(db) {
  const supplies = await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).find({}).toArray();
  const commercial = await db.collection(COLLECTIONS.COMMERCIAL_STOCK).find({}).toArray();
  const products = await db.collection(COLLECTIONS.PRODUCTS).find({}).toArray();

  const suppliesLow = supplies.filter(s => (s.currentQuantity || 0) <= (s.minAlert || 0) && s.minAlert > 0);
  const commercialLow = [];
  for (const cs of commercial) {
    const p = products.find(pp => (pp.variants || []).some(v => v.id === cs.variantId));
    if (!p) continue;
    const v = (p.variants || []).find(vv => vv.id === cs.variantId);
    if ((cs.quantity || 0) - (cs.reservedQuantity || 0) <= 0) {
      commercialLow.push({
        productName: p.name,
        variant: `${v?.color || ''} · ${v?.size || ''}`.trim(),
        available: (cs.quantity || 0) - (cs.reservedQuantity || 0),
        variantId: cs.variantId,
      });
    }
  }
  return json({
    suppliesLow: suppliesLow.map(s => ({
      id: s.id,
      name: s.name,
      currentStock: s.currentQuantity,
      minimumStock: s.minAlert,
      unit: s.unit,
      category: s.type,
    })),
    commercialLow: commercialLow.slice(0, 20),
    totalSuppliesLow: suppliesLow.length,
    totalCommercialLow: commercialLow.length,
  });
}

// ---------------------------------------------------------------------------
// Agent IA stats
// ---------------------------------------------------------------------------
async function handleAgent(db, url) {
  const { from, to } = parseRange(url);

  const conversations = await db.collection('agent_conversations')
    .find({ createdAt: { $gte: from, $lte: to } }).toArray();

  const totalConversations = conversations.length;
  const escalated = conversations.filter(c => !c.aiEnabled || c.stage === 'human_takeover').length;
  const escalationRate = totalConversations ? (escalated / totalConversations) * 100 : 0;

  const bySrc = conversations.reduce((acc, c) => {
    const s = c.source || 'web';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const drafts = await db.collection('agent_order_drafts')
    .countDocuments({ createdAt: { $gte: from, $lte: to } });

  const messages = await db.collection('agent_messages').aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]).toArray();

  // Tokens totales aproximados (sumando usage cuando existe)
  const tokenAggr = await db.collection('agent_messages').aggregate([
    { $match: { createdAt: { $gte: from, $lte: to }, 'usage.total_tokens': { $exists: true } } },
    { $group: { _id: null, totalTokens: { $sum: '$usage.total_tokens' } } },
  ]).toArray();

  return json({
    conversations: totalConversations,
    escalated,
    escalationRate: Math.round(escalationRate * 10) / 10,
    bySource: bySrc,
    drafts,
    messagesByRole: messages.reduce((acc, m) => { acc[m._id] = m.count; return acc; }, {}),
    totalTokens: tokenAggr[0]?.totalTokens || 0,
  });
}

// ---------------------------------------------------------------------------
// Channels breakdown
// ---------------------------------------------------------------------------
async function handleChannels(db, url) {
  const { from, to } = parseRange(url);

  const orders = await db.collection(COLLECTIONS.ORDERS)
    .find({ createdAt: { $gte: from, $lte: to } }).toArray();

  const byChannel = {};
  const byPayment = {};
  const byDelivery = {};

  for (const o of orders) {
    const ch = o.channel || (o.orderNumber?.startsWith('DLV-POS') ? 'pos' : 'web');
    byChannel[ch] = byChannel[ch] || { count: 0, revenue: 0 };
    byChannel[ch].count += 1;
    byChannel[ch].revenue += o.total || 0;

    const pm = o.paymentMethod || 'unknown';
    byPayment[pm] = byPayment[pm] || { count: 0, revenue: 0 };
    byPayment[pm].count += 1;
    byPayment[pm].revenue += o.total || 0;

    const dm = o.deliveryMethod || 'pickup';
    byDelivery[dm] = byDelivery[dm] || { count: 0, revenue: 0 };
    byDelivery[dm].count += 1;
    byDelivery[dm].revenue += o.total || 0;
  }

  const toArray = (obj) => Object.entries(obj).map(([k, v]) => ({ name: k, ...v }));
  return json({
    channel: toArray(byChannel).sort((a, b) => b.revenue - a.revenue),
    payment: toArray(byPayment).sort((a, b) => b.revenue - a.revenue),
    delivery: toArray(byDelivery).sort((a, b) => b.revenue - a.revenue),
  });
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------
export default async function handleReports(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/reports')) return null;
  if (method !== 'GET') return err('solo GET', 405);

  const url = new URL(request.url);
  try {
    if (route === '/reports/overview') return handleOverview(db, url);
    if (route === '/reports/sales-timeseries') return handleSalesTimeseries(db, url);
    if (route === '/reports/top-products') return handleTopProducts(db, url);
    if (route === '/reports/production') return handleProduction(db, url);
    if (route === '/reports/inventory-alerts') return handleInventoryAlerts(db);
    if (route === '/reports/agent') return handleAgent(db, url);
    if (route === '/reports/channels') return handleChannels(db, url);
  } catch (e) {
    console.error('[reports]', e);
    return err(e.message || 'error', 500);
  }

  return null;
}
