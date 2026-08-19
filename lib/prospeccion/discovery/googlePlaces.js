/**
 * =============================================================================
 *  Prospección B2B — discovery/googlePlaces.js  (build106)
 * -----------------------------------------------------------------------------
 *  PROVEEDOR DE DATOS REALES: Google Places API (Text Search, New).
 *
 *  ESTRATEGIA DE COBERTURA COMPLETA (build106):
 *   - La API Text Search devuelve máx. 20 resultados por consulta
 *     (sin paginación útil en la v1 New).
 *   - Para cubrir TODOS los negocios de una comuna (ej. ~209 restaurantes
 *     en Quilpué) se barre el territorio con una MALLA de rectángulos
 *     pequeños (celdas de ~0.02° ≈ 2 km) y se ejecutan 2 consultas por
 *     celda con textos distintos ("restaurantes" / "restaurantes en {comuna}"),
 *     lo que devuelve resultados complementarios.
 *   - Dedup por googlePlaceId (exacto) + dedup existente por nombre/comuna.
 *
 *  Búsquedas: "{rubro} en {comuna}, Chile", región CL, idioma es.
 *
 *  Cache: resultados por (query+rectángulo) en pro_places_cache (TTL 7 días)
 *  para no repetir búsquedas y cuidar la cuota.
 * =============================================================================
 */
import { coll } from '../../mongo.js';
import { COLLECTIONS } from '../../models.js';
import { SERVICE_BY_CATEGORY } from '../templates.js';

const API_URL = 'https://places.googleapis.com/v1/places:searchText';
const TTL_MS = 7 * 24 * 3600 * 1000;
const MASK = 'places.id,places.displayName,places.primaryType,places.types,places.formattedAddress,places.location,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,places.businessStatus';

// Códigos de categoría internos (iguales a SERVICE_BY_CATEGORY).
const ALL_CATEGORIES = Object.keys(SERVICE_BY_CATEGORY);

/**
 * Frases de búsqueda en español por categoría (para Text Search).
 */
const PLACE_SEARCH_PHRASES = {
  restaurantes: ['restaurantes', 'restaurantes familiares', 'fuentes de soda', 'picadas'],
  cafeterias: ['cafeterías', 'cafés', 'panaderías', 'cafés y pasteles'],
  bares: ['bares', 'cervecerías artesanales'],
  alojamiento_turismo: ['hoteles', 'hostales', 'cabañas', 'bed and breakfast'],
  salud_privada: ['clínicas dentales', 'centros médicos', 'consultorios médicos', 'farmacias'],
  educacion: ['colegios', 'academias', 'institutos'],
  gimnasios: ['gimnasios', 'centros de fitness', 'estudios de yoga'],
  automotor: ['talleres mecánicos', 'autolavados', 'talleres automotrices', 'neumáticos'],
  retail: ['tiendas de ropa', 'boutiques', 'tiendas de regalos'],
  servicios_profesionales: ['peluquerías', 'salones de belleza', 'barberías'],
  construccion: ['ferreterías', 'tiendas de materiales de construcción'],
  otros: ['tiendas', 'servicios'],
};

/**
 * Mapas de google place type → categoría interna (best effort).
 */
const PLACE_TYPE_TO_CATEGORY = {
  restaurant: 'restaurantes', cafe: 'cafeterias', bakery: 'cafeterias',
  bar: 'bares', night_club: 'bares', brewery: 'bares',
  gym: 'gimnasios', health: 'salud_privada', dentist: 'salud_privada',
  hospital: 'salud_privada', pharmacy: 'salud_privada',
  school: 'educacion', university: 'educacion',
  car_repair: 'automotor', car_wash: 'automotor',
  clothing_store: 'retail', shoe_store: 'retail', store: 'retail',
  beauty_salon: 'servicios_profesionales', hair_care: 'servicios_profesionales',
  lodging: 'alojamiento_turismo', hotel: 'alojamiento_turismo',
  hardware_store: 'construccion',
  veterinary_care: 'otros', pet_store: 'otros',
};

/**
 * Bounding box por comuna (lat min/max, lon min/max) para el barrido en malla.
 * Coordenadas aproximadas para la Quinta Región de Chile.
 */
const COMMUNE_BOXES = {
  'Valparaíso': { minLat: -33.080, maxLat: -32.990, minLon: -71.660, maxLon: -71.560 },
  'Viña del Mar': { minLat: -33.070, maxLat: -32.990, minLon: -71.600, maxLon: -71.470 },
  'Concón': { minLat: -33.010, maxLat: -32.930, minLon: -71.570, maxLon: -71.470 },
  'Quilpué': { minLat: -33.120, maxLat: -33.030, minLon: -71.490, maxLon: -71.360 },
  'Villa Alemana': { minLat: -33.100, maxLat: -33.010, minLon: -71.390, maxLon: -71.300 },
  'Limache': { minLat: -33.010, maxLat: -32.940, minLon: -71.320, maxLon: -71.210 },
  'Olmué': { minLat: -32.990, maxLat: -32.930, minLon: -71.250, maxLon: -71.160 },
  'Quillota': { minLat: -32.920, maxLat: -32.850, minLon: -71.300, maxLon: -71.180 },
  'La Cruz': { minLat: -32.870, maxLat: -32.820, minLon: -71.260, maxLon: -71.210 },
  'La Calera': { minLat: -32.810, maxLat: -32.720, minLon: -71.230, maxLon: -71.150 },
  'Hijuelas': { minLat: -32.700, maxLat: -32.620, minLon: -71.160, maxLon: -71.060 },
  'Nogales': { minLat: -32.760, maxLat: -32.660, minLon: -71.250, maxLon: -71.140 },
  'Quintero': { minLat: -32.840, maxLat: -32.740, minLon: -71.560, maxLon: -71.480 },
  'Puchuncaví': { minLat: -32.780, maxLat: -32.700, minLon: -71.490, maxLon: -71.390 },
  'San Antonio': { minLat: -33.630, maxLat: -33.560, minLon: -71.640, maxLon: -71.590 },
  'Santo Domingo': { minLat: -33.670, maxLat: -33.600, minLon: -71.690, maxLon: -71.620 },
  'Cartagena': { minLat: -33.590, maxLat: -33.520, minLon: -71.650, maxLon: -71.580 },
  'El Quisco': { minLat: -33.410, maxLat: -33.360, minLon: -71.720, maxLon: -71.660 },
  'El Tabo': { minLat: -33.510, maxLat: -33.440, minLon: -71.690, maxLon: -71.620 },
  'Algarrobo': { minLat: -33.380, maxLat: -33.310, minLon: -71.670, maxLon: -71.600 },
  'San Felipe': { minLat: -32.800, maxLat: -32.700, minLon: -70.750, maxLon: -70.660 },
  'Los Andes': { minLat: -32.900, maxLat: -32.800, minLon: -70.620, maxLon: -70.520 },
};

const COMMUNE_LABEL = Object.fromEntries(Object.keys(COMMUNE_BOXES).map(c => [c, c]));

/**
 * @returns {boolean}
 */
export function isGooglePlacesEnabled() {
  return process.env.ENABLE_GOOGLE_PLACES === 'true' && !!process.env.GOOGLE_PLACES_API_KEY;
}

/**
 * Convierte el primaryType de Google → categoría interna.
 */
function mapCategory(place) {
  const types = place.types || [];
  const primary = place.primaryType || types[0] || '';
  return PLACE_TYPE_TO_CATEGORY[primary] || null;
}

/**
 * Normaliza un lugar de Google Places → documento de prospecto.
 */
function normalizePlace(place, commune, category) {
  const name = place.displayName?.text || 'Sin nombre';
  return {
    name,
    commune,
    category,
    address: place.formattedAddress || null,
    lat: place.location?.latitude || null,
    lon: place.location?.longitude || null,
    website: place.websiteUri || null,
    phone: place.nationalPhoneNumber || null,
    email: null, // Google no entrega email; se usa el dominio de la web si existe
    rating: place.rating != null ? Number(place.rating) : null,
    reviewCount: place.userRatingCount != null ? Number(place.userRatingCount) : null,
    googleMapsUri: place.googleMapsUri || null,
    googlePlaceId: place.id || null,
    sourceDetail: { googleType: place.primaryType, types: place.types || [] },
  };
}

/**
 * Ejecuta una búsqueda Text Search en Google Places (con cache local).
 */
async function placesSearch(apiKey, query, bias, cache, now) {
  const cacheKey = `${query}@@${bias ? JSON.stringify(bias) : ''}`;
  const cached = await cache.findOne({ query: cacheKey, expiresAt: { $gt: now } });
  if (cached?.places) return cached.places;

  const body = {
    textQuery: query,
    languageCode: 'es',
    regionCode: 'CL',
    maxResultCount: 20,
  };
  if (bias) body.locationBias = bias;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': MASK,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    return { error: `HTTP ${res.status}: ${txt.slice(0, 150)}` };
  }
  const data = await res.json();
  const rows = (data.places || []).map(p => p);
  await cache.updateOne(
    { query: cacheKey },
    { $set: { places: rows, expiresAt: new Date(Date.now() + TTL_MS) } },
    { upsert: true },
  ).catch(() => {});
  return rows;
}

/**
 * Barrido en malla: divide el bounding box de la comuna en celdas y
 * ejecuta 2 consultas por celda para maximizar cobertura (20+20 complementarios).
 */
async function sweepCommune(apiKey, cache, now, commune, box, phrases, perCell, capLeft) {
  const results = [];
  const CELL = 0.025; // ~2.5 km por celda
  const usedPlaceIds = new Set();
  for (let lat = box.minLat; lat < box.maxLat && results.length < capLeft; lat += CELL) {
    for (let lon = box.minLon; lon < box.maxLon && results.length < capLeft; lon += CELL) {
      const bias = { rectangle: {
        low: { latitude: lat, longitude: lon },
        high: { latitude: Math.min(lat + CELL, box.maxLat), longitude: Math.min(lon + CELL, box.maxLon) },
      } };
      // 2 consultas por celda con textos distintos → resultados complementarios
      for (const phrase of phrases.slice(0, 2)) {
        if (results.length >= capLeft) break;
        const query = `${phrase} en ${commune}, Chile`;
        const rows = await placesSearch(apiKey, query, bias, cache, now);
        if (Array.isArray(rows)) {
          for (const p of rows) {
            if (results.length >= capLeft) break;
            if (p.id && usedPlaceIds.has(p.id)) continue;
            if (p.id) usedPlaceIds.add(p.id);
            results.push(p);
          }
        }
      }
    }
  }
  return results;
}

/**
 * Descubre negocios reales en Google Places por rubros/comunas.
 * @param {object} opts
 * @param {string[]} [opts.categories] códigos de categoría interna
 * @param {string[]} [opts.communes] nombres de comuna (labels)
 * @param {number} [opts.limit] máximo de prospectos a descubrir (default 500)
 * @returns {Promise<object>} { discovered, errors }
 */
export async function runDiscovery({ campaignId, categories = null, communes = null, limit = 500, actorId = null } = {}) {
  if (!isGooglePlacesEnabled()) {
    return { discovered: [], errors: [{ error: 'Google Places no habilitado (falta GOOGLE_PLACES_API_KEY o ENABLE_GOOGLE_PLACES=true).' }] };
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const cats = (categories && categories.length ? categories : ALL_CATEGORIES)
    .filter(c => PLACE_SEARCH_PHRASES[c]);
  // Comunas solicitadas, o TODAS las de la Quinta Región
  const coms = (communes && communes.length ? communes : Object.keys(COMMUNE_BOXES))
    .filter(c => COMMUNE_BOXES[c]);
  const cap = Math.min(Number(limit) || 500, 2000);

  const discovered = [];
  const errors = [];
  const usedQueries = new Set();
  const seenIds = new Set();
  const cache = await coll(COLLECTIONS.PRO_PLACES_CACHE);
  const now = new Date();

  // --- FASE 1: barrido en malla por comuna (cobertura masiva) ---
  for (const c of coms) {
    if (discovered.length >= cap) break;
    const box = COMMUNE_BOXES[c];
    // Frases a barrer: primera frase de cada categoría seleccionada
    const phrases = [];
    for (const cat of cats) {
      const first = PLACE_SEARCH_PHRASES[cat]?.[0];
      if (first && !phrases.includes(first)) phrases.push(first);
    }
    if (!phrases.length) continue;
    // Solo las primeras 3 categorías más relevantes para evitar explosión de llamadas
    const phrasesForSweep = phrases.slice(0, 3);
    try {
      const rows = await sweepCommune(
        apiKey, cache, now, c, box, phrasesForSweep, 2, cap - discovered.length,
      );
      for (const p of rows) {
        if (discovered.length >= cap) break;
        if (p.id && seenIds.has(p.id)) continue;
        if (p.id) seenIds.add(p.id);
        const np = normalizePlace(p, c, mapCategory(p));
        discovered.push(np);
      }
    } catch (e) {
      errors.push({ commune: c, error: String(e?.message || e) });
    }
  }

  // --- FASE 2: búsquedas textuales por categoría+comuna (refuerzo, sin bias) ---
  for (const cat of cats) {
    if (discovered.length >= cap) break;
    const phrases = PLACE_SEARCH_PHRASES[cat] || [];
    for (const phrase of phrases) {
      if (discovered.length >= cap) break;
      for (const c of coms) {
        if (discovered.length >= cap) break;
        const query = `${phrase} en ${c}, Chile`;
        if (usedQueries.has(query)) continue;
        usedQueries.add(query);

        let rows = [];
        try {
          rows = await placesSearch(apiKey, query, null, cache, now);
        } catch (e) {
          errors.push({ query, error: String(e?.message || e) });
          continue;
        }
        if (rows.error) {
          errors.push({ query, error: rows.error });
          continue;
        }

        for (const p of rows) {
          if (discovered.length >= cap) break;
          if (p.id && seenIds.has(p.id)) continue;
          if (p.id) seenIds.add(p.id);
          const np = normalizePlace(p, c, mapCategory(p) || cat);
          discovered.push(np);
        }
      }
    }
  }

  return { discovered, errors, stats: { sweepCells: true, cap, totalDiscovered: discovered.length } };
}

export default { runDiscovery, isGooglePlacesEnabled };
