// ============================================================================
// Notificaciones automáticas por WhatsApp
//
// Cada función construye el template y envía (best-effort). NUNCA lanza —
// registra el error en logs para no romper el flujo de negocio (checkout, POS,
// kanban) si WhatsApp está desconectado.
//
// Guarda cada intento en `whatsapp_messages` (log auditable).
// ============================================================================
import { getDb } from '@/lib/mongo';
import { v4 as uuidv4 } from 'uuid';
import { sendText, getStatus, toWhatsappJid } from './client';
import { formatCLP } from '@/lib/format';

const LOG_COLL = 'whatsapp_messages';

async function logMessage(entry) {
  try {
    const db = await getDb();
    await db.collection(LOG_COLL).insertOne({ id: uuidv4(), createdAt: new Date(), ...entry });
  } catch (e) {
    // no-op: log fail shouldn't break flow
    console.warn('[wa][log] cannot persist message log:', e.message);
  }
}

async function safeSend({ phone, text, event, orderId, orderNumber }) {
  const status = getStatus();
  const jid = toWhatsappJid(phone);
  const base = { event, orderId, orderNumber, phone, jid, text };

  if (!phone) {
    await logMessage({ ...base, status: 'skipped', reason: 'no_phone' });
    return { ok: false, reason: 'no_phone' };
  }
  if (!jid) {
    await logMessage({ ...base, status: 'skipped', reason: 'invalid_phone' });
    return { ok: false, reason: 'invalid_phone' };
  }
  if (status.state !== 'connected') {
    await logMessage({ ...base, status: 'skipped', reason: `not_connected:${status.state}` });
    return { ok: false, reason: `not_connected:${status.state}` };
  }

  try {
    const res = await sendText(phone, text);
    await logMessage({ ...base, status: 'sent', messageId: res.messageId, sentAt: res.sentAt });
    return { ok: true, messageId: res.messageId };
  } catch (e) {
    await logMessage({ ...base, status: 'failed', error: e.message });
    return { ok: false, reason: 'send_error', error: e.message };
  }
}

// ---------------------------------------------------------------------------
// TEMPLATES (tono cálido, chileno, sin sobre-formalismo)
// ---------------------------------------------------------------------------

function tplOrderConfirmation({ orderNumber, customerName, total, items, deliveryMethod }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const listado = items?.length
    ? items.slice(0, 5).map((it) => `• ${it.name} × ${it.quantity}`).join('\n')
    : '';
  const extra = items?.length > 5 ? `\n…y ${items.length - 5} ítem(s) más` : '';
  const entrega = deliveryMethod === 'shipping' ? 'Envío a domicilio' : 'Retiro en tienda';

  return `Hola *${name}* 👋

Recibimos tu pedido *${orderNumber}* en *Estampados DLV*.

${listado}${extra}

*Total:* ${formatCLP(total)}
*Entrega:* ${entrega}

Te avisaremos por acá cuando entre a producción y cuando esté listo 🖨️

Gracias por confiar en nosotros ✨`;
}

function tplOrderInProduction({ orderNumber, customerName, printerName }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const eq = printerName ? ` en *${printerName}*` : '';
  return `Hola *${name}* 🖨️

Tu pedido *${orderNumber}* ya entró a producción${eq}.

Estamos imprimiendo y curando tu diseño. Te avisamos apenas esté listo.

— Estampados DLV`;
}

function tplOrderReady({ orderNumber, customerName, deliveryMethod }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const cta = deliveryMethod === 'shipping'
    ? 'Estamos preparando el envío.'
    : '¡Ya lo puedes pasar a retirar cuando quieras!';
  return `¡Buenas noticias *${name}*! 🎉

Tu pedido *${orderNumber}* está *LISTO* ✅

${cta}

— Estampados DLV`;
}

function tplPaymentApproved({ orderNumber, customerName, total }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  return `Hola *${name}* ✅

Confirmamos tu *pago* del pedido *${orderNumber}* por ${formatCLP(total)}.

Ya pasó a producción y te avisamos cuando esté listo 🖨️

Gracias por confiar en *Estampados DLV* ✨`;
}

function tplPaymentRejected({ orderNumber, customerName, reason }) {
  const name = customerName?.split(' ')[0] || 'Hola';
  const motivo = reason ? `\n*Motivo:* ${reason}\n` : '';
  return `Hola *${name}* ⚠️

Revisamos el comprobante de tu pedido *${orderNumber}* y *no pudimos confirmar el pago*.${motivo}
Por favor sube otro comprobante desde el enlace de confirmación de tu pedido.

Si tienes dudas, respóndenos por acá 💬

— Estampados DLV`;
}

// ---------------------------------------------------------------------------
// DISPATCHERS (usar desde orders.js, pos.js, production.js)
// ---------------------------------------------------------------------------

/**
 * Confirmación de pedido pagado (checkout web o venta POS).
 * @param {Object} params
 * @param {Object} params.order          documento order de MongoDB
 * @param {Array}  params.items          order items (opcional pero recomendado)
 */
export async function notifyOrderConfirmation({ order, items }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const phone = order.customerSnapshot?.phone;
  const text = tplOrderConfirmation({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    total: order.total,
    items: items || [],
    deliveryMethod: order.deliveryMethod || 'pickup',
  });
  return safeSend({
    phone, text,
    event: 'order_confirmation',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

/**
 * Notifica al cliente que su pedido entró a producción (impresora asignada).
 * @param {Object} params
 * @param {Object} params.order          documento order
 * @param {string} [params.printerName]  nombre human-readable del equipo
 */
export async function notifyOrderInProduction({ order, printerName }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const phone = order.customerSnapshot?.phone;
  const text = tplOrderInProduction({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    printerName,
  });
  return safeSend({
    phone, text,
    event: 'order_in_production',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

/**
 * Notifica al cliente que su pedido está listo (todas las piezas producidas).
 */
export async function notifyOrderReady({ order }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const phone = order.customerSnapshot?.phone;
  const text = tplOrderReady({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    deliveryMethod: order.deliveryMethod || 'pickup',
  });
  return safeSend({
    phone, text,
    event: 'order_ready',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

/** Envío manual desde el panel admin (test o mensajes ad-hoc) */
export async function sendManualMessage({ phone, text, note }) {
  return safeSend({
    phone, text,
    event: 'manual',
    orderId: null,
    orderNumber: note || null,
  });
}

/** Notifica al cliente que su pago (transferencia) fue aprobado por el admin. */
export async function notifyPaymentApproved({ order }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const phone = order.customerSnapshot?.phone;
  const text = tplPaymentApproved({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    total: order.total,
  });
  return safeSend({
    phone, text,
    event: 'payment_approved',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

/** Notifica al cliente que su comprobante fue rechazado. */
export async function notifyPaymentRejected({ order, reason }) {
  if (!order) return { ok: false, reason: 'no_order' };
  const phone = order.customerSnapshot?.phone;
  const text = tplPaymentRejected({
    orderNumber: order.orderNumber,
    customerName: order.customerSnapshot?.name,
    reason,
  });
  return safeSend({
    phone, text,
    event: 'payment_rejected',
    orderId: order.id,
    orderNumber: order.orderNumber,
  });
}

export async function listRecentMessages(limit = 50) {
  const db = await getDb();
  const rows = await db.collection(LOG_COLL)
    .find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  return rows.map(({ _id, ...r }) => r);
}
