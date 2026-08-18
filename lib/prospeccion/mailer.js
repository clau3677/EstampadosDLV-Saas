/**
 * =============================================================================
 *  Prospección B2B — mailer.js
 * -----------------------------------------------------------------------------
 *  Envío REAL de correos vía Resend (transaccional).
 *   - RESEND_API_KEY + MAIL_SIMULATION=false → envío real
 *   - Cualquier otra configuración → simulación (registro en BD, sin envío)
 *  Guardrails: supresión, circuit breaker de rebotes, límite diario, ventana horaria.
 * =============================================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { findSuppression } from './suppression.js';
import { logAudit, AUDIT_ACTIONS } from './audit.js';
import { isSimulationMode } from './messages.js';
export { isSimulationMode };

export const MAILER_FROM = process.env.PROSPECTION_FROM || 'Sandra Vásquez <hola@estampadosdlv.com>';
export const MAILER_REPLY_TO = process.env.PROSPECTION_REPLY_TO || '+56954169052 <sandra@estampadosdlv.com>';

/** Límites de envío responsable (para proteger reputación del dominio). */
export const LIMITS = {
  dailyMax: parseInt(process.env.PROSPECTION_DAILY_MAX || '25', 10),   // máximo correos reales/día
  dailyBurst: parseInt(process.env.PROSPECTION_BURST || '5', 10),      // máximo por tanda corrida por el runner
  startHour: parseInt(process.env.PROSPECTION_START_HOUR || '10', 10), // horario comercial Chile
  endHour: parseInt(process.env.PROSPECTION_END_HOUR || '19', 10),
};

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Envía UN correo real vía Resend. Devuelve { sent, messageId, skipped, error }.
 */
export async function sendOne({ messageId, campaignId, recipient, subject, body, test = false, actorId = null, actorName = null }) {
  const messages = await coll(COLLECTIONS.PRO_MESSAGES);
  const jobs = await coll(COLLECTIONS.PRO_JOBS);

  // Guardrail 0: simulación
  if (isSimulationMode()) {
    await messages.updateOne({ id: messageId }, { $set: { status: 'simulado', sentAt: null } });
    await logAudit({ action: AUDIT_ACTIONS.MESSAGE_SIMULATED, actorId, entityType: 'messages', entityId: messageId, details: { recipient, reason: 'simulation_mode' } });
    return { sent: false, skipped: true, reason: 'modo_simulacion' };
  }

  // Guardrail 1: supresión (verificada de nuevo en el momento del envío)
  const suppressed = await findSuppression({ email: recipient });
  if (suppressed) {
    await messages.updateOne({ id: messageId }, { $set: { status: 'baja', sentAt: null } });
    return { sent: false, skipped: true, reason: 'supresion' };
  }

  // Guardrail 2: límite diario (sin contar tests)
  if (!test) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const sentToday = await messages.countDocuments({
      status: 'enviado', createdAt: { $gte: todayStart }, test: { $ne: true },
    });
    if (sentToday >= LIMITS.dailyMax) {
      await messages.updateOne({ id: messageId }, { $set: { status: 'pendiente', error: 'limite_diario_alcanzado' } });
      return { sent: false, skipped: true, reason: 'limite_diario' };
    }
  }

  // Guardrail 3: ventana horaria (sin contar tests)
  if (!test) {
    const nowHour = new Date().getHours();
    if (nowHour < LIMITS.startHour || nowHour >= LIMITS.endHour) {
      await messages.updateOne({ id: messageId }, { $set: { status: 'pendiente', error: 'fuera_ventana_horaria' } });
      return { sent: false, skipped: true, reason: 'fuera_ventana' };
    }
  }

  // Envío real
  let providerId = null;
  let error = null;
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: MAILER_FROM,
        to: [recipient],
        subject,
        html: body,
        reply_to: MAILER_REPLY_TO,
        tags: [{ name: 'campaign', value: String(campaignId || 'test') }, { name: 'service', value: 'prospeccion-b2b' }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      error = data?.message || `HTTP ${res.status}`;
    } else {
      providerId = data.id;
    }
  } catch (e) {
    error = e?.message || 'error_de_red';
  }

  if (error) {
    await messages.updateOne({ id: messageId }, { $set: { status: 'error', error } });
    // Reencolar con backoff si quedan intentos
    const job = await jobs.findOne({ messageId, status: { $in: ['pending', 'processing'] } });
    if (job && job.attempts < job.maxAttempts) {
      await jobs.updateOne({ id: job.id }, { $set: { status: 'pending', attempts: job.attempts + 1, runAt: new Date(Date.now() + 60000 * (job.attempts + 1)) } });
    }
    await logAudit({ action: AUDIT_ACTIONS.MESSAGE_FAILED, actorId, entityType: 'messages', entityId: messageId, details: { recipient, error } });
    return { sent: false, error };
  }

  await messages.updateOne({ id: messageId }, { $set: { status: 'enviado', providerId, sentAt: new Date(), error: null } });
  await logAudit({ action: AUDIT_ACTIONS.MESSAGE_SENT, actorId, entityType: 'messages', entityId: messageId, details: { recipient, providerId } });
  return { sent: true, providerId };
}

/**
 * Procesa una tanda de jobs pendientes (llamado por el runner/API).
 * @returns {{ processed, sent, skipped: { reason, count }[], errors: number }}
 */
export async function processJobBatch({ burst = LIMITS.dailyBurst, actorId = null, actorName = null } = {}) {
  const jobs = await coll(COLLECTIONS.PRO_JOBS);
  const messages = await coll(COLLECTIONS.PRO_MESSAGES);

  const now = new Date();
  const pending = await jobs.find({ type: 'message.send', status: 'pending', runAt: { $lte: now } })
    .sort({ createdAt: 1 }).limit(burst).toArray();

  let sent = 0; let processed = 0; let errors = 0;
  const skipped = [];

  for (const job of pending) {
    await jobs.updateOne({ id: job.id }, { $set: { status: 'processing' } });
    const msg = await messages.findOne({ id: job.messageId });
    if (!msg) {
      await jobs.deleteOne({ id: job.id });
      processed++;
      continue;
    }
    // Ya enviado (aprobado en otra tanda) → limpiar job
    if (msg.status === 'enviado' || msg.status === 'simulado') {
      await jobs.deleteOne({ id: job.id });
      processed++;
      continue;
    }
    const result = await sendOne({
      messageId: msg.id, campaignId: msg.campaignId, recipient: msg.recipient,
      subject: msg.subject, body: msg.body, test: !!msg.test, actorId, actorName,
    });
    processed++;
    if (result.sent) sent++;
    else if (result.error) errors++;
    else if (result.reason) {
      // reencolar solo si es temporario (límite/ventana); otros quedan pendientes
      if (result.reason === 'limite_diario' || result.reason === 'fuera_ventana') {
        const nextRun = result.reason === 'limite_diario'
          ? new Date(new Date().setHours(23, 59, 59, 999)) // mañana a primera hora
          : new Date(); nextRun.setHours(LIMITS.startHour, 0, 0, 0);
        await jobs.updateOne({ id: job.id }, { $set: { status: 'pending', runAt: nextRun } });
      } else {
        await jobs.deleteOne({ id: job.id });
      }
      skipped.push({ reason: result.reason, count: 1 });
    }
  }

  return { processed, sent, skipped, errors };
}

export default {
  sendOne, processJobBatch, isSimulationMode, LIMITS, MAILER_FROM,
};
