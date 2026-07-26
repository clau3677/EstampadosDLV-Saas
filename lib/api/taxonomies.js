// /api/taxonomies GET · POST · PATCH · DELETE
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err, codify } from './_helpers';

const VALID_KINDS = ['product_category', 'supply_type', 'unit', 'supplier'];

export default async function handleTaxonomies(ctx) {
  const { method, route, db, request } = ctx;

  if (route !== '/taxonomies') return null;

  if (method === 'GET') {
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');
    const q = kind ? { kind } : {};
    const rows = await db.collection(COLLECTIONS.TAXONOMIES).find(q).sort({ label: 1 }).toArray();
    return json(strip(rows));
  }

  if (method === 'POST') {
    const { kind, code, label, extras } = await request.json();
    if (!kind || !label) return err('kind y label son requeridos');
    if (!VALID_KINDS.includes(kind)) return err('kind inválido');

    const finalCode = codify(code || label);
    const existing = await db.collection(COLLECTIONS.TAXONOMIES).findOne({ kind, code: finalCode });
    if (existing) return json({ error: 'Ya existe con ese código', existing: strip(existing) }, { status: 409 });

    const doc = { id: uuidv4(), kind, code: finalCode, label, extras: extras || {}, createdAt: new Date() };
    await db.collection(COLLECTIONS.TAXONOMIES).insertOne(doc);
    return json(strip(doc));
  }

  if (method === 'PATCH') {
    const { id, label, extras } = await request.json();
    if (!id) return err('id requerido');
    const updates = { updatedAt: new Date() };
    if (label !== undefined) updates.label = label;
    if (extras !== undefined) updates.extras = extras;
    await db.collection(COLLECTIONS.TAXONOMIES).updateOne({ id }, { $set: updates });
    return json({ ok: true });
  }

  if (method === 'DELETE') {
    const { id } = await request.json();
    if (!id) return err('id requerido');
    await db.collection(COLLECTIONS.TAXONOMIES).deleteOne({ id });
    return json({ ok: true });
  }

  return null;
}
