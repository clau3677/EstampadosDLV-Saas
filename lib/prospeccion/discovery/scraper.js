/**
 * =============================================================================
 *  Prospección B2B — discovery/scraper.js
 * -----------------------------------------------------------------------------
 *  ADAPTADOR DEL SCRAPER DE GOOGLE MAPS.
 *
 *  ⚠️  FEATURE FLAG: ENABLE_MAPS_SCRAPER
 *  Por defecto ESTÁ DESHABILITADO. El scraping de Google Maps tiene
 *  riesgos legales (Términos de Servicio de Google) y de reputación
 *  (spam) que deben validarse con Sandra antes de activarlo.
 *
 *  Arquitectura inspirada en gosom/google-maps-scraper (Go):
 *   - Provider: puente FIFO entre la cola de trabajos y el scraper
 *   - Deduper: evita procesar el mismo negocio dos veces
 *   - Runner: ejecuta jobs con reintentos y circuit breaker
 *  Adaptado a Node.js + MongoDB usando las mismas colecciones.
 * =============================================================================
 */
import { coll } from '../../mongo.js';
import { COLLECTIONS } from '../../models.js';
import { logAudit } from '../audit.js';

export function isScraperEnabled() {
  return process.env.ENABLE_MAPS_SCRAPER === 'true';
}

/**
 * Ejecuta un ciclo de descubrimiento con el scraper.
 * Si el feature flag está apagado, rechaza con un error claro.
 */
export async function runDiscovery({ campaignId, categories = null, communes = null, limit = 50, actorId = null } = {}) {
  if (!isScraperEnabled()) {
    return {
      discovered: [],
      errors: [{ error: 'Scraper de Maps DESHABILITADO (ENABLE_MAPS_SCRAPER=false). Usar proveedor simulado o manual.' }],
      stats: { provider: 'scraper', enabled: false },
    };
  }

  // Guardrail de seguridad: nunca ejecutar más de N businesses por ciclo
  // aunque el scraper devuelva más.
  const safeLimit = Math.min(limit || 50, 200);

  try {
    const jobs = await coll(COLLECTIONS.PRO_JOBS);
    const now = new Date();
    const job = {
      id: crypto.randomUUID(),
      type: 'scraper.discovery',
      status: 'pending',
      campaignId,
      uniqueKey: `scraper.${campaignId}.${Math.floor(now.getTime() / 60000)}`, // 1 job por minuto por campaña
      payload: { categories, communes, limit: safeLimit },
      attempts: 0,
      maxAttempts: 3,
      runAt: now,
      createdAt: now,
    };
    await jobs.insertOne(job);

    await logAudit({
      action: 'discovery.run',
      actorId,
      entityType: 'campaigns',
      entityId: campaignId,
      details: { provider: 'scraper', status: 'queued', limit: safeLimit },
    });

    return {
      discovered: [],
      errors: [],
      stats: { provider: 'scraper', enabled: true, queued: true, jobId: job.id },
    };
  } catch (e) {
    return { discovered: [], errors: [{ error: e?.message || String(e) }], stats: { provider: 'scraper', enabled: true, queued: false } };
  }
}

export default { isScraperEnabled, runDiscovery };
