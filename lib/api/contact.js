// /api/contact — Formulario público de contacto. Envía email al taller usando el SMTP configurado.
import { v4 as uuidv4 } from 'uuid';
import { json, err } from './_helpers';
import { sendMail, isConfigured } from '@/lib/email/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limiting rústico en memoria (por IP)
const rateBucket = new Map();
const RATE_LIMIT = 5;               // máx envios
const RATE_WINDOW = 60 * 60 * 1000; // 1h

function ipFromRequest(request) {
  const h = request.headers;
  return h.get('x-forwarded-for')?.split(',')[0].trim()
      || h.get('x-real-ip')
      || 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateBucket.get(ip) || [];
  const recent = bucket.filter(t => now - t < RATE_WINDOW);
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  rateBucket.set(ip, recent);
  return true;
}

function escape(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEmailHtml({ name, email, phone, subject, message, referrer }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:auto;background:#f8fafc;padding:20px;">
    <div style="background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <div style="background:linear-gradient(135deg,#f97316,#e11d48);border-radius:10px;padding:16px;color:white;margin-bottom:20px;">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;opacity:.85;">Nuevo mensaje</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">Formulario de Contacto · Web</div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#1e293b;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;width:120px;font-weight:600;">Nombre</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">${escape(name)}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:600;">Email</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;"><a href="mailto:${escape(email)}" style="color:#e11d48;text-decoration:none;">${escape(email)}</a></td>
        </tr>
        ${phone ? `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:600;">Teléfono</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;"><a href="tel:${escape(phone)}" style="color:#e11d48;text-decoration:none;">${escape(phone)}</a></td>
        </tr>` : ''}
        ${subject ? `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-weight:600;">Asunto</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">${escape(subject)}</td>
        </tr>` : ''}
      </table>

      <div style="margin-top:20px;background:#f8fafc;border-left:3px solid #f97316;padding:16px;border-radius:6px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;margin-bottom:8px;font-weight:600;">Mensaje</div>
        <div style="white-space:pre-wrap;color:#1e293b;line-height:1.6;">${escape(message)}</div>
      </div>

      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
        Enviado desde estampadosdlv.cl${referrer ? ` · ${escape(referrer)}` : ''} · ${new Date().toLocaleString('es-CL')}
      </div>

      <div style="margin-top:20px;text-align:center;">
        <a href="mailto:${escape(email)}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#e11d48);color:white;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">Responder al cliente</a>
      </div>
    </div>
  </div>`;
}

export default async function handleContact(ctx) {
  const { method, route, request, db } = ctx;

  // Solo POST /api/contact
  if (route !== '/contact' || method !== 'POST') return null;

  // Rate limiting
  const ip = ipFromRequest(request);
  if (!checkRateLimit(ip)) {
    return err('Demasiados envíos desde tu conexión. Intenta más tarde.', 429);
  }

  let body = {};
  try { body = await request.json(); } catch { /* empty */ }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  const referrer = String(body.referrer || '').trim();
  // Honeypot anti-bot: si viene relleno, silenciosamente respondemos ok pero no enviamos
  const honeypot = String(body.website || '').trim();

  if (!name) return err('El nombre es obligatorio');
  if (!EMAIL_RE.test(email)) return err('Email inválido');
  if (message.length < 10) return err('El mensaje debe tener al menos 10 caracteres');
  if (message.length > 3000) return err('El mensaje es demasiado largo (máx 3000 caracteres)');

  // Bot detected — succeed silently
  if (honeypot) {
    return json({ ok: true, delivered: false, silent: true });
  }

  // Log a la BD (para historial de mensajes de contacto)
  const contactLog = {
    id: uuidv4(),
    name, email, phone, subject, message, referrer, ip,
    createdAt: new Date(),
    status: 'received',
  };

  try {
    await db.collection('contact_messages').insertOne(contactLog);
  } catch (e) {
    console.warn('[contact] cannot persist log:', e.message);
  }

  // Send email
  if (!isConfigured()) {
    // Guardar como pending; no fallar
    try {
      await db.collection('contact_messages').updateOne(
        { id: contactLog.id }, { $set: { status: 'smtp_not_configured' } }
      );
    } catch { /* empty */ }
    return json({ ok: true, delivered: false, reason: 'smtp_not_configured' });
  }

  try {
    const to = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const emailSubject = subject
      ? `[Contacto Web] ${subject} — ${name}`
      : `[Contacto Web] Nuevo mensaje de ${name}`;

    const html = buildEmailHtml({ name, email, phone, subject, message, referrer });
    const text = `Nuevo mensaje del sitio\n\nDe: ${name} <${email}>${phone ? `\nTel: ${phone}` : ''}${subject ? `\nAsunto: ${subject}` : ''}\n\n${message}\n\n---\nRecibido: ${new Date().toLocaleString('es-CL')}`;

    const res = await sendMail({
      to,
      subject: emailSubject,
      html,
      text,
      replyTo: `${name} <${email}>`,
    });

    try {
      await db.collection('contact_messages').updateOne(
        { id: contactLog.id },
        { $set: { status: 'sent', messageId: res?.messageId, sentAt: new Date() } }
      );
    } catch { /* empty */ }

    return json({ ok: true, delivered: true });
  } catch (e) {
    console.error('[contact] send failed:', e.message);
    try {
      await db.collection('contact_messages').updateOne(
        { id: contactLog.id }, { $set: { status: 'failed', error: e.message } }
      );
    } catch { /* empty */ }
    return err('No pudimos enviar tu mensaje. Intenta por WhatsApp o teléfono.', 500);
  }
}
