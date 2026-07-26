// /api/landings GET · POST · PATCH · DELETE — Landings SEO dinámicas
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';

const SLUG_RE = /^[a-z0-9-]+$/;

export default async function handleLandings(ctx) {
  const { method, route, db, request } = ctx;

  if (route !== '/landings') return null;

  if (method === 'GET') {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('active') === 'true';
    const q = activeOnly ? { active: true } : {};
    const rows = await db.collection(COLLECTIONS.LANDING_PAGES).find(q).sort({ createdAt: -1 }).toArray();
    return json(strip(rows));
  }

  if (method === 'POST') {
    const body = await request.json();
    const slug = (body.slug || '').trim().toLowerCase();
    if (!slug || !body.h1) return err('slug y h1 son obligatorios');
    if (!SLUG_RE.test(slug)) return err('slug inválido (usa a-z, 0-9, guiones)');
    const dup = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ slug });
    if (dup) return err('Ya existe una landing con ese slug', 409);
    const doc = {
      id: uuidv4(),
      slug,
      service: body.service || 'general',
      location: body.location || null,
      h1: body.h1,
      intro: body.intro || '',
      body: body.body || '',
      ctaText: body.ctaText || 'Cotiza tu diseño',
      metaTitle: body.metaTitle || '',
      metaDescription: body.metaDescription || '',
      ogImage: body.ogImage || '',
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      featuredProductIds: Array.isArray(body.featuredProductIds) ? body.featuredProductIds : [],
      active: body.active !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection(COLLECTIONS.LANDING_PAGES).insertOne(doc);
    return json(strip(doc));
  }

  if (method === 'PATCH') {
    const body = await request.json();
    if (!body.id) return err('id requerido');
    const update = { updatedAt: new Date() };
    const allowed = ['slug', 'service', 'location', 'h1', 'intro', 'body', 'ctaText',
                     'metaTitle', 'metaDescription', 'ogImage', 'keywords',
                     'featuredProductIds', 'active'];
    for (const k of allowed) if (k in body) update[k] = body[k];
    if (update.slug) {
      const s = String(update.slug).trim().toLowerCase();
      if (!SLUG_RE.test(s)) return err('slug inválido');
      update.slug = s;
      const dup = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ slug: s, id: { $ne: body.id } });
      if (dup) return err('slug ya usado', 409);
    }
    const r = await db.collection(COLLECTIONS.LANDING_PAGES).updateOne({ id: body.id }, { $set: update });
    if (!r.matchedCount) return err('no encontrado', 404);
    const updated = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ id: body.id });
    return json(strip(updated));
  }

  if (method === 'DELETE') {
    const body = await request.json();
    if (!body.id) return err('id requerido');
    const r = await db.collection(COLLECTIONS.LANDING_PAGES).deleteOne({ id: body.id });
    if (!r.deletedCount) return err('no encontrado', 404);
    return json({ ok: true });
  }

  return null;
}
