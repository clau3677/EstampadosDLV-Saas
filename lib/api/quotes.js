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

// Convierte un base64 (raw o dataURL) a Buffer para el adjunto del correo
function base64Input(raw) {
  if (!raw) return null;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  const stripped = s.includes(',') && s.slice(0, s.indexOf(',')).startsWith('data:')
    ? s.slice(s.indexOf(',') + 1)
    : s;
  return stripped;
}
function pdfBufferFrom(raw) {
  return raw ? Buffer.from(raw, 'base64') : Buffer.from('');
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
        <div style="margin:0;padding:0;background:#f5f7f6">
          <div style="max-width:560px;margin:28px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 3px 16px rgba(0,0,0,.08)">
            <div style="text-align:center;padding:20px 18px 8px">
              <span style="display:inline-block;background:#087d59;color:#fff;padding:8px 17px;border-radius:7px;font-weight:700;font-size:14px;font-family:Arial,Helvetica,sans-serif">Estampados DLV</span>
            </div>
            <div style="padding:0 28px 28px;font-family:Arial,Helvetica,sans-serif;color:#27332f">
              <p style="text-align:center;color:#087d59;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:18px 0 10px">DTF textil · DTF UV · Chile</p>
              <h2 style="font-size:25px;line-height:1.2;text-align:center;color:#096f51;margin:10px 0 18px">Tu cotización personalizada</h2>
              <p style="font-size:14px;margin:11px 0">Hola <b>${quote.clientName}</b>,</p>
              <p style="font-size:14px;margin:11px 0">Gracias por tu interés en <b>Estampados DLV</b>. Adjunto encontrarás tu cotización
              <b>${quote.code}</b> en formato PDF con el detalle completo de productos y servicios cotizados.</p>
              <div style="background:#d9fae9;border-radius:10px;padding:17px 18px;margin:18px 0;color:#1c654b">
                <strong style="display:block;color:#087d59;text-align:center;font-size:18px">Total cotizado: $${Number(quote.total).toLocaleString('es-CL')}</strong>
                <p style="font-size:14px;margin:6px 0 0;text-align:center">Cotización válida hasta el ${quote.validUntil.toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'})}</p>
              </div>
              <h3 style="font-size:17px;color:#087d59;margin:22px 0 8px">¿Qué podemos ofrecerte?</h3>
              <ul style="padding-left:22px;font-size:14px;margin:0 0 11px">
                <li style="margin:6px 0">Poleras, polerones, gorras y buzos personalizados.</li>
                <li style="margin:6px 0">Impresión DTF UV para llaveros, vasos, botellas y regalos.</li>
                <li style="margin:6px 0">Ropa de trabajo personalizada para tu equipo.</li>
                <li style="margin:6px 0">Precios mayoristas y despacho a todo Chile.</li>
              </ul>
              <p style="font-size:14px;margin:11px 0">Para concretar tu pedido, contáctanos al <b>+56 9 5416 9052</b> (WhatsApp) o responde
              a este correo. Hacemos envíos a todo Chile ($3.490, 2 a 5 días hábiles) o retiro gratis en Quilpué.</p>
              <div style="text-align:center;margin:23px 0 10px">
                <a href="https://wa.me/56954169052" style="display:inline-block;background:#08a86f;color:#fff;text-decoration:none;border-radius:7px;padding:12px 18px;font-size:14px;font-weight:700;margin:4px">Cotizar por WhatsApp</a>
                <a href="https://estampadosdlv.com/tienda" style="display:inline-block;background:#fff;color:#087d59;text-decoration:none;border-radius:7px;padding:12px 18px;font-size:14px;font-weight:700;margin:4px;border:1px solid #08a86f">Ver catálogo</a>
              </div>
              <div style="border-top:1px solid #e7eeeb;margin-top:22px;padding-top:15px;color:#53615c;font-size:13px">Saludos cordiales,<br><b>Sandra Vásquez</b><br>
              Estampados DLV · Quilpué, Quinta Región<br>+56 9 5416 9052 · estampadosdlv@gmail.com</div>
            </div>
            <div style="text-align:center;color:#82908a;font-size:11px;padding:15px 20px 22px;font-family:Arial,Helvetica,sans-serif">Quilpué, Valparaíso · Despacho a todo Chile<br>
            <a href="https://estampadosdlv.com/" style="color:#087d59">estampadosdlv.com</a></div>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `Cotizacion_${quote.code}_EstampadosDLV.pdf`,
          content: pdfBufferFrom(base64Input(body.pdfBase64)),
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
