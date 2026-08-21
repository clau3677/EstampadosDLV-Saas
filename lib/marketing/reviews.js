// =============================================================================
// Reputación online — Solicitudes de reseña post-venta (auditoría jul-2026)
// -----------------------------------------------------------------------------
// Flujo: cuando un pedido queda "ready" (o "delivered" en POS con contacto),
// se encola un documento en `review_requests` con dueAt = ahora + 48h.
// El cron de marketing (/api/marketing/dispatch) llama a dispatchDueReviewRequests()
// que envía la solicitud por WhatsApp y email (best-effort, nunca lanza).
// =============================================================================
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS } from '@/lib/models';
import { notifyReviewRequest } from '@/lib/whatsapp/notifications';
import { notifyReviewRequestByEmail } from '@/lib/email/notifications';

const DELAY_HOURS = Number(process.env.REVIEW_REQUEST_DELAY_HOURS || 48);

/**
 * Encola una solicitud de reseña para un pedido (idempotente por orderId).
 * No envía nada inmediatamente: respeta la ventana de DELAY_HOURS para que
 * el cliente ya tenga el producto en sus manos.
 */
export async function scheduleReviewRequest(db, order) {
  if (!order?.id) return { ok: false, reason: 'no_order' };
  const hasContact = order.customerSnapshot?.phone || order.customerSnapshot?.email;
  if (!hasContact) return { ok: false, reason: 'no_contact' };

  const existing = await db.collection(COLLECTIONS.REVIEW_REQUESTS).findOne({ orderId: order.id });
  if (existing) return { ok: true, deduped: true, requestId: existing.id };

  const now = new Date();
  const request = {
    id: uuidv4(),
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerSnapshot: {
      name: order.customerSnapshot?.name || '',
      phone: order.customerSnapshot?.phone || '',
      email: order.customerSnapshot?.email || '',
    },
    status: 'pending',            // pending → sent | failed | skipped
    channels: [],                 // se llena al enviar: ['whatsapp','email']
    createdAt: now,
    dueAt: new Date(now.getTime() + DELAY_HOURS * 3600 * 1000),
    sentAt: null,
    source: 'fulfillment_completed',
  };
  await db.collection(COLLECTIONS.REVIEW_REQUESTS).insertOne(request);
  return { ok: true, scheduled: true, requestId: request.id, dueAt: request.dueAt };
}

/**
 * Despacha todas las solicitudes vencidas (dueAt <= ahora).
 * Llamado por el cron /api/marketing/dispatch. Devuelve resumen.
 */
export async function dispatchDueReviewRequests(db, { limit = 20 } = {}) {
  const now = new Date();
  const due = await db.collection(COLLECTIONS.REVIEW_REQUESTS)
    .find({ status: 'pending', dueAt: { $lte: now } })
    .sort({ dueAt: 1 })
    .limit(limit)
    .toArray();

  let sent = 0, failed = 0;
  for (const req of due) {
    const order = {
      id: req.orderId,
      orderNumber: req.orderNumber,
      customerSnapshot: req.customerSnapshot,
    };
    const channels = [];
    try {
      if (req.customerSnapshot?.phone) {
        const r = await notifyReviewRequest({ order });
        if (r?.ok) channels.push('whatsapp');
      }
      if (req.customerSnapshot?.email) {
        const r = await notifyReviewRequestByEmail({ order });
        if (r?.ok) channels.push('email');
      }
      const status = channels.length > 0 ? 'sent' : 'failed';
      if (status === 'sent') sent += 1; else failed += 1;
      await db.collection(COLLECTIONS.REVIEW_REQUESTS).updateOne(
        { id: req.id },
        { $set: { status, channels, sentAt: channels.length ? new Date() : null } }
      );
    } catch (e) {
      failed += 1;
      await db.collection(COLLECTIONS.REVIEW_REQUESTS).updateOne(
        { id: req.id },
        { $set: { status: 'failed', error: e.message } }
      );
    }
  }
  return { processed: due.length, sent, failed };
}
