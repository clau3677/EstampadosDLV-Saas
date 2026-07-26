// ============================================================================
// WhatsApp Client Singleton — Baileys (open-source, zero-cost)
//
// Diseño clave:
//   - Se guarda en `globalThis.__waClient` para persistir el WebSocket entre
//     invocaciones de rutas API (Next.js reutiliza el mismo Node process).
//   - Auth state en MongoDB para sobrevivir reinicios del contenedor.
//   - No bloquea las rutas API: iniciar/conectar retorna estado inmediato,
//     el pairing por QR se resuelve por eventos.
//   - Auto-reconecta salvo `loggedOut` (401), en cuyo caso limpia credenciales.
// ============================================================================
import pino from 'pino';
import QRCode from 'qrcode';
import * as Baileys from '@whiskeysockets/baileys';
import { getMongoAuthState } from './mongo-auth';

const {
  makeWASocket, fetchLatestBaileysVersion, DisconnectReason, Browsers,
} = Baileys;

// Estructura del singleton
// globalThis.__waClient = {
//   sock: <WASocket>,
//   state: 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected',
//   qr: string | null,          // el string crudo del QR (para regenerar imágenes)
//   qrDataUrl: string | null,   // dataURL base64 listo para <img>
//   user: { id, name } | null,
//   lastError: string | null,
//   startedAt: Date | null,
//   connectedAt: Date | null,
//   messagesSent: number,
// }

function getStore() {
  if (!globalThis.__waClient) {
    globalThis.__waClient = {
      sock: null,
      state: 'idle',
      qr: null,
      qrDataUrl: null,
      user: null,
      lastError: null,
      startedAt: null,
      connectedAt: null,
      messagesSent: 0,
      _saveCreds: null,
      _clearCreds: null,
      _connecting: false,
    };
  }
  return globalThis.__waClient;
}

/** Devuelve el estado público del cliente (sin exponer sockets internos) */
export function getStatus() {
  const s = getStore();
  return {
    state: s.state,
    qrDataUrl: s.qrDataUrl,
    user: s.user,
    lastError: s.lastError,
    startedAt: s.startedAt,
    connectedAt: s.connectedAt,
    messagesSent: s.messagesSent,
  };
}

const logger = pino({ level: 'warn' });

/**
 * Inicia (o reinicia) la conexión. Idempotente:
 *   - Si ya está `connecting` o `qr`, no hace nada.
 *   - Si ya está `connected`, retorna el estado actual.
 */
export async function startConnection() {
  const s = getStore();
  if (s._connecting) return getStatus();
  if (s.state === 'connected') return getStatus();

  s._connecting = true;
  s.lastError = null;
  s.state = 'connecting';
  s.qr = null;
  s.qrDataUrl = null;
  s.startedAt = new Date();

  try {
    const { state: authState, saveCreds, clear } = await getMongoAuthState();
    s._saveCreds = saveCreds;
    s._clearCreds = clear;

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      auth: authState,
      browser: Browsers.ubuntu('Estampados DLV'),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
    });
    s.sock = sock;

    sock.ev.on('creds.update', async () => {
      try { await saveCreds(); } catch (e) { logger.warn({ err: e.message }, 'creds.update save fail'); }
    });

    sock.ev.on('connection.update', async (u) => {
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        s.qr = qr;
        s.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 6 });
        s.state = 'qr';
      }
      if (connection === 'open') {
        s.state = 'connected';
        s.qr = null;
        s.qrDataUrl = null;
        s.user = sock.user ? { id: sock.user.id, name: sock.user.name || sock.user.verifiedName || null } : null;
        s.connectedAt = new Date();
        s.lastError = null;
      }
      if (connection === 'close') {
        const reasonCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = reasonCode === DisconnectReason.loggedOut;
        s.state = 'disconnected';
        s.user = null;
        s.qr = null;
        s.qrDataUrl = null;
        s.lastError = lastDisconnect?.error?.message || `code:${reasonCode}`;

        if (isLoggedOut) {
          // Sesión invalidada por el usuario → limpiar credenciales
          try { await s._clearCreds?.(); } catch { /* ignore */ }
        } else {
          // Reintentar tras 3s
          setTimeout(() => {
            s._connecting = false;
            startConnection().catch((e) => { s.lastError = e.message; });
          }, 3000);
        }
      }
    });

    // ─── Listener de mensajes entrantes → Agente IA ─────────────────────
    // Se registra dinámicamente (require diferido) para evitar ciclos de import
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      try {
        const { handleIncomingWhatsappMessage } = await import('./inbound');
        for (const m of messages) {
          await handleIncomingWhatsappMessage(m, sock).catch((e) =>
            logger.warn({ err: e.message }, 'inbound handler failed'),
          );
        }
      } catch (e) {
        logger.warn({ err: e.message }, 'messages.upsert dispatch failed');
      }
    });

    // Marcar como no-connecting una vez el handler está registrado (los eventos ya llegan asincrónicos)
    s._connecting = false;
    return getStatus();
  } catch (e) {
    s._connecting = false;
    s.state = 'disconnected';
    s.lastError = e.message;
    logger.error({ err: e.message }, 'WA start error');
    return getStatus();
  }
}

/** Cierra la conexión y limpia credenciales (fuerza un nuevo pairing) */
export async function logout() {
  const s = getStore();
  try { await s.sock?.logout(); } catch { /* ignore */ }
  try { await s.sock?.ws?.close?.(); } catch { /* ignore */ }
  try { await s._clearCreds?.(); } catch { /* ignore */ }
  s.sock = null;
  s.state = 'idle';
  s.user = null;
  s.qr = null;
  s.qrDataUrl = null;
  s.connectedAt = null;
  return getStatus();
}

// ---------------------------------------------------------------------------
// Normalización de teléfono chileno → JID de WhatsApp
// Acepta: "+56 9 1234 5678" / "56912345678" / "912345678" / "9 1234 5678"
// Devuelve: "56912345678@s.whatsapp.net" o null si inválido
// ---------------------------------------------------------------------------
export function toWhatsappJid(rawPhone) {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return null;
  let normalized = digits;
  // Si empieza con 9 y tiene 9 dígitos → asumir móvil chileno, anteponer 56
  if (normalized.length === 9 && normalized.startsWith('9')) normalized = '56' + normalized;
  // Si tiene 8 dígitos, asumimos falta el 9 inicial + código país (raro, mejor rechazar)
  if (normalized.length < 11) return null;
  // Si no empieza con 56 y tiene 11+ dígitos, asumimos país explícito ya presente
  return `${normalized}@s.whatsapp.net`;
}

/**
 * Envía un mensaje de texto. Lanza si no está conectado.
 * @returns { messageId, jid, sentAt }
 */
export async function sendText(rawPhone, text) {
  const s = getStore();
  if (s.state !== 'connected' || !s.sock) {
    throw new Error(`WhatsApp no está conectado (estado: ${s.state}). Vincula la sesión primero.`);
  }
  const jid = toWhatsappJid(rawPhone);
  if (!jid) throw new Error(`Teléfono inválido: "${rawPhone}"`);

  const res = await s.sock.sendMessage(jid, { text });
  s.messagesSent += 1;
  return {
    messageId: res?.key?.id || null,
    jid,
    sentAt: new Date(),
  };
}
