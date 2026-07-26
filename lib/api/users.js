// /api/users — CRUD de usuarios (admins, operadores/cajeros, clientes)
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, ROLES, strip } from '@/lib/models';
import { json, err } from './_helpers';

const VALID_ROLES = Object.values(ROLES);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handleUsers(ctx) {
  const { method, route, request, db } = ctx;

  if (route !== '/users') return null;

  // GET /api/users?role=X
  if (method === 'GET') {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const q = role ? { role } : {};
    const rows = await db.collection(COLLECTIONS.USERS)
      .find(q, { projection: { passwordHash: 0 } })
      .sort({ fullName: 1 })
      .toArray();
    return json(strip(rows));
  }

  // POST /api/users — crear cajero/admin/cliente
  if (method === 'POST') {
    const body = await request.json();
    const { fullName, email, role, phone, rut, address } = body;

    if (!fullName?.trim()) return err('Nombre completo es obligatorio');
    if (!email?.trim()) return err('Email es obligatorio');
    if (!EMAIL_RE.test(email.trim())) return err('Email inválido');
    if (!VALID_ROLES.includes(role)) return err(`role inválido (usa: ${VALID_ROLES.join(', ')})`);

    const emailLower = email.trim().toLowerCase();
    const dup = await db.collection(COLLECTIONS.USERS).findOne({ email: emailLower });
    if (dup) return err('Ya existe un usuario con ese email', 409);

    const now = new Date();
    const doc = {
      id: uuidv4(),
      email: emailLower,
      passwordHash: '$2b$10$placeholder',   // sin auth real aún — futura Fase de login
      role,
      fullName: fullName.trim(),
      phone: (phone || '').trim(),
      rut: (rut || '').trim(),
      address: address || { street: '', comuna: '', city: '', region: '' },
      active: true,
      createdAt: now,
      lastLoginAt: null,
    };
    await db.collection(COLLECTIONS.USERS).insertOne(doc);
    const { passwordHash, ...clean } = doc;
    return json(strip(clean));
  }

  // PATCH /api/users
  if (method === 'PATCH') {
    const body = await request.json();
    if (!body.id) return err('id requerido');

    const update = {};
    const strFields = ['fullName', 'phone', 'rut'];
    for (const f of strFields) if (f in body) update[f] = String(body[f] || '').trim();
    if ('address' in body) update.address = body.address || { street: '', comuna: '', city: '', region: '' };
    if ('active' in body) update.active = !!body.active;

    if ('email' in body) {
      const em = String(body.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(em)) return err('Email inválido');
      const dup = await db.collection(COLLECTIONS.USERS).findOne({ email: em, id: { $ne: body.id } });
      if (dup) return err('Otro usuario ya usa ese email', 409);
      update.email = em;
    }
    if ('role' in body) {
      if (!VALID_ROLES.includes(body.role)) return err('role inválido');
      update.role = body.role;
    }

    if (Object.keys(update).length === 0) return err('nada que actualizar');

    const r = await db.collection(COLLECTIONS.USERS).updateOne({ id: body.id }, { $set: update });
    if (!r.matchedCount) return err('usuario no encontrado', 404);
    const updated = await db.collection(COLLECTIONS.USERS).findOne(
      { id: body.id }, { projection: { passwordHash: 0 } }
    );
    return json(strip(updated));
  }

  // DELETE /api/users
  if (method === 'DELETE') {
    const body = await request.json();
    if (!body.id) return err('id requerido');
    const user = await db.collection(COLLECTIONS.USERS).findOne({ id: body.id });
    if (!user) return err('usuario no encontrado', 404);

    // Proteger contra eliminar usuarios con sesiones POS o pedidos
    const posSessions = await db.collection(COLLECTIONS.POS_SESSIONS).countDocuments({ operatorId: body.id });
    if (posSessions > 0) {
      return err(`No se puede eliminar: tiene ${posSessions} sesión(es) POS asociada(s). Desactívalo (toggle active) para ocultarlo sin borrar historial.`, 409);
    }

    await db.collection(COLLECTIONS.USERS).deleteOne({ id: body.id });
    return json({ ok: true });
  }

  return null;
}
