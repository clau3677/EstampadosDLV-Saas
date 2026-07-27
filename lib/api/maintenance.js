// ============================================================================
// /api/maintenance/*  — Registros de mantenimiento de impresoras
//
// Endpoints:
//   GET  /api/maintenance                    → lista logs (filtros: printerCode, type, from, to)
//   POST /api/maintenance                    → crea un log (opcional: descuenta supplies)
//   GET  /api/maintenance/:id                → detalle
//   PATCH /api/maintenance/:id               → editar
//   DELETE /api/maintenance/:id              → borrar
//
//   GET /api/maintenance/timeline/:code      → historial completo de una impresora
//   GET /api/maintenance/alerts              → próximos vencimientos + atrasados
//   GET /api/maintenance/kpis                → costo total, MTBF, downtime, uptime
//   GET /api/maintenance/types               → catálogo de tipos usados (para filtros/autocomplete)
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';

const COLL = 'maintenance_logs';

const MAINTENANCE_TYPES = [
  { code: 'nozzle_check',      label: 'Nozzle check' },
  { code: 'head_cleaning',     label: 'Limpieza de cabezal' },
  { code: 'deep_cleaning',     label: 'Limpieza profunda' },
  { code: 'ink_change',        label: 'Cambio de tinta' },
  { code: 'head_replacement',  label: 'Cambio de cabezal' },
  { code: 'damper_replacement',label: 'Cambio de damper' },
  { code: 'capping_station',   label: 'Cambio de capping station' },
  { code: 'firmware_update',   label: 'Actualización de firmware' },
  { code: 'general_service',   label: 'Servicio general' },
  { code: 'repair',            label: 'Reparación / correctivo' },
  { code: 'other',              label: 'Otro' },
];

// Frecuencia sugerida por tipo (días) — usado para calcular alertas si no hay nextDueDate manual
const DEFAULT_INTERVAL_DAYS = {
  nozzle_check: 7,
  head_cleaning: 15,
  deep_cleaning: 60,
  ink_change: 90,
  head_replacement: 365,
  damper_replacement: 180,
  capping_station: 180,
  firmware_update: 365,
  general_service: 90,
};

// ---------------------------------------------------------------------------
// Helper: descontar supplies consumidos (best-effort, no bloquea el log)
// ---------------------------------------------------------------------------
async function consumeSupplies(db, log) {
  const now = new Date();
  if (!Array.isArray(log.suppliesConsumed) || !log.suppliesConsumed.length) return;
  for (const c of log.suppliesConsumed) {
    if (!c.supplyId || !c.quantity) continue;
    const supply = await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).findOne({ id: c.supplyId });
    if (!supply) continue;
    const newStock = Math.max(0, (supply.currentQuantity || 0) - Number(c.quantity));
    await db.collection(COLLECTIONS.PRODUCTION_SUPPLIES).updateOne(
      { id: c.supplyId },
      { $set: { currentQuantity: newStock, updatedAt: now } }
    );
    await db.collection(COLLECTIONS.STOCK_MOVEMENTS).insertOne({
      id: uuidv4(),
      type: 'supply_out',
      reference: 'maintenance',
      referenceId: log.id,
      itemType: 'supply',
      itemId: c.supplyId,
      quantity: -Number(c.quantity),
      balanceAfter: newStock,
      operatorId: log.operatorId || null,
      reason: `Mantenimiento ${log.type} · ${log.printerName || log.printerCode}`,
      createdAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// Helper: calcular próxima fecha sugerida
// ---------------------------------------------------------------------------
function computeNextDueDate(date, type, intervalDays) {
  if (intervalDays) {
    const d = new Date(date);
    d.setDate(d.getDate() + intervalDays);
    return d;
  }
  const def = DEFAULT_INTERVAL_DAYS[type];
  if (!def) return null;
  const d = new Date(date);
  d.setDate(d.getDate() + def);
  return d;
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------
async function handleList(db, url) {
  const filter = {};
  const printerCode = url.searchParams.get('printerCode');
  const type = url.searchParams.get('type');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)));
  if (printerCode) filter.printerCode = printerCode;
  if (type) filter.type = type;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const rows = await db.collection(COLL).find(filter).sort({ date: -1 }).limit(limit).toArray();
  return json(strip(rows));
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------
async function handleCreate(db, request) {
  const body = await request.json().catch(() => ({}));
  const {
    printerId, printerCode, printerName,
    type, date, notes, cost, operatorId, operatorName,
    hoursOperated, partsReplaced, suppliesConsumed, nextDueDate, intervalDays,
  } = body || {};

  if (!printerCode) return err('printerCode requerido');
  if (!type) return err('type requerido');

  // Resolver el printer si solo se pasó code
  let pr = null;
  if (printerId) {
    pr = await db.collection(COLLECTIONS.PRINTERS).findOne({ id: printerId });
  }
  if (!pr && printerCode) {
    pr = await db.collection(COLLECTIONS.PRINTERS).findOne({ code: printerCode });
  }
  if (!pr) return err(`Impresora ${printerCode} no encontrada`, 404);

  const eventDate = date ? new Date(date) : new Date();
  const computedNext = nextDueDate ? new Date(nextDueDate) : computeNextDueDate(eventDate, type, intervalDays);

  const now = new Date();
  const log = {
    id: uuidv4(),
    printerId: pr.id,
    printerCode: pr.code,
    printerName: pr.label || printerName,
    type,
    typeLabel: (MAINTENANCE_TYPES.find(t => t.code === type) || {}).label || type,
    date: eventDate,
    notes: notes || '',
    cost: Number(cost) || 0,
    operatorId: operatorId || null,
    operatorName: operatorName || null,
    hoursOperated: Number(hoursOperated) || 0,
    partsReplaced: Array.isArray(partsReplaced) ? partsReplaced : [],
    suppliesConsumed: Array.isArray(suppliesConsumed) ? suppliesConsumed : [],
    nextDueDate: computedNext,
    intervalDays: intervalDays || null,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(COLL).insertOne(log);
  await consumeSupplies(db, log).catch((e) => console.warn('[maintenance] consumeSupplies:', e.message));

  return json({ ok: true, log: strip(log) });
}

// ---------------------------------------------------------------------------
// UPDATE / DELETE (por id)
// ---------------------------------------------------------------------------
async function handleUpdate(db, id, request) {
  const body = await request.json().catch(() => ({}));
  const $set = { updatedAt: new Date() };
  const allowed = ['type', 'date', 'notes', 'cost', 'operatorId', 'operatorName',
                   'hoursOperated', 'partsReplaced', 'suppliesConsumed', 'nextDueDate', 'intervalDays'];
  for (const k of allowed) {
    if (k in body) {
      $set[k] = (k === 'date' || k === 'nextDueDate') && body[k] ? new Date(body[k]) : body[k];
    }
  }
  if ('type' in body) {
    $set.typeLabel = (MAINTENANCE_TYPES.find(t => t.code === body.type) || {}).label || body.type;
  }
  await db.collection(COLL).updateOne({ id }, { $set });
  const log = await db.collection(COLL).findOne({ id });
  return json({ ok: true, log: strip(log) });
}

async function handleDelete(db, id) {
  const res = await db.collection(COLL).deleteOne({ id });
  return json({ ok: true, deleted: res.deletedCount > 0 });
}

// ---------------------------------------------------------------------------
// Timeline por impresora
// ---------------------------------------------------------------------------
async function handleTimeline(db, printerCode) {
  const rows = await db.collection(COLL).find({ printerCode }).sort({ date: -1 }).toArray();
  const printer = await db.collection(COLLECTIONS.PRINTERS).findOne({ code: printerCode });
  const totalCost = rows.reduce((s, r) => s + (r.cost || 0), 0);
  const byType = rows.reduce((acc, r) => { acc[r.type] = (acc[r.type] || 0) + 1; return acc; }, {});
  return json({
    printer: strip(printer),
    events: strip(rows),
    stats: {
      totalEvents: rows.length,
      totalCost,
      byType,
      lastEvent: rows[0]?.date || null,
      nextDue: rows.filter(r => r.nextDueDate).sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))[0]?.nextDueDate || null,
    },
  });
}

// ---------------------------------------------------------------------------
// Alertas — próximos + atrasados
// ---------------------------------------------------------------------------
async function handleAlerts(db) {
  const now = new Date();
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);

  // Tomar el ÚLTIMO log por (printerCode, type) para saber cuándo se hizo la última vez
  const pipeline = [
    { $sort: { date: -1 } },
    {
      $group: {
        _id: { printerCode: '$printerCode', type: '$type' },
        lastDate: { $first: '$date' },
        nextDueDate: { $first: '$nextDueDate' },
        printerName: { $first: '$printerName' },
        typeLabel: { $first: '$typeLabel' },
        intervalDays: { $first: '$intervalDays' },
      },
    },
  ];
  const latests = await db.collection(COLL).aggregate(pipeline).toArray();

  const overdue = [];
  const dueSoon = [];   // en los próximos 7 días
  const dueLater = [];  // en los próximos 30 días
  for (const l of latests) {
    if (!l.nextDueDate) continue;
    const due = new Date(l.nextDueDate);
    const item = {
      printerCode: l._id.printerCode,
      printerName: l.printerName,
      type: l._id.type,
      typeLabel: l.typeLabel,
      lastDate: l.lastDate,
      nextDueDate: l.nextDueDate,
      daysUntilDue: Math.ceil((due - now) / 86400000),
    };
    if (due < now) overdue.push(item);
    else if (due < in7) dueSoon.push(item);
    else if (due < in30) dueLater.push(item);
  }

  overdue.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  dueSoon.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return json({
    now,
    overdue,
    dueSoon,
    dueLater,
    counts: { overdue: overdue.length, dueSoon: dueSoon.length, dueLater: dueLater.length },
  });
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
async function handleKpis(db, url) {
  const days = parseInt(url.searchParams.get('days') || '90', 10);
  const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0);

  const logs = await db.collection(COLL).find({ date: { $gte: from } }).toArray();
  const totalCost = logs.reduce((s, r) => s + (r.cost || 0), 0);
  const totalEvents = logs.length;

  // Costo y eventos por impresora
  const byPrinter = {};
  for (const l of logs) {
    const k = l.printerCode || 'unknown';
    byPrinter[k] = byPrinter[k] || { printerCode: k, printerName: l.printerName, events: 0, cost: 0, corrective: 0 };
    byPrinter[k].events += 1;
    byPrinter[k].cost += l.cost || 0;
    if (l.type === 'repair') byPrinter[k].corrective += 1;
  }

  // Eventos por tipo
  const byType = {};
  for (const l of logs) {
    const k = l.type || 'other';
    byType[k] = byType[k] || { type: k, label: l.typeLabel || k, count: 0, cost: 0 };
    byType[k].count += 1;
    byType[k].cost += l.cost || 0;
  }

  // MTBF aproximado por impresora — días promedio entre correctivos
  const correctiveByPrinter = {};
  for (const l of logs) {
    if (l.type !== 'repair') continue;
    (correctiveByPrinter[l.printerCode] = correctiveByPrinter[l.printerCode] || []).push(new Date(l.date));
  }
  const mtbf = [];
  for (const [code, dates] of Object.entries(correctiveByPrinter)) {
    if (dates.length < 2) continue;
    dates.sort((a, b) => a - b);
    const diffs = [];
    for (let i = 1; i < dates.length; i++) diffs.push((dates[i] - dates[i - 1]) / 86400000);
    const avg = diffs.reduce((s, d) => s + d, 0) / diffs.length;
    mtbf.push({ printerCode: code, mtbfDays: Math.round(avg * 10) / 10 });
  }

  return json({
    periodDays: days,
    totalEvents,
    totalCost,
    byPrinter: Object.values(byPrinter).sort((a, b) => b.cost - a.cost),
    byType: Object.values(byType).sort((a, b) => b.count - a.count),
    mtbf,
  });
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------
export default async function handleMaintenance(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/maintenance')) return null;

  const url = new URL(request.url);

  // Rutas específicas primero
  if (route === '/maintenance/types' && method === 'GET') {
    return json({ types: MAINTENANCE_TYPES });
  }
  if (route === '/maintenance/alerts' && method === 'GET') {
    return handleAlerts(db);
  }
  if (route === '/maintenance/kpis' && method === 'GET') {
    return handleKpis(db, url);
  }
  if (route.startsWith('/maintenance/timeline/') && method === 'GET') {
    const printerCode = route.split('/')[3];
    if (!printerCode) return err('printerCode requerido');
    return handleTimeline(db, printerCode);
  }

  // /maintenance base
  if (route === '/maintenance' && method === 'GET') return handleList(db, url);
  if (route === '/maintenance' && method === 'POST') return handleCreate(db, request);

  // /maintenance/:id
  if (route.startsWith('/maintenance/') && (method === 'PATCH' || method === 'DELETE' || method === 'GET')) {
    const id = route.split('/')[2];
    if (!id) return err('id requerido');
    if (method === 'GET') {
      const log = await db.collection(COLL).findOne({ id });
      if (!log) return err('log no encontrado', 404);
      return json(strip(log));
    }
    if (method === 'PATCH') return handleUpdate(db, id, request);
    if (method === 'DELETE') return handleDelete(db, id);
  }

  return null;
}
