/**
 * =============================================================================
 *  Módulo Prospección B2B — suppression.js
 * -----------------------------------------------------------------------------
 *  Lista de supresión GLOBAL por email / dominio / teléfono.
 *  Un prospecto en la lista de supresión NUNCA recibe mensajes y se descarta
 *  del scoring/campañas automáticamente.
 * =============================================================================
 */
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { normalizeEmail, emailDomain, normalizePhone } from './utils.js';

export const SUPPRESSION_KINDS = ['email', 'domain', 'phone'];

/**
 * Registra una supresión (idempotente por kind+valor).
 * @param {'email'|'domain'|'phone'} kind
 * @param {string} value valor crudo
 * @param {string} [reason] motivo (ej: "solicitó baja", "rebote duro")
 * @param {string} [actorId] id del usuario que la registró
 */
export async function addSuppression(kind, value, reason = '', actorId = null) {
  if (!SUPPRESSION_KINDS.includes(kind)) throw new Error(`kind inválido: ${kind}`);
  let valueLower = null;
  if (kind === 'email') valueLower = normalizeEmail(value);
  else if (kind === 'domain') valueLower = String(value).trim().toLowerCase();
  else if (kind === 'phone') valueLower = normalizePhone(value);
  if (!valueLower) throw new Error(`valor inválido para supresión ${kind}: ${value}`);

  const col = await coll(COLLECTIONS.PRO_SUPPRESSIONS);
  const now = new Date();
  await col.updateOne(
    { kind, valueLower },
    {
      $setOnInsert: {
        id: crypto.randomUUID(),
        kind,
        valueLower,
        original: value,
        active: true,
        reason,
        actorId,
        createdAt: now,
      },
      $set: { updatedAt: now, active: true },
    },
    { upsert: true }
  );
  return { kind, valueLower, active: true };
}

/**
 * ¿El prospecto está en la lista de supresión?
 * @returns {Promise<object|null>} supresión coincidente o null
 */
export async function findSuppression({ email, phone }) {
  const col = await coll(COLLECTIONS.PRO_SUPPRESSIONS);
  const ors = [{ active: true }];
  const conds = [];
  if (email) {
    const e = normalizeEmail(email);
    if (e) {
      conds.push({ kind: 'email', valueLower: e });
      const dom = emailDomain(email);
      if (dom) conds.push({ kind: 'domain', valueLower: dom });
    }
  }
  if (phone) {
    const p = normalizePhone(phone);
    if (p) conds.push({ kind: 'phone', valueLower: p });
  }
  if (!conds.length) return null;
  const s = await col.findOne({ $and: [{ active: true }, { $or: conds }] });
  return s || null;
}

/** Lista paginada de supresiones. */
export async function listSuppressions({ page = 1, pageSize = 50 } = {}) {
  const col = await coll(COLLECTIONS.PRO_SUPPRESSIONS);
  const skip = Math.max(0, (page - 1) * pageSize);
  const [rows, total] = await Promise.all([
    col.find({ active: true }).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
    col.countDocuments({ active: true }),
  ]);
  return { items: rows, page, pageSize, total };
}

/** Desactiva una supresión (reactivación manual). */
export async function removeSuppression(id) {
  const col = await coll(COLLECTIONS.PRO_SUPPRESSIONS);
  const res = await col.updateOne({ id }, { $set: { active: false, updatedAt: new Date() } });
  return { modified: res.modifiedCount === 1 };
}

export default {
  SUPPRESSION_KINDS,
  addSuppression,
  findSuppression,
  listSuppressions,
  removeSuppression,
};
