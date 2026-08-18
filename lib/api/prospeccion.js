// =============================================================================
// Módulo Prospección B2B — API handler (Quinta Región)
// -----------------------------------------------------------------------------
// Endpoints (todos bajo /api/prospeccion/*, admin only salvo donde se indica):
//
//  Campañas:
//   GET  /prospeccion/campaigns          → listar campañas (admin)
//   GET  /prospeccion/campaigns/:id      → detalle + métricas (admin)
//   POST /prospeccion/campaigns          → crear campaña (admin)
//   PATCH /prospeccion/campaigns/:id     → actualizar / pausar / reanudar (admin)
//
//  Descubrimiento:
//   POST /prospeccion/discovery          → ejecutar descubrimiento por campaña
//                                          { campaignId, providerOverride?, manualBusinesses? }
//
//  Prospectos:
//   GET  /prospeccion/leads              → listar con filtros (rubro, comuna, score, estado, fuente)
//   GET  /prospeccion/leads/:id          → detalle
//   PATCH /prospeccion/leads/:id         → cambiar estado (approve/reject/etiquetas)
//
//  Mensajes:
//   GET  /prospeccion/messages           → listar / preview { campaignId, leadId }
//   POST /prospeccion/messages/approve   → aprobar lote { campaignId, campaignLeadIds[] }
//   POST /prospeccion/messages/test      → enviar prueba { toEmail }
//
//  Supresiones:
//   GET  /prospeccion/suppressions       → listar
//   POST /prospeccion/suppressions       → agregar { type, value, reason }
//   DELETE /prospeccion/suppressions/:id → retirar
//
//  Auditoría y configuración:
//   GET  /prospeccion/audit              → eventos (admin)
//   GET  /prospeccion/config             → configuración del módulo (flags, modo, límites)
// =============================================================================
import { NextResponse } from 'next/server';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import { coll } from '@/lib/mongo';
import { listCampaigns, getCampaign, createCampaign, updateCampaign, pauseCampaign, resumeCampaign } from '@/lib/prospeccion/campaigns';
import { runDiscoveryForCampaign } from '@/lib/prospeccion/discovery';
import { listLeads, getLead, updateLeadState, listLeadStats } from '@/lib/prospeccion/leads';
import { isSimulationMode, previewMessage, approveMessageBatch, sendTestMessage } from '@/lib/prospeccion/messages';
import { sendOne, processJobBatch } from '@/lib/prospeccion/mailer';
import { listSuppressions, addSuppression, removeSuppression } from '@/lib/prospeccion/suppression';
import { listAuditEvents } from '@/lib/prospeccion/audit';
import { listCategories } from '@/lib/prospeccion/templates';
import { isScraperEnabled } from '@/lib/prospeccion/discovery/scraper';

function requireAdmin(request) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return null;
  return user;
}

function matchRoute(route, pattern) {
  const rp = route.split('/').filter(Boolean);
  const pp = pattern.split('/').filter(Boolean);
  if (rp.length !== pp.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(rp[i]);
    else if (pp[i] !== rp[i]) return null;
  }
  return params;
}

function readInt(qs, key, def) {
  const v = qs.get(key);
  const n = v === null || v === '' ? def : Number(v);
  return Number.isFinite(n) ? n : def;
}

export default async function handleProspection({ request, method, route, db }) {
  const url = new URL(request.url, 'http://internal');
  const qs = url.searchParams;

  const routes = [
    // Campañas
    { pattern: '/prospeccion/campaigns', get: handleCampaignsGet, post: handleCampaignsPost },
    { pattern: '/prospeccion/campaigns/:id', get: handleCampaignGet, patch: handleCampaignPatch },
    { pattern: '/prospeccion/campaigns/:id/leads', get: handleCampaignLeadsGet },
    // Descubrimiento
    { pattern: '/prospeccion/discovery', post: handleDiscoveryPost },
    // Leads
    { pattern: '/prospeccion/leads', get: handleLeadsGet },
    { pattern: '/prospeccion/leads/csv', get: handleLeadsCsv },
    { pattern: '/prospeccion/leads/stats', get: handleLeadsStatsGet },
    { pattern: '/prospeccion/leads/:id', get: handleLeadGet, patch: handleLeadPatch },
    // Mensajes
    { pattern: '/prospeccion/messages', get: handleMessagesGet, post: handleMessagesPost },
    { pattern: '/prospeccion/messages/approve', post: handleMessagesApprove },
    { pattern: '/prospeccion/messages/test', post: handleMessagesTest },
    // Envío real (jobs)
    { pattern: '/prospeccion/jobs/run', post: handleJobsRunPost },
    { pattern: '/prospeccion/jobs', get: handleJobsGet },
    // Supresiones
    { pattern: '/prospeccion/suppressions', get: handleSuppressionsGet, post: handleSuppressionsPost },
    { pattern: '/prospeccion/suppressions/:id', delete: handleSuppressionDelete },
    // Configuración y auditoría
    { pattern: '/prospeccion/audit', get: handleAuditGet },
    { pattern: '/prospeccion/config', get: handleConfigGet },
    { pattern: '/prospeccion/categories', get: handleCategoriesGet },
  ];

  for (const r of routes) {
    const params = matchRoute(route, r.pattern);
    if (params === null) continue;
    const fn = r[method.toLowerCase()];
    if (!fn) return err('Método no permitido', 405);
    return fn(request, params, qs);
  }
  return null; // ruta no reconocida → que continúe el siguiente handler
}

function readBody(req) {
  return req.json().catch(() => ({}));
}

async function withAdmin(req, fn) {
  const user = requireAdmin(req);
  if (!user) return err('No autorizado', 401);
  return fn(user);
}

// ---------- Campañas ----------
async function handleCampaignsGet() {
  return withAdmin(arguments[0], async () => {
    const data = await listCampaigns({ page: 1, pageSize: 50 });
    return json(strip(data));
  });
}
async function handleCampaignsPost(request) {
  return withAdmin(request, async (user) => {
    const body = await readBody(request);
    const campaign = await createCampaign(body, user.id, user.name);
    return json(strip(campaign), { status: 201 });
  });
}
async function handleCampaignGet(request, params) {
  return withAdmin(request, async () => {
    const campaign = await getCampaign(params.id);
    if (!campaign) return err('Campaña no encontrada', 404);
    return json(strip(campaign));
  });
}
async function handleCampaignLeadsGet(request, params) {
  return withAdmin(request, async () => {
    const cl = await coll(COLLECTIONS.PRO_CAMPAIGN_LEADS);
    const leads = await coll(COLLECTIONS.PRO_LEADS);
    const rows = await cl.find({ campaignId: params.id }).toArray();
    const items = [];
    for (const row of rows) {
      const lead = await leads.findOne({ id: row.leadId });
      if (lead) items.push({ ...lead, campaignLeadId: row.id, campaignLeadState: row.state, campaignLeadCreatedAt: row.createdAt });
    }
    return json(strip(items));
  });
}
async function handleCampaignPatch(request, params) {
  return withAdmin(request, async (user) => {
    const body = await readBody(request);
    try {
      let result;
      if (body.action === 'pause') result = await pauseCampaign(params.id, user.id, user.name);
      else if (body.action === 'resume') result = await resumeCampaign(params.id, user.id, user.name);
      else result = await updateCampaign(params.id, body, user.id, user.name);
      return json(strip(result));
    } catch (e) {
      return err(e.message, 400);
    }
  });
}

// ---------- Descubrimiento ----------
async function handleDiscoveryPost(request) {
  return withAdmin(request, async (user) => {
    const body = await readBody(request);
    if (!body.campaignId) return err('campaignId requerido', 400);
    try {
      const outcome = await runDiscoveryForCampaign({
        campaignId: body.campaignId,
        providerOverride: body.providerOverride || null,
        manualBusinesses: body.manualBusinesses || [],
        actorId: user.id,
      });
      return json({
        saved: outcome.saved,
        skipped: outcome.skipped,
        errors: outcome.result?.errors || [],
        discovered: outcome.result?.discovered?.slice(0, 20) || [], // solo primeros 20 para el preview
      });
    } catch (e) {
      return err(e.message, 400);
    }
  });
}

// ---------- Leads ----------
// Exporta los prospectos (con filtros aplicados, sin límite de paginación) como CSV UTF-8
async function handleLeadsCsv(request) {
  return withAdmin(request, async () => {
    const data = await listLeads({
      page: 1,
      pageSize: 5000,
      category: qsRef(request).get('category') || undefined,
      commune: qsRef(request).get('commune') || undefined,
      state: qsRef(request).get('state') || undefined,
      source: qsRef(request).get('source') || undefined,
      minScore: readInt(qsRef(request), 'minScore', null),
      maxScore: readInt(qsRef(request), 'maxScore', null),
      q: qsRef(request).get('q') || undefined,
    });
    const rows = [
      ['Nombre', 'Rubro', 'Comuna', 'Email', 'Teléfono', 'Sitio web', 'Score', 'Estado', 'Fuente', 'Dirección'],
      ...data.items.map(l => [
        esc(l.name),
        esc(CATEGORY_LABELS[l.category] || l.category || ''),
        esc(l.commune),
        esc(l.email),
        esc(l.phone),
        esc(l.website),
        esc(String(l.score?.final ?? '')),
        esc(STATE_LABELS[l.state] || l.state || ''),
        esc(l.source),
        esc(l.address),
      ]),
    ];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n') + '\r\n';
    const filename = `prospectos-estampadosdlv-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  });
}

const CATEGORY_LABELS = {
  restaurantes: 'Restaurantes', cafeterias: 'Cafeterías', bares: 'Bares',
  alojamiento_turismo: 'Alojamiento y Turismo', salud_privada: 'Salud Privada',
  educacion: 'Educación', gimnasios: 'Gimnasios', automotor: 'Automotor',
  retail: 'Retail', servicios_profesionales: 'Servicios Profesionales',
  construccion: 'Construcción', otros: 'Otros',
};
const STATE_LABELS = {
  requiere_revision: 'Requiere revisión', candidato: 'Candidato', descartado: 'Descartado',
  aprobado_contacto: 'Aprobado para contacto', contactado: 'Contactado', respondio: 'Respondió',
  reunion: 'Reunión', no_interesado: 'No interesado', rebote: 'Rebote',
  baja: 'Baja', bloqueado: 'Bloqueado',
};
function esc(v) { return String(v ?? ''); }

async function handleLeadsGet(request) {
  return withAdmin(request, async () => {
    const data = await listLeads({
      page: readInt(qsRef(request), 'page', 1),
      pageSize: Math.min(100, readInt(qsRef(request), 'pageSize', 50)),
      category: qsRef(request).get('category') || undefined,
      commune: qsRef(request).get('commune') || undefined,
      state: qsRef(request).get('state') || undefined,
      source: qsRef(request).get('source') || undefined,
      minScore: readInt(qsRef(request), 'minScore', null),
      maxScore: readInt(qsRef(request), 'maxScore', null),
      q: qsRef(request).get('q') || undefined,
    });
    return json(strip(data));
  });
}
async function handleLeadsStatsGet() {
  return withAdmin(arguments[0], async () => json(await listLeadStats()));
}
async function handleLeadGet(request, params) {
  return withAdmin(request, async () => {
    const lead = await getLead(params.id);
    if (!lead) return err('Prospecto no encontrado', 404);
    return json(strip(lead));
  });
}
async function handleLeadPatch(request, params) {
  return withAdmin(request, async (user) => {
    const body = await readBody(request);
    try {
      const lead = await updateLeadState(params.id, body, user.id, user.name);
      return json(strip(lead));
    } catch (e) {
      return err(e.message, 400);
    }
  });
}

// ---------- Mensajes ----------
async function handleMessagesGet(request) {
  return withAdmin(request, async () => {
    const qs = qsRef(request);
    if (qs.get('preview') === '1' && qs.get('leadId')) {
      const leads = await coll(COLLECTIONS.PRO_LEADS);
      const lead = await leads.findOne({ id: qs.get('leadId') });
      if (!lead) return err('Prospecto no encontrado', 404);
      const preview = previewMessage(lead, lead.category || 'otros', 'email');
      return json(strip(preview));
    }
    const page = readInt(qs, 'page', 1);
    const pageSize = Math.min(100, readInt(qs, 'pageSize', 50));
    const skip = Math.max(0, (page - 1) * pageSize);
    const messages = await coll(COLLECTIONS.PRO_MESSAGES);
    const filter = {};
    if (qs.get('campaignId')) filter.campaignId = qs.get('campaignId');
    if (qs.get('status')) filter.status = qs.get('status');
    const [items, total] = await Promise.all([
      messages.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).toArray(),
      messages.countDocuments(filter),
    ]);
    return json({ items: items.map(strip), page, pageSize, total });
  });
}
async function handleMessagesPost() {
  return err('Usar /prospeccion/messages/approve o /prospeccion/messages/test', 400);
}
async function handleMessagesApprove(request) {
  return withAdmin(request, async (user) => {
    const body = await readBody(request);
    try {
      const result = await approveMessageBatch({
        campaignId: body.campaignId,
        campaignLeadIds: body.campaignLeadIds || [],
        actorId: user.id,
        actorName: user.name,
      });
      return json(result);
    } catch (e) {
      return err(e.message, 400);
    }
  });
}
async function handleMessagesTest(request) {
  return withAdmin(request, async (user) => {
    const body = await readBody(request);
    if (!body.toEmail) return err('toEmail requerido', 400);
    try {
      // Crea el mensaje de prueba (en BD) y lo ENCOLA para entrega real via mailer
      const msg = await sendTestMessage({ toEmail: body.toEmail, actorId: user.id });
      if (!isSimulationMode()) {
        const result = await sendOne({
          messageId: msg.id, campaignId: null, recipient: msg.recipient,
          subject: msg.subject, body: msg.body, test: true, actorId: user.id, actorName: user.name,
        });
        return json({ ...strip(msg), delivery: result });
      }
      return json(strip(msg));
    } catch (e) {
      return err(e.message, 400);
    }
  });
}

// ---------- Supresiones ----------
async function handleSuppressionsGet(request) {
  return withAdmin(request, async () => {
    const qs = qsRef(request);
    const data = await listSuppressions({
      page: readInt(qs, 'page', 1),
      pageSize: Math.min(100, readInt(qs, 'pageSize', 50)),
    });
    return json(strip(data));
  });
}
async function handleSuppressionsPost(request) {
  return withAdmin(request, async (user) => {
    const body = await readBody(request);
    if (!body.type || !body.value) return err('type y value requeridos', 400);
    try {
      const s = await addSuppression(body.type, body.value, body.reason || '', user.id);
      return json(strip(s), { status: 201 });
    } catch (e) {
      return err(e.message, 400);
    }
  });
}
async function handleSuppressionDelete(request, params) {
  return withAdmin(request, async (user) => {
    try {
      const s = await removeSuppression(params.id, user.id);
      return json(strip(s));
    } catch (e) {
      return err(e.message, 400);
    }
  });
}

// ---------- Auditoría / configuración ----------
async function handleAuditGet(request) {
  return withAdmin(request, async () => {
    const qs = qsRef(request);
    const data = await listAuditEvents({
      page: readInt(qs, 'page', 1),
      pageSize: Math.min(100, readInt(qs, 'pageSize', 100)),
      action: qs.get('action') || undefined,
    });
    return json(strip(data));
  });
}
async function handleConfigGet() {
  return withAdmin(arguments[0], async () => json({
    simulationMode: isSimulationMode(),
    providerConfigured: Boolean(process.env.RESEND_API_KEY),
    from: process.env.PROSPECTION_FROM || 'Sandra Vásquez <hola@estampadosdlv.com>',
    scraperEnabled: isScraperEnabled(),
    categories: listCategories(),
  }));
}

// ---------- Jobs de envío real ----------
async function handleJobsRunPost(request) {
  return withAdmin(request, async (user) => {
    try {
      const result = await processJobBatch({ actorId: user.id, actorName: user.name });
      return json(result);
    } catch (e) {
      return err(e.message, 400);
    }
  });
}
async function handleJobsGet() {
  return withAdmin(arguments[0], async () => {
    const jobs = await coll(COLLECTIONS.PRO_JOBS);
    const [total, pending] = await Promise.all([
      jobs.countDocuments({ type: 'message.send' }),
      jobs.countDocuments({ type: 'message.send', status: 'pending' }),
    ]);
    return json({ total, pending });
  });
}
async function handleCategoriesGet() {
  return withAdmin(arguments[0], async () => json(listCategories()));
}

/** Extrae searchParams de una request (helper local). */
function qsRef(request) {
  return new URL(request.url, 'http://internal').searchParams;
}
