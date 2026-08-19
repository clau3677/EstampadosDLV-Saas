/**
 * =============================================================================
 *  Prospección B2B — discovery/index.js
 * -----------------------------------------------------------------------------
 *  ORQUESTADOR DE DESCUBRIMIENTO.
 *
 *  Decide qué proveedor usar según la configuración de la campaña y los
 *  feature flags del proceso:
 *   - campaign.provider === 'scraper'   → scraper (sólo si ENABLE_MAPS_SCRAPER=true)
 *   - campaign.provider === 'manual'    → proveedor manual
 *   - default / 'simulated'             → proveedor simulado
 *
 *  Después del descubrimiento, cada prospecto pasa por:
 *   1. Deduplicación (findDuplicate) → se descarta si ya existe
 *   2. Supresión (findSuppression) → se descarta si está en la lista negra
 *   3. Scoring (scoreBusiness) → se calcula el puntaje 0-100 explicable
 *   4. Upsert (upsertLead) → se persiste en la colección leads
 * =============================================================================
 */
import { coll } from '../../mongo.js';
import { COLLECTIONS } from '../../models.js';
import { runDiscovery as runSimulated } from './simulated.js';
import { runDiscovery as runScraper } from './scraper.js';
import { runDiscovery as runManual } from './manual.js';
import { upsertLead, findDuplicate } from '../dedup.js';
import { scoreBusiness } from '../scoring.js';
import { validateTerritory } from '../territory.js';
import { findSuppression } from '../suppression.js';
import { logAudit, AUDIT_ACTIONS } from '../audit.js';

const PROVIDERS = {
  simulated: runSimulated,
  scraper: runScraper,
  manual: runManual,
};

/**
 * Ejecuta descubrimiento para una campaña.
 * @param {object} opts
 * @param {string} opts.campaignId
 * @param {string} [opts.providerOverride] forzar proveedor ('simulated'|'scraper'|'manual')
 * @param {object[]} [opts.manualBusinesses] datos para proveedor manual
 * @param {string} [opts.actorId]
 * @returns {Promise<object>}
 */
export async function runDiscoveryForCampaign({ campaignId, providerOverride = null, manualBusinesses = [], actorId = null } = {}) {
  if (!campaignId) throw new Error('campaignId requerido');

  const campaigns = await coll(COLLECTIONS.PRO_CAMPAIGNS);
  const campaign = await campaigns.findOne({ id: campaignId });
  if (!campaign) throw new Error(`campaña no encontrada: ${campaignId}`);

  const providerName = providerOverride || campaign.provider || 'simulated';
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`proveedor desconocido: ${providerName}`);

  // El scraper requiere flag explícito aunque la campaña lo pida
  if (providerName === 'scraper' && process.env.ENABLE_MAPS_SCRAPER !== 'true') {
    return {
      result: { discovered: [], errors: [{ error: 'Scraper deshabilitado (ENABLE_MAPS_SCRAPER=false). Campaña configurada con proveedor "scraper" pero el flag no está activo.' }], stats: { provider: providerName, enabled: false } },
      saved: 0,
      skipped: { duplicate: 0, suppressed: 0 },
    };
  }

  const discoveryInput = providerName === 'manual'
    ? { campaignId, businesses: manualBusinesses, actorId }
    : { campaignId, categories: campaign.categories || null, communes: campaign.communes || null, limit: campaign.limitPerRun || 50, actorId };

  const result = await provider(discoveryInput);

  // Persistir cada prospecto descubierto
  let saved = 0;
  let skippedDuplicate = 0;
  let skippedSuppressed = 0;

  for (const biz of result.discovered || []) {
    try {
      // 1. Supresión global
      const suppressed = await findSuppression({ email: biz.email, phone: biz.phone });
      if (suppressed) { skippedSuppressed += 1; continue; }

      // 2. Deduplicación
      const dup = await findDuplicate({ name: biz.name, commune: biz.commune, email: biz.email, phone: biz.phone, website: biz.website });
      if (dup) { skippedDuplicate += 1; continue; }

      // 3. Upsert con score y territorio
      const { lead } = await upsertLead({
        ...biz,
        sourceId: providerName,
        source: providerName,
        state: 'requiere_revision',
        score: biz.score || scoreBusiness(biz),
        territory: biz.territory || validateTerritory({ commune: biz.commune, lat: biz.lat, lon: biz.lon }),
      });

      // 4. Asignar a la campaña
      const campaignLeads = await coll(COLLECTIONS.PRO_CAMPAIGN_LEADS);
      await campaignLeads.insertOne({
        id: crypto.randomUUID(),
        campaignId,
        leadId: lead.id,
        state: 'pendiente_revision',
        createdAt: new Date(),
      }).catch(() => {}); // unique index evita duplicados

      saved += 1;
    } catch (e) {
      result.errors = result.errors || [];
      result.errors.push({ business: biz.name, error: e?.message || String(e) });
    }
  }

  await logAudit({
    action: AUDIT_ACTIONS.DISCOVERY_RUN,
    actorId,
    entityType: 'campaigns',
    entityId: campaignId,
    details: { provider: providerName, saved, skippedDuplicate, skippedSuppressed, errors: result.errors?.length || 0 },
  });

  return { result, saved, skipped: { duplicate: skippedDuplicate, suppressed: skippedSuppressed } };
}

/**
 * Ejecuta descubrimiento SIN campaña: solo filtra por rubros y comunas.
 * Los prospectos quedan guardados en la base de datos (estado
 * 'requiere_revision') y pueden aprobarse más tarde desde el panel.
 * Ideal para búsqueda rápida desde la pestaña Prospectos.
 */
export async function runDiscoveryByFilter({ categories = null, communes = null, provider = null, limit = 50, actorId = null } = {}) {
  const providerName = provider || 'simulated';
  const p = PROVIDERS[providerName];
  if (!p) throw new Error(`proveedor desconocido: ${providerName}`);
  if (providerName === 'scraper' && process.env.ENABLE_MAPS_SCRAPER !== 'true') {
    return { result: { discovered: [], errors: [{ error: 'Scraper deshabilitado (ENABLE_MAPS_SCRAPER=false).' }], stats: { provider: providerName, enabled: false } }, saved: 0, skipped: { duplicate: 0, suppressed: 0 } };
  }

  const result = await p({ campaignId: 'directo', categories: categories || null, communes: communes || null, limit: Number(limit) || 50, actorId });

  let saved = 0;
  let skippedDuplicate = 0;
  let skippedSuppressed = 0;

  for (const biz of result.discovered || []) {
    try {
      const suppressed = await findSuppression({ email: biz.email, phone: biz.phone });
      if (suppressed) { skippedSuppressed += 1; continue; }
      const dup = await findDuplicate({ name: biz.name, commune: biz.commune, email: biz.email, phone: biz.phone, website: biz.website });
      if (dup) { skippedDuplicate += 1; continue; }
      await upsertLead({
        ...biz,
        sourceId: providerName,
        source: providerName,
        state: 'requiere_revision',
        score: biz.score || scoreBusiness(biz),
        territory: biz.territory || validateTerritory({ commune: biz.commune, lat: biz.lat, lon: biz.lon }),
      });
      saved += 1;
    } catch (e) {
      result.errors = result.errors || [];
      result.errors.push({ business: biz.name, error: e?.message || String(e) });
    }
  }

  await logAudit({
    action: AUDIT_ACTIONS.DISCOVERY_RUN,
    actorId,
    entityType: 'leads',
    entityId: 'directo',
    details: { provider: providerName, saved, skippedDuplicate, skippedSuppressed, errors: result.errors?.length || 0, categories, communes, sinCampaña: true },
  });

  return { result, saved, skipped: { duplicate: skippedDuplicate, suppressed: skippedSuppressed } };
}

export default {
  runDiscoveryForCampaign,
  runDiscoveryByFilter,
  PROVIDERS,
};
