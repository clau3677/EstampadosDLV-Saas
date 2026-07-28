// =============================================================================
// Datos de tienda del lado del servidor (SSR/ISR) — Auditoría jul-2026
// -----------------------------------------------------------------------------
// La tienda pública era 100% client-side (SWR), por lo que Google indexaba
// un HTML sin productos. Estas funciones consultan MongoDB directamente en
// Server Components, con caché en memoria de 60s para no golpear la DB en
// cada request de bot/usuario.
// =============================================================================
import { getDb } from '@/lib/mongo';
import { COLLECTIONS, strip } from '@/lib/models';

const TTL_MS = 60 * 1000;
const cache = { products: { data: null, at: 0 }, taxonomies: { data: null, at: 0 } };

export async function getPublicProducts() {
  const now = Date.now();
  if (cache.products.data && now - cache.products.at < TTL_MS) return cache.products.data;
  try {
    const db = await getDb();
    const items = await db.collection(COLLECTIONS.PRODUCTS)
      .find({ active: { $ne: false } })
      .sort({ createdAt: -1 })
      .toArray();
    const data = strip(items);
    cache.products = { data, at: now };
    return data;
  } catch (e) {
    // Nunca romper el render público por un fallo de DB.
    console.error('[store-data] getPublicProducts failed:', e.message);
    return cache.products.data || [];
  }
}

export async function getPublicProductBySlug(slug) {
  const products = await getPublicProducts();
  return products.find(p => p.slug === slug) || null;
}

export async function getProductCategories() {
  const now = Date.now();
  if (cache.taxonomies.data && now - cache.taxonomies.at < TTL_MS) return cache.taxonomies.data;
  try {
    const db = await getDb();
    const items = await db.collection(COLLECTIONS.TAXONOMIES)
      .find({ kind: 'product_category' })
      .sort({ order: 1 })
      .toArray();
    const data = strip(items);
    cache.taxonomies = { data, at: now };
    return data;
  } catch (e) {
    console.error('[store-data] getProductCategories failed:', e.message);
    return cache.taxonomies.data || [];
  }
}
