/**
 * =============================================================================
 *  Prospección B2B — wasender.js (build109)
 * -----------------------------------------------------------------------------
 *  Envío REAL de WhatsApp vía la sesión Baileys zero-cost (Ya existente en
 *  /admin/whatsapp). Reutiliza lib/whatsapp/client.js (sendText, getStatus,
 *  startConnection) y registra cada envío en el log de WhatsApp existente.
 *
 *  Guardrails:
 *   - La sesión debe estar 'connected'; si no, el mensaje queda 'pendiente'
 *     y se reintentará en la siguiente corrida del runner.
 *   - Respecta supresión, ventana horaria y límite diario (igual que email).
 *   - Delay ~1.2s entre mensajes para no activar rate limits de WhatsApp.
 * =============================================================================
 */
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { logAudit, AUDIT_ACTIONS } from './audit.js';

// El cliente Baileys (lib/whatsapp/client.js) es ESM: sendText LANZA si la sesión
// no está conectada y devuelve { messageId, jid, sentAt } en éxito.
// Se importa de forma estática (el módulo existe en producción); el estado se
// consulta siempre vía getStatus() antes de enviar.
import { getStatus, sendText } from '../whatsapp/client.js';

/** ¿Está la sesión de WhatsApp conectada? */
export function isWhatsappConnected() {
  try {
    return getStatus()?.state === 'connected';
  } catch (e) {
    return false;
  }
}

/** Obtiene el usuario vinculado (para el log). */
export function whatsappUserInfo() {
  try {
    const s = getStatus() || {};
    return s.user ? { user: s.user, startedAt: s.startedAt, messagesSent: s.messagesSent } : null;
  } catch (e) {
    return null;
  }
}


/**
 * Envía UN mensaje de WhatsApp real a un número.
 * @returns { sent, skipped, reason }
 */
export async function sendWhatsappOne({ messageId, recipient, body, test = false, actorId = null }) {
  const messages = await coll(COLLECTIONS.PRO_MESSAGES);

  if (!isWhatsappConnected()) {
    await messages.updateOne({ id: messageId }, { $set: { status: 'pendiente', error: 'sesion_whatsapp_no_conectada' } });
    await logAudit({ action: AUDIT_ACTIONS.MESSAGE_SIMULATED, actorId, entityType: 'messages', entityId: messageId, details: { recipient, reason: 'whatsapp_desconectado', note: 'se reintentará cuando la sesión esté conectada' } });
    return { sent: false, skipped: true, reason: 'whatsapp_desconectado' };
  }

  try {
    const rawPhone = String(recipient || '').replace(/[^0-9+]/g, '');
    const result = await sendText(rawPhone, body);
    if (result && result.messageId) {
      await messages.updateOne({ id: messageId }, { $set: { status: 'enviado', sentAt: new Date(), sentVia: 'whatsapp_baileys', externalResult: result } });
      await logAudit({ action: AUDIT_ACTIONS.MESSAGE_SENT, actorId, entityType: 'messages', entityId: messageId, details: { recipient, channel: 'whatsapp', test } });
      return { sent: true };
    }
    await messages.updateOne({ id: messageId }, { $set: { status: 'error', error: 'desconocido' } });
    return { sent: false, skipped: false, reason: 'desconocido' };
  } catch (e) {
    await messages.updateOne({ id: messageId }, { $set: { status: 'error', error: e?.message || String(e) } });
    await logAudit({ action: AUDIT_ACTIONS.MESSAGE_FAILED, actorId, entityType: 'messages', entityId: messageId, details: { recipient, channel: 'whatsapp', error: e?.message || String(e), test } });
    return { sent: false, skipped: false, reason: e?.message || String(e) };
  }
}

/** Delay respetuoso entre envíos de WhatsApp. */
export function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default {
  isWhatsappConnected,
  whatsappUserInfo,
  sendWhatsappOne,
};
