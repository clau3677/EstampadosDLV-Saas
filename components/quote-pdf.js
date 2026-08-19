// Cotizador — generador de PDF profesional (build124)
// Renderiza la cotización en A4 con branding Estampados DLV usando jsPDF.
import { jsPDF } from 'jspdf';

const C_PRIMARY = [233, 30, 99];   // rose-600
const C_ACCENT = [249, 115, 22];   // orange-500
const C_DARK = [30, 41, 59];       // slate-800
const C_GRAY = [100, 116, 139];    // slate-500
const C_LIGHT = [248, 250, 252];   // slate-50

function money(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;
}

export function generateQuotePDF(quote) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const MH = 297;
  let y = 0;

  // ---------- Encabezado degradado ----------
  doc.setFillColor(...C_PRIMARY);
  doc.rect(0, 0, W, 42, 'F');
  const gradColors = [[233, 30, 99], [249, 115, 22]];
  // degradado manual: barra naranja al final
  doc.setFillColor(...C_ACCENT);
  doc.rect(W - 60, 0, 60, 42, 'F');
  // franja diagonal blanca de contraste
  doc.setFillColor(255, 255, 255);
  doc.triangle(0, 42, 48, 42, 0, 20, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('ESTAMPADOS DLV', 16, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('DTF & DTF UV  ·  Ropa personalizada  ·  Gorras  ·  Ropa de trabajo', 16, 25);
  doc.text('Quilpué, Quinta Región, Chile', 16, 30);
  doc.setFontSize(9);
  doc.setTextColor(255, 235, 225);
  doc.text('+56 9 5416 9052  ·  estampadosdlv@gmail.com  ·  estampadosdlv.com', 16, 36);

  y = 52;

  // ---------- Título de la cotización ----------
  doc.setTextColor(...C_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`COTIZACIÓN ${quote.code}`, 16, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  const valida = new Date(quote.validUntil).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Fecha de emisión: ${fecha}`, 16, y);
  doc.text(`Válida hasta: ${valida}`, 120, y);
  y += 8;

  // ---------- Datos del cliente ----------
  doc.setFillColor(...C_LIGHT);
  doc.roundedRect(16, y, W - 32, 26, 3, 3, 'F');
  doc.setTextColor(...C_PRIMARY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PREPARADA PARA', 22, y + 7);
  doc.setTextColor(...C_DARK);
  doc.setFontSize(11);
  doc.text(quote.clientName, 22, y + 14);
  doc.setFontSize(9);
  doc.setTextColor(...C_GRAY);
  const clienteLine2 = [
    quote.clientCompany ? `Empresa: ${quote.clientCompany}` : null,
    quote.clientPhone ? `Teléfono: ${quote.clientPhone}` : null,
  ].filter(Boolean).join('   ');
  if (clienteLine2) doc.text(clienteLine2, 22, y + 20);
  y += 34;

  // ---------- Tabla de items ----------
  const colX = [16, 100, 118, 142, 194]; // nombre, variante, cantidad, unitario, subtotal
  const rowH = 9;

  // Header de tabla
  doc.setFillColor(...C_DARK);
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
    if (bg) { doc.setFillColor(241, 245, 249); doc.rect(16, y, W - 32, rowH, 'F'); }
    doc.setTextColor(...C_DARK);
    const name = String(it.name).slice(0, 52);
    doc.text(name, 20, y + 6);
    doc.setTextColor(...C_GRAY);
    doc.setFontSize(8);
    if (it.variantName) doc.text(String(it.variantName).slice(0, 16), 100, y + 6);
    doc.setFontSize(9);
    doc.setTextColor(...C_DARK);
    doc.text(String(it.quantity), 132, y + 6);
    doc.text(money(it.unitPrice), 156, y + 6);
    doc.setFont('helvetica', 'bold');
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
  doc.roundedRect(tx, y, totalsW, lineH * totalRows.length + 6, 3, 3, 'F');
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
  doc.setTextColor(...C_PRIMARY);
  doc.text('CONDICIONES Y NOTAS', 16, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C_DARK);
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

  // ---------- Pie de página ----------
  doc.setFillColor(...C_PRIMARY);
  doc.rect(0, MH - 22, W, 22, 'F');
  doc.setFillColor(...C_ACCENT);
  doc.rect(0, MH - 22, 60, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Estampados DLV · Quilpué, Quinta Región, Chile', 16, MH - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('www.estampadosdlv.com · +56 9 5416 9052 · estampadosdlv@gmail.com', 16, MH - 7);
  doc.setFontSize(8);
  doc.text('Esta cotización es válida hasta la fecha indicada. Precios sujetos a confirmación al momento del pedido.', 16, MH - 2.5);

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
