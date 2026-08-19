/**
 * =============================================================================
 *  Prospección B2B — mailer.js
 * -----------------------------------------------------------------------------
 *  Envío REAL de correos vía SMTP (Gmail de Sandra: estampadosdlv@gmail.com).
 *   - SMTP_USER + SMTP_APP_PASSWORD configurados + MAIL_SIMULATION=false → envío real
 *   - Cualquier otra configuración → simulación (registro en BD, sin envío)
 *  Guardrails: supresión, límite diario, ventana horaria, reintentos con backoff.
 * =============================================================================
 */
import nodemailer from 'nodemailer';
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { findSuppression } from './suppression.js';
import { bumpSentCount } from './campaigns.js';
import { logAudit, AUDIT_ACTIONS } from './audit.js';
import { isSimulationMode } from './messages.js';
import { sendWhatsappOne, wait as waWait } from './wasender.js';
export { isSimulationMode };

export const MAILER_FROM = process.env.PROSPECTION_FROM || 'Sandra Vásquez <estampadosdlv@gmail.com>';
export const MAILER_REPLY_TO = process.env.PROSPECTION_REPLY_TO || 'Sandra Vásquez <estampadosdlv@gmail.com>';

/** Límites de envío responsable (para proteger la cuenta de Gmail). */
export const LIMITS = {
  dailyMax: parseInt(process.env.PROSPECTION_DAILY_MAX || '100', 10),  // máximo correos reales/día (build109: 100/día)
  dailyBurst: parseInt(process.env.PROSPECTION_BURST || '5', 10),      // máximo por tanda corrida por el runner
  startHour: parseInt(process.env.PROSPECTION_START_HOUR || '10', 10), // horario comercial Chile
  endHour: parseInt(process.env.PROSPECTION_END_HOUR || '19', 10),
};

/** Singleton del transporter SMTP (se crea bajo demanda). */
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: {
        user: process.env.SMTP_USER || 'estampadosdlv@gmail.com',
        pass: process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

/** ¿Está todo configurado para enviar en real? */
function isProviderConfigured() {
  return Boolean(process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD || process.env.RESEND_API_KEY);
}

/**
 * Envía UN correo real vía SMTP Gmail. Devuelve { sent, skipped, error }.
 */
export async function sendOne({ messageId, campaignId, recipient, subject, body, test = false, actorId = null, actorName = null, channel: msgChannel = null }) {
  const messages = await coll(COLLECTIONS.PRO_MESSAGES);
  const jobs = await coll(COLLECTIONS.PRO_JOBS);

  // ------------------------------------------------------------------
  // Canal WhatsApp (build109): envío real vía sesión Baileys vinculada.
  // No requiere SMTP; el límite diario de correos no aplica a WhatsApp
  // (tiene su propio cuidado de delay entre mensajes).
  // ------------------------------------------------------------------
  if (String(msgChannel || '').startsWith('whatsapp')) {
    // Guardrail 1: supresión (verificada de nuevo en el momento del envío)
    const suppressed = await findSuppression({ phone: recipient });
    if (suppressed) {
      await messages.updateOne({ id: messageId }, { $set: { status: 'baja', sentAt: null } });
      return { sent: false, skipped: true, reason: 'supresion' };
    }
    const waResult = await sendWhatsappOne({ messageId, recipient, body, test, actorId, actorName });
    return waResult;
  }

  // Guardrail 0: simulación email (sin credenciales o MAIL_SIMULATION=true)
  if (isSimulationMode() || !isProviderConfigured()) {
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

  // Envío real vía SMTP
  let providerId = null;
  let error = null;
  try {
    const t = getTransporter();
    const info = await t.sendMail({
      from: MAILER_FROM,
      to: recipient,
      replyTo: MAILER_REPLY_TO,
      subject,
      html: body,
      headers: {
        'List-Unsubscribe': `<https://estampadosdlv.com>`,
        'X-Campaign': String(campaignId || 'test'),
      },
    });
    providerId = info?.messageId || null;
  } catch (e) {
    error = e?.message || 'error_de_red';
    // Error de autenticación → forzar modo simulación para no romper cada envío
    if (/auth|credentials|password/i.test(error)) {
      error = `smtp_auth_error: ${error}`;
    }
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
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);

  const now = new Date();
  const pending = await jobs.find({ type: 'message.send', status: 'pending', runAt: { $lte: now } })
    .sort({ createdAt: 1 }).limit(burst).toArray();

  let sent = 0; let processed = 0; let errors = 0;
  const skipped = [];

  // Caché de cadencia por campaña (máx. por tanda) para no consultar BD en cada job
  const cadenceCache = new Map();
  async function getCadence(campaignId) {
    let info = cadenceCache.get(campaignId);
    if (!info) {
      const c = await campaigns.findOne({ id: campaignId });
      info = {
        channels: Array.isArray(c?.channels) ? c.channels : ['email'],
        maxEmail: Math.min(parseInt(c?.maxPerDayEmail || '100', 10) || 100, 100),
        maxWhatsapp: Math.min(parseInt(c?.maxPerDayWhatsapp || '50', 10) || 50, 200),
        windowStart: parseInt(c?.windowStart || '10', 10),
        windowEnd: parseInt(c?.windowEnd || '19', 10),
      };
      cadenceCache.set(campaignId, info);
    }
    return info;
  }

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
    const ch = msg.channel || 'email';
    // Cadencia por campaña (build112): respetar los máximos diarios por canal y
    // la ventana horaria configurada de la campaña (hora Chile).
    if (!msg.test && msg.campaignId) {
      try {
        const cad = await getCadence(msg.campaignId);
        const clTz = new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' });
        const clHour = new Date(clTz).getHours();
        if (clHour < cad.windowStart || clHour >= cad.windowEnd) {
          const nextRun = new Date(); nextRun.setHours(cad.windowStart, 0, 0, 0);
          await jobs.updateOne({ id: job.id }, { $set: { status: 'pending', runAt: nextRun } });
          skipped.push({ reason: 'fuera_ventana_campana', count: 1 });
          processed++;
          continue;
        }
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        if (ch === 'email') {
          const sentEmailToday = await messages.countDocuments({
            campaignId: msg.campaignId, channel: 'email', status: 'enviado', createdAt: { $gte: todayStart }, test: { $ne: true },
          });
          if (sentEmailToday >= cad.maxEmail) {
            const nextRun = new Date(); nextRun.setHours(23, 59, 59, 999);
            await jobs.updateOne({ id: job.id }, { $set: { status: 'pending', runAt: nextRun } });
            skipped.push({ reason: 'limite_diario_campana_email', count: 1 });
            processed++;
            continue;
          }
        } else if (ch === 'whatsapp') {
          const sentWaToday = await messages.countDocuments({
            campaignId: msg.campaignId, channel: 'whatsapp', status: 'enviado', createdAt: { $gte: todayStart }, test: { $ne: true },
          });
          if (sentWaToday >= cad.maxWhatsapp) {
            const nextRun = new Date(); nextRun.setHours(23, 59, 59, 999);
            await jobs.updateOne({ id: job.id }, { $set: { status: 'pending', runAt: nextRun } });
            skipped.push({ reason: 'limite_diario_campana_whatsapp', count: 1 });
            processed++;
            continue;
          }
        }
      } catch (e) {
        // Si falla la lectura de cadencia, continuar con los valores por defecto
      }
    }
    const result = await sendOne({
      messageId: msg.id, campaignId: msg.campaignId, recipient: msg.recipient,
      subject: msg.subject, body: msg.body, test: !!msg.test, actorId, actorName,
      channel: ch,
    });
    processed++;
    // Actualizar contador de envíos de la campaña tras envío exitoso
    if (result.sent && msg.campaignId) {
      try { await bumpSentCount(msg.campaignId, ch); } catch (e) { /* no bloqueante */ }
    }
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
  sendOne, processJobBatch, isSimulationMode, isProviderConfigured, LIMITS, MAILER_FROM,
};
