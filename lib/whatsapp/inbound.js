// ============================================================================
// Inbound Handler — mensajes de WhatsApp que llegan al negocio
//
// Filtrado:
//   - Solo mensajes que NO son del propio negocio (m.key.fromMe === false)
//   - Solo desde JIDs individuales (no grupos por ahora)
//   - Solo mensajes con texto (no notas de voz, imágenes u otros por MVP)
//
// Flujo:
//   1) Buffering — agrupa mensajes de un mismo JID en un "burst" de 3s
//      para que el agente responda una sola vez a múltiples mensajes cortos.
//   2) Llama al agent engine con source='whatsapp' + contactHint.phone
//   3) Envía la respuesta por WA (a menos que la conv esté en human_takeover)
//   4) Marca los mensajes como leídos.
// ============================================================================
import { getDb } from '@/lib/mongo';
import { agentChat } from '@/lib/agent/engine';

const BURST_MS = 3000;

// Buffer en memoria por JID: { jid → { messages: [text], timer, sock } }
const buffers = new Map();

function extractText(m) {
  const c = m.message;
  if (!c) return null;
  if (c.conversation) return c.conversation;
  if (c.extendedTextMessage?.text) return c.extendedTextMessage.text;
  if (c.imageMessage?.caption) return c.imageMessage.caption;
  if (c.videoMessage?.caption) return c.videoMessage.caption;
  return null;
}

function jidToPhone(jid) {
  // "56912345678@s.whatsapp.net" → "+56912345678"
  const raw = String(jid || '').split('@')[0];
  if (!raw) return null;
  return '+' + raw;
}

function jidToPushName(m) {
  return m.pushName || null;
}

export async function handleIncomingWhatsappMessage(m, sock) {
  // 1) Filtros básicos
  if (m.key?.fromMe) return;
  if (!m.key?.remoteJid) return;
  if (m.key.remoteJid.endsWith('@g.us')) return; // grupos NO por ahora
  if (m.key.remoteJid === 'status@broadcast') return;

  const text = extractText(m);
  if (!text?.trim()) return;

  const jid = m.key.remoteJid;
  const phone = jidToPhone(jid);
  const pushName = jidToPushName(m);

  // 2) Buffer del JID
  let buf = buffers.get(jid);
  if (!buf) {
    buf = { messages: [], timer: null, sock, phone, pushName };
    buffers.set(jid, buf);
  }
  buf.messages.push(text.trim());
  buf.sock = sock; // último socket
  buf.pushName = pushName || buf.pushName;

  // Reset timer — cada nuevo mensaje reinicia la espera (3s de silencio → responde)
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(async () => {
    const messages = buf.messages.slice();
    buffers.delete(jid);
    await flushToAgent({ jid, phone, pushName: buf.pushName, sock: buf.sock, texts: messages });
  }, BURST_MS);
}

async function flushToAgent({ jid, phone, pushName, sock, texts }) {
  const combined = texts.join('\n');

  try {
    // Marcar como leído (best-effort)
    try {
      await sock?.readMessages?.([{ remoteJid: jid, id: '', participant: undefined }]).catch(() => {});
    } catch { /* ignore */ }

    // Indicador de "escribiendo…"
    try {
      await sock?.sendPresenceUpdate?.('composing', jid).catch(() => {});
    } catch { /* ignore */ }

    // Ejecutar agente
    const result = await agentChat({
      userMessage: combined,
      source: 'whatsapp',
      contactHint: { name: pushName, phone },
    });

    // Enviar respuesta (a menos que se escaló)
    if (result.reply && !result.escalated) {
      await sock?.sendMessage?.(jid, { text: result.reply });
    } else if (result.escalated) {
      // Mensaje breve al cliente
      const escMsg = result.reply || 'Perfecto, te derivo con nuestro equipo — te contactarán pronto 👋';
      await sock?.sendMessage?.(jid, { text: escMsg });
      // Notificación interna: emitir evento (podríamos enviar email a estampadosdlv@gmail.com)
      await notifyStaffOfEscalation({ jid, phone, pushName, lastMessages: texts, conversationId: result.conversationId });
    }
  } catch (e) {
    console.error('[wa/inbound] agent failed:', e.message);
    // Fallback: mensaje de error suave (no queremos ghostear al cliente)
    try {
      await sock?.sendMessage?.(jid, {
        text: 'Uy, tuve un problema técnico ahora mismo 😕 En un momento te respondo, o si prefieres, escríbeme "hablar con humano".',
      }).catch(() => {});
    } catch { /* ignore */ }
  } finally {
    try { await sock?.sendPresenceUpdate?.('paused', jid).catch(() => {}); } catch { /* ignore */ }
  }
}

async function notifyStaffOfEscalation({ jid, phone, pushName, lastMessages, conversationId }) {
  // Log en la BD para que aparezca en la bandeja admin como "requiere atención"
  try {
    const db = await getDb();
    await db.collection('agent_conversations').updateOne(
      { id: conversationId },
      { $set: { needsAttention: true, needsAttentionAt: new Date() } }
    );
    // Enviar email al staff (best-effort)
    const { sendManualEmail } = await import('@/lib/email/notifications');
    await sendManualEmail({
      to: process.env.SMTP_FROM_EMAIL || 'estampadosdlv@gmail.com',
      subject: `🔔 Cliente WhatsApp requiere atención · ${pushName || phone}`,
      html: `
        <p>Un cliente en WhatsApp fue escalado a humano:</p>
        <ul>
          <li><b>Nombre:</b> ${pushName || '—'}</li>
          <li><b>Teléfono:</b> ${phone}</li>
          <li><b>JID:</b> ${jid}</li>
        </ul>
        <p><b>Últimos mensajes:</b></p>
        <blockquote style="border-left:3px solid #059669;padding:8px 12px;background:#f8fafc;white-space:pre-wrap;">${lastMessages.join('\n')}</blockquote>
        <p>Abre la bandeja: <a href="${process.env.NEXT_PUBLIC_BASE_URL || ''}/bandeja">Ver conversación</a></p>
      `,
      note: 'escalation-notice',
    });
  } catch (e) {
    console.warn('[wa/inbound] notifyStaff failed:', e.message);
  }
}
