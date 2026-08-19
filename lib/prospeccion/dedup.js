/**
 * =============================================================================
 *  Módulo Prospección B2B — dedup.js
 * -----------------------------------------------------------------------------
 *  Deduplicación de prospectos usando claves normalizadas en MongoDB:
 *   - emailLower (email normalizado, case/dots/+ignored)
 *   - emailDomain (dominio del email corporativo)
 *   - phoneNormalized (E.164)
 *   - nameNormalized + commune (pareja negocio/comuna)
 *
 *  Las claves se materializan en el documento del lead al crearlo para que
 *  los índices hagan el upsert O(log N) en lugar de un escaneo completo.
 * =============================================================================
 */
import { coll } from '../mongo.js';
import { COLLECTIONS } from '../models.js';
import { normalizeEmail, emailDomain, normalizePhone, normalizeName } from './utils.js';

export const DEDUP_KINDS = ['email', 'domain', 'phone', 'nameCommune', 'googlePlaceId'];

/** Construye las claves de deduplicación desde datos crudos del prospecto. */
export function buildDedupKeys({ name, commune, email, phone, website }) {
  return {
    emailLower: normalizeEmail(email),
    emailDomain: emailDomain(email),
    phoneNormalized: normalizePhone(phone),
    nameNormalized: normalizeName(name),
    nameCommune: normalizeName(name) && commune ? `${normalizeName(name)}|${String(commune).trim().toLowerCase()}` : null,
    websiteHost: website ? extractHost(website) : null,
    googlePlaceId: (googlePlaceId || null) && String(googlePlaceId).trim() ? String(googlePlaceId).trim() : null,
  };
}

function extractHost(url) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Busca un lead existente con alguna clave en común.
 * @returns {Promise<object|null>} lead duplicado encontrado o null
 */
export async function findDuplicate({ name, commune, email, phone, website, googlePlaceId }) {
  const keys = buildDedupKeys({ name, commune, email, phone, website, googlePlaceId });
  const leads = await coll(COLLECTIONS.PRO_LEADS);
  const query = {
    $or: [
      ...(keys.googlePlaceId ? [{ googlePlaceId: keys.googlePlaceId }] : []),
      ...(keys.emailLower ? [{ emailLower: keys.emailLower }] : []),
      ...(keys.emailDomain ? [{ emailDomain: keys.emailDomain }] : []),
      ...(keys.phoneNormalized ? [{ phoneNormalized: keys.phoneNormalized }] : []),
      ...(keys.nameCommune ? [{ nameNormalized: keys.nameNormalized, commune: { $regex: `^${String(commune).trim().toLowerCase()}$`, $options: 'i' } }] : []),
    ],
  };
  if (!query.$or.length) return null;
  return leads.findOne(query, { projection: { id: 1, name: 1, commune: 1, state: 1, email: 1 } });
}

/**
 * Upsert idempotente: crea el lead si no existe, si existe devuelve el existente.
 * @returns {Promise<{ lead: object, created: boolean, duplicateOf: string|null }>}
 */
export async function upsertLead(doc) {
  const keys = buildDedupKeys(doc);
  const now = new Date();
  const base = {
    ...doc,
    ...keys,
    updatedAt: now,
  };
  if (!doc.id) base.id = crypto.randomUUID();
  if (!doc.createdAt) base.createdAt = now;

  const leads = await coll(COLLECTIONS.PRO_LEADS);
  // Prioridad: googlePlaceId → email exacto → teléfono → dominio → nombre+comuna
  const conditions = [
    ...(keys.googlePlaceId ? [{ googlePlaceId: keys.googlePlaceId }] : []),
    ...(keys.emailLower ? [{ emailLower: keys.emailLower }] : []),
    ...(keys.phoneNormalized ? [{ phoneNormalized: keys.phoneNormalized }] : []),
    ...(keys.emailDomain ? [{ emailDomain: keys.emailDomain }] : []),
    ...(keys.nameCommune ? [{ nameNormalized: keys.nameNormalized, commune: { $regex: `^${String(doc.commune).trim().toLowerCase()}$`, $options: 'i' } }] : []),
  ];
  if (conditions.length) {
    const existing = await leads.findOne({ $or: conditions });
    if (existing) {
      // merge de campos vacíos sin sobrescribir datos ya existentes
      const merge = { updatedAt: now };
      for (const [k, v] of Object.entries(doc)) {
        if (['id', 'createdAt'].includes(k)) continue;
        if (v !== undefined && v !== null && (existing[k] === undefined || existing[k] === null || existing[k] === '')) {
          merge[k] = v;
        }
      }
      if (Object.keys(merge).length > 2) {
        await leads.updateOne({ id: existing.id }, { $set: merge });
      }
      return { lead: { ...existing, ...merge }, created: false, duplicateOf: existing.id };
    }
  }
  const result = await leads.insertOne(base);
  return { lead: base, created: true, duplicateOf: null };
}

export default {
  DEDUP_KINDS,
  buildDedupKeys,
  findDuplicate,
  upsertLead,
};
