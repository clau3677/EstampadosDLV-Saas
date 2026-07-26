// ============================================================================
// /api/email/*  — Endpoints para configuración SMTP y envío manual
//
// Endpoints:
//   GET  /api/email/status        → configuración pública + verifyConnection()
//   POST /api/email/verify        → force verify (útil después de cambiar creds)
//   POST /api/email/send          → { to, subject, html?, text?, note? }
//   GET  /api/email/messages      → últimos emails registrados
// ============================================================================
import { json, err } from './_helpers';
import { getPublicConfig, verifyConnection } from '@/lib/email/client';
import { sendManualEmail, listRecentEmails } from '@/lib/email/notifications';

export default async function handleEmail(ctx) {
  const { method, route, request } = ctx;
  if (!route.startsWith('/email')) return null;

  if (route === '/email/status' && method === 'GET') {
    return json({ config: getPublicConfig() });
  }

  if (route === '/email/verify' && method === 'POST') {
    const res = await verifyConnection();
    return json(res);
  }

  if (route === '/email/send' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch { /* empty */ }
    const { to, subject, html, text, note } = body || {};
    if (!to) return err('to requerido');
    if (!subject) return err('subject requerido');
    if (!html && !text) return err('html o text requerido');

    const finalHtml = html || `<p style="font-family:sans-serif;">${String(text).replace(/\n/g, '<br>')}</p>`;
    const res = await sendManualEmail({ to, subject, html: finalHtml, text, note });
    if (!res.ok) return err(res.error || res.reason || 'no se pudo enviar', 400);
    return json(res);
  }

  if (route === '/email/messages' && method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const rows = await listRecentEmails(limit);
    return json(rows);
  }

  return null;
}
