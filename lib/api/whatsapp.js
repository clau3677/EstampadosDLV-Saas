// ============================================================================
// /api/whatsapp/*  — Endpoints para gestionar la sesión Baileys
//
// Endpoints:
//   GET  /api/whatsapp/status        → estado actual (state, qr, user)
//   POST /api/whatsapp/connect       → inicia (o reintenta) la conexión
//   POST /api/whatsapp/logout        → cierra sesión y limpia credenciales
//   POST /api/whatsapp/send          → { phone, text } — envío manual/test
//   GET  /api/whatsapp/messages      → últimos mensajes registrados
// ============================================================================
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import { getStatus, startConnection, logout } from '@/lib/whatsapp/client';
import { sendManualMessage, listRecentMessages } from '@/lib/whatsapp/notifications';

export default async function handleWhatsapp(ctx) {
  const { method, route, request } = ctx;
  if (!route.startsWith('/whatsapp')) return null;

  const user = getUserFromRequest(request);
  if (!user || !['admin', 'operator'].includes(user.role)) return err('No autorizado', 403);

  if (route === '/whatsapp/status' && method === 'GET') {
    return json(getStatus());
  }

  if (route === '/whatsapp/connect' && method === 'POST') {
    const s = await startConnection();
    return json(s);
  }

  if (route === '/whatsapp/logout' && method === 'POST') {
    const s = await logout();
    return json(s);
  }

  if (route === '/whatsapp/send' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty body */ }
    const { phone, text, note } = body || {};
    if (!phone) return err('phone requerido');
    if (!text) return err('text requerido');
    const res = await sendManualMessage({ phone, text, note });
    if (!res.ok) return err(res.error || res.reason || 'no se pudo enviar', 400);
    return json(res);
  }

  if (route === '/whatsapp/messages' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const rows = await listRecentMessages(limit);
    return json(rows);
  }

  return null;
}
