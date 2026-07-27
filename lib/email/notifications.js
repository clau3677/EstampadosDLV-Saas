// ============================================================================
// Notificaciones por Email — Dispatchers best-effort
//
// Cada función es non-throwing: si falla el SMTP, se registra en logs y en la
// colección `email_messages` con status: sent | skipped | failed. Nunca rompe
// el flujo de negocio (checkout, POS, kanban).
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/mongo';
import { sendMail, isConfigured } from './client';
import {
  tplOrderConfirmation, tplOrderInProduction, tplOrderReady,
  tplPaymentApproved, tplPaymentRejected,
} from './templates';

const LOG_COLL = 'email_messages';

async function logMessage(entry) {
  try {
    const db = await getDb();
    await db.collection(LOG_COLL).insertOne({ id: uuidv4(), createdAt: new Date(), ...entry });
  } catch (e) {
    console.warn('[email][log] cannot persist:', e.message);
  }
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

async function safeSend({ to, subject, html, text, event, orderId, orderNumber, note }) {
  const base = { event, orderId, orderNumber, to, subject, note };

  if (!to) {
    await logMessage({ ...base, status: 'skipped', reason: 'no_email' });
    return { ok: false, reason: 'no_email' };
  }
  if (!isValidEmail(to)) {
    await logMessage({ ...base, status: 'skipped', reason: 'invalid_email' });
    return { ok: false, reason: 'invalid_email' };
  }
  if (!isConfigured()) {
    await logMessage({ ...base, status: 'skipped', reason: 'smtp_not_configured' });
    return { ok: false, reason: 'smtp_not_configured' };
  }

  try {
    const res = await sendMail({ to, subject, html, text });
    await logMessage({
      ...base,
      status: 'sent',
      messageId: res.messageId,
      accepted: res.accepted,
      sentAt: new Date(),
    });
    return { ok: true, messageId: res.messageId };
  } catch (e) {
    await logMessage({ ...base, status: 'failed', error: e.message });
    return { ok: false, reason: 'send_error', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Dispatchers públicos (los mismos hooks que usa WhatsApp los usan aquí)
// ---------------------------------------------------------------------------

export async function notifyOrderConfirmationByEmail({ order, items }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const to = order.customerSnapshot?.email;
  const { subject, html, text } = tplOrderConfirmation({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    total: order.total,
    items: items || [],
    deliveryMethod: order.deliveryMethod || 'pickup',
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
  });
  return safeSend({
    to, subject, html, text,
    event: 'order_confirmation',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

export async function notifyOrderInProductionByEmail({ order, printerName }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const to = order.customerSnapshot?.email;
  const { subject, html, text } = tplOrderInProduction({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    printerName,
  });
  return safeSend({
    to, subject, html, text,
    event: 'order_in_production',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

export async function notifyOrderReadyByEmail({ order }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const to = order.customerSnapshot?.email;
  const { subject, html, text } = tplOrderReady({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    deliveryMethod: order.deliveryMethod || 'pickup',
  });
  return safeSend({
    to, subject, html, text,
    event: 'order_ready',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

/** Envío manual desde el panel admin (test o ad-hoc) */
export async function sendManualEmail({ to, subject, html, text, note }) {
  return safeSend({
    to, subject, html, text: text || undefined,
    event: 'manual',
    orderId: null,
    orderNumber: null,
    note: note || null,
  });
}

/** Notifica al cliente que su pago fue aprobado por el admin. */
export async function notifyPaymentApprovedByEmail({ order }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const to = order.customerSnapshot?.email;
  const { subject, html, text } = tplPaymentApproved({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    total: order.total,
  });
  return safeSend({
    to, subject, html, text,
    event: 'payment_approved',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

/** Notifica al cliente que su comprobante fue rechazado. */
export async function notifyPaymentRejectedByEmail({ order, reason }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const to = order.customerSnapshot?.email;
  const { subject, html, text } = tplPaymentRejected({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    reason,
  });
  return safeSend({
    to, subject, html, text,
    event: 'payment_rejected',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

export async function listRecentEmails(limit = 50) {
  const db = await getDb();
  const rows = await db.collection(LOG_COLL)
    .find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  // Excluir el HTML completo del listado para no pesar
  return rows.map(({ _id, html, ...r }) => r);
}
