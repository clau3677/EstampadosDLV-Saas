// SEO: sitemap.xml dinámico
// Next.js 13+ genera automáticamente /sitemap.xml a partir de este export.

import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/models';

export default async function sitemap() {
  const base = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

  try {
    const db = await getDb();
    const [products, landings] = await Promise.all([
      db.collection(COLLECTIONS.PRODUCTS).find({ active: { $ne: false } }).toArray(),
      db.collection(COLLECTIONS.LANDING_PAGES).find({ active: true }).toArray(),
    ]);

    return [
      // Página principal — la más importante
      { url: `${base}/`,               priority: 1.0, changeFrequency: 'weekly',  lastModified: new Date() },
      { url: `${base}/tienda`,         priority: 0.95, changeFrequency: 'daily',   lastModified: new Date() },
      { url: `${base}/gang-sheet`,     priority: 0.9, changeFrequency: 'weekly',  lastModified: new Date() },
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
  } catch (e) {
    return [
      { url: `${base}/`,           priority: 1.0, changeFrequency: 'weekly' },
      { url: `${base}/tienda`,     priority: 0.95, changeFrequency: 'daily' },
      { url: `${base}/gang-sheet`, priority: 0.9, changeFrequency: 'weekly' },
      { url: `${base}/mockup`,     priority: 0.9, changeFrequency: 'weekly' },
      { url: `${base}/servicios`,  priority: 0.85, changeFrequency: 'weekly' },
      { url: `${base}/blog`,          priority: 0.9, changeFrequency: "weekly",  lastModified: new Date() },
      ...require("../lib/blog-data").articles.map(a => ({ url: `${base}/blog/${a.slug}`, lastModified: a.date, priority: 0.85, changeFrequency: "monthly" })),
      { url: `${base}/contacto`,   priority: 0.8, changeFrequency: 'monthly' },
    ];
  }
}
