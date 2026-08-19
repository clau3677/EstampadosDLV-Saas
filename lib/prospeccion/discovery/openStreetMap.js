/**
 * =============================================================================
 *  Prospección B2B — discovery/openStreetMap.js  (build120)
 * -----------------------------------------------------------------------------
 *  PROVEEDOR DE DATOS REALES Y 100% GRATUITO: OpenStreetMap vía Overpass API.
 *
 *  Reemplaza a Google Places API (New) que resultó demasiado costosa.
 *  Overpass API es un servicio público y gratuito del ecosistema OSM.
 *
 *  REGLAS DE USO (política oficial de OSM/Overpass):
 *   - User-Agent identificable del proyecto (estampadosdlv).
 *   - Pausa entre peticiones para no saturar los servidores públicos.
 *   - Cache local de resultados por 30 días para NO repetir consultas
 *     (reduce la carga en los servidores públicos a cero en re-ejecuciones).
 *   - Si el servidor responde 429/504, esperar 30-60 s y reintentar.
 *
 *  MÉTODO:
 *   - Por cada comuna se toma su bounding box (COMMUNE_BOXES, mismo mapa
 *     que usaba el proveedor de Google).
 *   - Se construye una consulta Overpass QL por categoría de interés con
 *     tags relevantes (amenity/shop/tourism/office/leisure/healthcare...).
 *   - Se extrae: nombre, dirección, teléfono, sitio web, coordenadas,
 *     y URI de Google Maps (calculada desde lat/lon con el nombre).
 *   - La categoría interna se deduce del tag OSM (mapa TAG_TO_CATEGORY).
 *   - Después el orquestador aplica dedup, supresiones, scoring y upsert.
 * =============================================================================
 */
import { coll } from '../../mongo.js';
import { COLLECTIONS } from '../../models.js';

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

const TTL_MS = 30 * 24 * 3600 * 1000;
const UA = 'EstampadosDLV Prospecion Local (https://estampadosdlv.com; contacto: estampadosdlv@gmail.com)';
const DELAY_MS = 1200; // pausa entre peticiones (política OSM)
const RETRY_WAIT_MS = 35000;

// Bounding boxes por comuna de la Quinta Región (mismos que googlePlaces.js)
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

/**
 * Filtros OSM (tag + valores) por categoría interna.
 */
const CATEGORY_FILTERS = {
  restaurantes: [
    { k: 'amenity', v: 'restaurant' }, { k: 'amenity', v: 'fast_food' },
    { k: 'tourism', v: 'hostel' },
  ],
  cafeterias: [
    { k: 'amenity', v: 'cafe' }, { k: 'amenity', v: 'bakery' }, { k: 'cuisine', v: 'ice_cream' },
  ],
  bares: [
    { k: 'amenity', v: 'bar' }, { k: 'amenity', v: 'pub' }, { k: 'amenity', v: 'nightclub' },
  ],
  alojamiento_turismo: [
    { k: 'tourism', v: 'hotel' }, { k: 'tourism', v: 'motel' }, { k: 'tourism', v: 'guest_house' },
    { k: 'tourism', v: 'chalet' }, { k: 'tourism', v: 'hostel' }, { k: 'tourism', v: 'apartment' },
    { k: 'tourism', v: 'camp_site' },
  ],
  salud_privada: [
    { k: 'amenity', v: 'clinic' }, { k: 'amenity', v: 'doctors' }, { k: 'amenity', v: 'dentist' },
    { k: 'amenity', v: 'pharmacy' }, { k: 'healthcare', v: 'centre' },
    { k: 'healthcare', v: 'doctor' }, { k: 'healthcare', v: 'dentist' },
  ],
  educacion: [
    { k: 'amenity', v: 'school' }, { k: 'amenity', v: 'college' }, { k: 'amenity', v: 'university' },
    { k: 'amenity', v: 'kindergarten' }, { k: 'amenity', v: 'language_school' },
    { k: 'office', v: 'educational_institution' },
  ],
  gimnasios: [
    { k: 'leisure', v: 'fitness_centre' }, { k: 'leisure', v: 'sports_centre' },
    { k: 'leisure', v: 'gym' },
  ],
  automotor: [
    { k: 'shop', v: 'car_repair' }, { k: 'shop', v: 'car_parts' }, { k: 'shop', v: 'tyres' },
    { k: 'amenity', v: 'car_wash' }, { k: 'amenity', v: 'fuel' },
  ],
  retail: [
    { k: 'shop', v: 'clothes' }, { k: 'shop', v: 'boutique' }, { k: 'shop', v: 'gift' },
    { k: 'shop', v: 'shoes' }, { k: 'shop', v: 'fashion' }, { k: 'shop', v: 'department_store' },
    { k: 'shop', v: 'convenience' }, { k: 'shop', v: 'supermarket' },
  ],
  servicios_profesionales: [
    { k: 'shop', v: 'hairdresser' }, { k: 'shop', v: 'beauty' }, { k: 'shop', v: 'barber' },
    { k: 'amenity', v: 'beauty_salon' }, { k: 'office', v: 'beauty' },
    { k: 'shop', v: 'tailor' }, { k: 'craft', v: 'tailor' },
  ],
  construccion: [
    { k: 'shop', v: 'hardware' }, { k: 'shop', v: 'doityourself' }, { k: 'shop', v: 'building_supplies' },
  ],
  otros: [
    { k: 'shop', v: 'pet' }, { k: 'amenity', v: 'veterinary' }, { k: 'office', v: 'company' },
  ],
};

const ALL_CATEGORIES = Object.keys(CATEGORY_FILTERS);

/**
 * Construye la consulta Overpass QL para un conjunto de filtros en un bbox.
 */
function buildQuery(box, filters) {
  const parts = filters.map(f =>
    f.v
      ? `node["${f.k}"="${f.v}"](${box.minLat},${box.minLon},${box.maxLat},${box.maxLon});way["${f.k}"="${f.v}"](${box.minLat},${box.minLon},${box.maxLat},${box.maxLon});`
      : `node["${f.k}"](${box.minLat},${box.minLon},${box.maxLat},${box.maxLon});way["${f.k}"](${box.minLat},${box.minLon},${box.maxLat},${box.maxLon});`
  ).join('\n');
  return `[out:json][timeout:60][bbox:${box.minLat},${box.minLon},${box.maxLat},${box.maxLon}];(\n${parts}\n);out center tags;`;
}

/**
 * Ejecuta la consulta Overpass con failover entre servidores, backoff y cache.
 */
async function overpassQuery(query, cache, now) {
  const cached = await cache.findOne({ query, expiresAt: { $gt: now } });
  if (cached?.elements) return cached.elements;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(DELAY_MS);

  let lastErr = null;
  for (let attempt = 0; attempt < OVERPASS_URLS.length; attempt++) {
    try {
      const res = await fetch(OVERPASS_URLS[attempt], {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} en ${OVERPASS_URLS[attempt]}`);
        await sleep(RETRY_WAIT_MS);
        continue;
      }
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} en ${OVERPASS_URLS[attempt]}`);
        continue;
      }
      const data = await res.json();
      const elements = data.elements || [];
      await cache.updateOne(
        { query },
        { $set: { elements, expiresAt: new Date(Date.now() + TTL_MS) } },
        { upsert: true },
      ).catch(() => {});
      return elements;
    } catch (e) {
      lastErr = e;
      await sleep(5000);
    }
  }
  return { error: lastErr?.message || 'Overpass no disponible' };
}

/**
 * Clasifica un elemento OSM → categoría interna (best effort).
 */
function mapCategory(tags) {
  for (const [cat, filters] of Object.entries(CATEGORY_FILTERS)) {
    for (const f of filters) {
      if (f.v) { if (tags[f.k] === f.v) return cat; }
      else { if (tags[f.k]) return cat; }
    }
  }
  return null;
}

/**
 * Extrae teléfono chileno (normalizado) de los tags OSM.
 */
function extractPhone(tags) {
  const raw = tags.phone || tags['contact:phone'] || tags['contact:mobile'];
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+?569\d{8}$/.test(digits.replace('+', ''))) return '+' + digits.replace('+', '');
  if (/^9\d{8}$/.test(digits)) return '+56' + digits;
  const m = digits.match(/(\d+)$/);
  if (m && m[1].length >= 9 && m[1].length <= 11) return m[1].length === 9 ? '+56' + m[1] : '+' + m[1];
  return raw;
}

/**
 * Normaliza un elemento OSM → documento de prospecto.
 */
function normalizeElement(el, commune) {
  const tags = el.tags || {};
  const cat = mapCategory(tags);
  const lat = el.lat ?? el.center?.lat ?? null;
  const lon = el.lon ?? el.center?.lon ?? null;
  let website = tags.website || tags['contact:website'] || null;
  if (website && website.startsWith('http://')) website = website; // as-is
  const address = [
    tags['addr:street'], tags['addr:housenumber'], tags['addr:suburb'],
  ].filter(Boolean).join(' ').trim() || tags.address || null;
  return {
    name: tags.name || 'Sin nombre',
    commune,
    category: cat,
    address: address || null,
    lat: lat != null ? Number(lat) : null,
    lon: lon != null ? Number(lon) : null,
    website,
    phone: extractPhone(tags),
    email: tags.email || tags['contact:email'] || null,
    rating: null,
    reviewCount: null,
    googleMapsUri: lat != null && lon != null
      ? `https://www.google.com/maps/search/?api=1&query=${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`
      : null,
    googlePlaceId: String(el.id),
    sourceDetail: { osmId: el.id, osmType: el.type, tags: Object.keys(tags).length },
  };
}

/**
 * @returns {boolean} — siempre disponible (Overpass es gratuito y público)
 */
export function isGooglePlacesEnabled() {
  return true;
}

/**
 * Descubre negocios reales en OpenStreetMap por rubros/comunas.
 */
export async function runDiscovery({ campaignId, categories = null, communes = null, limit = 500, actorId = null } = {}) {
  const cats = (categories && categories.length ? categories : ALL_CATEGORIES)
    .filter(c => CATEGORY_FILTERS[c]);
  const coms = (communes && communes.length ? communes : Object.keys(COMMUNE_BOXES))
    .filter(c => COMMUNE_BOXES[c]);
  const cap = Math.min(Number(limit) || 500, 5000);

  const discovered = [];
  const errors = [];
  const seen = new Set();
  const cache = await coll(COLLECTIONS.PRO_PLACES_CACHE);
  const now = new Date();

  for (const c of coms) {
    if (discovered.length >= cap) break;
    const box = COMMUNE_BOXES[c];
    const filters = [];
    for (const cat of cats) {
      for (const f of CATEGORY_FILTERS[cat]) filters.push(f);
    }
    if (!filters.length) continue;
    try {
      const query = buildQuery(box, filters);
      const elements = await overpassQuery(query, cache, now);
      if (elements.error) { errors.push({ commune: c, error: elements.error }); continue; }
      for (const el of elements) {
        if (discovered.length >= cap) break;
        const tags = el.tags || {};
        if (!tags.name) continue; // sin nombre → descartar
        const dedupKey = `${(tags.name || '').toLowerCase().trim()}|${c}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        const np = normalizeElement(el, c);
        np.category = np.category || 'otros';
        discovered.push(np);
      }
    } catch (e) {
      errors.push({ commune: c, error: String(e?.message || e) });
    }
  }

  return { discovered, errors, stats: { cap, totalDiscovered: discovered.length } };
}

export default { runDiscovery, isGooglePlacesEnabled };
