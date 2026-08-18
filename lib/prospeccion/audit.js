/**
 * =============================================================================
 *  Módulo Prospección B2B — audit.js
 * -----------------------------------------------------------------------------
 *  Log inmutable de auditoría: quién hizo qué, cuándo, sobre qué entidad.
 *  Nunca se borran ni modifican eventos (append-only).
 * =============================================================================
 */
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';

export const AUDIT_ACTIONS = {
  CAMPAIGN_CREATED: 'campaign.created',
  CAMPAIGN_UPDATED: 'campaign.updated',
  CAMPAIGN_PAUSED: 'campaign.paused',
  CAMPAIGN_RESUMED: 'campaign.resumed',
  CAMPAIGN_CANCELLED: 'campaign.cancelled',
  DISCOVERY_RUN: 'discovery.run',
  LEAD_CREATED: 'lead.created',
  LEAD_APPROVED: 'lead.approved',
  LEAD_REJECTED: 'lead.rejected',
  LEAD_CONTACTED: 'lead.contacted',
  LEAD_REPLIED: 'lead.replied',
  LEAD_NOT_INTERESTED: 'lead.not_interested',
  LEAD_STATE_CHANGED: 'lead.state_changed',
  MESSAGE_APPROVED: 'message.approved',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_TEST: 'message.test',
  MESSAGE_BOUNCED: 'message.bounced',
  SUPPRESSION_ADDED: 'suppression.added',
  SUPPRESSION_REMOVED: 'suppression.removed',
  JOB_CREATED: 'job.created',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  CONFIG_CHANGED: 'config.changed',
  SYSTEM: 'system',
};

/**
 * Registra un evento de auditoría.
 * @param {object} opts
 * @param {string} opts.action   AUDIT_ACTIONS
 * @param {string} [opts.actorId]  id del usuario (null = sistema)
 * @param {string} [opts.actorName] nombre legible del actor
 * @param {string} [opts.entityType] campaigns|leads|messages|suppressions|config
 * @param {string} [opts.entityId] id del documento afectado
 * @param {object} [opts.details] payload adicional (antes/después, razones, etc.)
 * @param {string} [opts.ip] ip del actor
 */
export async function logAudit({ action, actorId = null, actorName = null, entityType = null, entityId = null, details = {}, ip = null }) {
  const col = await coll(COLLECTIONS.PRO_AUDIT);
  const event = {
    id: crypto.randomUUID(),
    action,
    actorId,
    actorName,
    entityType,
    entityId,
    details,
    ip,
    createdAt: new Date(),
  };
  // Append-only: insertOne sin upsert, sin índices de update.
  await col.insertOne(event);
  return event;
}

/** Lista paginada de eventos (más recientes primero). */
export async function listAuditEvents({ page = 1, pageSize = 50, action = null } = {}) {
  const col = await coll(COLLECTIONS.PRO_AUDIT);
  const query = action ? { action } : {};
  const skip = Math.max(0, (page - 1) * pageSize);
  const [items, total] = await Promise.all([
    col.find(query).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
    col.countDocuments(query),
  ]);
  return { items, page, pageSize, total };
}

export default {
  AUDIT_ACTIONS,
  logAudit,
  listAuditEvents,
};
