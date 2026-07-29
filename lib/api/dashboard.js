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

    // VENTAS HOY = suma del total de todas las órdenes creadas HOY que no
    // estén canceladas. Incluye pending/paid/in_production/ready/delivered
    // porque son ventas COMPROMETIDAS (importa que se vendió, aunque el
    // pago llegue después — típico de gang-sheet o transferencia bancaria).
    const [salesAgg] = await db.collection(COLLECTIONS.ORDERS).aggregate([
      { $match: { createdAt: { $gte: start }, status: { $ne: ORDER_STATUS.CANCELLED } } },
      { $group: { _id: null, total: { $sum: '$total' }, c: { $sum: 1 } } },
    ]).toArray();

    // PEDIDOS EN COLA = ítems reales en la cola de producción con estado
    // received/printing/curing (idéntico a lo que muestra el Kanban).
    // Excluimos items cuyo pedido esté cancelado para no inflar el conteo.
    const activeOrderIds = (await db.collection(COLLECTIONS.ORDERS).find(
      { status: { $ne: ORDER_STATUS.CANCELLED } },
      { projection: { id: 1 } }
    ).toArray()).map(o => o.id);

    const pendingOrders = await db.collection(COLLECTIONS.PRODUCTION_QUEUE).countDocuments({
      status: { $in: [PRODUCTION_STATUS.RECEIVED, PRODUCTION_STATUS.PRINTING, PRODUCTION_STATUS.CURING] },
      orderId: { $in: activeOrderIds },
    });

    const [metersAgg] = await db.collection(COLLECTIONS.PRODUCTION_QUEUE).aggregate([
      { $match: { completedAt: { $gte: start } } },
      { $group: { _id: null, mm: { $sum: '$lengthMm' } } },
    ]).toArray();

    const supplies = await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).find({}).toArray();
    const stockAlerts = supplies.filter(s => (s.currentQuantity || 0) <= (s.minAlert || 0) && (s.minAlert || 0) > 0).length;

    const queueByPrinter = await db.collection(COLLECTIONS.PRODUCTION_QUEUE).aggregate([
      { $match: { status: { $in: [PRODUCTION_STATUS.RECEIVED, PRODUCTION_STATUS.PRINTING, PRODUCTION_STATUS.CURING] } } },
      { $group: { _id: '$printer', c: { $sum: 1 } } },
    ]).toArray();
    const printerQueues = Object.values(PRINTERS).reduce((acc, p) => (acc[p] = 0, acc), {});
    queueByPrinter.forEach(q => { printerQueues[q._id] = q.c; });

    const recentOrders = await db.collection(COLLECTIONS.ORDERS)
      .find({}).sort({ createdAt: -1 }).limit(6).toArray();
    const recentActivity = recentOrders.map(o => ({
      message: `Pedido ${o.orderNumber} · ${o.customerSnapshot?.name || 'Cliente'} · ${(o.channel || 'web').toUpperCase()}`,
      at: o.createdAt,
    }));

    return json({
      salesToday: salesAgg?.total ?? 0,
      salesTodayCount: salesAgg?.c ?? 0,
      pendingOrders,
      metersToday: Math.round(((metersAgg?.mm ?? 0) / 1000) * 10) / 10,
      stockAlerts,
      printerQueues,
      recentActivity,
    });
  }

  return null;
}
