// /app/lib/api/design-library.js
// ============================================================================
// Endpoints /api/design-library/*
// Biblioteca de plantillas de diseño (imágenes pre-hechas del print shop)
// que los clientes pueden agregar directamente al Gang Sheet Builder.
//
// Collection: 'design_library'
// Documento: { id, name, imageUrl, srcWidthPx, srcHeightPx, tags[], active,
//              createdAt, updatedAt, uses (contador) }
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { strip } from '@/lib/models';
import { json, err } from './_helpers';

const COLLECTION = 'design_library';

export default async function handleDesignLibrary(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/design-library')) return null;

  // ---------------------------------------------------------------------------
  // GET /api/design-library?tag=X
  // Público — lista plantillas activas.
  // ---------------------------------------------------------------------------
  if (route === '/design-library' && method === 'GET') {
    const url = new URL(request.url);
    const tag = url.searchParams.get('tag');
    const filter = { active: { $ne: false } };
    if (tag) filter.tags = tag;
    const items = await db.collection(COLLECTION)
      .find(filter)
      .sort({ uses: -1, createdAt: -1 })
      .limit(200)
      .toArray();
    return json(strip(items));
  }

  // ---------------------------------------------------------------------------
  // POST /api/design-library
  // (Admin) Agrega una plantilla a la biblioteca.
  // Body: { name, imageUrl, srcWidthPx, srcHeightPx, tags?: string[] }
  // ---------------------------------------------------------------------------
  if (route === '/design-library' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { name, imageUrl, srcWidthPx, srcHeightPx, tags = [] } = body;
    if (!name || !imageUrl) return err('name e imageUrl son requeridos', 400);
    const now = new Date();
    const doc = {
      id: uuidv4(),
      name: String(name).slice(0, 100),
      imageUrl,
      srcWidthPx: Number(srcWidthPx) || 1000,
      srcHeightPx: Number(srcHeightPx) || 1000,
      tags: Array.isArray(tags) ? tags.map(String).slice(0, 10) : [],
      active: true,
      uses: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTION).insertOne(doc);
    return json(strip(doc));
  }

  // ---------------------------------------------------------------------------
  // PUT /api/design-library/:id
  // (Admin) Actualiza una plantilla.
  // ---------------------------------------------------------------------------
  const putMatch = route.match(/^\/design-library\/([a-f0-9-]+)$/);
  if (putMatch && method === 'PUT') {
    const id = putMatch[1];
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const allowed = ['name', 'imageUrl', 'srcWidthPx', 'srcHeightPx', 'tags', 'active'];
    const patch = {};
    for (const k of allowed) if (k in body) patch[k] = body[k];
    patch.updatedAt = new Date();
    const r = await db.collection(COLLECTION).updateOne({ id }, { $set: patch });
    if (r.matchedCount === 0) return err('no encontrado', 404);
    const updated = await db.collection(COLLECTION).findOne({ id });
    return json(strip(updated));
  }

  // ---------------------------------------------------------------------------
  // DELETE /api/design-library/:id
  // (Admin) Elimina una plantilla.
  // ---------------------------------------------------------------------------
  if (putMatch && method === 'DELETE') {
    const id = putMatch[1];
    const r = await db.collection(COLLECTION).deleteOne({ id });
    if (r.deletedCount === 0) return err('no encontrado', 404);
    return json({ ok: true, id });
  }

  // ---------------------------------------------------------------------------
  // POST /api/design-library/:id/use
  // Registra que se usó (incrementa contador — para ordenar por popularidad).
  // ---------------------------------------------------------------------------
  const useMatch = route.match(/^\/design-library\/([a-f0-9-]+)\/use$/);
  if (useMatch && method === 'POST') {
    const id = useMatch[1];
    await db.collection(COLLECTION).updateOne({ id }, { $inc: { uses: 1 } });
    return json({ ok: true });
  }

  return null;
}
