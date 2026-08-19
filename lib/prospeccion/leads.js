/**
 * =============================================================================
 *  Prospección B2B — leads.js
 * -----------------------------------------------------------------------------
 *  Consultas y transiciones de estado de prospectos.
 *
 *  Estados válidos: descartado, candidato, requiere_revision,
 *  aprobado_contacto, contactado, respondio, reunion, no_interesado,
 *  rebote, baja, bloqueado
 * =============================================================================
 */
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { logAudit, AUDIT_ACTIONS } from './audit.js';

export const LEAD_STATES = [
  'descartado', 'candidato', 'requiere_revision', 'aprobado_contacto',
  'contactado', 'respondio', 'reunion', 'no_interesado',
  'rebote', 'baja', 'bloqueado',
];

const TRANSITIONS = {
  // estado actual → estados destino permitidos
  requiere_revision: ['candidato', 'descartado', 'aprobado_contacto'],
  candidato: ['aprobado_contacto', 'descartado', 'requiere_revision'],
  aprobado_contacto: ['contactado', 'no_interesado', 'descartado'],
  contactado: ['respondio', 'reunion', 'no_interesado', 'rebote'],
  respondio: ['reunion', 'no_interesado'],
  reunion: ['no_interesado', 'contactado'],
  no_interesado: ['requiere_revision', 'descartado'],
  rebote: ['requiere_revision', 'descartado'],
  descartado: ['requiere_revision', 'candidato'],
  baja: ['requiere_revision'],
  bloqueado: ['requiere_revision'],
};

/**
 * Lista prospectos con filtros.
 */
export async function listLeads({ page = 1, pageSize = 50, category, commune, state, source, minScore, maxScore, q, sortBy = 'score' } = {}) {
  const leads = await coll(COLLECTIONS.PRO_LEADS);
  const skip = Math.max(0, (page - 1) * pageSize);
  const filter = {};
  if (category) filter.category = category;
  if (commune) filter.commune = commune;
  if (state) filter.state = state;
  if (source) filter.source = source;
  if (minScore !== null && minScore !== undefined) filter['score.final'] = { ...(filter['score.final'] || {}), $gte: minScore };
  if (maxScore !== null && maxScore !== undefined) filter['score.final'] = { ...(filter['score.final'] || {}), $lte: maxScore };
  if (q) filter.name = { $regex: q, $options: 'i' };

  const SORTS = {
    score: { 'score.final': -1, createdAt: -1 },
    nombre: { name: 1, commune: 1 },
    comuna: { commune: 1, name: 1 },
    reciente: { createdAt: -1 },
    antiguo: { createdAt: 1 },
  };
  const sortSpec = SORTS[sortBy] || SORTS.score;

  const [items, total] = await Promise.all([
    leads.find(filter).sort(sortSpec).skip(skip).limit(pageSize).toArray(),
    leads.countDocuments(filter),
  ]);
  return { items, page, pageSize, total, filters: { category, commune, state, source, minScore, maxScore, q, sortBy } };
}

/** Estadísticas agregadas de prospectos (para el dashboard). */
export async function listLeadStats() {
  const leads = await coll(COLLECTIONS.PRO_LEADS);
  const [byState, byCategory, bySource, avgScore] = await Promise.all([
    leads.aggregate([{ $group: { _id: '$state', n: { $sum: 1 } } }]).toArray(),
    leads.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]).toArray(),
    leads.aggregate([{ $group: { _id: '$source', n: { $sum: 1 } } }]).toArray(),
    leads.aggregate([{ $group: { _id: null, avg: { $avg: '$score.final' }, max: { $max: '$score.final' } } }]).toArray(),
  ]);
  return {
    byState: Object.fromEntries(byState.map(r => [r._id || 'sin_estado', r.n])),
    byCategory: Object.fromEntries(byCategory.map(r => [r._id || 'sin_categoria', r.n])),
    bySource: Object.fromEntries(bySource.map(r => [r._id || 'sin_fuente', r.n])),
    score: avgScore[0] ? { average: Math.round(avgScore[0].avg * 10) / 10, max: avgScore[0].max } : { average: 0, max: 0 },
  };
}

/** Detalle de un prospecto con sus asignaciones a campañas. */
export async function getLead(id) {
  const leads = await coll(COLLECTIONS.PRO_LEADS);
  const lead = await leads.findOne({ id });
  if (!lead) return null;
  const cl = await coll(COLLECTIONS.PRO_CAMPAIGN_LEADS);
  const assignments = await cl.find({ leadId: id }).toArray();
  const messages = await coll(COLLECTIONS.PRO_MESSAGES);
  const msgs = await messages.find({ leadId: id }).sort({ createdAt: -1 }).limit(10).toArray();
  return { ...lead, campaignAssignments: assignments, recentMessages: msgs };
}

/**
 * Cambia el estado de un prospecto validando la transición.
 * @param {string} id
 * @param {object} body { state, notes? }
 */
export async function updateLeadState(id, body, actorId = null, actorName = null) {
  const leads = await coll(COLLECTIONS.PRO_LEADS);
  const lead = await leads.findOne({ id });
  if (!lead) throw new Error('prospecto no encontrado');

  if (body.state && body.state !== lead.state) {
    const allowed = TRANSITIONS[lead.state] || [];
    if (!allowed.includes(body.state)) {
      throw new Error(`transición no permitida: de "${lead.state}" a "${body.state}". Permitidas: ${allowed.join(', ')}`);
    }
    await leads.updateOne(
      { id },
      { $set: { state: body.state, updatedAt: new Date(), stateNotes: body.notes || lead.stateNotes || '' } }
    );
  } else if (body.notes !== undefined) {
    await leads.updateOne({ id }, { $set: { notes: body.notes, updatedAt: new Date() } });
  }

  await logAudit({
    action: AUDIT_ACTIONS.LEAD_STATE_CHANGED,
    actorId, actorName,
    entityType: 'leads',
    entityId: id,
    details: { from: lead.state, to: body.state || lead.state, notes: body.notes },
  });

  const updated = await leads.findOne({ id });
  return updated;
}

export default {
  LEAD_STATES,
  TRANSITIONS,
  listLeads,
  listLeadStats,
  getLead,
  updateLeadState,
};
