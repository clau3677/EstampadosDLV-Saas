// SEO: sitemap.xml dinámico
// Next.js 13+ genera automáticamente /sitemap.xml a partir de este export.

import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/models';

// Forzar ejecución dinámica en cada petición (ISR de 1h) para que
// productos y landings se incluyan siempre actualizados.
export const revalidate = 3600;

export default async function sitemap() {
  const base = 'https://estampadosdlv.com';

  let products = [];
  let landings = [];
  try {
    const db = await getDb();
    [products, landings] = await Promise.all([
      db.collection('products').find({ active: { $ne: false } }).toArray(),
      db.collection('landing_pages').find({ active: true }).toArray(),
    ]);
  } catch (e) {
    // El sitemap nunca debe fallar: si la DB no responde, devolvemos las
    // páginas estáticas y logueamos el error para diagnóstico.
    console.error('[sitemap] error DB:', e && (e.message || e));
  }

    return [
      // Página principal — la más importante
      { url: `${base}/`,               priority: 1.0, changeFrequency: 'weekly',  lastModified: new Date() },
      { url: `${base}/tienda`,         priority: 0.95, changeFrequency: 'daily',   lastModified: new Date() },
      { url: `${base}/gang-sheet-info`,     priority: 0.9, changeFrequency: 'weekly',  lastModified: new Date() },
      { url: `${base}/mockup`,         priority: 0.9, changeFrequency: 'weekly',  lastModified: new Date() },
      { url: `${base}/servicios`,      priority: 0.85, changeFrequency: 'weekly',  lastModified: new Date() },
      { url: `${base}/blog`,          priority: 0.9, changeFrequency: "weekly",  lastModified: new Date() },
      ...require("../lib/blog-data").articles.map(a => ({ url: `${base}/blog/${a.slug}`, lastModified: a.date, priority: 0.85, changeFrequency: "monthly" })),
      { url: `${base}/contacto`,       priority: 0.8, changeFrequency: 'monthly', lastModified: new Date() },
      
      // Productos — alta prioridad para indexación
      ...products.map(p => ({
        url: `${base}/producto/${p.slug}`,
        lastModified: p.updatedAt || p.createdAt,
        priority: 0.8,
        changeFrequency: 'weekly',
      })),
      
      // Landings de servicios — SEO local
      ...landings.map(l => ({
        url: `${base}/servicios/${l.slug}`,
        lastModified: l.updatedAt || l.createdAt,
        priority: 0.85,
        changeFrequency: 'monthly',
      })),
    ];
}
