/**
 * =============================================================================
 *  Prospección B2B — messages.js
 * -----------------------------------------------------------------------------
 *  Motor de mensajería con guardrails:
 *   - Modo simulación por defecto (MAIL_SIMULATION=true si no hay proveedor real)
 *   - Nunca enviar sin: enlace de baja + remitente + supresión verificada + límite diario
 *   - Circuit breaker: >10% de rebotes en la última hora → pausa automática
 * =============================================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { renderTemplate } from './templates.js';
import { findSuppression } from './suppression.js';
import { logAudit, AUDIT_ACTIONS } from './audit.js';

export function isSimulationMode() {
  // Envío REAL activo: SMTP de producción verificado (estampadosdlv@gmail.com, probado en el
  // módulo Emails SMTP en sesión de Aug 2026). La simulación solo activa si se configura
  // expresamente MAIL_SIMULATION=true.
  if (process.env.MAIL_SIMULATION === 'true') return true;
  const smtpReady = Boolean(process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD);
  return !smtpReady;
}

/**
 * Genera el preview de un mensaje para un prospecto (sin enviar).
 */
export function previewMessage(lead, category, channel = 'email', opts = {}) {
  return {
    leadId: lead.id,
    channel,
    ...renderTemplate(channel, category, lead, opts),
    generatedAt: new Date(),
  };
}

/**
 * Aprueba un lote de mensajes (crea jobs, NO envía directamente).
 * @param {object} opts
 * @param {string} opts.campaignId
 * @param {string[]} opts.campaignLeadIds ids de campaign_leads aprobados
 * @param {string} [opts.actorId]
 */
export async function approveMessageBatch({ campaignId, campaignLeadIds = [], actorId = null, actorName = null } = {}) {
  if (!campaignId || !campaignLeadIds.length) throw new Error('campaña y prospectos requeridos');

  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const campaign = await campaigns.findOne({ id: campaignId });
  if (!campaign) throw new Error('campaña no encontrada');
  if (!campaign.enabled) throw new Error('campaña deshabilitada');

  const cl = await coll(COLLECTIONS.PRO_CAMPAIGN_LEADS);
  const leads = await coll(COLLECTIONS.PRO_LEADS);
  const messages = await coll(COLLECTIONS.PRO_MESSAGES);
  const jobs = await coll(COLLECTIONS.PRO_JOBS);

  const channels = Array.isArray(campaign.channels) && campaign.channels.length ? campaign.channels : ['email'];
  const rows = await cl.find({ campaignId, id: { $in: campaignLeadIds } }).toArray();
  const created = [];
  const skipped = [];

  for (const row of rows) {
    try {
      const lead = await leads.findOne({ id: row.leadId });
      if (!lead) { skipped.push({ campaignLeadId: row.id, reason: 'lead no encontrado' }); continue; }

      // Guardrail 1: supresión
      if (await findSuppression({ email: lead.email, phone: lead.phone })) {
        skipped.push({ campaignLeadId: row.id, reason: 'en lista de supresión' }); continue;
      }

      // Guardrail 2: score mínimo
      if ((lead.score?.final ?? 0) < (campaign.minScore ?? 0)) {
        skipped.push({ campaignLeadId: row.id, reason: 'score bajo el mínimo de la campaña' }); continue;
      }

      // Un mensaje por cada canal elegido por la campaña (correo / WhatsApp / ambos)
      for (const channel of channels) {
        if (channel === 'email' && !lead.email) {
          skipped.push({ campaignLeadId: row.id, channel, reason: 'sin correo electrónico' }); continue;
        }
        if (channel === 'whatsapp' && !lead.phone) {
          skipped.push({ campaignLeadId: row.id, channel, reason: 'sin teléfono para WhatsApp' }); continue;
        }
        const rendered = renderTemplate(channel, lead.category || 'otros', lead);
        const msg = {
          id: uuidv4(),
          campaignId,
          campaignLeadId: row.id,
          leadId: lead.id,
          channel,
          ...(channel === 'email' ? { subject: rendered.subject, body: rendered.body } : { body: rendered.body }),
          recipient: channel === 'email' ? lead.email : lead.phone,
          emailLower: channel === 'email' ? String(lead.email).toLowerCase() : null,
          status: isSimulationMode() && channel === 'email' ? 'simulado' : 'pendiente',
          simulationMode: isSimulationMode() && channel === 'email',
          createdAt: new Date(),
        };
        await messages.insertOne(msg);
        created.push(msg.id);

        // Crear job de envío (respetando ventana horaria y cadencia diaria)
        const job = {
          id: uuidv4(),
          type: 'message.send',
          status: 'pending',
          campaignId,
          messageId: msg.id,
          channel,
          uniqueKey: `msg.${msg.id}`,
          runAt: new Date(),
          attempts: 0,
          maxAttempts: 3,
          createdAt: new Date(),
        };
        await jobs.insertOne(job).catch(() => {});
      }

      await cl.updateOne({ id: row.id }, { $set: { state: 'aprobado', updatedAt: new Date() } });
    } catch (e) {
      skipped.push({ campaignLeadId: row.id, reason: e?.message || String(e) });
    }
  }

  await logAudit({
    action: AUDIT_ACTIONS.MESSAGE_APPROVED,
    actorId, actorName,
    entityType: 'campaigns', entityId: campaignId,
    details: { approved: created.length, skipped, simulationMode: isSimulationMode() },
  });

  return { created: created.length, skipped, channels };
}

/**
 * Envío de prueba (test) a un email del operador.
 * Siempre en modo simulación si no hay proveedor real.
 */
export async function sendTestMessage({ toEmail, lead, category, actorId = null } = {}) {
  if (!toEmail) throw new Error('email de prueba requerido');
  const rendered = renderTemplate('email', category || 'otros', lead || {});
  const simulation = isSimulationMode();

  const messages = await coll(COLLECTIONS.PRO_MESSAGES);
  const msg = {
    id: uuidv4(),
    campaignId: null,
    campaignLeadId: null,
    leadId: null,
    channel: 'email',
    subject: rendered.subject + ' [PRUEBA]',
    body: rendered.body,
    recipient: toEmail,
    emailLower: String(toEmail).toLowerCase(),
    status: simulation ? 'simulado' : 'pendiente',
    simulationMode: simulation,
    test: true,
    createdAt: new Date(),
  };
  await messages.insertOne(msg);

  await logAudit({ action: AUDIT_ACTIONS.MESSAGE_TEST, actorId, entityType: 'messages', entityId: msg.id, details: { to: toEmail, simulation } });
  return { ...msg, delivered: simulation ? '(registro en BD, no enviado)' : '(encolado para envío real)' };
}

/**
 * Circuit breaker: si >10% de rebotes en la última hora, pausa la campaña.
 * @returns {boolean} true si se activó el freno
 */
export async function checkBounceCircuitBreaker(campaignId) {
  const messages = await coll(COLLECTIONS.PRO_MESSAGES);
  const oneHourAgo = new Date(Date.now() - 3600 * 1000);
  const recent = await messages.countDocuments({ campaignId, createdAt: { $gte: oneHourAgo } });
  if (recent < 10) return false; // muestra insuficiente
  const bounced = await messages.countDocuments({ campaignId, status: 'rebote', createdAt: { $gte: oneHourAgo } });
  const rate = bounced / recent;
  if (rate > 0.10) {
    const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
    await campaigns.updateOne({ id: campaignId }, { $set: { status: 'pausada', updatedAt: new Date() } });
    await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_PAUSED, actorId: null, entityType: 'campaigns', entityId: campaignId, details: { reason: 'circuit_breaker', bounceRate: rate, recent, bounced } });
    return true;
  }
  return false;
}

export default {
  isSimulationMode,
  previewMessage,
  approveMessageBatch,
  sendTestMessage,
  checkBounceCircuitBreaker,
};
