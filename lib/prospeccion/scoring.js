/**
 * =============================================================================
 *  Módulo Prospección B2B — scoring.js
 * -----------------------------------------------------------------------------
 *  Scoring 0-100 EXPLICABLE: cada factor registra su valor, peso y evidencia.
 *
 *  Factores:
 *   - web ausente (sin sitio web) ............... +15
 *   - email corporativo (no gmail/hotmail) ...... +10
 *   - teléfono válido (celular chileno) ......... +8
 *   - rubro objetivo (alta demanda de estampado) +10
 *   - comuna objetivo (cerca de Quilpué/Valpo) .. +5
 *   - rating bajo / reseñas negativas ........... +10  (dolor insatisfecho)
 *   - pocas reseñas (sin reputación digital) .... +5
 *   - calidad de datos (dirección, horario, etc). +7
 *   - cercanía a Estampados DLV (km) ............ +10
 *   - señal verificable de identidad ............ +10
 *   - presencia social activa ................... +10
 * =============================================================================
 */
import { haversineKm, validateTerritory } from './territory.js';
import { CHILE_DLV } from './utils.js';

export const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'hotmail.com', 'yahoo.com', 'yahoo.cl', 'outlook.com',
  'live.cl', 'icloud.com', 'msn.com', 'protonmail.com', 'gmx.com',
]);

// Rubros objetivo y su relevancia para servicios de estampado (DTF, polerones, gorras).
export const TARGET_CATEGORIES = [
  'restaurantes', 'cafeterias', 'bares', 'alojamiento_turismo',
  'salud_privada', 'educacion', 'gimnasios', 'automotor',
  'retail', 'servicios_profesionales', 'construccion', 'otros',
];

export const FACTORS = [
  { key: 'noWebsite',        label: 'Sin sitio web',                    weight: 15,
    fn: (b) => !b.website && (!b.hasWebsite || b.hasWebsite === false) },
  { key: 'corporateEmail',   label: 'Email corporativo',                weight: 10,
    fn: (b) => Boolean(b.email) && !GENERIC_EMAIL_DOMAINS.has(String(b.email).split('@')[1]?.toLowerCase()) },
  { key: 'validPhone',       label: 'Teléfono válido',                  weight: 8,
    fn: (b) => Boolean(b.phone) && String(b.phone).replace(/\D/g, '').length >= 9 },
  { key: 'targetCategory',   label: 'Rubro objetivo',                   weight: 10,
    fn: (b) => TARGET_CATEGORIES.includes(b.category) || (b.category && TARGET_CATEGORIES.some(c => String(b.category).toLowerCase().includes(c))) },
  { key: 'targetCommune',    label: 'Comuna objetivo',                  weight: 5,
    fn: (b) => Boolean(b.commune) && validateTerritory({ commune: b.commune }).inTerritory },
  { key: 'lowRating',        label: 'Rating bajo o sin rating',         weight: 10,
    fn: (b) => (b.rating !== undefined && b.rating !== null && b.rating > 0 && b.rating < 4.2) || (b.reviewCount !== undefined && b.reviewCount === 0) },
  { key: 'fewReviews',       label: 'Pocas reseñas',                    weight: 5,
    fn: (b) => b.reviewCount !== undefined && b.reviewCount !== null && b.reviewCount >= 1 && b.reviewCount <= 25 },
  { key: 'dataQuality',      label: 'Información completa',             weight: 7,
    fn: (b) => Boolean(b.address || b.hours || b.lat || b.longitude) },
  { key: 'nearby',           label: 'Cercanía a Quilpué',               weight: 10,
    fn: (b) => Boolean(b.lat) && Boolean(b.longitude) && haversineKm(b.lat, b.longitude, CHILE_DLV.lat, CHILE_DLV.lon) !== null &&
               haversineKm(b.lat, b.longitude, CHILE_DLV.lat, CHILE_DLV.lon) <= 60 },
  { key: 'verifiedSignal',   label: 'Señal verificable (Maps/Instagram)', weight: 10,
    fn: (b) => Boolean(b.verifiedSignal || b.placeId || b.instagram) },
  { key: 'socialPresence',   label: 'Redes sociales activas',           weight: 10,
    fn: (b) => Boolean(b.instagram || b.facebook) },
];

/**
 * Calcula el score 0-100 con explicación por factor.
 * @param {object} business datos crudos del prospecto
 * @returns {{ final: number, max: number, factors: Array<{key,label,value,weight,points,evidence}> }}
 */
export function scoreBusiness(business) {
  const factors = FACTORS.map((f) => {
    let value = false;
    let evidence = '';
    try {
      value = Boolean(f.fn(business));
    } catch (e) {
      value = false;
      evidence = `error: ${e?.message || e}`;
    }
    switch (f.key) {
      case 'noWebsite':
        evidence = business.website ? `tiene web: ${business.website}` : 'no se encontró sitio web';
        break;
      case 'corporateEmail':
        evidence = business.email || 'sin email';
        break;
      case 'validPhone':
        evidence = business.phone ? String(business.phone) : 'sin teléfono';
        break;
      case 'targetCategory':
        evidence = business.category || 'rubro desconocido';
        break;
      case 'targetCommune':
        evidence = business.commune ? `${business.commune} (Quinta Región)` : 'comuna no declarada';
        break;
      case 'lowRating':
        evidence = business.rating !== undefined ? `rating ${business.rating} / ${business.reviewCount ?? 0} reseñas` : 'sin datos de rating';
        break;
      case 'fewReviews':
        evidence = `cantidad de reseñas: ${business.reviewCount ?? 'desconocida'}`;
        break;
      case 'dataQuality':
        evidence = `dirección: ${Boolean(business.address)}, horario: ${Boolean(business.hours)}`;
        break;
      case 'nearby': {
        const d = (business.lat && business.longitude) ? haversineKm(business.lat, business.longitude, CHILE_DLV.lat, CHILE_DLV.lon) : null;
        evidence = d !== null ? `${Math.round(d)} km de Quilpué` : 'sin coordenadas';
        break;
      }
      case 'verifiedSignal':
        evidence = business.verifiedSignal || business.placeId || business.instagram || 'sin señal verificable';
        break;
      case 'socialPresence':
        evidence = business.instagram || business.facebook || 'sin redes declaradas';
        break;
    }
    return {
      key: f.key,
      label: f.label,
      value,
      weight: f.weight,
      points: value ? f.weight : 0,
      evidence,
    };
  });
  const final = Math.min(100, Math.round(factors.reduce((acc, f) => acc + f.points, 0)));
  return { final, max: 100, factors };
}

export default {
  GENERIC_EMAIL_DOMAINS,
  TARGET_CATEGORIES,
  FACTORS,
  scoreBusiness,
};
