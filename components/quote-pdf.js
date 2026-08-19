// Cotizador — generador de PDF profesional (build130: diseño de Sandra)
// Renderiza la cotización en A4 con la paleta verde de Estampados DLV usando jsPDF.
import { jsPDF } from 'jspdf';

// Paleta de la plantilla de Sandra
const C_PRIMARY = [8, 125, 89];    // verde #087d59 (brand)
const C_ACCENT = [8, 168, 111];    // verde #08a86f (botones)
const C_DARK = [9, 111, 81];       // verde oscuro #096f51 (títulos)
const C_TEXT = [39, 51, 47];       // texto #27332f
const C_GRAY = [83, 97, 92];       // gris #53615c
const C_LIGHT = [217, 250, 233];   // fondo highlight #d9fae9
const C_LINE = [231, 238, 235];    // borde #e7eeeb

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
}

export function generateQuotePDF(quote) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const MH = 297;
  let y = 0;

  // ---------- Encabezado ----------
  doc.setFillColor(...C_PRIMARY);
  doc.rect(0, 0, W, 38, 'F');

  // Marca en píldora blanca para contraste
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(16, 11, 46, 15, 4, 4, 'F');
  doc.setTextColor(...C_PRIMARY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ESTAMPADOS DLV', 39, 21, { align: 'center' });

  // Datos de contacto a la derecha del encabezado
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('DTF TEXTIL  ·  DTF UV  ·  ROPA PERSONALIZADA  ·  CHILE', 194, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('+56 9 5416 9052  ·  estampadosdlv@gmail.com  ·  estampadosdlv.com', 194, 21.5, { align: 'right' });
  doc.text('Galleguillos 1870, Casa 1 · Quilpué, Valparaíso', 194, 27, { align: 'right' });

  y = 50;

  // ---------- Título de la cotización ----------
  doc.setTextColor(...C_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Cotización', W / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(11);
  doc.setTextColor(...C_ACCENT);
  doc.setFont('helvetica', 'bold');
  doc.text(quote.code, W / 2, y, { align: 'center' });
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  const valida = new Date(quote.validUntil).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Fecha de emisión: ${fecha}`, 16, y);
  doc.text(`Válida hasta: ${valida}`, W - 16, y, { align: 'right' });
  y += 9;

  // ---------- Datos del cliente ----------
  doc.setFillColor(...C_LIGHT);
  doc.roundedRect(16, y, W - 32, 28, 4, 4, 'F');
  doc.setTextColor(...C_PRIMARY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PREPARADA PARA', 22, y + 7);
  doc.setTextColor(...C_DARK);
  doc.setFontSize(11.5);
  doc.text(quote.clientName, 22, y + 13.5);
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  const clienteLine2 = [
    quote.clientCompany ? `Empresa: ${quote.clientCompany}` : null,
    quote.clientEmail ? `Correo: ${quote.clientEmail}` : null,
    quote.clientPhone ? `Teléfono: ${quote.clientPhone}` : null,
  ].filter(Boolean).join('   ');
  if (clienteLine2) doc.text(clienteLine2, 22, y + 20.5);
  y += 37;

  // ---------- Tabla de items ----------
  const rowH = 9;

  // Header de tabla
  doc.setFillColor(...C_PRIMARY);
  doc.rect(16, y, W - 32, rowH, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PRODUCTO / SERVICIO', 20, y + 6);
  doc.text('CANT.', 126, y + 6);
  doc.text('P. UNITARIO', 146, y + 6);
  doc.text('SUBTOTAL', 178, y + 6);
  y += rowH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  quote.items.forEach((it, i) => {
    const bg = i % 2 === 1;
    if (bg) { doc.setFillColor(245, 250, 248); doc.rect(16, y, W - 32, rowH, 'F'); }
    doc.setTextColor(...C_TEXT);
    const name = String(it.name).slice(0, 52);
    doc.text(name, 20, y + 6);
    doc.setTextColor(...C_GRAY);
    doc.setFontSize(8);
    if (it.variantName) doc.text(String(it.variantName).slice(0, 16), 100, y + 6);
    doc.setFontSize(9);
    doc.setTextColor(...C_TEXT);
    doc.text(String(it.quantity), 132, y + 6);
    doc.text(money(it.unitPrice), 156, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C_DARK);
    doc.text(money(it.subtotal), 194, y + 6);
    doc.setFont('helvetica', 'normal');
    y += rowH;
  });
  y += 4;

  // ---------- Totales ----------
  const totalsW = 78;
  const tx = W - 16 - totalsW;
  const lineH = 8.5;
  const totalRows = [
    { label: 'Subtotal', value: money(quote.subtotal), bold: false, color: C_GRAY },
  ];
  if (quote.discount) {
    totalRows.push({ label: `Descuento (${quote.discount}%)`, value: money(-Math.round(quote.subtotal * quote.discount / 100)), bold: false, color: C_ACCENT });
  }
  totalRows.push({ label: 'IVA estimado (19%)', value: money(Math.round(quote.subtotal * 0.19)), bold: false, color: C_GRAY });
  totalRows.push({ label: 'TOTAL', value: money(quote.total), bold: true, color: C_PRIMARY });

  doc.setFillColor(...C_LIGHT);
  doc.roundedRect(tx, y, totalsW, lineH * totalRows.length + 6, 4, 4, 'F');
  totalRows.forEach((r, i) => {
    const ry = y + 6 + i * lineH;
    doc.setFont('helvetica', r.bold ? 'bold' : 'normal');
    doc.setFontSize(r.bold ? 12 : 9);
    doc.setTextColor(...r.color);
    doc.text(r.label, tx + 6, ry + 5);
    doc.text(r.value, tx + totalsW - 6, ry + 5, { align: 'right' });
    if (r.bold) {
      doc.setDrawColor(...C_ACCENT);
      doc.setLineWidth(0.8);
      doc.line(tx, ry + 8, tx + totalsW, ry + 8);
    }
  });
  y += lineH * totalRows.length + 14;

  // ---------- Notas y condiciones ----------
  const notesY = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C_DARK);
  doc.text('Condiciones y notas', 16, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C_TEXT);
  const condLines = [
    '• Envío a todo Chile: $3.490 (2 a 5 días hábiles) o retiro gratis en nuestro local de Quilpué.',
    '• Tiempos de producción: prendas personalizadas 3 a 7 días hábiles según cantidad.',
    '• Pago: 50% de anticipo para iniciar producción y 50% contra entrega.',
    quote.notes ? `• Nota adicional: ${quote.notes}` : null,
  ].filter(Boolean);
  condLines.forEach(l => {
    const wrapped = doc.splitTextToSize(l, W - 32);
    doc.text(wrapped, 16, y);
    y += wrapped.length * 4.6 + 1.5;
  });

  y = Math.max(y, notesY + 46);

  // ---------- Llamado a la acción ----------
  doc.setFillColor(...C_ACCENT);
  doc.roundedRect(45, y, W - 90, 13, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('¿Te gusta la cotización? Escríbenos al +56 9 5416 9052 (WhatsApp)', W / 2, y + 8.5, { align: 'center' });
  y += 24;

  // ---------- Pie de página ----------
  doc.setDrawColor(...C_LINE);
  doc.setLineWidth(0.5);
  doc.line(16, y, W - 16, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  doc.text('Saludos cordiales,  Sandra Vásquez  ·  Estampados DLV', 16, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(130, 144, 138);
  doc.text('Quilpué, Valparaíso · Despacho a todo Chile · estampadosdlv.com', 16, y);
  doc.text('Esta cotización es válida hasta la fecha indicada. Precios sujetos a confirmación al momento del pedido.', 16, MH - 8);

  return doc.output('blob');
}

export function generateQuotePDFBase64(quote) {
  const blob = generateQuotePDF(quote);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
