// /app/lib/api/design-library.js
// ============================================================================
// Endpoints /api/design-library/*
// Biblioteca de plantillas de diseño (imágenes pre-hechas del print shop)
// que los clientes pueden agregar directamente al Gang Sheet Builder.
//
// v2 — optimización para 4,648+ imágenes:
//   GET /api/design-library?tag=X&folder=Y&search=Z&page=1&size=48
//     → paginación server-side
//     → filtro por carpeta de Drive (driveFolderName)
//     → búsqueda por nombre
//     → devuelve { items, total, page, size, totalPages, folders }
//
// Collection: 'design_library'
// Documento: { id, name, imageUrl, srcWidthPx, srcHeightPx, tags[], active,
//              source, driveFileId, driveFolderId, driveFolderName,
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
  // GET /api/design-library?tag=X&folder=Y&search=Z&page=1&size=48
  // Público — lista plantillas activas con paginación server-side.
  // Si no hay page/size, cae al modo legacy (200 items) para compatibilidad.
  // ---------------------------------------------------------------------------
  if (route === '/design-library' && method === 'GET') {
    const url = new URL(request.url);
    const tag = url.searchParams.get('tag');
    const folder = url.searchParams.get('folder');
    const search = url.searchParams.get('search');
    const pageParam = url.searchParams.get('page');
    const sizeParam = url.searchParams.get('size');

    const isPaginated = pageParam !== null || sizeParam !== null;
    const page = Math.max(1, parseInt(pageParam || '1', 10));
    const size = Math.min(100, Math.max(10, parseInt(sizeParam || '200', 10)));

    const filter = { active: { $ne: false } };
    if (tag) filter.tags = tag;
    if (folder) filter.driveFolderName = folder;
    if (search) filter.name = { $regex: search, $options: 'i' };

    // Carpetas únicas con conteo (para selector de carpetas en UI)
    const folderStats = await db.collection(COLLECTION).aggregate([
      { $match: { active: { $ne: false } } },
      {
        $group: { _id: '$driveFolderName', count: { $sum: 1 } },
      },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]).toArray();
    const folders = folderStats.map(f => ({ name: f._id || 'Sin carpeta', count: f.count }));

    // Total de items que matchean
    const total = await db.collection(COLLECTION).countDocuments(filter);

    if (isPaginated) {
      const skip = (page - 1) * size;
      const items = await db.collection(COLLECTION)
        .find(filter)
        .sort({ uses: -1, createdAt: -1 })
        .skip(skip)
        .limit(size)
        .toArray();
      return json({ items: strip(items), total, page, size, totalPages: Math.ceil(total / size), folders });
    }

    // Legacy: 200 items sin paginación
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

  // ---------------------------------------------------------------------------
  // POST /api/design-library/bulk
  // (Admin) Upload manual masivo: recibe array de items ya subidos previamente
  // (vía /api/uploads que ya existe) y los inserta en la biblioteca.
  // Body: { items: [{ name, imageUrl, srcWidthPx, srcHeightPx, tags? }] }
  // ---------------------------------------------------------------------------
  if (route === '/design-library/bulk' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return err('items requerido (array no vacío)', 400);

    const now = new Date();
    const docs = items
      .filter(it => it.name && it.imageUrl)
      .map(it => ({
        id: uuidv4(),
        name: String(it.name).slice(0, 100),
        imageUrl: String(it.imageUrl),
        srcWidthPx: Number(it.srcWidthPx) || 1000,
        srcHeightPx: Number(it.srcHeightPx) || 1000,
        tags: Array.isArray(it.tags) ? it.tags.map(String).slice(0, 10) : [],
        active: true,
        uses: 0,
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      }));

    if (docs.length === 0) return err('ningún item válido (name + imageUrl requeridos)', 400);
    await db.collection(COLLECTION).insertMany(docs);
    return json({ ok: true, inserted: docs.length, items: strip(docs) });
  }

  // ---------------------------------------------------------------------------
  // POST /api/design-library/bulk-delete
  // Body: { ids: string[] }
  // ---------------------------------------------------------------------------
  if (route === '/design-library/bulk-delete' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) return err('ids requerido', 400);
    const r = await db.collection(COLLECTION).deleteMany({ id: { $in: ids } });
    return json({ ok: true, deleted: r.deletedCount });
  }

  // ---------------------------------------------------------------------------
  // GET /api/design-library/stats
  // Retorna estadísticas globales de uso y por tag.
  // ---------------------------------------------------------------------------
  if (route === '/design-library/stats' && method === 'GET') {
    const [totalActive, totalInactive, drive, manual, byTag, topUsed] = await Promise.all([
      db.collection(COLLECTION).countDocuments({ active: { $ne: false } }),
      db.collection(COLLECTION).countDocuments({ active: false }),
      db.collection(COLLECTION).countDocuments({ source: 'drive' }),
      db.collection(COLLECTION).countDocuments({ source: 'manual' }),
      db.collection(COLLECTION).aggregate([
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 20 },
      ]).toArray(),
      db.collection(COLLECTION).find({ uses: { $gt: 0 } })
        .sort({ uses: -1 }).limit(10)
        .project({ id: 1, name: 1, imageUrl: 1, uses: 1 }).toArray(),
    ]);

    const totalUses = topUsed.reduce((acc, r) => acc + (r.uses || 0), 0);
    return json({
      totalActive, totalInactive,
      totalItems: totalActive + totalInactive,
      bySource: { drive, manual },
      byTag: byTag.map(t => ({ tag: t._id, count: t.count })),
      topUsed: strip(topUsed),
      totalUses,
    });
  }

  return null;
}
