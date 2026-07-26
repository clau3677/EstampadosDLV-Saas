// ============================================================================
// Cliente SMTP — Nodemailer singleton
//
// Usa `globalThis.__mailer` para reutilizar el transporter entre invocaciones
// de rutas API (Next.js reutiliza el mismo Node process).
//
// Variables .env requeridas:
//   SMTP_HOST         (ej smtp.gmail.com)
//   SMTP_PORT         (465 = SSL, 587 = STARTTLS)
//   SMTP_SECURE       ('true' para 465, 'false' para 587)
//   SMTP_USER         cuenta que envía
//   SMTP_PASS         App Password (Gmail requiere App Password, no la clave normal)
//   SMTP_FROM_NAME    ej "Estampados DLV"
//   SMTP_FROM_EMAIL   ej "estampadosdlv@gmail.com"
// ============================================================================
import nodemailer from 'nodemailer';

function config() {
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: (process.env.SMTP_SECURE || 'true') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Estampados DLV',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '',
  };
}

/** Verifica si SMTP está configurado */
export function isConfigured() {
  const c = config();
  return !!(c.host && c.user && c.pass && c.fromEmail);
}

/** Retorna { host, port, secure, user, fromName, fromEmail } SIN password */
export function getPublicConfig() {
  const c = config();
  return {
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    fromName: c.fromName,
    fromEmail: c.fromEmail,
    configured: isConfigured(),
  };
}

function buildTransporter() {
  const c = config();
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    // Pool activo → reutiliza conexiones TCP (más eficiente para bursts)
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  });
}

/** Devuelve (crea si no existe) el transporter singleton */
export function getTransporter() {
  if (!globalThis.__mailer) {
    globalThis.__mailer = buildTransporter();
  }
  return globalThis.__mailer;
}

/** Verifica conexión con el servidor SMTP (útil para health-check) */
export async function verifyConnection() {
  if (!isConfigured()) {
    return { ok: false, error: 'SMTP no configurado (faltan variables en .env)' };
  }
  try {
    const t = getTransporter();
    await t.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Envía un email. Lanza si falla.
 * @param {Object} params
 * @param {string} params.to      destinatario
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string} [params.text]  fallback plain text
 * @returns {Promise<{ messageId, accepted, rejected }>}
 */
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!isConfigured()) throw new Error('SMTP no configurado');
  const c = config();
  const t = getTransporter();
  const info = await t.sendMail({
    from: `"${c.fromName}" <${c.fromEmail}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''),
    replyTo: replyTo || c.fromEmail,
  });
  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  };
}
