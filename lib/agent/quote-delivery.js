import { randomUUID } from 'node:crypto';
import { sendMail } from '@/lib/email/client';
import { sendText, getStatus as getWaStatus } from '@/lib/whatsapp/client';
import { generateQuotePDF } from '@/components/quote-pdf';

const CONFIRM_PREFIX = 'ENVIAR COTIZACIÓN';

function money(n) { return `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`; }
function clientName(raw) {
  return String(raw || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
function confirmationFor(code) { return `${CONFIRM_PREFIX} ${code}`; }

export function quoteSendConfirmation(code) { return confirmationFor(code); }

function assertConfirmation(quote, confirmation) {
  return String(confirmation || '').trim().toUpperCase() === confirmationFor(quote.code).toUpperCase();
}

async function pdfBuffer(quote) {
  const blob = generateQuotePDF(quote);
  return Buffer.from(await blob.arrayBuffer());
}

function whatsappText(quote) {
  const lines = (quote.items || []).map(it => `• ${it.name} ×${it.quantity} = ${money(it.subtotal)}`).join('\n');
  const valid = new Date(quote.validUntil).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `Hola ${clientName(quote.clientName)}. Soy Sandra Vásquez de *Estampados DLV* (Quilpué).\n\nCotización *${quote.code}*:\n${lines}\n\n*Total: ${money(quote.total)}*\nVálida hasta el ${valid}.\n\nPara confirmar o resolver dudas, responde este mensaje. También podemos enviarte el PDF por correo.\n\nSandra Vásquez — Estampados DLV\n+56 9 5416 9052 · estampadosdlv.com`;
}

export async function deliverQuote({ db, quoteId, channel, confirmation, actor = 'vicky' }) {
  if (!['email', 'whatsapp'].includes(channel)) return { ok: false, error: 'Canal inválido' };
  const quote = await db.collection('quotes').findOne({ id: quoteId });
  if (!quote) return { ok: false, error: 'cotización no encontrada' };
  if (!assertConfirmation(quote, confirmation)) {
    return { ok: false, error: 'Confirmación inválida', requiredConfirmation: confirmationFor(quote.code) };
  }
  if (quote.delivery?.[channel]?.status === 'sent') {
    return { ok: false, error: `La cotización ya fue enviada por ${channel}`, sentAt: quote.delivery[channel].sentAt };
  }
  const now = new Date();
  const auditId = randomUUID();
  await db.collection('quote_delivery_audit').insertOne({ id: auditId, quoteId, code: quote.code, channel, actor, status: 'sending', createdAt: now });
  try {
    let result;
    let recipient;
    if (channel === 'email') {
      recipient = String(quote.clientEmail || '').trim();
      if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) return { ok: false, error: 'La cotización no tiene un correo válido' };
      const pdf = await pdfBuffer(quote);
      result = await sendMail({
        to: recipient,
        subject: `Cotización ${quote.code} — Estampados DLV`,
        replyTo: 'estampadosdlv@gmail.com',
        text: `Hola ${clientName(quote.clientName)}. Adjuntamos la cotización ${quote.code} por ${money(quote.total)}.`,
        html: `<p>Hola <b>${clientName(quote.clientName)}</b>,</p><p>Adjuntamos tu cotización <b>${quote.code}</b> de Estampados DLV por <b>${money(quote.total)}</b>.</p><p>Válida hasta el ${new Date(quote.validUntil).toLocaleDateString('es-CL')}.</p><p>Saludos cordiales,<br>Sandra Vásquez<br>Estampados DLV</p>`,
        attachments: [{ filename: `Cotizacion_${quote.code}_EstampadosDLV.pdf`, content: pdf }],
      });
    } else {
      recipient = String(quote.clientPhone || '').trim();
      if (!recipient) return { ok: false, error: 'La cotización no tiene teléfono' };
      const status = getWaStatus();
      if (status.state !== 'connected') return { ok: false, error: `WhatsApp no conectado (${status.state})` };
      result = await sendText(recipient, whatsappText(quote));
    }
    await db.collection('quotes').updateOne({ id: quoteId }, { $set: { [`delivery.${channel}`]: { status: 'sent', recipient, sentAt: now, messageId: result?.messageId || null }, updatedAt: now, status: 'enviada' } });
    await db.collection('quote_delivery_audit').updateOne({ id: auditId }, { $set: { status: 'sent', recipient, sentAt: now, result: { messageId: result?.messageId || null } } });
    return { ok: true, channel, recipient, sentAt: now, messageId: result?.messageId || null };
  } catch (error) {
    await db.collection('quote_delivery_audit').updateOne({ id: auditId }, { $set: { status: 'error', error: error.message, finishedAt: new Date() } });
    return { ok: false, error: error.message || 'No se pudo enviar la cotización' };
  }
}

export async function listQuoteDeliveries(db, quoteId) {
  return db.collection('quote_delivery_audit').find({ quoteId }).sort({ createdAt: -1 }).limit(50).toArray();
}

export { confirmationFor };

// Nota: el servicio no se expone como tool del LLM. Solo puede invocarse desde una ruta administrativa
// con autenticación y una confirmación exacta: ENVIAR COTIZACIÓN COT-XXXXXX.
