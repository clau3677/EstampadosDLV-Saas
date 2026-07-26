// GET /api/production/queue · POST /api/production/move
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { notifyOrderInProduction, notifyOrderReady } from '@/lib/whatsapp/notifications';

export default async function handleProduction(ctx) {
  const { method, route, db, request } = ctx;

  if (route === '/production/queue' && method === 'GET') {
    const url = new URL(request.url);
    const printerFilter = url.searchParams.get('printer');
    const q = printerFilter && printerFilter !== 'all' ? { printer: printerFilter } : {};

    const items = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
      .find(q).sort({ createdAt: -1 }).limit(500).toArray();

    const orderIds = [...new Set(items.map(i => i.orderId).filter(Boolean))];
    const orders = orderIds.length
      ? await db.collection(COLLECTIONS.ORDERS).find({ id: { $in: orderIds } }).toArray()
      : [];
    const ordersMap = Object.fromEntries(orders.map(o => [o.id, o]));

    const enriched = items.map(i => {
      const o = ordersMap[i.orderId];
      return {
        ...i,
        order: o ? {
          orderNumber: o.orderNumber,
          customerName: o.customerSnapshot?.name,
          channel: o.channel,
          total: o.total,
          createdAt: o.createdAt,
        } : null,
      };
    });
    return json(strip(enriched));
  }

  if (route === '/production/move' && method === 'POST') {
    const { id, toStatus } = await request.json();
    const valid = ['received', 'printing', 'curing', 'ready'];
    if (!id || !valid.includes(toStatus)) return err('parámetros inválidos');

    const now = new Date();
    const setFields = { status: toStatus };
    if (toStatus === 'printing') setFields.startedAt = now;
    if (toStatus === 'ready') setFields.completedAt = now;

    const result = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
      .findOneAndUpdate({ id }, { $set: setFields }, { returnDocument: 'after' });
    const item = result?.value || result;
    if (!item) return err('no encontrado', 404);

    if (item.orderId) {
      await db.collection(COLLECTIONS.ORDERS).updateOne(
        { id: item.orderId },
        { $set: { productionStatus: toStatus } }
      );

      // Buscar la orden actualizada para notificaciones
      const orderDoc = await db.collection(COLLECTIONS.ORDERS).findOne({ id: item.orderId });

      // Nombre human-readable de la impresora (si existe en la colección)
      let printerName = item.printer;
      try {
        const printerDoc = await db.collection(COLLECTIONS.PRINTERS).findOne({ code: item.printer });
        if (printerDoc?.name) printerName = printerDoc.name;
      } catch { /* opcional */ }

      // Notificación al entrar a producción (printing) — solo la primera vez
      if (toStatus === 'printing' && orderDoc) {
        notifyOrderInProduction({ order: orderDoc, printerName })
          .catch((e) => console.warn('[wa] in_production dispatch failed:', e.message));
      }

      if (toStatus === 'ready') {
        const pending = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
          .countDocuments({ orderId: item.orderId, status: { $ne: 'ready' } });
        if (pending === 0) {
          await db.collection(COLLECTIONS.ORDERS).updateOne(
            { id: item.orderId },
            { $set: { status: 'ready' } }
          );
          const finalOrder = await db.collection(COLLECTIONS.ORDERS).findOne({ id: item.orderId });
          if (finalOrder) {
            notifyOrderReady({ order: finalOrder })
              .catch((e) => console.warn('[wa] ready dispatch failed:', e.message));
          }
        }
      }
    }

    return json({ ok: true, item: strip(item) });
  }

  return null;
}
