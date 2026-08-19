// /api/quotes GET · POST · DELETE · /api/quotes/send POST
// Cotizador de productos y servicios — módulo Ventas (build124)
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import { upsertCustomerFromSnapshot } from './customers';

const QUOTES = 'quotes';

function requireAdmin(request) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return null;
  return user;
}

// ---------- Listar cotizaciones ----------
async function handleQuotesGet(request) {
  const user = requireAdmin(request);
  if (!user) return err('No autorizado', 401);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const coll = (await import('@/lib/mongo')).coll;
  const docs = await coll(QUOTES);
  if (id) {
    const q = await docs.findOne({ id });
    return q ? json(strip(q)) : err('cotización no encontrada', 404);
  }
  const items = await docs.find({}).sort({ createdAt: -1 }).toArray();
  return json(items);
}

// ---------- Crear / actualizar cotización ----------
async function handleQuotesPost(request) {
  const user = requireAdmin(request);
  if (!user) return err('No autorizado', 401);
  const body = await request.json();
  const { id, clientName, clientCompany, clientEmail, clientPhone, notes, items, discount, subtotal, total } = body;
  if (!Array.isArray(items) || items.length === 0) return err('items requerido (al menos 1)', 400);
  if (!clientName) return err('clientName requerido', 400);

  const { getDb } = await import('@/lib/mongo');
  const db = await getDb();
  const docs = db.collection(QUOTES);
  const now = new Date();

  if (id) {
    const existing = await docs.findOne({ id });
    if (!existing) return err('cotización no encontrada', 404);
    await docs.updateOne(
      { id },
      {
        $set: {
          clientName, clientCompany: clientCompany || '', clientEmail: clientEmail || '', clientPhone: clientPhone || '',
          notes: notes || '', items, discount: Number(discount) || 0, subtotal: Number(subtotal) || 0, total: Number(total) || 0,
          status: 'borrador', updatedAt: now,
        },
      },
    );
    await upsertCustomerFromSnapshot(db, { name: clientName, company: clientCompany, email: clientEmail, phone: clientPhone }, { source: 'cotizador', tags: ['cotizador'] });
    return json({ ok: true, id });
  }

  const code = `COT-${String(Date.now()).slice(-6)}`;
  const doc = {
    id: uuidv4(),
    code,
    clientName, clientCompany: clientCompany || '', clientEmail: clientEmail || '', clientPhone: clientPhone || '',
    notes: notes || '',
    items, // { productId, name, category, quantity, unitPrice, subtotal, variantName? }
    discount: Number(discount) || 0,
    subtotal: Number(subtotal) || 0,
    total: Number(total) || 0,
    status: 'borrador',
    validUntil: new Date(Date.now() + 15 * 24 * 3600 * 1000),
    createdAt: now,
    updatedAt: now,
  };
  await docs.insertOne(doc);
  await upsertCustomerFromSnapshot(db, { name: clientName, company: clientCompany, email: clientEmail, phone: clientPhone }, { source: 'cotizador', tags: ['cotizador'] });
  return json({ ok: true, id: doc.id, code });
}

// ---------- Eliminar ----------
async function handleQuotesDelete(request) {
  const user = requireAdmin(request);
  if (!user) return err('No autorizado', 401);
  const body = await request.json();
  if (!body.id) return err('id requerido', 400);
  const coll = (await import('@/lib/mongo')).coll;
  await (await coll(QUOTES)).deleteOne({ id: body.id });
  return json({ ok: true });
}

// ---------- Enviar cotización por correo con PDF adjunto ----------
async function handleQuotesSendPost(request) {
  const user = requireAdmin(request);
  if (!user) return err('No autorizado', 401);
  const body = await request.json();
  if (!body.quoteId || !body.clientEmail) return err('quoteId y clientEmail requeridos', 400);

  const coll = (await import('@/lib/mongo')).coll;
  const docs = await coll(QUOTES);
  const quote = await docs.findOne({ id: body.quoteId });
  if (!quote) return err('cotización no encontrada', 404);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER || 'estampadosdlv@gmail.com',
      pass: process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: 'Sandra Vásquez <estampadosdlv@gmail.com>',
      to: body.clientEmail,
      replyTo: 'Sandra Vásquez <estampadosdlv@gmail.com>',
      subject: `Cotización ${quote.code} — Estampados DLV`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1e293b">
          <div style="background:linear-gradient(135deg,#f97316,#e11d48);padding:22px;border-radius:14px 14px 0 0">
            <div style="font-size:22px;font-weight:bold;color:#fff">Estampados DLV</div>
            <div style="color:#ffe4d6;font-size:13px;margin-top:4px">DTF & DTF UV · Ropa personalizada · Quilpué, Chile</div>
          </div>
          <div style="padding:26px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px">
            <p style="font-size:15px">Hola <b>${quote.clientName}</b>,</p>
            <p style="font-size:15px">Gracias por tu interés en <b>Estampados DLV</b>. Adjunto encontrarás tu cotización
            <b> ${quote.code}</b> en formato PDF con el detalle completo de productos y servicios cotizados.</p>
            <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#f8fafc;border-radius:10px;overflow:hidden">
              <tr><td style="padding:10px 14px;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b">Total cotizado</td>
              <td style="padding:10px 14px;border-top:1px solid #e2e8f0;font-size:16px;font-weight:bold;color:#ea580c;text-align:right">$${Number(quote.total).toLocaleString('es-CL')}</td></tr>
              <tr><td style="padding:10px 14px;font-size:13px;color:#64748b">Válida hasta</td>
              <td style="padding:10px 14px;font-size:14px;text-align:right">${quote.validUntil.toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'})}</td></tr>
            </table>
            <p style="font-size:14px">Para concretar tu pedido, contáctanos al <b>+56 9 5416 9052</b> (WhatsApp) o responde
            a este correo. Hacemos envíos a todo Chile ($3.490, 2 a 5 días hábiles).</p>
            <p style="font-size:13px;color:#64748b;margin-top:22px">Saludos cordiales,<br><b>Sandra Vásquez</b><br>
            Estampados DLV · Quilpué, Quinta Región<br>+56 9 5416 9052 · estampadosdlv@gmail.com</p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Cotizacion_${quote.code}_EstampadosDLV.pdf`,
          content: body.pdfBase64,
          encoding: 'base64',
        },
      ],
    });
    await docs.updateOne({ id: quote.id }, { $set: { status: 'enviada', sentAt: new Date(), sentEmail: body.clientEmail } });
    return json({ ok: true, messageId: info?.messageId || null });
  } catch (e) {
    return err(`No se pudo enviar el correo: ${e.message}`, 500);
  }
}

// ---------- Enviar cotización por WhatsApp (mensaje personalizado automático) ----------
async function handleQuotesSendWhatsappPost(request) {
  const user = requireAdmin(request);
  if (!user) return err('No autorizado', 401);
  const body = await request.json();
  if (!body.quoteId) return err('quoteId requerido', 400);

  const coll = (await import('@/lib/mongo')).coll;
  const docs = await coll(QUOTES);
  const quote = await docs.findOne({ id: body.quoteId });
  if (!quote) return err('cotización no encontrada', 404);

  // Canal WhatsApp del módulo Prospección (sesión Baileys vinculada en /admin/whatsapp)
  let { sendWhatsappOne, isWhatsappConnected } = { sendWhatsappOne: null, isWhatsappConnected: null };
  try {
    const wa = await import('@/lib/prospeccion/wasender');
    sendWhatsappOne = wa.sendWhatsappOne;
    isWhatsappConnected = wa.isWhatsappConnected;
  } catch (e) { /* prospección deshabilitada: cae a link wa.me */ }

  const lines = quote.items.map(it => `• ${it.name} ×${it.quantity} = $${Number(it.subtotal).toLocaleString('es-CL')}`).join('\n');
  const totalTxt = `$${Number(quote.total).toLocaleString('es-CL')}`;
  const validTxt = quote.validUntil.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  const nombre = quote.clientCompany ? `${quote.clientName} (${quote.clientCompany})` : quote.clientName;
  const texto =
`Hola ${nombre} 👋

Soy Sandra Vásquez de *Estampados DLV* (Quilpué, Quinta Región).

Te envío la cotización que preparamos para ti:

*Cotización ${quote.code}*
${lines}

*Total: ${totalTxt}*
${quote.discount ? `Descuento aplicado: ${quote.discount}%
` : ''}Cotización válida hasta el ${validTxt}.

Para concretar tu pedido contáctame directamente a este número o responde este mensaje. Envíos a todo Chile ($3.490, 2 a 5 días hábiles).

¡Esperamos tener tu estampado pronto! 🎨
Sandra Vásquez — Estampados DLV
+56 9 5416 9052 · estampadosdlv.com`;

  // ¿Hay sesión WhatsApp vinculada? Envío real; si no, devolvemos el texto + link wa.me
  if (isWhatsappConnected && isWhatsappConnected()) {
    try {
      const result = await sendWhatsappOne({ recipient: quote.clientPhone, body: texto });
      await docs.updateOne({ id: quote.id }, { $set: { status: 'enviada_whatsapp', sentAt: new Date() } });
      return json({ ok: true, method: 'whatsapp', result, text: texto });
    } catch (e) {
      return err(`No se pudo enviar por WhatsApp: ${e.message}`, 500);
    }
  }
  const phoneDigits = (quote.clientPhone || '').replace(/[^\d]/g, '');
  return json({
    ok: true,
    method: 'whatsapp_link',
    text,
    waLink: `https://wa.me/${phoneDigits}?text=${encodeURIComponent(texto)}`,
    note: 'No hay sesión de WhatsApp vinculada; usa el enlace para abrir la conversación.',
  });
}

export default async function handleQuotes(ctx) {
  const { method, route } = ctx;
  if (route === '/quotes' && method === 'GET') return handleQuotesGet(ctx.request);
  if (route === '/quotes' && method === 'POST') return handleQuotesPost(ctx.request);
  if (route === '/quotes' && method === 'DELETE') return handleQuotesDelete(ctx.request);
  if (route === '/quotes/send' && method === 'POST') return handleQuotesSendPost(ctx.request);
  if (route === '/quotes/send-whatsapp' && method === 'POST') return handleQuotesSendWhatsappPost(ctx.request);
  return null;
}
