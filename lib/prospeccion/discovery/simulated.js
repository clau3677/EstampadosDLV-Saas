/**
 * =============================================================================
 *  Prospección B2B — discovery/simulated.js
 * -----------------------------------------------------------------------------
 *  PROVEEDOR SIMULADO (HABILITADO POR DEFECTO).
 *
 *  Genera prospectos a partir de fixtures de negocios REALISTAS de la
 *  Quinta Región (comunas reales, categorías reales). Los datos son
 *  SINTÉTICOS: NO provienen de scraping ni de fuentes de terceros.
 *
 *  Implementa la misma interfaz que los otros proveedores:
 *    runDiscovery(opts) → { discovered: [...], errors: [...], stats: {...} }
 * =============================================================================
 */
import { SIMULATED_BUSINESSES } from './fixtures.js';
import { buildDedupKeys } from '../dedup.js';
import { scoreBusiness } from '../scoring.js';
import { validateTerritory } from '../territory.js';
import { logAudit } from '../audit.js';

let _callCount = 0;

/**
 * Ejecuta un ciclo de descubrimiento simulado.
 * @param {object} opts
 * @param {string} opts.campaignId id de la campaña
 * @param {string[]} [opts.categories] rubros a incluir (todos por defecto)
 * @param {string[]} [opts.communes] comunas a incluir (todas por defecto)
 * @param {number} [opts.limit] máx prospectos por ciclo (default 50)
 * @param {string} [opts.actorId] id del actor que disparó
 * @returns {Promise<object>}
 */
export async function runDiscovery({ campaignId, categories = null, communes = null, limit = 50, actorId = null } = {}) {
  _callCount += 1;
  const discovered = [];
  const errors = [];

  try {
    // Rotación determinística: cada llamada toma un "slice" distinto para
    // simular descubrimiento progresivo sin repetir.
    const start = ((_callCount - 1) * 4) % SIMULATED_BUSINESSES.length;
    const pool = SIMULATED_BUSINESSES.slice(start, start + 4);

    for (const biz of pool) {
      try {
        if (categories && categories.length && !categories.includes(biz.category)) continue;
        if (communes && communes.length && !communes.map(c => String(c).toLowerCase()).includes(String(biz.commune).toLowerCase())) continue;

        const territory = validateTerritory({ commune: biz.commune, lat: biz.lat, lon: biz.lon });
        const score = scoreBusiness({ ...biz, category: biz.category, commune: biz.commune, email: biz.email, phone: biz.phone, website: biz.website, address: biz.address, hours: biz.hours, rating: biz.rating, reviewCount: biz.reviewCount, verifiedSignal: biz.verifiedSignal, instagram: biz.instagram, facebook: biz.facebook });

        discovered.push({
          ...biz,
          source: 'simulated',
          territory,
          score,
          dedupKeys: buildDedupKeys(biz),
        });
      } catch (e) {
        errors.push({ business: biz.name, error: e?.message || String(e) });
      }
    }

    await logAudit({
      action: 'discovery.run',
      actorId,
      entityType: 'campaigns',
      entityId: campaignId,
      details: { provider: 'simulated', discovered: discovered.length, errors: errors.length, limit },
    });
  } catch (e) {
    errors.push({ error: e?.message || String(e) });
  }

  return { discovered, errors, stats: { provider: 'simulated', calls: _callCount, returned: discovered.length } };
}

export default { runDiscovery };
