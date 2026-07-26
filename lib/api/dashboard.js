// GET /api/ (health) · GET /api/config · GET /api/dashboard/summary · GET /api/pricing
import { COLLECTIONS, PRINTER_SPECS, PRINTERS, ROLES, SUPPLY_TYPE, PRODUCT_CATEGORY,
  ORDER_STATUS, PRODUCTION_STATUS, PRIORITY, SALES_CHANNEL, PAYMENT_METHOD, strip,
} from '@/lib/models';
import { PRICING } from '@/lib/pricing';
import { json } from './_helpers';

export default async function handleDashboard(ctx) {
  const { method, route, db } = ctx;

  if ((route === '/' || route === '/root') && method === 'GET') {
    return json({
      service: 'Estampados DLV · Sistema Operativo',
      status: 'ok',
      version: '0.1.0',
      printers: Object.values(PRINTER_SPECS).map(p => `${p.name} (${p.maxWidthCm}cm)`),
    });
  }

  if (route === '/config' && method === 'GET') {
    const dynamicPrinters = await db.collection(COLLECTIONS.PRINTERS)
      .find({}).sort({ sortOrder: 1, createdAt: 1 }).toArray();
    return json({
      printers: PRINTER_SPECS,
      printersDynamic: strip(dynamicPrinters),
      enums: { ROLES, SUPPLY_TYPE, PRODUCT_CATEGORY, ORDER_STATUS, PRODUCTION_STATUS, PRIORITY, SALES_CHANNEL, PAYMENT_METHOD },
    });
  }

  if (route === '/pricing' && method === 'GET') {
    return json(PRICING);
  }

  if (route === '/dashboard/summary' && method === 'GET') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [salesAgg] = await db.collection(COLLECTIONS.ORDERS).aggregate([
      { $match: { paidAt: { $gte: start }, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).toArray();

    const pendingOrders = await db.collection(COLLECTIONS.ORDERS).countDocuments({
      status: { $in: [ORDER_STATUS.PAID, ORDER_STATUS.IN_PRODUCTION] },
    });

    const [metersAgg] = await db.collection(COLLECTIONS.PRODUCTION_QUEUE).aggregate([
      { $match: { completedAt: { $gte: start } } },
      { $group: { _id: null, mm: { $sum: '$lengthMm' } } },
    ]).toArray();

    const supplies = await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).find({}).toArray();
    const stockAlerts = supplies.filter(s => s.currentQuantity <= s.minAlert).length;

    const queueByPrinter = await db.collection(COLLECTIONS.PRODUCTION_QUEUE).aggregate([
      { $match: { status: { $in: [PRODUCTION_STATUS.RECEIVED, PRODUCTION_STATUS.PRINTING] } } },
      { $group: { _id: '$printer', c: { $sum: 1 } } },
    ]).toArray();
    const printerQueues = Object.values(PRINTERS).reduce((acc, p) => (acc[p] = 0, acc), {});
    queueByPrinter.forEach(q => { printerQueues[q._id] = q.c; });

    const recentOrders = await db.collection(COLLECTIONS.ORDERS)
      .find({}).sort({ createdAt: -1 }).limit(6).toArray();
    const recentActivity = recentOrders.map(o => ({
      message: `Pedido ${o.orderNumber} · ${o.customerSnapshot?.name || 'Cliente'} · ${o.channel.toUpperCase()}`,
      at: o.createdAt,
    }));

    return json({
      salesToday: salesAgg?.total ?? 0,
      pendingOrders,
      metersToday: Math.round(((metersAgg?.mm ?? 0) / 1000) * 10) / 10,
      stockAlerts,
      printerQueues,
      recentActivity,
    });
  }

  return null;
}
