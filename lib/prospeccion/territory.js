/**
 * =============================================================================
 *  Módulo Prospección B2B — territory.js
 * -----------------------------------------------------------------------------
 *  Validación territorial de la Quinta Región de Valparaíso.
 *
 *  Un negocio se considera "dentro del territorio" si:
 *   1) Su comuna está en la lista de comunas objetivo (normalizada), Y
 *   2) Si tiene coordenadas, cae dentro de la geocerca aproximada de la región.
 *
 *  La lista de comunas es configurable por campaña (`territory.communes`)
 *  o a nivel global con `setAllowedCommunes([...])`.
 * =============================================================================
 */

// Geocerca aproximada de la Quinta Región (bounds generales).
// Lat: -32.15 (norte, Los Andes/San Felipe) a -33.95 (sur, borde con RM)
// Lon: -70.30 (este, cordillera) a -72.55 (oeste, litoral de San Antonio)
export const REGION_BOUNDS = {
  latMin: -33.95,
  latMax: -32.15,
  lonMin: -72.55,
  lonMax: -70.30,
};

// Comunas objetivo por defecto: las principales de la Quinta Región.
export const DEFAULT_COMMUNES = [
  'valparaiso', 'vina del mar', 'concon', 'quilpue', 'villa alemana',
  'limache', 'olmue', 'quillota', 'la calera', 'hijuelas', 'nogales',
  'san antonio', 'cartagena', 'el quisco', 'algarrobo', 'el tabo',
  'casablanca', 'san felipe', 'los andes', 'putaendo', 'cabildo',
  'la ligua', 'zapallar', 'papudo', 'puchuncavi', 'quirihue', 'catemu',
];

// Normaliza una comuna a clave minúscula sin tildes.
export function normalizeCommune(commune) {
  if (!commune) return '';
  return String(commune)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Valida coordenadas básicas (latitud/longitud numéricas razonables).
export function isValidCoordinates(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  return Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

// ¿Las coordenadas caen dentro de la geocerca de la Quinta Región?
export function isInsideGeoBounds(lat, lon) {
  if (!isValidCoordinates(lat, lon)) return false;
  const la = Number(lat);
  const lo = Number(lon);
  return la >= REGION_BOUNDS.latMin && la <= REGION_BOUNDS.latMax &&
         lo >= REGION_BOUNDS.lonMin && lo <= REGION_BOUNDS.lonMax;
}

// Comunas permitidas globales (override de sesión, opcional).
let _globalOverride = null;
export function setAllowedCommunes(communes) {
  _globalOverride = Array.isArray(communes)
    ? communes.map(normalizeCommune).filter(Boolean)
    : null;
}
export function getAllowedCommunes() {
  return _globalOverride;
}

/**
 * Valida si un negocio (prospecto crudo) está dentro del territorio.
 * @param {object} opts
 * @param {string} [opts.commune] comuna declarada
 * @param {number} [opts.lat] latitude
 * @param {number} [opts.lon] longitude
 * @param {string[]} [opts.communesOverride] comunas específicas de la campaña
 * @returns {{ inTerritory: boolean, reasons: string[] }}
 */
export function validateTerritory({ commune, lat, lon, communesOverride } = {}) {
  const reasons = [];
  const allowed = communesOverride || _globalOverride || DEFAULT_COMMUNES;
  const normCommune = normalizeCommune(commune);

  let communeMatch = false;
  if (normCommune) {
    communeMatch = allowed.includes(normCommune);
    if (!communeMatch) reasons.push(`comuna "${commune}" no está en la lista objetivo`);
  } else {
    reasons.push('comuna no declarada');
  }

  let geoCheck = null;
  const hasCoords = lat !== undefined && lat !== null && lon !== undefined && lon !== null;
  if (hasCoords) {
    const inside = isInsideGeoBounds(lat, lon);
    geoCheck = { lat: Number(lat), lon: Number(lon), inside };
    if (!inside) reasons.push('coordenadas fuera de la geocerca regional');
  }

  // Decisión: comuna coincide (si fue declarada) y coordenadas (si existen) son consistentes.
  // Si no hay comuna ni coordenadas, no se puede validar → descartado por calidad de datos.
  const inTerritory = communeMatch || (!normCommune && hasCoords && geoCheck?.inside);

  return { inTerritory, reasons, geoCheck, communeNormalized: normCommune };
}

/**
 * Distancia (km) entre dos puntos usando la fórmula de Haversine.
 * Se usa para scoring de cercanía a Quilpué/Valparaíso.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  if (!isValidCoordinates(lat1, lon1) || !isValidCoordinates(lat2, lon2)) return null;
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default {
  REGION_BOUNDS,
  DEFAULT_COMMUNES,
  normalizeCommune,
  isInsideGeoBounds,
  validateTerritory,
  haversineKm,
  setAllowedCommunes,
  getAllowedCommunes,
};
