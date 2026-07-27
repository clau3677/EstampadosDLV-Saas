// /api/auth/* — Login, registro, logout, sesión actual.
import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { COLLECTIONS, ROLES, strip } from '@/lib/models';
import { json, err, cors } from './_helpers';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { getUserFromRequest, buildAuthCookie, clearAuthCookie } from '@/lib/auth/session';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, _id, ...rest } = u;
  return rest;
}

function responseWithCookie(data, cookieStr, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.append('Set-Cookie', cookieStr);
  return cors(res);
}

export default async function handleAuth(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/auth')) return null;

  const users = db.collection(COLLECTIONS.USERS);

  // ---------------------------------------------------------------------
  // POST /api/auth/login   { email, password }
  // ---------------------------------------------------------------------
  if (route === '/auth/login' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!EMAIL_RE.test(email)) return err('Email inválido');
    if (!password) return err('Contraseña requerida');

    const user = await users.findOne({ email });
    if (!user) return err('Credenciales incorrectas', 401);
    if (user.active === false) return err('Usuario desactivado', 403);

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return err('Credenciales incorrectas', 401);

    // Update last login
    await users.updateOne({ id: user.id }, { $set: { lastLoginAt: new Date() } });

    const token = signToken({
      id: user.id, email: user.email, role: user.role, fullName: user.fullName,
    });
    return responseWithCookie(
      { ok: true, user: publicUser(user), token },
      buildAuthCookie(token),
    );
  }

  // ---------------------------------------------------------------------
  // POST /api/auth/register   { fullName, email, password, phone?, rut? }
  // Solo crea cuentas de rol 'customer'. Admin/operator se crean vía /api/users.
  // ---------------------------------------------------------------------
  if (route === '/auth/register' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const phone = String(body.phone || '').trim();
    const rut = String(body.rut || '').trim();

    if (!fullName) return err('Nombre completo es obligatorio');
    if (!EMAIL_RE.test(email)) return err('Email inválido');
    if (password.length < 6) return err('La contraseña debe tener al menos 6 caracteres');

    const dup = await users.findOne({ email });
    if (dup) return err('Ya existe una cuenta con ese email. Inicia sesión.', 409);

    const passwordHash = await hashPassword(password);
    const doc = {
      id: uuidv4(),
      email,
      passwordHash,
      role: ROLES.CUSTOMER,
      fullName,
      phone,
      rut,
      address: { street: '', comuna: '', city: '', region: '' },
      active: true,
      createdAt: new Date(),
      lastLoginAt: new Date(),
    };
    await users.insertOne(doc);

    // Auto-login
    const token = signToken({ id: doc.id, email: doc.email, role: doc.role, fullName: doc.fullName });
    return responseWithCookie(
      { ok: true, user: publicUser(doc), token },
      buildAuthCookie(token),
    );
  }

  // ---------------------------------------------------------------------
  // POST /api/auth/logout
  // ---------------------------------------------------------------------
  if (route === '/auth/logout' && method === 'POST') {
    return responseWithCookie({ ok: true }, clearAuthCookie());
  }

  // ---------------------------------------------------------------------
  // GET /api/auth/me
  // ---------------------------------------------------------------------
  if (route === '/auth/me' && method === 'GET') {
    const payload = getUserFromRequest(request);
    if (!payload) return json({ user: null }, { status: 200 });
    // Traer datos frescos de la BD (email/rol pueden haber cambiado)
    const fresh = await users.findOne({ id: payload.id });
    if (!fresh || fresh.active === false) return json({ user: null });
    return json({ user: strip(publicUser(fresh)) });
  }

  // ---------------------------------------------------------------------
  // PATCH /api/auth/me    (update own profile)
  // Permite: fullName, phone, rut, address
  // ---------------------------------------------------------------------
  if (route === '/auth/me' && method === 'PATCH') {
    const payload = getUserFromRequest(request);
    if (!payload) return err('No autenticado', 401);

    let body = {};
    try { body = await request.json(); } catch { /* empty */ }

    const update = {};
    for (const f of ['fullName', 'phone', 'rut']) {
      if (f in body) update[f] = String(body[f] || '').trim();
    }
    if ('address' in body) update.address = body.address || { street: '', comuna: '', city: '', region: '' };

    if (Object.keys(update).length === 0) return err('nada que actualizar');

    await users.updateOne({ id: payload.id }, { $set: update });
    const fresh = await users.findOne({ id: payload.id });
    return json({ ok: true, user: strip(publicUser(fresh)) });
  }

  // ---------------------------------------------------------------------
  // POST /api/auth/change-password   { currentPassword, newPassword }
  // ---------------------------------------------------------------------
  if (route === '/auth/change-password' && method === 'POST') {
    const payload = getUserFromRequest(request);
    if (!payload) return err('No autenticado', 401);

    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');

    if (newPassword.length < 6) return err('La nueva contraseña debe tener al menos 6 caracteres');

    const user = await users.findOne({ id: payload.id });
    if (!user) return err('Usuario no encontrado', 404);

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return err('La contraseña actual es incorrecta', 401);

    const passwordHash = await hashPassword(newPassword);
    await users.updateOne({ id: user.id }, { $set: { passwordHash } });
    return json({ ok: true });
  }

  // ---------------------------------------------------------------------
  // POST /api/auth/bootstrap  (idempotent — asegura que existe el admin)
  // No requiere autenticación. Útil para inicializar sistemas nuevos.
  // Si ya existe un admin, retorna sin cambios.
  // ---------------------------------------------------------------------
  if (route === '/auth/bootstrap' && method === 'POST') {
    const existingAdmin = await users.findOne({ role: ROLES.ADMIN });
    if (existingAdmin) {
      return json({ ok: true, created: false, adminEmail: existingAdmin.email });
    }
    const passwordHash = await hashPassword('EstampadosDLV2025!');
    const doc = {
      id: uuidv4(),
      email: 'estampadosdlv@gmail.com',
      passwordHash,
      role: ROLES.ADMIN,
      fullName: 'Administrador Estampados DLV',
      phone: '+56912345678',
      rut: '',
      address: { street: 'Galleguillos 1870', comuna: 'Quilpué', city: 'Quilpué', region: 'Valparaíso' },
      active: true,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    await users.insertOne(doc);
    return json({ ok: true, created: true, adminEmail: doc.email });
  }

  return null;
}
