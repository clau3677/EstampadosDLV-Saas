// ============================================================================
// PDF TICKETS/BOLETAS — Impresiones POS
//
// Endpoints:
//   GET /api/tickets/[orderId]?format=thermal  → PDF 80mm térmico (venta rápida)
//   GET /api/tickets/[orderId]?format=a4       → PDF A4 boleta interna
//
// Nota: NO es facturación electrónica SII. Solo boleta interna con folio propio
// para operación y auditoría interna. Para SII electrónica ver playbook aparte.
// ============================================================================
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { NextResponse } from 'next/server';
import { COLLECTIONS } from '@/lib/models';
import { cors, err } from './_helpers';

const CLP = (n) => `$${new Intl.NumberFormat('es-CL').format(Math.round(n || 0))}`;
const dateCL = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ============================================================================
// TICKET 80mm THERMAL (venta rápida)
// ============================================================================
async function generateThermalTicket(order, items) {
  const width = 226.77;             // 80mm en points (80 * 72 / 25.4)
  const lineH = 10;
  const items_h = items.length * (lineH * 2);
  const height = 260 + items_h;     // altura dinámica según items

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([width, height]);
  const font = await pdf.embedFont(StandardFonts.Courier);
  const fontBold = await pdf.embedFont(StandardFonts.CourierBold);
  const black = rgb(0, 0, 0);

  let y = height - 14;
  const centerLine = (text, f = font, size = 8) => {
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font: f, color: black });
    y -= size + 3;
  };
  const leftLine = (text, size = 7, f = font) => {
    page.drawText(text, { x: 6, y, size, font: f, color: black });
    y -= size + 2;
  };
  const spaceLine = (left, right, size = 7, f = font) => {
    page.drawText(left, { x: 6, y, size, font: f, color: black });
    const rw = f.widthOfTextAtSize(right, size);
    page.drawText(right, { x: width - 6 - rw, y, size, font: f, color: black });
    y -= size + 2;
  };
  const separator = () => {
    for (let x = 6; x < width - 6; x += 3) {
      page.drawText('-', { x, y, size: 6, font, color: black });
    }
    y -= 6;
  };

  // Header
  centerLine('ESTAMPADOS DLV', fontBold, 10);
  centerLine('DTF Textil / DTF UV', font, 7);
  centerLine('www.estampadosdlv.cl', font, 6);
  separator();

  // Info
  leftLine(`Boleta interna: ${order.boleta?.number || order.orderNumber}`);
  leftLine(`Pedido:         ${order.orderNumber}`);
  leftLine(`Fecha:          ${dateCL(order.paidAt || order.createdAt)}`);
  leftLine(`Cajero:         ${order.operatorName || 'N/D'}`);
  if (order.customerSnapshot?.name && order.customerSnapshot.name !== 'Cliente presencial') {
    leftLine(`Cliente:        ${order.customerSnapshot.name}`);
    if (order.customerSnapshot.rut) leftLine(`RUT:            ${order.customerSnapshot.rut}`);
  }
  separator();

  // Items
  leftLine('DETALLE', 7, fontBold);
  separator();
  for (const it of items) {
    // Wrap el nombre en 32 chars aprox
    const name = it.name.length > 32 ? it.name.slice(0, 30) + '…' : it.name;
    leftLine(name, 7);
    spaceLine(`  ${it.quantity} x ${CLP(it.unitPrice)}`, CLP(it.totalPrice), 7);
  }
  separator();

  // Totals
  spaceLine('Neto:', CLP(order.subtotal), 7);
  spaceLine('IVA 19%:', CLP(order.tax), 7);
  spaceLine('TOTAL:', CLP(order.total), 9, fontBold);
  y -= 2;
  separator();

  // Payments
  leftLine('PAGO', 7, fontBold);
  const paymentLabels = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
  for (const p of (order.payments || [])) {
    let lbl = paymentLabels[p.method] || p.method;
    if (p.cardBrand) lbl += ` ${p.cardBrand}`;
    if (p.last4) lbl += ` ***${p.last4}`;
    spaceLine(lbl, CLP(p.amount), 7);
  }
  if (order.change > 0) {
    spaceLine('Vuelto:', CLP(order.change), 8, fontBold);
  }
  separator();

  // Footer
  centerLine('¡Gracias por su compra!', font, 7);
  centerLine('Cambios en 5 días con boleta', font, 6);
  centerLine(order.orderNumber, font, 6);

  return await pdf.save();
}

// ============================================================================
// A4 BOLETA (interna, para impresora normal)
// ============================================================================
async function generateA4Boleta(order, items) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);  // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.15);
  const gray = rgb(0.45, 0.45, 0.5);
  const orange = rgb(0.95, 0.44, 0.15);

  const W = 595.28;
  const M = 42;                     // margen
  let y = 800;

  // ==== HEADER ====
  page.drawText('ESTAMPADOS DLV', { x: M, y, size: 24, font: fontBold, color: black });
  y -= 22;
  page.drawText('DTF Textil · DTF UV · Impresión profesional', { x: M, y, size: 10, font, color: gray });
  y -= 12;
  page.drawText('www.estampadosdlv.cl · Chile', { x: M, y, size: 9, font, color: gray });

  // Right box: boleta info
  const rightX = W - M - 200;
  page.drawRectangle({ x: rightX, y: 750, width: 200, height: 60, color: rgb(0.98, 0.95, 0.92), borderColor: orange, borderWidth: 1 });
  page.drawText('BOLETA INTERNA', { x: rightX + 10, y: 792, size: 10, font: fontBold, color: orange });
  page.drawText(`N° ${order.boleta?.number || order.orderNumber}`, { x: rightX + 10, y: 776, size: 12, font: fontBold, color: black });
  page.drawText(dateCL(order.paidAt || order.createdAt), { x: rightX + 10, y: 762, size: 9, font, color: gray });

  y = 720;
  // ==== CUSTOMER + OPERATOR ====
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: gray });
  y -= 20;
  page.drawText('CLIENTE', { x: M, y, size: 8, font: fontBold, color: gray });
  page.drawText('CAJERO', { x: W / 2, y, size: 8, font: fontBold, color: gray });
  y -= 14;
  const c = order.customerSnapshot || {};
  page.drawText(c.name || 'Cliente presencial', { x: M, y, size: 11, font: fontBold, color: black });
  page.drawText(order.operatorName || 'N/D', { x: W / 2, y, size: 11, font: fontBold, color: black });
  y -= 13;
  if (c.rut) page.drawText(`RUT: ${c.rut}`, { x: M, y, size: 9, font, color: gray });
  page.drawText(`Pedido: ${order.orderNumber}`, { x: W / 2, y, size: 9, font, color: gray });
  y -= 12;
  if (c.email) page.drawText(c.email, { x: M, y, size: 9, font, color: gray });
  y -= 25;

  // ==== ITEMS TABLE ====
  page.drawRectangle({ x: M, y: y - 4, width: W - M * 2, height: 20, color: rgb(0.95, 0.95, 0.97) });
  page.drawText('PRODUCTO', { x: M + 8, y: y + 3, size: 9, font: fontBold, color: black });
  page.drawText('CANT', { x: 340, y: y + 3, size: 9, font: fontBold, color: black });
  page.drawText('P.UNIT', { x: 400, y: y + 3, size: 9, font: fontBold, color: black });
  page.drawText('TOTAL', { x: 490, y: y + 3, size: 9, font: fontBold, color: black });
  y -= 25;

  for (const it of items) {
    page.drawText(it.name.slice(0, 45), { x: M + 8, y, size: 10, font, color: black });
    page.drawText(String(it.quantity), { x: 348, y, size: 10, font, color: black });
    page.drawText(CLP(it.unitPrice), { x: 400, y, size: 10, font, color: black });
    page.drawText(CLP(it.totalPrice), { x: 490, y, size: 10, font, color: black });
    y -= 18;
  }

  // ==== TOTALES ====
  y -= 15;
  page.drawLine({ start: { x: 380, y }, end: { x: W - M, y }, thickness: 0.5, color: gray });
  y -= 18;
  const totalLine = (label, value, big = false) => {
    page.drawText(label, { x: 380, y, size: big ? 12 : 10, font: big ? fontBold : font, color: big ? black : gray });
    const s = big ? 12 : 10;
    const w = (big ? fontBold : font).widthOfTextAtSize(value, s);
    page.drawText(value, { x: W - M - w, y, size: s, font: big ? fontBold : font, color: big ? orange : black });
    y -= big ? 20 : 15;
  };
  totalLine('Neto', CLP(order.subtotal));
  totalLine('IVA 19%', CLP(order.tax));
  totalLine('TOTAL', CLP(order.total), true);

  // ==== PAYMENTS ====
  y -= 10;
  page.drawText('MEDIOS DE PAGO', { x: M, y, size: 9, font: fontBold, color: gray });
  y -= 15;
  const paymentLabels = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
  for (const p of (order.payments || [])) {
    let lbl = paymentLabels[p.method] || p.method;
    if (p.cardBrand) lbl += ` — ${p.cardBrand}${p.last4 ? ` ***${p.last4}` : ''}`;
    page.drawText(lbl, { x: M, y, size: 10, font, color: black });
    const s = CLP(p.amount);
    const w = font.widthOfTextAtSize(s, 10);
    page.drawText(s, { x: W - M - w, y, size: 10, font, color: black });
    y -= 14;
  }
  if (order.change > 0) {
    y -= 5;
    page.drawText('Vuelto entregado', { x: M, y, size: 10, font: fontBold, color: orange });
    const s = CLP(order.change);
    const w = fontBold.widthOfTextAtSize(s, 10);
    page.drawText(s, { x: W - M - w, y, size: 10, font: fontBold, color: orange });
    y -= 14;
  }

  // ==== FOOTER ====
  page.drawLine({ start: { x: M, y: 60 }, end: { x: W - M, y: 60 }, thickness: 0.5, color: gray });
  page.drawText('Documento no válido como boleta electrónica SII.', { x: M, y: 45, size: 8, font, color: gray });
  page.drawText('Comprobante interno de venta. Cambios: 5 días con este documento.', { x: M, y: 33, size: 8, font, color: gray });
  page.drawText('¡Gracias por elegir Estampados DLV!', { x: M, y: 18, size: 9, font: fontBold, color: orange });

  return await pdf.save();
}

// ============================================================================
// ROUTER
// ============================================================================
export default async function handleTickets(ctx) {
  const { method, route, request, db } = ctx;

  if (!(route.startsWith('/tickets/') && method === 'GET')) return null;

  const orderId = route.replace('/tickets/', '');
  if (!orderId) return err('orderId requerido');

  const order = await db.collection(COLLECTIONS.ORDERS).findOne({ id: orderId });
  if (!order) return err('orden no encontrada', 404);

  const items = await db.collection(COLLECTIONS.ORDER_ITEMS)
    .find({ orderId }).toArray();

  const url = new URL(request.url);
  const format = url.searchParams.get('format') || 'thermal';

  let pdfBytes;
  try {
    if (format === 'a4') {
      pdfBytes = await generateA4Boleta(order, items);
    } else {
      pdfBytes = await generateThermalTicket(order, items);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error generando PDF:', e);
    return err('Error generando PDF: ' + e.message, 500);
  }

  const filename = `${format === 'a4' ? 'boleta' : 'ticket'}-${order.orderNumber}.pdf`;
  const res = new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
  return cors(res);
}
