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
      { url: `${base}/tienda`,      priority: 1.0, changeFrequency: 'daily',   lastModified: new Date() },
      { url: `${base}/gang-sheet`,  priority: 0.9, changeFrequency: 'weekly',  lastModified: new Date() },
      { url: `${base}/servicios`,   priority: 0.8, changeFrequency: 'weekly',  lastModified: new Date() },
      ...products.map(p => ({
        url: `${base}/producto/${p.slug}`,
        lastModified: p.updatedAt || p.createdAt,
        priority: 0.7,
        changeFrequency: 'weekly',
      })),
      ...landings.map(l => ({
        url: `${base}/servicios/${l.slug}`,
        lastModified: l.updatedAt || l.createdAt,
        priority: 0.9,
        changeFrequency: 'monthly',
      })),
    ];
  } catch (e) {
    return [
      { url: `${base}/tienda`,     priority: 1.0, changeFrequency: 'daily' },
      { url: `${base}/gang-sheet`, priority: 0.9, changeFrequency: 'weekly' },
    ];
  }
}
