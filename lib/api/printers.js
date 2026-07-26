// /api/printers GET · POST · PATCH · DELETE — Equipos configurables
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';

const CODE_RE = /^[a-z0-9_-]+$/;

export default async function handlePrinters(ctx) {
  const { method, route, db, request } = ctx;

  if (route !== '/printers') return null;

  if (method === 'GET') {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('active') === 'true';
    const q = activeOnly ? { active: true } : {};
    const rows = await db.collection(COLLECTIONS.PRINTERS)
      .find(q).sort({ sortOrder: 1, createdAt: 1 }).toArray();
    return json(strip(rows));
  }

  if (method === 'POST') {
    const body = await request.json();
    const code = (body.code || '').trim().toLowerCase();
    if (!code || !body.label) return err('code y label son obligatorios');
    if (!CODE_RE.test(code)) return err('code inválido (usa a-z, 0-9, guion, guion bajo)');
    const dup = await db.collection(COLLECTIONS.PRINTERS).findOne({ code });
    if (dup) return err('ya existe un equipo con ese code', 409);

    const type = body.type === 'dtf_uv' ? 'dtf_uv' : 'dtf_textil';
    const widthMm = Number.parseInt(body.widthMm, 10);
    if (!widthMm || widthMm < 50 || widthMm > 2000) return err('widthMm inválido (rango 50–2000)');
    const pricePerMm = Number.parseInt(body.pricePerMm, 10);
    if (!pricePerMm || pricePerMm < 1) return err('pricePerMm inválido (CLP por mm, > 0)');

    const now = new Date();
    const doc = {
      id: uuidv4(),
      code,
      label: body.label,
      shortLabel: body.shortLabel || body.label,
      type,
      widthMm,
      dpi: Number.parseInt(body.dpi, 10) || 300,
      supportsWhite: body.supportsWhite !== false,
      supportsVarnish: type === 'dtf_uv' ? !!body.supportsVarnish : false,
      pricePerMm,
      minLengthMm: Number.parseInt(body.minLengthMm, 10) || 100,
      dailyCapacityM: Math.max(0, Number.parseInt(body.dailyCapacityM, 10) || 0),
      color: body.color || 'from-slate-500 to-slate-700',
      notes: body.notes || '',
      active: body.active !== false,
      sortOrder: Number.parseInt(body.sortOrder, 10) || 99,
      createdAt: now, updatedAt: now,
    };
    await db.collection(COLLECTIONS.PRINTERS).insertOne(doc);
    return json(strip(doc));
  }

  if (method === 'PATCH') {
    const body = await request.json();
    if (!body.id) return err('id requerido');
    const update = { updatedAt: new Date() };
    const strFields = ['label', 'shortLabel', 'color', 'notes'];
    const numFields = ['widthMm', 'dpi', 'pricePerMm', 'minLengthMm', 'dailyCapacityM', 'sortOrder'];
    const boolFields = ['supportsWhite', 'supportsVarnish', 'active'];

    for (const k of strFields) if (k in body) update[k] = String(body[k] || '');
    for (const k of numFields) if (k in body) {
      const n = Number.parseInt(body[k], 10);
      if (Number.isNaN(n)) return err(`${k} inválido`);
      update[k] = n;
    }
    for (const k of boolFields) if (k in body) update[k] = !!body[k];

    if ('type' in body) {
      const t = body.type === 'dtf_uv' ? 'dtf_uv' : 'dtf_textil';
      update.type = t;
      if (t !== 'dtf_uv') update.supportsVarnish = false;
    }
    if ('code' in body) {
      const c = String(body.code || '').trim().toLowerCase();
      if (!CODE_RE.test(c)) return err('code inválido');
      const dup = await db.collection(COLLECTIONS.PRINTERS).findOne({ code: c, id: { $ne: body.id } });
      if (dup) return err('code ya usado', 409);
      update.code = c;
    }
    if (update.widthMm !== undefined && (update.widthMm < 50 || update.widthMm > 2000)) {
      return err('widthMm fuera de rango 50–2000');
    }

    const r = await db.collection(COLLECTIONS.PRINTERS).updateOne({ id: body.id }, { $set: update });
    if (!r.matchedCount) return err('no encontrado', 404);
    const updated = await db.collection(COLLECTIONS.PRINTERS).findOne({ id: body.id });
    return json(strip(updated));
  }

  if (method === 'DELETE') {
    const body = await request.json();
    if (!body.id) return err('id requerido');
    const printer = await db.collection(COLLECTIONS.PRINTERS).findOne({ id: body.id });
    if (!printer) return err('no encontrado', 404);
    const inUse = await db.collection(COLLECTIONS.PRODUCTION_QUEUE)
      .countDocuments({ printer: printer.code });
    if (inUse > 0) {
      return err(`No se puede eliminar: el equipo tiene ${inUse} trabajo(s) en cola. Desactívalo (toggle) o mueve los trabajos primero.`, 409);
    }
    await db.collection(COLLECTIONS.PRINTERS).deleteOne({ id: body.id });
    return json({ ok: true });
  }

  return null;
}
