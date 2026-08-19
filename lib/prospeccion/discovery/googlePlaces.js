/**
 * =============================================================================
 *  Prospección B2B — discovery/googlePlaces.js
 * -----------------------------------------------------------------------------
 *  PROVEEDOR DE DATOS REALES: Google Places API (Text Search, New).
 *
 *  Es el producto OFICIAL de Google, permitido por sus términos
 *  (a diferencia del scraping). Cobra ~USD 32 por 1.000 búsquedas
 *  pero el crédito gratuito de Google Cloud (~USD 200/mes) lo cubre
 *  de sobra para prospección B2B local (6.000+ búsquedas/mes).
 *
 *  Requiere en el servidor:
 *   - ENABLE_GOOGLE_PLACES=true
 *   - GOOGLE_PLACES_API_KEY=<key> (Google Cloud Console → Places API)
 *
 *  Búsquedas: "{rubro} en {comuna}, Chile", región CL, idioma es.
 *  Campos devueltos (no pagan el costo de Place Details):
 *    displayName, formattedAddress, primaryType, types, websiteUri,
 *    nationalPhoneNumber, rating, userRatingCount, googleMapsUri
 *
 *  Cache: resultados por consulta en pro_places_cache (TTL 7 días)
 *  para no repetir búsquedas y cuidar la cuota.
 * =============================================================================
 */
import { coll } from '../../mongo.js';
import { COLLECTIONS } from '../../models.js';
import { SERVICE_BY_CATEGORY } from '../templates.js';

const API_URL = 'https://places.googleapis.com/v1/places:searchText';
const TTL_MS = 7 * 24 * 3600 * 1000;

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

const COMMUNE_LABEL = {
  'Valparaíso': 'Valparaíso', 'Viña del Mar': 'Viña del Mar',
  'Concón': 'Concón', 'Quilpué': 'Quilpué',
  'Villa Alemana': 'Villa Alemana', 'Limache': 'Limache',
  'Olmué': 'Olmué', 'Quillota': 'Quillota',
  'La Cruz': 'La Cruz', 'La Calera': 'La Calera',
  'Hijuelas': 'Hijuelas', 'Nogales': 'Nogales',
  'Quintero': 'Quintero', 'Puchuncaví': 'Puchuncaví',
  'San Antonio': 'San Antonio', 'Santo Domingo': 'Santo Domingo',
  'Cartagena': 'Cartagena', 'El Quisco': 'El Quisco', 'El Tabo': 'El Tabo',
  'Algarrobo': 'Algarrobo', 'San Felipe': 'San Felipe', 'Los Andes': 'Los Andes',
};

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
function normalizePlace(place) {
  return {
    name: place.displayName?.text || 'Sin nombre',
    commune: null, // se asigna por la comuna de la búsqueda
    category: null, // se asigna tras mapCategory
    address: place.formattedAddress || null,
    lat: place.location?.latitude || null,
    lon: place.location?.longitude || null,
    website: place.websiteUri || null,
    phone: place.nationalPhoneNumber || null,
    email: null, // Google no entrega email; se usa el dominio de la web si existe
    rating: place.rating != null ? Number(place.rating) : null,
    reviewCount: place.userRatingCount != null ? Number(place.userRatingCount) : null,
    googleMapsUri: place.googleMapsUri || null,
    sourceDetail: { googleType: place.primaryType, types: place.types || [] },
  };
}

/**
 * Descubre negocios reales en Google Places por rubros/comunas.
 * @param {object} opts
 * @param {string[]} [opts.categories] códigos de categoría interna
 * @param {string[]} [opts.communes] nombres de comuna (labels)
 * @param {number} [opts.limit]
 * @returns {Promise<object>} { discovered, errors }
 */
export async function runDiscovery({ campaignId, categories = null, communes = null, limit = 50, actorId = null } = {}) {
  if (!isGooglePlacesEnabled()) {
    return { discovered: [], errors: [{ error: 'Google Places no habilitado (falta GOOGLE_PLACES_API_KEY o ENABLE_GOOGLE_PLACES=true).' }] };
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const cats = (categories && categories.length ? categories : ALL_CATEGORIES)
    .filter(c => PLACE_SEARCH_PHRASES[c]);
  const coms = (communes && communes.length ? communes : Object.keys(COMMUNE_LABEL))
    .filter(c => COMMUNE_LABEL[c]);
  const cap = Math.min(Number(limit) || 50, 200);

  const discovered = [];
  const errors = [];
  const usedQueries = new Set();
  const cache = await coll(COLLECTIONS.PRO_PLACES_CACHE);
  const now = new Date();

  for (const cat of cats) {
    if (discovered.length >= cap) break;
    for (const phrase of PLACE_SEARCH_PHRASES[cat]) {
      if (discovered.length >= cap) break;
      for (const c of coms) {
        if (discovered.length >= cap) break;
        const query = `${phrase} en ${COMMUNE_LABEL[c]}, Chile`;
        if (usedQueries.has(query)) continue;
        usedQueries.add(query);

        let rows = [];
        try {
          const cached = await cache.findOne({ query, expiresAt: { $gt: now } });
          if (cached?.places) {
            rows = cached.places;
          } else {
            const body = {
              textQuery: query,
              languageCode: 'es',
              regionCode: 'CL',
              maxResultCount: 20,
            };
            // El mask de campos ES obligatorio en la New Places API (sin él, 400).
            const res = await fetch(API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': '*',
              },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              const txt = await res.text();
              errors.push({ query, status: res.status, error: txt.slice(0, 200) });
              continue;
            }
            const data = await res.json();
            rows = (data.places || []).map(normalizePlace);

            await cache.updateOne(
              { query },
              { $set: { places: rows, expiresAt: new Date(Date.now() + TTL_MS) } },
              { upsert: true },
            ).catch(() => {});
          }
        } catch (e) {
          errors.push({ query, error: String(e?.message || e) });
          continue;
        }

        for (const p of rows) {
          if (discovered.length >= cap) break;
          const catMapped = mapCategory(p) || cat;
          p.category = catMapped;
          p.commune = c;
          discovered.push(p);
        }
      }
    }
  }

  return { discovered, errors };
}

export default { runDiscovery, isGooglePlacesEnabled };
