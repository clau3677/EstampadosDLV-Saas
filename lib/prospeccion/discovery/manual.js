/**
 * =============================================================================
 *  Prospección B2B — discovery/manual.js
 * -----------------------------------------------------------------------------
 *  PROVEEDOR MANUAL: ingreso de prospectos por el operador (Sandra o staff).
 *  Es el método más seguro legalmente: los datos los entrega el operador
 *  desde conocimiento propio del mercado local.
 *
 *  Interfaz compartida:
 *    runDiscovery(opts) → { discovered: [...], errors: [...], stats: {...} }
 * =============================================================================
 */
import { upsertLead } from '../dedup.js';
import { scoreBusiness } from '../scoring.js';
import { validateTerritory } from '../territory.js';
import { logAudit } from '../audit.js';

/**
 * Registra uno o más prospectos manuales.
 * @param {object} opts
 * @param {string} opts.campaignId
 * @param {object[]} opts.businesses [{ name, category, commune, address, lat, lon, email, phone, website, rating, reviewCount, instagram, facebook, notes }]
 * @param {string} [opts.actorId]
 * @returns {Promise<object>}
 */
export async function runDiscovery({ campaignId, businesses = [], actorId = null } = {}) {
  const discovered = [];
  const errors = [];

  for (const biz of businesses) {
    try {
      if (!biz.name) { errors.push({ error: 'nombre requerido' }); continue; }
      const territory = validateTerritory({ commune: biz.commune, lat: biz.lat, lon: biz.lon });
      const score = scoreBusiness({
        ...biz,
        category: biz.category || 'otros',
        commune: biz.commune,
        email: biz.email,
        phone: biz.phone,
        website: biz.website,
        address: biz.address,
        rating: biz.rating,
        reviewCount: biz.reviewCount,
        verifiedSignal: 'manual',
        instagram: biz.instagram,
        facebook: biz.facebook,
      });

      const { lead, created, duplicateOf } = await upsertLead({
        ...biz,
        category: biz.category || 'otros',
        sourceId: 'manual',
        source: 'manual',
        state: 'requiere_revision',
        territory,
        score,
        notes: biz.notes || '',
      });

      discovered.push({ lead, created, duplicateOf });
    } catch (e) {
      errors.push({ business: biz.name, error: e?.message || String(e) });
    }
  }

  await logAudit({
    action: 'discovery.run',
    actorId,
    entityType: 'campaigns',
    entityId: campaignId,
    details: { provider: 'manual', created: discovered.filter(d => d.created).length, duplicates: discovered.filter(d => !d.created).length, errors: errors.length },
  });

  return { discovered, errors, stats: { provider: 'manual', total: businesses.length } };
}

export default { runDiscovery };
