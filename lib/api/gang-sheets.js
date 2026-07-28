// POST /api/gang-sheets — persiste pliego y crea pedido
// Soporta modos legacy (dtf_textil_31/33/uv) y printers dinámicos (printerCode)
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, PRINTER_SPECS, ORDER_STATUS, PRODUCTION_STATUS, PRIORITY, SALES_CHANNEL } from '@/lib/models';
import { PRICING, quote } from '@/lib/pricing';
import { json, err } from './_helpers';

export default async function handleGangSheets(ctx) {
  const { method, route, db, request } = ctx;

  if (!(route === '/gang-sheets' && method === 'POST')) return null;

  const body = await request.json();
  const { mode, printerCode, canvasWidthMm, express = false, designs = [] } = body;
  if (!designs.length) return err('sin diseños');

  let cfg;
  let resolvedMode;
  let printerDoc = null;

  if (printerCode) {
    printerDoc = await db.collection(COLLECTIONS.PRINTERS).findOne({ code: printerCode, active: true });
    if (!printerDoc) return err(`Equipo "${printerCode}" no encontrado o inactivo`);
    cfg = {
      label: `${printerDoc.label} · ${(printerDoc.widthMm / 10).toFixed(0)} cm`,
      printer: printerDoc.code,
      canvasWidthCm: printerDoc.widthMm / 10,
      pricePerMm: printerDoc.pricePerMm,
      minLengthMm: printerDoc.minLengthMm || 100,
      color: printerDoc.color || 'from-slate-500 to-slate-700',
      type: printerDoc.type,
    };
    if (printerDoc.code === 'epson_r1390') resolvedMode = 'dtf_textil_31';
    else if (printerDoc.code === 'prestige_r2_pro') resolvedMode = 'dtf_textil_33';
    else if (printerDoc.code === 'dtf_uv') resolvedMode = 'dtf_uv';
    else resolvedMode = `printer_${printerDoc.code}`;
  } else {
    if (!mode || !PRICING[mode]) return err('modo inválido');
    cfg = { ...PRICING[mode], type: mode === 'dtf_uv' ? 'dtf_uv' : 'dtf_textil' };
    resolvedMode = mode;
    printerDoc = await db.collection(COLLECTIONS.PRINTERS).findOne({ code: cfg.printer });
  }

  if (cfg.type !== 'dtf_uv' && canvasWidthMm / 10 > cfg.canvasWidthCm) {
    return err(`Ancho excede ${cfg.canvasWidthCm}cm para ${cfg.label}`);
  }

  // (Q) Validación de DPI crítico: impedir pedidos con DPI < 150 (pixelados)
  for (const d of designs) {
    const wInches = d.widthMm / 25.4;
    const effectiveDpi = wInches > 0 ? Math.round((d.srcWidthPx || 0) / wInches) : 0;
    if (effectiveDpi < 150) {
      return err(`Diseño "${d.name}" tiene DPI demasiado bajo (${effectiveDpi}). Aumenta el tamaño del diseño o usa una imagen de mayor resolución.`);
    }
  }

  // (Q) Validación de solapamientos: impedir pedidos con diseños superpuestos
  for (let i = 0; i < designs.length; i++) {
    for (let j = i + 1; j < designs.length; j++) {
      const a = designs[i], b = designs[j];
      const overlapX = a.xMm < b.xMm + b.widthMm && a.xMm + a.widthMm > b.xMm;
      const overlapY = a.yMm < b.yMm + b.heightMm && a.yMm + a.heightMm > b.yMm;
      if (overlapX && overlapY) {
        return err(`Diseños "${a.name}" y "${b.name}" están solapados. Sepáralos antes de confirmar.`);
      }
    }
  }

  for (const d of designs) {
    if (d.xMm + d.widthMm > canvasWidthMm) {
      return err(`Diseño "${d.name}" excede el ancho del lienzo`);
    }
  }

  const maxBottom = designs.reduce((m, d) => Math.max(m, d.yMm + d.heightMm), 0);
  const lengthMm = Math.max(maxBottom + 20, 300);

  let q;
  if (PRICING[resolvedMode]) {
    q = quote({ mode: resolvedMode, lengthMm, express });
  } else {
    const billableMm = Math.max(lengthMm, cfg.minLengthMm);
    const subtotal = billableMm * cfg.pricePerMm;
    const surcharge = express ? Math.round(subtotal * 0.30) : 0;
    const netAmount = subtotal + surcharge;
    const tax = Math.round(netAmount * 0.19);
    const total = netAmount + tax;
    q = { mode: resolvedMode, label: cfg.label, lengthMm, billableMm,
          pricePerMm: cfg.pricePerMm, subtotal, surcharge, netAmount, tax, total, express };
  }

  const now = new Date();

  const gangSheetId = uuidv4();
  const gangSheet = {
    id: gangSheetId,
    orderId: null,
    userId: null,
    type: cfg.type,
    printerTarget: cfg.printer,
    canvasWidthCm: cfg.canvasWidthCm,
    canvasLengthMm: lengthMm,
    designs: designs.map(d => ({
      id: uuidv4(),
      imageUrl: d.imageUrl,
      name: d.name,
      srcWidthPx: d.srcWidthPx,
      srcHeightPx: d.srcHeightPx,
      xMm: d.xMm, yMm: d.yMm, widthMm: d.widthMm, heightMm: d.heightMm,
      rotation: d.rotation || 0,
      dpi: Math.round(d.srcWidthPx / (d.widthMm / 25.4)),
    })),
    exportedPngUrl: null,
    exportedTiffUrl: null,
    exportStatus: 'draft',
    hotFolderPath: null,
    createdAt: now,
    exportedAt: null,
  };
  await db.collection(COLLECTIONS.GANG_SHEETS).insertOne(gangSheet);

  const orderCount = await db.collection(COLLECTIONS.ORDERS).countDocuments({});
  const orderNumber = `DLV-2025-${String(orderCount + 200).padStart(6, '0')}`;
  const orderId = uuidv4();
  const order = {
    id: orderId,
    orderNumber,
    channel: SALES_CHANNEL.WEB,
    customerId: null,
    customerSnapshot: { name: 'Cliente Web', email: '', phone: '', rut: '' },
    status: ORDER_STATUS.PENDING,
    productionStatus: PRODUCTION_STATUS.NOT_STARTED,
    priority: express ? PRIORITY.EXPRESS : PRIORITY.NORMAL,
    subtotal: q.subtotal,
    discount: 0,
    tax: q.tax,
    shipping: 0,
    total: q.total,
    paymentMethod: null,
    paymentStatus: 'pending',
    boleta: null,
    deliveryMethod: 'pickup',
    shippingAddress: null,
    notes: '',
    createdAt: now,
    paidAt: null,
    deliveredAt: null,
  };
  await db.collection(COLLECTIONS.ORDERS).insertOne(order);

  const orderItemId = uuidv4();
  await db.collection(COLLECTIONS.ORDER_ITEMS).insertOne({
    id: orderItemId,
    orderId,
    type: 'gang_sheet',
    gangSheetId,
    name: `${cfg.label} · ${(lengthMm/10).toFixed(1)} cm`,
    quantity: 1,
    unitPrice: q.netAmount,
    discount: 0,
    totalPrice: q.netAmount,
    gangSheetSpec: {
      printerType: cfg.printer,
      widthCm: cfg.canvasWidthCm,
      lengthMm,
      designsCount: designs.length,
    },
  });

  // Crear entrada en la cola de producción (Kanban) — así aparece en /kanban automáticamente
  await db.collection(COLLECTIONS.PRODUCTION_QUEUE).insertOne({
    id: uuidv4(),
    orderId,
    orderItemId,
    gangSheetId,
    printer: cfg.printer,
    status: PRODUCTION_STATUS.RECEIVED,
    priority: express ? PRIORITY.EXPRESS : PRIORITY.NORMAL,
    assignedOperatorId: null,
    startedAt: null,
    completedAt: null,
    fileUrl: null,           // se llenará cuando Pre-Prensa exporte el PNG
    lengthMm,
    inkConsumption: { c: 0, m: 0, y: 0, k: 0, w: 0, v: 0 },
    filmConsumption: 0,
    notes: '',
    createdAt: now,
  });

  // Actualizar productionStatus del pedido para que refleje que ya está en cola
  await db.collection(COLLECTIONS.ORDERS).updateOne(
    { id: orderId },
    { $set: { productionStatus: PRODUCTION_STATUS.RECEIVED } }
  );

  await db.collection(COLLECTIONS.GANG_SHEETS).updateOne({ id: gangSheetId }, { $set: { orderId } });

  const legacyLabel = PRINTER_SPECS[cfg.printer]?.name || printerDoc?.label || cfg.printer;
  return json({
    ok: true,
    gangSheetId,
    orderId,
    orderNumber,
    printerLabel: legacyLabel,
    printer: cfg.printer,
    lengthMm,
    total: q.total,
    quote: q,
  });
}
