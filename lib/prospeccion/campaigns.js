/**
 * =============================================================================
 *  Prospección B2B — campaigns.js
 * -----------------------------------------------------------------------------
 *  Gestión de campañas de prospección.
 *
 *  Estados: borrador | programada | en_curso | pausada | completada | cancelada
 *
 *  Configuración por campaña:
 *   - provider ('simulated'|'scraper'|'manual')
 *   - categories[] / communes[] (filtros de descubrimiento)
 *   - limitPerRun (máx prospectos por ejecución)
 *   - outreach.channel ('email'|'whatsapp_manual')
 *   - outreach.minScore (score mínimo para aprobar contacto)
 *   - outreach.maxPerDay (límite diario de mensajes)
 *   - schedule.start / schedule.end
 *   - enabled: bool (kill switch)
 * =============================================================================
 */
import { v4 as uuidv4 } from 'uuid';
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { logAudit, AUDIT_ACTIONS } from './audit.js';

export const CAMPAIGN_STATUS = ['borrador', 'programada', 'en_curso', 'pausada', 'completada', 'cancelada'];
export const VALID_PROVIDERS = ['simulated', 'scraper', 'manual'];

export function normalizeCampaignInput(body) {
  return {
    name: String(body.name || '').trim().slice(0, 120),
    description: String(body.description || '').trim().slice(0, 2000),
    provider: VALID_PROVIDERS.includes(body.provider) ? body.provider : 'simulated',
    categories: Array.isArray(body.categories) ? body.categories.filter(Boolean).slice(0, 30) : [],
    communes: Array.isArray(body.communes) ? body.communes.map(c => String(c).trim()).filter(Boolean).slice(0, 50) : [],
    limitPerRun: Math.min(200, Math.max(1, Number(body.limitPerRun) || 50)),
    outreach: {
      channel: body.outreach?.channel === 'whatsapp_manual' ? 'whatsapp_manual' : 'email',
      minScore: Math.min(100, Math.max(0, Number(body.outreach?.minScore) || 60)),
      maxPerDay: Math.min(100, Math.max(1, Number(body.outreach?.maxPerDay) || 10)),
      windowStart: body.outreach?.windowStart || '09:00',
      windowEnd: body.outreach?.windowEnd || '18:00',
    },
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
  };
  await campaigns.insertOne(campaign);
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_CREATED, actorId, actorName, entityType: 'campaigns', entityId: campaign.id, details: { name: data.name, provider: data.provider } });
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

/** Pausa una campaña en curso. */
export async function pauseCampaign(id, actorId = null, actorName = null) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const res = await campaigns.updateOne(
    { id, status: { $in: ['en_curso', 'programada', 'borrador'] } },
    { $set: { status: 'pausada', updatedAt: new Date() } }
  );
  if (res.modifiedCount !== 1) throw new Error('no se pudo pausar (estado actual no permite)');
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_PAUSED, actorId, actorName, entityType: 'campaigns', entityId: id });
  return { id, status: 'pausada' };
}

/** Reanuda una campaña pausada. */
export async function resumeCampaign(id, actorId = null, actorName = null) {
  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const res = await campaigns.updateOne(
    { id, status: { $in: ['pausada', 'borrador'] } },
    { $set: { status: 'programada', updatedAt: new Date() } }
  );
  if (res.modifiedCount !== 1) throw new Error('no se pudo reanudar (estado actual no permite)');
  await logAudit({ action: AUDIT_ACTIONS.CAMPAIGN_RESUMED, actorId, actorName, entityType: 'campaigns', entityId: id });
  return { id, status: 'programada' };
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
  const leads = await coll(COLLECTIONS.PRO_LEADS);
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

export default {
  CAMPAIGN_STATUS,
  VALID_PROVIDERS,
  normalizeCampaignInput,
  createCampaign,
  updateCampaign,
  pauseCampaign,
  resumeCampaign,
  listCampaigns,
  getCampaign,
};
