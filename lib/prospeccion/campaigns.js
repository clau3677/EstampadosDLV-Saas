/**
 * =============================================================================
 *  Prospección B2B — campaigns.js
 * -----------------------------------------------------------------------------
 *  Gestión de campañas de prospección (build112).
 *
 *  Una campaña define:
 *   - CANALES de envío: email / whatsapp / ambos
 *   - DESTINATARIOS: rubros (categories), comunas, score mínimo, máx. contactos
 *   - CADENCIA: envíos por día por canal y ventana horaria
 *   - FRECUENCIA: diaria (única opción por ahora)
 *
 *  Estados: borrador | activa | pausada | completada | cancelada
 * =============================================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { logAudit, AUDIT_ACTIONS } from './audit.js';

export const CAMPAIGN_STATUS = ['borrador', 'activa', 'pausada', 'completada', 'cancelada'];

export const VALID_CHANNELS = ['email', 'whatsapp', 'ambos'];

export const CHANNEL_LABELS = {
  email: 'Correo',
  whatsapp: 'WhatsApp',
  ambos: 'Correo + WhatsApp',
};

/**
 * Normaliza el cuerpo de creación/edición de campaña.
 *  - channels: ['email'], ['whatsapp'] o ['email','whatsapp']
 *  - maxPerDayEmail / maxPerDayWhatsapp: cadencia por canal
 *  - frequency: 'diaria'
 *  - filters: categories[], communes[], minScore, maxContacts
 */
export function normalizeCampaignInput(body) {
  const ch = Array.isArray(body.channels)
    ? body.channels.filter(c => VALID_CHANNELS.includes(c))
    : (body.outreach?.channel === 'whatsapp' ? ['whatsapp'] : ['email']);
  const channels = ch.length ? ch : ['email'];

  const freq = ['diaria', 'semanal', 'solo_vez'].includes(body.frequency) ? body.frequency : 'diaria';

  return {
    name: String(body.name || '').trim().slice(0, 120),
    description: String(body.description || '').trim().slice(0, 2000),
    // Canales de envío (correo / WhatsApp / ambos)
    channels,
    // Cadencia por canal
    maxPerDayEmail: Math.min(100, Math.max(1, Number(body.maxPerDayEmail ?? body.outreach?.maxPerDay ?? 25))),
    maxPerDayWhatsapp: Math.min(200, Math.max(1, Number(body.maxPerDayWhatsapp ?? 50))),
    // Ventana horaria (hora Chile)
    windowStart: Math.min(23, Math.max(0, Number(body.windowStart ?? body.outreach?.windowStart ?? 10))),
    windowEnd: Math.min(23, Math.max(0, Number(body.windowEnd ?? body.outreach?.windowEnd ?? 19))),
    // Frecuencia de envío
    frequency: freq,
    // Destinatarios
    categories: Array.isArray(body.categories) ? body.categories.filter(Boolean).slice(0, 30) : [],
    communes: Array.isArray(body.communes) ? body.communes.map(c => String(c).trim()).filter(Boolean).slice(0, 50) : [],
    minScore: Math.min(100, Math.max(0, Number(body.minScore ?? body.outreach?.minScore ?? 0))),
    maxContacts: Math.min(10000, Math.max(1, Number(body.maxContacts ?? body.limitPerRun ?? 0))) || null,
    // Programación
    schedule: {
      start: body.schedule?.start ? new Date(body.schedule.start) : new Date(),
      end: body.schedule?.end ? new Date(body.schedule.end) : null,
    },
    enabled: Boolean(body.enabled ?? true),
  };
}

/** Crea una campaña nueva (estado: borrador). */
export async function createCampaign(body, actorId = null, actorName = null) {
  const data = normalizeCampaignInput(body);
  if (!data.name) throw new Error('nombre de campaña requerido');

  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const now = new Date();
  const campaign = {
    id: uuidv4(),
    ...data,
    status: 'borrador',
    createdAt: now,
    updatedAt: now,
    // Progreso de cadencia por día
    sent: { date: null, email: 0, whatsapp: 0 },
  };
  await campaigns.insertOne(campaign);
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_CREATED, actorId, actorName, entityType: 'campaigns', entityId: campaign.id, details: { name: data.name, channels: data.channels } });
  return campaign;
}

/** Actualiza campos editables de una campaña (sólo en estados editables). */
export async function updateCampaign(id, body, actorId = null, actorName = null) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const existing = await campaigns.findOne({ id });
  if (!existing) throw new Error('campaña no encontrada');
  if (['completada', 'cancelada'].includes(existing.status)) throw new Error(`campaña en estado "${existing.status}" no se puede editar`);

  const data = normalizeCampaignInput(body);
  await campaigns.updateOne({ id }, { $set: { ...data, updatedAt: new Date() } });
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_UPDATED, actorId, actorName, entityType: 'campaigns', entityId: id, details: { changed: Object.keys(body) } });
  return { ...existing, ...data, updatedAt: new Date() };
}

/** Activa una campaña (borrador o pausada → activa). */
export async function resumeCampaign(id, actorId = null, actorName = null) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const res = await campaigns.updateOne(
    { id, status: { $in: ['pausada', 'borrador'] } },
    { $set: { status: 'activa', updatedAt: new Date() } }
  );
  if (res.modifiedCount !== 1) throw new Error('no se pudo activar (estado actual no permite)');
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_RESUMED, actorId, actorName, entityType: 'campaigns', entityId: id });
  return { id, status: 'activa' };
}

/** Pausa una campaña activa. */
export async function pauseCampaign(id, actorId = null, actorName = null) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const res = await campaigns.updateOne(
    { id, status: { $in: ['activa'] } },
    { $set: { status: 'pausada', updatedAt: new Date() } }
  );
  if (res.modifiedCount !== 1) throw new Error('no se pudo pausar (estado actual no permite)');
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_PAUSED, actorId, actorName, entityType: 'campaigns', entityId: id });
  return { id, status: 'pausada' };
}

/** Marca una campaña como completada. */
export async function completeCampaign(id, actorId = null, actorName = null) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  await campaigns.updateOne({ id }, { $set: { status: 'completada', updatedAt: new Date() } });
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_COMPLETED, actorId, actorName, entityType: 'campaigns', entityId: id });
  return { id, status: 'completada' };
}

/** Cancela una campaña. */
export async function cancelCampaign(id, actorId = null, actorName = null) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  await campaigns.updateOne({ id }, { $set: { status: 'cancelada', updatedAt: new Date() } });
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_CANCELLED, actorId, actorName, entityType: 'campaigns', entityId: id });
  return { id, status: 'cancelada' };
}

/** Lista campañas con conteo de prospectos por estado. */
export async function listCampaigns({ page = 1, pageSize = 25 } = {}) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const skip = Math.max(0, (page - 1) * pageSize);
  const [items, total] = await Promise.all([
    campaigns.find().sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
    campaigns.countDocuments(),
  ]);
  return { items, page, pageSize, total };
}

/** Detalle de una campaña con métricas agregadas. */
export async function getCampaign(id) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const campaign = await campaigns.findOne({ id });
  if (!campaign) return null;

  const cl = await coll(COLLECTIONS.PRO_CAMPAIGN_LEADS);
  const messages = await coll(COLLECTIONS.PRO_MESSAGES);

  const [byState, msgByStatus] = await Promise.all([
    cl.aggregate([{ $match: { campaignId: id } }, { $group: { _id: '$state', n: { $sum: 1 } } }]).toArray(),
    messages.aggregate([{ $match: { campaignId: id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
  ]);

  return {
    ...campaign,
    stats: {
      leadsByState: Object.fromEntries(byState.map(r => [r._id, r.n])),
      messagesByStatus: Object.fromEntries(msgByStatus.map(r => [r._id, r.n])),
    },
  };
}

/** Incrementa el contador diario de envíos de una campaña. */
export async function bumpSentCount(campaignId, channel) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const today = new Date().toISOString().slice(0, 10);
  const inc = channel === 'whatsapp' ? 'sent.whatsapp' : 'sent.email';
  await campaigns.updateOne(
    { id: campaignId },
    { $set: { 'sent.date': today }, $inc: { [inc]: 1 } }
  );
}

export default {
  CAMPAIGN_STATUS,
  VALID_CHANNELS,
  CHANNEL_LABELS,
  normalizeCampaignInput,
  createCampaign,
  updateCampaign,
  resumeCampaign,
  pauseCampaign,
  completeCampaign,
  cancelCampaign,
  listCampaigns,
  getCampaign,
  bumpSentCount,
};
