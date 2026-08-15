// =============================================================================
// Módulo Marketing — API handler (auditoría jul-2026)
// -----------------------------------------------------------------------------
// Endpoints (todos bajo /api/marketing/*):
//
//  Conexión Meta (OAuth):
//   GET  /marketing/status                    → estado general del módulo (admin)
//   GET  /marketing/oauth/start               → { url } diálogo OAuth (admin)
//   GET  /marketing/oauth/callback            → redirect de Meta (code+state)
//   POST /marketing/accounts/select           → elegir página/IG/ad account (admin)
//   DELETE /marketing/accounts                → desconectar (admin)
//
//  Posts:
//   GET  /marketing/posts                     → listar (admin)
//   POST /marketing/posts/generate            → genera post con IA para un producto (admin)
//   PATCH /marketing/posts                    → editar caption/programación/estado (admin)
//   POST /marketing/posts/publish             → publicar ahora un post (admin)
//   DELETE /marketing/posts?id=               → eliminar borrador (admin)
//
//  Anuncios (recetas):
//   GET  /marketing/campaigns                 → listar campañas creadas (admin)
//   POST /marketing/campaigns                 → crear campaña receta (admin)
//   POST /marketing/campaigns/status          → pausar/activar (admin)
//
//  Métricas:
//   GET  /marketing/metrics                   → resumen posts + ads (admin)
//
//  Automatización:
//   POST /marketing/dispatch                  → cron: publica posts programados,
//                                               envía reseñas vencidas, refresca métricas.
//                                               Auth: header x-cron-secret o admin.
//  Catálogo Meta:
//   GET  /marketing/feed.csv                  → feed de productos para Commerce Manager (público)
// =============================================================================
import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err, cors } from './_helpers';
import { getUserFromRequest } from '@/lib/auth/session';
import { encryptToken, decryptToken, isEncryptionConfigured } from '@/lib/marketing/crypto';
import {
  isMetaConfigured, buildOAuthUrl, exchangeCodeForToken,
  getAllManagedPages, getInstagramAccount, getAdAccounts,
  publishFacebookPhoto, publishInstagramPhoto, getInstagramPublishingLimit,
  publishFacebookVideoDirect, publishInstagramVideoDirect,
  createCampaign, createAdSet, createAdCreative, createAd, updateCampaignStatus,
  getCampaignInsights, getPostInsights, getIgMediaInsights,
  graphFetch,
} from '@/lib/marketing/meta-client';
import { generatePostContent, isGeneratorConfigured } from '@/lib/marketing/post-generator';
import { composePostImage } from '@/lib/marketing/image-composer';
import { dispatchDueReviewRequests } from '@/lib/marketing/reviews';
import {
  isGoogleAdsConfigured, buildGoogleAdsOAuthUrl, exchangeCodeForGoogleAdsToken,
  saveGoogleAdsTokens, getGoogleAdsTokens, disconnectGoogleAds,
  getGoogleAdsConnectionStatus,
  listGoogleAdsCampaigns, createGoogleAdsSearchCampaign,
  createGoogleAdsAdGroup, createGoogleAdsKeyword, createGoogleAdsResponsiveAd,
  updateGoogleAdsCampaignStatus, getGoogleAdsMetrics,
} from '@/lib/marketing/google-ads-client';
import { generateOptimizationRecommendations } from '@/lib/marketing/google-ads-optimizer';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');
const ACCOUNT_KEY = 'meta_main'; // single-tenant: una sola conexión Meta
const GOOGLE_ACCOUNT_KEY = 'google_ads_main'; // conexión Google Ads

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function requireAdmin(request) {
  const user = getUserFromRequest(request);
  if (!user || user.role !== 'admin') return null;
  return user;
}

async function getAccount(db) {
  return db.collection(COLLECTIONS.MARKETING_ACCOUNTS).findOne({ key: ACCOUNT_KEY });
}

function accountTokens(account) {
  return {
    userToken: account?.userToken ? decryptToken(account.userToken) : null,
    pageToken: account?.pageToken ? decryptToken(account.pageToken) : null,
  };
}

/** Vista pública de la cuenta (sin tokens). */
function publicAccount(account) {
  if (!account) return null;
  const { _id, userToken, pageToken, oauthState, ...rest } = account;
  return rest;
}

const absUrl = (u) => (u?.startsWith('http') ? u : `${BASE}${u || ''}`);

// -----------------------------------------------------------------------------
// Publicación de un post (compartida entre publish-now y dispatch)
// -----------------------------------------------------------------------------

async function publishPost(db, post, account) {
  const { pageToken } = accountTokens(account);
  // Si hay Page Token directo configurado (META_PAGE_ACCESS_TOKEN), úsalo como fallback
  const directToken = process.env.META_PAGE_ACCESS_TOKEN;
  const directPageId = process.env.META_PAGE_ID;
  if (!pageToken && !directToken) throw new Error('Cuenta Meta sin page token — reconecta la cuenta');

  const results = { facebook: null, instagram: null };
  const errors = [];

  // Si el post tiene videoUrl, publicar como video; si no, como foto
  const isVideo = !!post.videoUrl;
  const mediaUrl = absUrl(isVideo ? post.videoUrl : post.imageUrl);

  if (post.platforms?.includes('facebook')) {
    try {
      if (isVideo && directToken && directPageId) {
        // Publicar como video en Facebook
        const data = await graphFetch(`/${directPageId}/videos`, {
          method: 'POST',
          token: directToken,
          params: { file_url: mediaUrl, description: post.fullCaption || post.caption || '' },
        });
        results.facebook = { videoId: data.id, postId: data.post_id || data.id };
      } else if (directToken && directPageId) {
        const data = await graphFetch(`/${directPageId}/photos`, {
          method: 'POST',
          token: directToken,
          params: { url: mediaUrl, message: post.fullCaption || post.caption || '' },
        });
        results.facebook = { photoId: data.id, postId: data.post_id || data.id };
      } else if (isVideo) {
        results.facebook = await publishFacebookVideoDirect({ videoUrl: mediaUrl, caption: post.fullCaption || post.caption });
      } else {
        results.facebook = await publishFacebookPhoto({
          pageId: account.pageId,
          pageToken,
          imageUrl: mediaUrl,
          caption: post.fullCaption || post.caption,
        });
      }
    } catch (e) {
      errors.push(`facebook: ${e.message}`);
    }
  }

  if (post.platforms?.includes('instagram') && account.igUserId) {
    try {
      const limit = await getInstagramPublishingLimit(account.igUserId, pageToken);
      if ((limit.quota_usage || 0) >= 95) {
        errors.push('instagram: cuota de publicación 24h casi agotada (95+/100)');
      } else if (isVideo && directToken && directPageId) {
        // Publicar como Reel en Instagram
        const igData = await graphFetch(`/${directPageId}`, {
          token: directToken,
          params: { fields: 'instagram_business_account{id,username}' },
        });
        const igUserId = igData.instagram_business_account?.id;
        if (igUserId) {
          const container = await graphFetch(`/${igUserId}/media`, {
            method: 'POST',
            token: directToken,
            params: {
              media_type: 'REELS',
              video_url: mediaUrl,
              caption: post.fullCaption || post.caption || '',
            },
          });
          // Esperar a que el contenedor de IG esté listo (la API necesita 10-60s para procesar el video)
          const maxWait = 60000;
          const start = Date.now();
          while (Date.now() - start < maxWait) {
            try {
              const status = await graphFetch(`/${container.id}`, {
                token: directToken,
                params: { fields: 'status_code' },
              });
              if (status.status_code === 'FINISHED' || status.status_code === 'EXPIRED') break;
            } catch { /* ignore transient errors during polling */ }
            await new Promise(r => setTimeout(r, 3000));
          }
          const published = await graphFetch(`/${igUserId}/media_publish`, {
            method: 'POST',
            token: directToken,
            params: { creation_id: container.id },
          });
          results.instagram = { containerId: container.id, mediaId: published.id };
        }
      } else if (isVideo) {
        results.instagram = await publishInstagramVideoDirect({ videoUrl: mediaUrl, caption: post.fullCaption || post.caption });
      } else {
        results.instagram = await publishInstagramPhoto({
          igUserId: account.igUserId,
          pageToken,
          imageUrl: mediaUrl,
          caption: post.fullCaption || post.caption,
          altText: post.altText,
        });
      }
    } catch (e) {
      errors.push(`instagram: ${e.message}`);
    }
  }

  const anyOk = results.facebook || results.instagram;
  const now = new Date();
  await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
    { id: post.id },
    {
      $set: {
        status: anyOk ? 'published' : 'failed',
        publishedAt: anyOk ? now : null,
        fbPostId: results.facebook?.postId || null,
        igMediaId: results.instagram?.mediaId || null,
        publishErrors: errors,
        retryCount: (post.retryCount || 0) + 1,
        updatedAt: now,
      },
    }
  );
  return { ok: !!anyOk, results, errors };
}

// Convierte el campo de premios del sorteo a un array de 3 objetos
// (soporta documentos antiguos que solo tenían 'prize' como texto).
function buildPrizesArray(contest) {
  if (Array.isArray(contest.prizes) && contest.prizes.length === 3) return contest.prizes;
  const text = (contest.prize || '').trim();
  if (!text) return null;
  // Formato esperado: '1er lugar: X · 2do lugar: Y · 3er lugar: Z' (o '1er lugar: X | ...')
  const parts = text.split(/\s*[·|]\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const extract = (t) => t.replace(/^\d+(?:er|do|o|ro)?\s+lugar:\s*/i, '').trim();
  const def = ['Polerón personalizado', 'Polera personalizada', 'Gorra personalizada'];
  const imgs = ['/uploads/contest/premio-poleron.png', '/uploads/contest/premio-polera.png', '/uploads/contest/premio-gorra.png'];
  return parts.slice(0, 3).map((p, i) => ({
    label: extract(p) || def[i],
    image: imgs[i],
  }));
}

// -----------------------------------------------------------------------------
// Handler principal
// -----------------------------------------------------------------------------
export default async function handleMarketing(ctx) {
  const { method, route, db, request } = ctx;
  if (!route.startsWith('/marketing')) return null;

  // ==========================================================================
  // RUTAS PÚBLICAS DE CONCURSO (deben estar ANTES del gate de admin)
  // GET  /marketing/contest             → datos del concurso activo
  // POST /marketing/contest/upload-proof → subir captura viral
  // GET  /marketing/contest/progress     → progreso viral de un participante
  // POST /marketing/contest/participate  → registro final del participante
  // ==========================================================================
  if (route === '/marketing/contest' && method === 'GET') {
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
    if (!contest) return json({ contest: null, participantCount: 0 });
    const count = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).countDocuments({ contestId: contest.id });
    return json({
      contest: {
        id: contest.id, title: contest.title, description: contest.description,
        prize: contest.prize, prizes: buildPrizesArray(contest) || null, ogImage: contest.ogImage || '/uploads/contest/og-concurso.jpg',
        rules: contest.rules, status: contest.status,
        startDate: contest.startDate, endDate: contest.endDate,
        winners: contest.winners ? {
          first: contest.winners.first ? { name: contest.winners.first.name, city: contest.winners.first.city } : null,
          second: contest.winners.second ? { name: contest.winners.second.name, city: contest.winners.second.city } : null,
          third: contest.winners.third ? { name: contest.winners.third.name, city: contest.winners.third.city } : null,
        } : null,
      },
      participantCount: count,
    });
  }
  // ==========================================================================
  // RUTAS DE CONCURSO CON ACCESO CRON-SECRET (admin o secret, ANTES del gate)
  // Los cron jobs del sorteo llaman con x-cron-secret; los admins con sesión.
  // ==========================================================================
  if (route === '/marketing/contest/privileged' && method === 'POST') {
    const secret = request.headers.get('x-cron-secret');
    const isCron = !!(secret && process.env.MARKETING_CRON_SECRET && secret === process.env.MARKETING_CRON_SECRET);
    if (!isCron && !requireAdmin(request)) return err('No autorizado', 401);
    const body = await request.json();
    const { action } = body;
    if (action === 'create') {
      return await createContest(ctx, body);
    }
    if (action === 'auto-pick') {
      return await pickWinnersAuto(ctx);
    }
    if (action === 'participants') {
      const participants = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS)
        .find({ contestId: body.contestId })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();
      return json({ participants: participants.map(strip) });
    }
    if (action === 'admin-summary') {
      const contest = await db.collection(COLLECTIONS.CONTESTS).findOne(
        {},
        { sort: { createdAt: -1 } },
      );
      return json({ contest });
    }
    if (action === 'update') {
      // Edición del sorteo desde el panel admin (multipart con imágenes de premios)
      const ctB = (request.headers.get('content-type') || '').toLowerCase();
      let titleB, startDateB, endDateB, prizesB;
      const uploadedB = {};
      if (ctB.includes('multipart/form-data')) {
        let formB;
        try { formB = await request.formData(); } catch (e) { return err('No se pudo leer el formulario: ' + e.message, 400); }
        titleB = String(formB.get('title') || '');
        startDateB = String(formB.get('startDate') || '');
        endDateB = String(formB.get('endDate') || '');
        const prizesRawB = String(formB.get('prizes') || '[]');
        try { prizesB = JSON.parse(prizesRawB); if (!Array.isArray(prizesB)) prizesB = []; } catch { prizesB = []; }
        const allowedMimeB = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        for (let i = 0; i < 3; i++) {
          const fB = formB.get(`prizeImage${i}`);
          if (!fB || typeof fB === 'string' || !fB.size || fB.size < 1024) continue;
          if (!allowedMimeB.includes(fB.type)) continue;
          if (fB.size > 5 * 1024 * 1024) continue;
          const extB = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[fB.type] || 'jpg';
          const fileNameB = `premio-editado-${Date.now()}-${i}.${extB}`;
          const fileBufB = Buffer.from(await fB.arrayBuffer());
          const relDirB = path.join('uploads', 'contest');
          const publicDirB = path.resolve(process.env.PUBLIC_ROOT || '/var/www/estampadosdlv/public', relDirB);
          await fs.mkdir(publicDirB, { recursive: true });
          await fs.writeFile(path.join(publicDirB, fileNameB), fileBufB);
          try { await fs.writeFile(path.join(process.cwd(), 'public', relDirB, fileNameB), fileBufB); } catch { /* noop */ }
          uploadedB[i] = `/uploads/contest/${fileNameB}`;
        }
      } else {
        // El cuerpo JSON ya fue leído al inicio del handler privilegiado (variable `body`)
        titleB = body.title;
        startDateB = body.startDate;
        endDateB = body.endDate;
        prizesB = Array.isArray(body.prizes) ? body.prizes : [];
      }
      let contestB = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: { $in: ['active', 'paused'] } });
      if (!contestB) contestB = await db.collection(COLLECTIONS.CONTESTS).findOne({}, { sort: { createdAt: -1 } });
      if (!contestB) return err('No hay ningún sorteo', 404);
      const setB = {};
      if (titleB && titleB.trim().length >= 3) setB.title = titleB.trim().slice(0, 200);
      const parseDateB = (s) => { const d = new Date(s); return isNaN(d.getTime()) ? null : d; };
      const startDB = parseDateB(startDateB);
      const endDB = parseDateB(endDateB);
      if (startDB) setB.startDate = startDB;
      if (endDB) {
        if (startDB && endDB <= startDB) return err('La fecha de fin debe ser posterior al inicio', 400);
        setB.endDate = endDB;
      }
      if (Array.isArray(prizesB) && prizesB.length === 3) {
        const baseImagesB = ['/uploads/contest/premio-poleron.png', '/uploads/contest/premio-polera.png', '/uploads/contest/premio-gorra.png'];
        setB.prizes = prizesB.map((p, i) => ({
          rank: ['1er lugar', '2do lugar', '3er lugar'][i],
          label: String(p?.label || '').slice(0, 120) || ['Polerón personalizado', 'Polera personalizada', 'Gorra personalizada'][i],
          image: uploadedB[i] || p?.image || baseImagesB[i],
        }));
      }
      if (Object.keys(setB).length === 0) return err('No hay cambios que guardar', 400);
      await db.collection(COLLECTIONS.CONTESTS).updateOne({ id: contestB.id }, { $set: setB });
      return json({ ok: true, contestId: contestB.id });
    }
    if (action === 'set-status') {
      const { status } = body;
      if (!['active', 'paused', 'ended'].includes(status)) return err('status inválido (active|paused|ended)');
      const contest = await db.collection(COLLECTIONS.CONTESTS).findOne(
        {},
        { sort: { createdAt: -1 } },
      );
      if (!contest) return err('No hay ningún sorteo', 404);
      await db.collection(COLLECTIONS.CONTESTS).updateOne(
        { id: contest.id },
        { $set: { status } },
      );
      return json({ ok: true, status, contestId: contest.id });
    }
    return err('acción de concurso no válida');
  }

  if (route === '/marketing/contest/upload-proof' && method === 'POST') {
    // Validación de content-type multipart
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) return err('Content-Type debe ser multipart/form-data', 400);
    let form;
    try { form = await request.formData(); } catch (e) { return err('No se pudo leer el formulario: ' + e.message, 400); }
    const email = String(form.get('email') || '').trim().toLowerCase();
    const proofType = String(form.get('proofType') || '').trim();
    const sharedNetworksRaw = String(form.get('sharedNetworks') || '[]');
    const file = form.get('file');
    if (!email || !email.includes('@')) return err('Email requerido');
    if (!['share1', 'share2', 'follow'].includes(proofType)) return err('proofType debe ser share1, share2 o follow', 400);
    if (!file || typeof file === 'string') return err('Captura de pantalla requerida', 400);
    let sharedNetworks = [];
    try {
      const parsed = JSON.parse(sharedNetworksRaw);
      if (Array.isArray(parsed)) sharedNetworks = parsed.filter(s => ['facebook', 'whatsapp', 'instagram', 'tiktok', 'x'].includes(s));
    } catch { /* empty */ }
    const allowedMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMime.includes(file.type)) return err('Solo se aceptan capturas JPG, PNG o WebP', 400);
    if (file.size > 5 * 1024 * 1024) return err('La captura excede 5 MB', 400);
    if (file.size < 1024) return err('La captura parece corrupta o vacía', 400);
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
    if (!contest) return err('No hay un concurso activo');
    if (new Date() > contest.endDate) return err('El concurso ya terminó');
    const emailSafe = email.replace(/[^a-z0-9@._-]/g, '_').slice(0, 80);
    const ext = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type] || 'jpg';
    const fileName = `${uuidv4()}.${ext}`;
    const fileBuf = Buffer.from(await file.arrayBuffer());
    const rel = path.join('uploads', 'contest-proofs', emailSafe, proofType);
    // En producción (output: standalone) el cwd del proceso PM2 es
    // <proyecto>/.next/standalone, por lo que cualquier ruta relativa a
    // process.cwd() queda fuera del public servido por nginx (alias /uploads/
    // apunta a /var/www/estampadosdlv/public). Usamos la ruta ABSOLUTA del
    // public servido por nginx y como respaldo también el cwd del proceso:
    const publicDir = path.resolve(process.env.PUBLIC_ROOT || '/var/www/estampadosdlv/public', rel);
    const publicDirCwd = path.resolve(process.cwd(), 'public', rel);
    try {
      await fs.mkdir(publicDir, { recursive: true });
      await fs.writeFile(path.join(publicDir, fileName), fileBuf);
    } catch { /* noop: solo falla fuera de producción */ }
    try {
      await fs.mkdir(publicDirCwd, { recursive: true });
      await fs.writeFile(path.join(publicDirCwd, fileName), fileBuf);
    } catch { /* noop */ }
    const proofUrl = `/uploads/contest-proofs/${emailSafe}/${proofType}/${fileName}`;
    const participantCol = db.collection(COLLECTIONS.CONTEST_PARTICIPANTS);
    let participant = await participantCol.findOne({ contestId: contest.id, email });
    if (participant) {
      const updates = {};
      if (proofType === 'share1') { updates.proofShare1Url = proofUrl; updates.proofShare1At = new Date(); updates.sharedNetworks = sharedNetworks.length ? sharedNetworks : (participant.sharedNetworks || []); }
      else if (proofType === 'share2') { updates.proofShare2Url = proofUrl; updates.proofShare2At = new Date(); }
      else if (proofType === 'follow') { updates.proofFollowUrl = proofUrl; updates.proofFollowAt = new Date(); updates.followingNetworks = true; }
      await participantCol.updateOne({ id: participant.id }, { $set: updates });
    } else {
      const doc = {
        id: uuidv4(), contestId: contest.id, email, name: '', phone: '', city: '', designIdea: '',
        proofShare1Url: proofType === 'share1' ? proofUrl : null, proofShare1At: proofType === 'share1' ? new Date() : null,
        proofShare2Url: proofType === 'share2' ? proofUrl : null, proofShare2At: proofType === 'share2' ? new Date() : null,
        proofFollowUrl: proofType === 'follow' ? proofUrl : null, proofFollowAt: proofType === 'follow' ? new Date() : null,
        sharedNetworks: proofType === 'share1' && sharedNetworks.length ? sharedNetworks : [],
        followingNetworks: proofType === 'follow', viralComplete: false, createdAt: new Date(),
      };
      await participantCol.insertOne(doc);
    }
    const updated = await participantCol.findOne({ contestId: contest.id, email });
    const viralComplete = !!(updated.proofShare1Url && updated.proofShare2Url && updated.proofFollowUrl);
    if (viralComplete && !updated.viralComplete) {
      await participantCol.updateOne({ id: updated.id }, { $set: { viralComplete: true, viralCompleteAt: new Date() } });
    }
    return json({ ok: true, proofUrl, proofType, viralComplete: viralComplete || !!updated.viralComplete, hasShare1: !!updated.proofShare1Url, hasShare2: !!updated.proofShare2Url, hasFollow: !!updated.proofFollowUrl });
  }
  if (route === '/marketing/contest/progress' && method === 'GET') {
    const url = new URL(request.url);
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    const empty = { viralComplete: false, hasShare1: false, hasShare2: false, hasFollow: false };
    if (!email || !email.includes('@')) return json(empty);
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
    if (!contest) return json(empty);
    const participant = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).findOne({ contestId: contest.id, email });
    if (!participant) return json(empty);
    return json({
      viralComplete: !!participant.viralComplete, hasShare1: !!participant.proofShare1Url,
      hasShare2: !!participant.proofShare2Url, hasFollow: !!participant.proofFollowUrl,
      sharedNetworks: participant.sharedNetworks || [], registered: !!(participant.name && participant.name.trim()),
    });
  }
  if (route === '/marketing/contest/participate' && method === 'POST') {
    const body = await request.json();
    const { name, email, phone, city, designIdea } = body;
    if (!email || !phone) return err('Email y teléfono son obligatorios');
    if (email.length > 100 || (name && name.length > 100) || phone.length > 20) return err('Campos demasiado largos');
    if (!email.includes('@') || !email.includes('.')) return err('Email inválido');
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
    if (!contest) return err('No hay un concurso activo');
    if (new Date() > contest.endDate) return err('El concurso ya terminó');
    const emailNorm = email.toLowerCase().trim();
    const existing = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).findOne({ contestId: contest.id, email: emailNorm });
    if (existing && existing.name && existing.name.trim()) {
      return json({ ok: true, duplicate: true, message: 'Ya estás registrado en este concurso' });
    }

    // Confirmación de participación por correo (best-effort, nunca rompe el registro)
    try {
      const { notifyContestParticipationByEmail } = await import('@/lib/email/notifications');
      const endDateLabel = contest.endDate
        ? contest.endDate.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long', year: 'numeric' })
        : '12 de noviembre de 2026';
      await notifyContestParticipationByEmail({
        email: emailNorm,
        contestTitle: contest.title || 'Concurso Estampados DLV',
        endDateLabel,
      });
    } catch (e) {
      console.warn('[contest] confirm email failed:', e.message);
    }
    if (existing) {
      await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).updateOne(
        { id: existing.id },
        { $set: { name: (name || '').trim().slice(0, 100), phone: phone.trim().slice(0, 20), city: (city || '').trim().slice(0, 100), designIdea: (designIdea || '').trim().slice(0, 500), registeredAt: new Date() } }
      );
    } else {
      await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).insertOne({
        id: uuidv4(), contestId: contest.id, name: (name || '').trim().slice(0, 100), email: emailNorm,
        phone: phone.trim().slice(0, 20), city: (city || '').trim().slice(0, 100), designIdea: (designIdea || '').trim().slice(0, 500),
        proofShare1Url: null, proofShare2Url: null, proofFollowUrl: null, sharedNetworks: [],
        followingNetworks: false, viralComplete: false, createdAt: new Date(), registeredAt: new Date(),
      });
    }
    const count = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).countDocuments({ contestId: contest.id });
    return json({ ok: true, participantCount: count, duplicate: false });
  }

  // ==========================================================================
  // FEED DE CATÁLOGO (público — lo consume Meta Commerce Manager por URL)
  // ==========================================================================
  if (route === '/marketing/feed.csv' && method === 'GET') {
    const products = await db.collection(COLLECTIONS.PRODUCTS)
      .find({ active: { $ne: false } }).toArray();
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const header = 'id,title,description,availability,condition,price,link,image_link,brand';
    const rows = products.map(p => {
      const price = p.basePrice || p.variants?.[0]?.price || 0;
      const img = p.images?.[0] ? absUrl(p.images[0]) : '';
      return [
        esc(p.sku || p.id),
        esc(p.name),
        esc(p.description || p.name),
        'in stock',
        'new',
        `${price}`, // CLP sin decimales - Facebook requiere entero para monedas sin decimales
        esc(`${BASE}/producto/${p.slug}`),
        esc(img),
        esc('Estampados DLV'),
      ].join(',');
    });
    return cors(new NextResponse([header, ...rows].join('\n'), {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    }));
  }

  // ==========================================================================
  // CRON DISPATCH (x-cron-secret o admin)
  // ==========================================================================
  if (route === '/marketing/dispatch' && method === 'POST') {
    const secret = request.headers.get('x-cron-secret');
    const isCron = secret && process.env.MARKETING_CRON_SECRET && secret === process.env.MARKETING_CRON_SECRET;
    if (!isCron && !requireAdmin(request)) return err('No autorizado', 401);

    const summary = { scheduledPosts: 0, publishedPosts: 0, failedPosts: 0, reviews: null, recovered: 0 };

    // 0) Recovery: posts stuck in 'publishing' for more than 15 minutes
    // If they already have FB/IG IDs, mark as published. Otherwise, mark as failed for retry.
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const stuckPosts = await db.collection(COLLECTIONS.MARKETING_POSTS)
        .find({ status: 'publishing', updatedAt: { $lte: fifteenMinAgo } })
        .toArray();
      for (const sp of stuckPosts) {
        if (sp.fbPostId && sp.igMediaId) {
          // Successfully published but got stuck in 'publishing' state
          await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
            { id: sp.id },
            { $set: { status: 'published', updatedAt: new Date() } }
          );
          summary.recovered += 1;
        } else if (sp.fbPostId && !sp.igMediaId) {
          // Published to FB but not IG - mark as published, IG retry will handle it
          await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
            { id: sp.id },
            { $set: { status: 'published', updatedAt: new Date() } }
          );
          summary.recovered += 1;
        } else {
          // Never published - mark as failed so it gets retried
          await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
            { id: sp.id },
            { $set: { status: 'failed', publishErrors: ['stuck: publishing timeout - auto-recovery'], updatedAt: new Date() } }
          );
          summary.recovered += 1;
        }
      }
    } catch (re) {
      // Recovery failure is non-fatal
    }

    // 1) Publicar posts programados vencidos
    const account = await getAccount(db);
    if (account?.pageToken) {
      const now = new Date();

      // 1a) Reintentar posts fallidos automáticamente (máximo 2 reintentos)
      const failedPosts = await db.collection(COLLECTIONS.MARKETING_POSTS)
        .find({ status: 'failed', retryCount: { $lt: 2 }, scheduledAt: { $exists: true } })
        .sort({ scheduledAt: 1 }).limit(3).toArray();
      for (const fp of failedPosts) {
        await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
          { id: fp.id, status: 'failed' },
          { $set: { status: 'scheduled', updatedAt: new Date() } }
        );
      }

      const duePosts = await db.collection(COLLECTIONS.MARKETING_POSTS)
        .find({ status: 'scheduled', scheduledAt: { $lte: now }, fbPostId: { $exists: false } })
        .sort({ scheduledAt: 1 }).limit(10).toArray();
      summary.scheduledPosts = duePosts.length;
      for (const post of duePosts) {
        // Marcar como 'publishing' para evitar race condition con el cron
        // que corre cada 10 minutos y podría re-publicar el mismo post
        const lockResult = await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
          { id: post.id, status: 'scheduled', fbPostId: { $exists: false } },
          { $set: { status: 'publishing', updatedAt: new Date() } }
        );
        if (lockResult.modifiedCount === 0) continue; // Ya fue tomado por otro dispatch
        try {
          const r = await publishPost(db, post, account);
          if (r.ok) summary.publishedPosts += 1; else summary.failedPosts += 1;
        } catch (e) {
          summary.failedPosts += 1;
          await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
            { id: post.id },
            { $set: { status: 'failed', publishErrors: [e.message], updatedAt: new Date() } }
          );
        }
      }

      // 1b) Re-publicar en Instagram los posts que fallaron solo en IG
      // (ya tienen fbPostId pero no igMediaId, y tienen errores de instagram)
      const igRetryPosts = await db.collection(COLLECTIONS.MARKETING_POSTS)
        .find({
          status: { $in: ['published', 'scheduled'] },
          platforms: 'instagram',
          isVideo: true,
          fbPostId: { $exists: true, $ne: null },
          igMediaId: null,
        })
        .sort({ updatedAt: 1 }).limit(5).toArray();
      for (const post of igRetryPosts) {
        const lockResult = await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
          { id: post.id, igMediaId: null },
          { $set: { status: 'publishing', updatedAt: new Date() } }
        );
        if (lockResult.modifiedCount === 0) continue;
        try {
          // Publicar solo en Instagram (no re-publicar en Facebook)
          const directToken = process.env.META_PAGE_ACCESS_TOKEN;
          const directPageId = process.env.META_PAGE_ID;
          const { pageToken } = accountTokens(account);
          const mediaUrl = absUrl(post.videoUrl);
          const igData = await graphFetch(`/${directPageId}`, {
            token: directToken,
            params: { fields: 'instagram_business_account{id,username}' },
          });
          const igUserId = igData.instagram_business_account?.id;
          if (igUserId) {
            const container = await graphFetch(`/${igUserId}/media`, {
              method: 'POST',
              token: directToken,
              params: {
                media_type: 'REELS',
                video_url: mediaUrl,
                caption: post.fullCaption || post.caption || '',
              },
            });
            // Esperar a que el contenedor esté listo
            const maxWait = 60000;
            const start = Date.now();
            while (Date.now() - start < maxWait) {
              try {
                const status = await graphFetch(`/${container.id}`, {
                  token: directToken,
                  params: { fields: 'status_code' },
                });
                if (status.status_code === 'FINISHED' || status.status_code === 'EXPIRED') break;
              } catch { /* ignore transient */ }
              await new Promise(r => setTimeout(r, 3000));
            }
            const published = await graphFetch(`/${igUserId}/media_publish`, {
              method: 'POST',
              token: directToken,
              params: { creation_id: container.id },
            });
            await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
              { id: post.id },
              { $set: { igMediaId: published.id, publishErrors: [], updatedAt: new Date() } }
            );
            summary.publishedPosts += 1;
          }
        } catch (e) {
          await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne(
            { id: post.id },
            { $set: { status: 'published', publishErrors: [`instagram-retry: ${e.message}`], updatedAt: new Date() } }
          );
          summary.failedPosts += 1;
        }
      }
    }

    // 2) Despachar solicitudes de reseña vencidas
    try {
      summary.reviews = await dispatchDueReviewRequests(db);
    } catch (e) {
      summary.reviews = { error: e.message };
    }

    return json({ ok: true, ...summary });
  }

  // ==========================================================================
  // OAUTH CALLBACK (llega desde Meta, sin sesión admin — valida state)
  // ==========================================================================
  if (route === '/marketing/oauth/callback' && method === 'GET') {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error_description') || url.searchParams.get('error');

    const redirectTo = (msg) =>
      NextResponse.redirect(`${BASE}/admin/marketing?connected=${msg}`);

    if (errorParam) return redirectTo(`error&detail=${encodeURIComponent(errorParam)}`);
    if (!code || !state) return redirectTo('error&detail=missing_code');

    const pending = await db.collection(COLLECTIONS.MARKETING_ACCOUNTS)
      .findOne({ key: ACCOUNT_KEY });
    if (!pending?.oauthState || pending.oauthState !== state) {
      return redirectTo('error&detail=invalid_state');
    }

    try {
      const redirectUri = `${BASE}/api/marketing/oauth/callback`;
      const { accessToken, expiresIn } = await exchangeCodeForToken({ code, redirectUri });
      const pages = await getAllManagedPages(accessToken);
      const adAccounts = await getAdAccounts(accessToken).catch(() => []);

      const now = new Date();
      await db.collection(COLLECTIONS.MARKETING_ACCOUNTS).updateOne(
        { key: ACCOUNT_KEY },
        {
          $set: {
            userToken: encryptToken(accessToken),
            tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
            availablePages: pages.map(p => ({
              id: p.id, name: p.name, category: p.category,
              picture: p.picture?.data?.url || null,
              // El page token se re-obtiene al seleccionar; se guarda cifrado temporalmente
              token: encryptToken(p.access_token),
            })),
            availableAdAccounts: adAccounts.map(a => ({
              id: a.account_id, name: a.name, currency: a.currency, status: a.account_status,
            })),
            status: 'pending_selection',
            oauthState: null,
            updatedAt: now,
          },
        }
      );
      return redirectTo('ok');
    } catch (e) {
      console.error('[marketing] oauth callback failed:', e.message);
      return redirectTo(`error&detail=${encodeURIComponent(e.message)}`);
    }
  }


  // ==========================================================================
  // AUTO-PUBLISHING: Genera 4 posts diarios y los programa automáticamente
  // POST /marketing/auto/schedule    → cron: genera posts del día (x-cron-secret)
  // GET  /marketing/auto/status      → estado del auto-publishing (admin)
  // POST /marketing/auto/toggle      → pausar/reanudar (admin)
  // ==========================================================================

  // --- POST /marketing/auto/toggle → pausar o reanudar auto-publishing ---
  if (route === '/marketing/auto/toggle' && method === 'POST') {
    const { enabled } = await request.json();
    const set = { enabled: enabled === true, updatedAt: new Date() };
    await db.collection('marketing_auto_config').updateOne(
      { key: 'auto_publish' },
      { $set: set },
      { upsert: true }
    );
    return json({ ok: true, enabled: set.enabled });
  }

  // --- GET /marketing/auto/status → estado del sistema automático ---
  if (route === '/marketing/auto/status' && method === 'GET') {
    const config = await db.collection('marketing_auto_config').findOne({ key: 'auto_publish' }) || { enabled: true };
    const publishedCount = await db.collection('marketing_published_products').countDocuments({});
    const totalActive = await db.collection(COLLECTIONS.PRODUCTS).countDocuments({ active: { $ne: false } });
    const cycleStart = await db.collection('marketing_published_products')
      .findOne({}, { sort: { publishedAt: 1 } });
    const scheduledToday = await db.collection(COLLECTIONS.MARKETING_POSTS)
      .countDocuments({ status: 'scheduled', autoScheduled: true });
    return json({
      ok: true,
      enabled: config.enabled,
      productsPublishedThisCycle: publishedCount,
      totalActiveProducts: totalActive,
      remainingInCycle: totalActive - publishedCount,
      scheduledToday,
      cycleStartedAt: cycleStart?.publishedAt || null,
    });
  }

  // --- POST /marketing/auto/schedule → cron: genera 4 posts del día ---
  if (route === '/marketing/auto/schedule' && method === 'POST') {
    const secret = request.headers.get('x-cron-secret');
    const isCron = !!(secret && process.env.MARKETING_CRON_SECRET && secret === process.env.MARKETING_CRON_SECRET);
    if (!isCron && !requireAdmin(request)) return err('No autorizado', 401);

    // Verificar si está pausado
    const config = await db.collection('marketing_auto_config').findOne({ key: 'auto_publish' }) || { enabled: true };
    if (!config.enabled) return json({ ok: true, skipped: true, reason: 'Auto-publishing pausado' });

    // Verificar que la cuenta Meta esté conectada
    const account = await getAccount(db);
    if (!account || account.status !== 'connected') {
      return json({ ok: true, skipped: true, reason: 'Cuenta Meta no conectada' });
    }

    // Seleccionar 4 productos diferentes (uno por categoría principal)
    const categories = ['workwear', 'blank_apparel', 'caps_hats', 'dtf_textil'];
    const categoryMap = {
      workwear: 'Ropa de Trabajo',
      blank_apparel: 'Ropa Lisa',
      caps_hats: 'Gorras',
      dtf_textil: 'DTF Textil',
    };
    // Obtener SKUs de productos ya publicados en este ciclo
    const publishedSkus = await db.collection('marketing_published_products')
      .find({}).project({ sku: 1 }).toArray()
      .then(docs => new Set(docs.map(d => d.sku)));

    // IMPORTANTE: También excluir productos que ya tienen posts programados o publicados
    // Esto evita duplicados cuando el cron corre múltiples veces
    const postsWithProducts = await db.collection(COLLECTIONS.MARKETING_POSTS)
      .find({ productId: { $ne: 'video-promo' } })
      .project({ productId: 1 })
      .toArray()
      .then(docs => new Set(docs.map(d => d.productId)));
    // Combinar ambos sets de exclusión
    postsWithProducts.forEach(sku => publishedSkus.add(sku));

    const selected = [];
    for (const cat of categories) {
      const products = await db.collection(COLLECTIONS.PRODUCTS)
        .find({ active: { $ne: false }, category: cat })
        .sort({ publishedCount: 1, name: 1 })
        .limit(50)
        .toArray();
      // Filtrar los ya publicados en este ciclo (posts publicados, no solo programados)
      const unpublish = products.filter(p => !publishedSkus.has(p.sku || p.id));
      if (unpublish.length > 0) {
        selected.push({ product: unpublish[0], category: cat, categoryName: categoryMap[cat] });
      }
    }

    // Si no hay suficientes categorías, completar con otros productos
    if (selected.length < 4) {
      const allProducts = await db.collection(COLLECTIONS.PRODUCTS)
        .find({ active: { $ne: false } })
        .sort({ publishedCount: 1, name: 1 })
        .limit(100)
        .toArray();
      const usedSkus = new Set(selected.map(s => s.product.sku || s.product.id));
      for (const p of allProducts) {
        if (selected.length >= 4) break;
        const sku = p.sku || p.id;
        if (publishedSkus.has(sku) || usedSkus.has(sku)) continue;
        // No repetir categorías ya usadas
        const cat = p.category || 'blank_apparel';
        if (selected.some(s => s.category === cat)) continue;
        const catNames = { workwear: 'Ropa de Trabajo', blank_apparel: 'Ropa Lisa', caps_hats: 'Gorras', dtf_textil: 'DTF Textil', dtf_uv: 'DTF UV' };
        selected.push({ product: p, category: cat, categoryName: catNames[cat] || cat });
      }
    }

    // Programar los posts cada 3 horas: 6:00, 9:00, 12:00, 15:00
    const now = new Date();
    const scheduleHours = [6, 9, 12, 15];
    const results = [];

    for (let i = 0; i < Math.min(selected.length, 4); i++) {
      const { product, category, categoryName } = selected[i];
      const schedHour = scheduleHours[i % scheduleHours.length];
      const publishAt = new Date(now);
      publishAt.setHours(schedHour, 0, 0, 0);
      if (publishAt <= now) publishAt.setDate(publishAt.getDate() + 1);

      try {
        // Generar contenido con IA (generatePostContent)
        let postContent;
        if (isGeneratorConfigured()) {
          try {
            postContent = await generatePostContent({
              product,
              tone: 'cercano',
              occasion: categoryName,
              platform: 'both',
            });
            postContent.link = `https://estampadosdlv.com/producto/${product.slug}`;
          } catch (genErr) {
            console.error('[auto-schedule] Error generando con IA:', genErr.message);
            const price = product.basePrice || product.variants?.[0]?.price || 0;
            postContent = {
              caption: `¡Nuevo producto en Estampados DLV! 🎉\n\n${product.name}\n💰 Precio: \$${price.toLocaleString('es-CL')}\n\n👉 Cómprala aquí: https://estampadosdlv.com/producto/${product.slug}`,
              hashtags: ['#EstampadosDLV', '#DTF', '#Estampado', '#Chile', '#Valparaiso'],
              link: `https://estampadosdlv.com/producto/${product.slug}`,
            };
          }
        } else {
          const price = product.basePrice || product.variants?.[0]?.price || 0;
          postContent = {
            caption: `¡Nuevo producto en Estampados DLV! 🎉\n\n${product.name}\n💰 Precio: \$${price.toLocaleString('es-CL')}\n\n👉 Cómprala aquí: https://estampadosdlv.com/producto/${product.slug}`,
            hashtags: ['#EstampadosDLV', '#DTF', '#Estampado', '#Chile', '#Valparaiso'],
            link: `https://estampadosdlv.com/producto/${product.slug}`,
          };
        }

        const productName = product.name || "Producto";
        // Crear el post programado
        const postId = `auto-${Date.now()}-${i}`;
        const post = {
          id: postId,
          productId: product.sku || product.id,
          productSlug: product.slug,
          productName: productName,
          category: category,
          text: postContent.caption,
          caption: postContent.caption,
          fullCaption: postContent.fullCaption || postContent.caption,
          link: postContent.link,
          hashtags: (postContent.hashtags || []).join(' '),
          altText: productName,
          tone: 'estándar',
          occasion: categoryName,
          platforms: ['facebook', 'instagram'],
          status: 'scheduled',
          autoScheduled: true,
          createdAt: now,
          updatedAt: now,
          scheduledAt: publishAt,
          suggestedTime: publishAt,
          imageUrl: await composePostImage({
            sourceImage: product.images[0],
            productName: productName,
            priceClp: product.basePrice || product.variants?.[0]?.price || 0,
            // FIX: usar productId + hash de la imagen para que cada producto tenga un archivo único
            // Antes: postId.slice(0,8) era 'auto-178' para todos los posts del mismo segundo → overwrite
            fileStem: `post-${(product.sku || product.id || 'x').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}-${i}-${Date.now()}`,
          }).then(r => r.relativeUrl).catch(() => {
            // Fallback: URL absoluta del sitio para que la thumbnail funcione en el admin
            const fallbackImg = product.images?.[0] || '';
            return fallbackImg ? (fallbackImg.startsWith('/') ? `https://estampadosdlv.com${fallbackImg}` : fallbackImg) : '';
          }),
        };

        await db.collection(COLLECTIONS.MARKETING_POSTS).insertOne(post);

        // Marcar producto como publicado en este ciclo
        await db.collection('marketing_published_products').updateOne(
          { sku: product.sku || product.id },
          { $set: { sku: product.sku || product.id, name: productName, publishedAt: now, cycle: Math.floor(now.getTime() / (24 * 3600 * 1000)) } },
          { upsert: true }
        );

        // Incrementar publishedCount
        await db.collection(COLLECTIONS.PRODUCTS).updateOne(
          { _id: product._id },
          { $inc: { publishedCount: 1 } }
        );

        results.push({ ok: true, postId, productName, category: categoryName, publishAt });
      } catch (e) {
        results.push({ ok: false, error: e.message });
      }
    }

    // Verificar si se completó el ciclo y resetear
    // IMPORTANTE: Solo resetear si todos los posts de este ciclo están REALMENTE publicados
    // (status: 'published'), no solo programados (status: 'scheduled')
    const totalActive = await db.collection(COLLECTIONS.PRODUCTS).countDocuments({ active: { $ne: false } });
    const publishedSkusCount = await db.collection('marketing_published_products').countDocuments({});
    if (publishedSkusCount >= totalActive && results.some(r => r.ok)) {
      // Verificar que todos los posts programados estén realmente publicados
      const unpublishedPosts = await db.collection(COLLECTIONS.MARKETING_POSTS)
        .countDocuments({ autoScheduled: true, status: { $nin: ['published', 'failed'] } });
      if (unpublishedPosts === 0) {
        // Ciclo realmente completado - resetear para empezar de nuevo
        await db.collection('marketing_published_products').deleteMany({});
        results.push({ cycleReset: true, message: 'Catálogo completado, iniciando nuevo ciclo' });
      } else {
        // Aún hay posts pendientes de publicar, no resetear el ciclo
        results.push({ cyclePaused: true, message: `Esperando ${unpublishedPosts} posts pendientes de publicar` });
      }
    }


    // --- POSTS PROMOCIONALES DTF Textil y DTF UV (2 adicionales por día) ---
    // Se generan 2 posts promocionales adicionales: uno de DTF Textil y uno de DTF UV
    // Horarios: 18:00 (DTF Textil) y 21:00 (DTF UV)
    const promoSlots = [
      { hour: 18, category: 'dtf_textil', label: 'DTF Textil', promoText: true },
      { hour: 21, category: 'dtf_uv', label: 'DTF UV', promoText: true },
    ];
    for (const promo of promoSlots) {
      const promoProducts = await db.collection(COLLECTIONS.PRODUCTS)
        .find({ active: { $ne: false }, category: promo.category })
        .sort({ publishedCount: 1, name: 1 })
        .limit(30)
        .toArray();
      if (promoProducts.length === 0) continue;
      // Excluir productos que ya tienen posts promocionales programados o publicados hoy
      const todayPosts = await db.collection(COLLECTIONS.MARKETING_POSTS)
        .find({ 
          category: promo.category, 
          isPromo: true,
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        })
        .project({ productId: 1 })
        .toArray()
        .then(docs => new Set(docs.map(d => d.productId)));
      const availablePromoProducts = promoProducts.filter(p => !todayPosts.has(p.sku || p.id));
      const pool = availablePromoProducts.length > 0 ? availablePromoProducts : promoProducts;
      // Rotar entre productos disponibles (usar publishedCount para no repetir)
      const promoProduct = pool[Math.floor(Math.random() * Math.min(pool.length, 5))];
      const promoPrice = promoProduct.basePrice || promoProduct.variants?.[0]?.price || 0;
      const promoName = promoProduct.name || `${promo.label} Premium`;
      const promoSlug = promoProduct.slug || 'tienda';
      const promoPostId = `promo-${Date.now()}-${promo.category}`;
      const promoPublishAt = new Date(now);
      promoPublishAt.setHours(promo.hour, 0, 0, 0);
      if (promoPublishAt <= now) promoPublishAt.setDate(promoPublishAt.getDate() + 1);
      // Caption promocional genérico que no depende de un producto específico
      const promoCaptions = {
        dtf_textil: `¡Estampado DTF Textil de alta calidad! 🎨🔥\n\nTransforma tus prendas en piezas profesionales con nuestro servicio de estampado DTF Textil. Colores vibrantes, durabilidad y detalles que se notan.\n\n✅ Colores intensos y resistentes al lavado\n✅ Ideal para algodones, poliéster y mezclas\n✅ Diseño propio o de nuestro catálogo\n\n👉 Compra aquí: https://estampadosdlv.com/producto/${promoSlug}\n\n📍 Envío a todo Chile: $3.490 · 2-5 días hábiles\n📞 WhatsApp: +56 9 5416 9052\n\n#dtftextil #dtf #estampados #estampadosdlv #quilpue #valparaiso #emprendedoreschile #dtfchile #serigrafia #sublimacion #modachilena #ropaemprendedor #pymechile`,
        dtf_uv: `¡Estampado DTF UV para superficies rígidas! ✨🖨️\n\nPersonaliza tazones, llaveros, madera, acrílico, vidrio y mucho más con nuestro DTF UV premium. Adherencia perfecta y colores que duran.\n\n✅ Compatible con superficies rígidas y curvas\n✅ Resistente a rayones y luz UV\n✅ Colores vibrantes con acabado profesional\n\n👉 Compra aquí: https://estampadosdlv.com/producto/${promoSlug}\n\n📍 Envío a todo Chile: $3.490 · 2-5 días hábiles\n📞 WhatsApp: +56 9 5416 9052\n\n#dtfuv #dtf #uvdtf #estampados #estampadosdlv #quilpue #valparaiso #personalizacion #llaveros #tazones #emprendedoreschile #dtfchile #pymechile`,
      };
      const promoCaption = promoCaptions[promo.category] || promoCaptions.dtf_textil;
      // Seleccionar imagen del producto
      // FIX: Las imágenes del DB (/uploads/dtf-services/) NO existen en el servidor
      // Usar las imágenes correctas que están en /uploads/marketing/
      const promoImage = promo.category === 'dtf_uv' 
        ? '/uploads/marketing/promo-dtf_uv.jpg'
        : '/uploads/marketing/promo-dtf_textil.jpg';
      const promoPost = {
        id: promoPostId,
        productId: promoProduct.sku || promoProduct.id,
        productSlug: promoSlug,
        productName: promoName,
        category: promo.category,
        text: promoCaption,
        caption: promoCaption,
        fullCaption: promoCaption,
        link: `https://estampadosdlv.com/producto/${promoSlug}`,
        hashtags: promo.category === 'dtf_uv' ? '#dtfuv #dtf #uvdtf #estampados #estampadosdlv' : '#dtftextil #dtf #estampados #estampadosdlv',
        altText: promoName,
        tone: 'promocional',
        occasion: `Promoción ${promo.label}`,
        platforms: ['facebook', 'instagram'],
        status: 'scheduled',
        autoScheduled: true,
        isPromo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledAt: promoPublishAt,
        suggestedTime: promoPublishAt,
        imageUrl: promoImage ? await composePostImage({
          sourceImage: promoImage,
          productName: promoName,
          priceClp: promoPrice,
          fileStem: `promo-${promo.category}-${(promoProduct.sku || promoProduct.id || 'x').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}-${Date.now()}`,
        }).then(r => r.relativeUrl).catch(() => promoImage) : '',
      };
      await db.collection(COLLECTIONS.MARKETING_POSTS).insertOne(promoPost);
      results.push({ ok: true, postId: promoPostId, productName: promoName, category: promo.label, publishAt: promoPublishAt, promo: true });
    }

    // --- POST DIARIO DEL CONCURSO (1 por día · 88 días en Facebook e Instagram) ---
    // 1 post diario del sorteo, a las 09:00 hora Chile (UTC-4), durante 88 días
    // a partir del 16-08-2026 (mañana). No se duplica: si ya existe un post del
    // concurso para hoy, se omite. Solo genera mientras hay sorteo activo.
    try {
      const activeContest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
      if (!activeContest) {
        results.push({ contestPost: false, reason: 'No hay sorteo activo' });
      } else {
        // Ventana: 09:00 Chile del 16-08-2026 + 88 días (último post: 11-11-2026)
        const CONTEST_START_MS = Date.UTC(2026, 7, 16, 13, 0, 0); // 09:00 hora Chile (UTC-4) del 16-08-2026
        const CONTEST_DAYS = 88;
        // Ahora en hora Chile (UTC-4). El cron corre a las 03:00 UTC = 23:00 hora
        // Chile; por eso el post que genera hoy es el de MAÑANA a las 09:00 Chile.
        const nowCL = new Date(Date.now() - 4 * 3600 * 1000);
        const targetCL = new Date(nowCL);
        targetCL.setDate(targetCL.getDate() + 1);
        targetCL.setUTCHours(13, 0, 0, 0); // 09:00 hora Chile (13:00 UTC) del día siguiente
        const contestEnd = new Date(CONTEST_START_MS + (CONTEST_DAYS - 1) * 24 * 3600 * 1000);
        // Si el cron corre la noche anterior al inicio (ej.: 15-08 23:00 CL),
        // programar el primer post para el momento exacto de inicio
        if (targetCL.getTime() < CONTEST_START_MS) targetCL.setTime(CONTEST_START_MS);
        if (targetCL >= CONTEST_START_MS && targetCL <= contestEnd) {
          // Anti-duplicado: post del concurso ya programado/publicado para el día objetivo
          const dupCount = await db.collection(COLLECTIONS.MARKETING_POSTS).countDocuments({
            productId: 'contest-daily',
            scheduledAt: {
              $gte: new Date(targetCL.getTime() - 12 * 3600 * 1000),
              $lte: new Date(targetCL.getTime() + 36 * 3600 * 1000),
            },
          });
          if (dupCount === 0) {
            // Rotación de imágenes del concurso según el día objetivo
            const _ci = Array.isArray(activeContest?.prizes) && activeContest.prizes.length === 3
              ? activeContest.prizes.map(p => p.image || p.img).filter(Boolean)
              : [];
            const contestImages = [
              '/uploads/contest/og-concurso.jpg',
              '/uploads/contest/hero-ganador.png',
              '/uploads/contest/celebracion-grupo.png',
              ..._ci,
            ].filter(Boolean);
            const dayIdx = Math.floor(targetCL.getTime() / (24 * 3600 * 1000)) % contestImages.length;
            const contestImg = contestImages[dayIdx >= 0 ? dayIdx : 0];
            const contestCaption =
              `¡Participa y GANA! 🎁✨🎉\n\n` +
              `Estampados DLV regala 3 premios increíbles:\n` +
              `🥇 1er lugar: ${activeContest?.prizes?.[0]?.label || 'Polerón personalizado'}\n` +
              `🥈 2do lugar: ${activeContest?.prizes?.[1]?.label || 'Polera personalizada'}\n` +
              `🥉 3er lugar: ${activeContest?.prizes?.[2]?.label || 'Gorra personalizada'}\n\n` +
              `Participar es GRATIS y muy fácil:\n` +
              `1️⃣ Comparte nuestra web en Facebook 📘\n` +
              `2️⃣ Comparte la web en WhatsApp 💬\n` +
              `3️⃣ Registra tu correo y listo ✅\n\n` +
              `⏰ El sorteo termina el ${new Date(activeContest.endDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}\n\n` +
              `👉 Participa aquí: https://estampadosdlv.com/concurso\n\n` +
              `📍 Quilpué, Región de Valparaíso, Chile\n` +
              `📞 WhatsApp: +56 9 5416 9052\n\n` +
              `#ConcursoEstampadosDLV #SorteoChile #EstampadosDLV #GanaPremios #PoleronPersonalizado #PoleraPersonalizada #GorraPersonalizada #Quilpue #Valparaiso #Chile #DTFChile #EmprendedoresChile`;
            const contestPostId = `contest-${Date.now()}-daily`;
            const contestPost = {
              id: contestPostId,
              productId: 'contest-daily',
              productSlug: 'concurso',
              productName: 'Concurso Estampados DLV',
              category: 'concurso',
              text: contestCaption,
              caption: contestCaption,
              fullCaption: contestCaption,
              link: 'https://estampadosdlv.com/concurso',
              hashtags: '#ConcursoEstampadosDLV #SorteoChile #EstampadosDLV #GanaPremios',
              altText: `Concurso Estampados DLV: gana ${activeContest?.prizes?.[0]?.label || 'un polerón'}, ${activeContest?.prizes?.[1]?.label || 'polera'} o ${activeContest?.prizes?.[2]?.label || 'gorra'} personalizada`,
              tone: 'promocional',
              occasion: 'Concurso diario',
              platforms: ['facebook', 'instagram'],
              status: 'scheduled',
              autoScheduled: true,
              isContestPost: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              scheduledAt: targetCL,
              suggestedTime: targetCL,
              imageUrl: contestImg,
            };
            await db.collection(COLLECTIONS.MARKETING_POSTS).insertOne(contestPost);
            results.push({ ok: true, postId: contestPostId, productName: 'Concurso Estampados DLV', publishAt: targetCL, contestPost: true });
          } else {
            results.push({ contestPost: false, reason: 'Post del concurso de hoy ya programado' });
          }
        } else {
          results.push({ contestPost: false, reason: 'Fuera del rango de 88 días del concurso' });
        }
      }
    } catch (e) {
      results.push({ contestPost: false, error: e.message });
    }

    // --- VIDEOS PUBLICITARIOS DE PRODUCTOS INDIVIDUALES (4 por día) ---
    // Selecciona 4 productos del catálogo que NO tienen video generado aún
    // Genera videos dinámicamente y los programa para publicación
    // Rotación: no se repite ningún producto hasta agotar todo el catálogo

    // 1) Obtener SKUs de productos que ya tienen video generado
    const videoGeneratedSkus = await db.collection('marketing_video_products')
      .find({}).project({ sku: 1 }).toArray()
      .then(docs => new Set(docs.map(d => d.sku)));

    // 2) Seleccionar 4 productos que no tienen video, rotando por categorías
    const videoCategories = ['workwear', 'blank_apparel', 'caps_hats'];
    const videoCategoryNames = {
      workwear: 'Ropa de Trabajo',
      blank_apparel: 'Ropa Lisa',
      caps_hats: 'Gorras',
    };
    const selectedVideoProducts = [];

    for (const cat of videoCategories) {
      const catProducts = await db.collection(COLLECTIONS.PRODUCTS)
        .find({ active: { $ne: false }, category: cat, images: { $exists: true, $not: { $size: 0 } } })
        .sort({ publishedCount: 1, name: 1 })
        .limit(100)
        .toArray();
      const available = catProducts.filter(p => !videoGeneratedSkus.has(p.sku || p.id));
      if (available.length > 0) {
        selectedVideoProducts.push(available[0]);
      }
    }

    // Si no hay suficientes categorías, completar con otros productos
    if (selectedVideoProducts.length < 4) {
      const allActive = await db.collection(COLLECTIONS.PRODUCTS)
        .find({ active: { $ne: false }, images: { $exists: true, $not: { $size: 0 } } })
        .sort({ publishedCount: 1, name: 1 })
        .limit(200)
        .toArray();
      const usedSkus = new Set(selectedVideoProducts.map(p => p.sku || p.id));
      for (const p of allActive) {
        if (selectedVideoProducts.length >= 4) break;
        const sku = p.sku || p.id;
        if (videoGeneratedSkus.has(sku) || usedSkus.has(sku)) continue;
        // Skip DTF services (not individual products for video ads)
        if (p.category === 'dtf_textil' || p.category === 'dtf_uv') continue;
        selectedVideoProducts.push(p);
      }
    }

    // 3) Generar videos y programar posts
    // Horarios de video: 9:00, 12:00, 15:00, 18:00
    const videoHours = [9, 12, 15, 18];

    for (let vi = 0; vi < selectedVideoProducts.length; vi++) {
      const product = selectedVideoProducts[vi];
      const sku = product.sku || product.id;
      const skuSafe = String(sku).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      const videoFileName = `video-${skuSafe}-ad.mp4`;
      const videoUrlPath = `/videos/${videoFileName}`;
      const productName = product.name || 'Producto';
      const price = product.basePrice || product.variants?.[0]?.price || 0;
      const priceFormatted = `$${price.toLocaleString('es-CL')} CLP`;
      const productImgs = (product.images || []).slice(0, 4).map(img =>
        img.startsWith('http') ? img : `${BASE}${img}`
      );

      if (productImgs.length === 0) continue; // Skip if no images

      // Generar el video usando el script Python en el servidor
      try {
        // Solo generar si el video no existe en el servidor
        const videoLocalPath = `/var/www/estampadosdlv/public/videos/${videoFileName}`;
        const videoExists = execSync(
          `test -f "${videoLocalPath}" && test $(stat -c%s "${videoLocalPath}" 2>/dev/null || echo 0) -gt 1000000 && echo "exists" || echo "missing"`,
          { timeout: 5000 }
        ).toString().trim() === 'exists';

        if (!videoExists) {
          // Generar video en background (no bloquear el cron)
          const imgArgs = productImgs.map(u => `'${u}'`).join(' ');
          const genCmd = `nohup python3 /var/www/dlv-video-assets/generate_product_video.py '${sku}' '${productName.replace(/'/g, "\\'")}' '${priceFormatted}' '${product.category || 'general'}' ${imgArgs} > /tmp/dlv-gen-${skuSafe}.log 2>&1 &`;
          execSync(genCmd, { timeout: 10000 });
        }

        // Marcar producto como video generado
        await db.collection('marketing_video_products').updateOne(
          { sku },
          { $set: { sku, name: productName, category: product.category, generatedAt: new Date() } },
          { upsert: true }
        );
      } catch (genErr) {
        console.error('[auto-schedule] Error generando video:', genErr.message);
      }

      // Programar el post de video (aunque el video se genere en background)
      const videoPostId = `video-${Date.now()}-${videoHours[vi]}`;
      const videoPublishAt = new Date(now);
      videoPublishAt.setHours(videoHours[vi], 0, 0, 0);
      if (videoPublishAt <= now) videoPublishAt.setDate(videoPublishAt.getDate() + 1);

      // Crear caption personalizado para el producto
      const videoCaption = `¡${productName}! 🛒🔥\n\n✅ ${product.category === 'workwear' ? 'Calidad profesional, resistente y duradera' : product.category === 'caps_hats' ? 'Ajuste perfecto, material premium' : 'Tela de calidad, costuras reforzadas'}\n✅ Precio: ${priceFormatted}\n✅ Estampado DTF disponible\n\n👉 Compra aquí: https://estampadosdlv.com/producto/${product.slug || 'tienda'}\n\n📍 Envío a todo Chile: $3.490 · 2-5 días hábiles\n📞 WhatsApp: +56 9 5416 9052\n🏪 Estampados DLV - Quilpué\n\n#estampadosdlv #dtf #personalizacion #quilpue #chile #${product.category === 'workwear' ? 'ropadetrabajo' : product.category === 'caps_hats' ? 'gorras' : 'poleras'}`;

      const videoPost = {
        id: videoPostId,
        productId: sku,
        productSlug: product.slug || 'tienda',
        productName: productName,
        category: 'video_promo',
        text: videoCaption,
        caption: videoCaption,
        fullCaption: videoCaption,
        link: `https://estampadosdlv.com/producto/${product.slug || 'tienda'}`,
        hashtags: '#estampadosdlv #dtf #personalizacion #quilpue #chile',
        altText: `Video publicitario - ${productName}`,
        tone: 'video',
        occasion: `Video Publicitario - ${productName}`,
        platforms: ['facebook', 'instagram'],
        status: 'scheduled',
        autoScheduled: true,
        isVideo: true,
        videoUrl: `${BASE}${videoUrlPath}`,
        imageUrl: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledAt: videoPublishAt,
        suggestedTime: videoPublishAt,
      };
      await db.collection(COLLECTIONS.MARKETING_POSTS).insertOne(videoPost);
      results.push({ ok: true, postId: videoPostId, productName, occasion: `Video ${productName}`, publishAt: videoPublishAt, video: true, videoFile: videoFileName });
    }

    // 4) Resetear ciclo de videos cuando se agoten todos los productos
    const totalVideoProducts = await db.collection(COLLECTIONS.PRODUCTS)
      .countDocuments({ active: { $ne: false }, images: { $exists: true, $not: { $size: 0 } }, category: { $nin: ['dtf_textil', 'dtf_uv'] } });
    const videoSkusCount = await db.collection('marketing_video_products').countDocuments({});
    if (videoSkusCount >= totalVideoProducts && videoSkusCount > 0) {
      await db.collection('marketing_video_products').deleteMany({});
      results.push({ videoCycleReset: true, message: `Ciclo de videos completado (${totalVideoProducts} productos), reiniciando` });
    }

    return json({ ok: true, scheduled: results.filter(r => r.ok).length, results });
  }


  // ==========================================================================
  // GET /marketing/contest/drawnames → nombres para el sorteo grabable (anonimo)
  // La vista /sorteo (pública) llama este endpoint sin sesión → debe estar ANTES
  // del gate de admin. Solo devuelve identificador seguro (nombre de pila + ciudad).
  // ==========================================================================
  if (route === '/marketing/contest/drawnames' && method === 'GET') {
    // Público (sin sesión): solo expone etiquetas seguras (nombre de pila
    // o email parcialmente oculto). Usado por la vista grabable /sorteo.
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
    if (!contest) return json({ drawnames: [], contestEnded: true });
    const participants = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS)
      .find({ contestId: contest.id, registered: { $ne: false } })
      .project({ name: 1, email: 1, city: 1, phone: 1 })
      .toArray();
    // El flujo actual solo pide email+teléfono; si no hay nombre/ciudad, se usa
    // una etiqueta segura (inicio del email ocultado) para la ruleta.
    const drawnames = participants.map((p) => {
      const first = (p.name || '').trim().split(' ')[0] || '';
      if (first) return { label: `${first} (${(p.city || 'Chile').trim().slice(0, 30)})` };
      const email = (p.email || '').toLowerCase();
      const user = email.split('@')[0] || '';
      const hidden = user.slice(0, 2) + '•'.repeat(Math.max(user.length - 3, 2));
      return { label: `Participante ${hidden} (Chile)` };
    });
    const prizesLabels = (buildPrizesArray(contest) || []).map((p, i) => ({
      rank: ['1er Lugar', '2do Lugar', '3er Lugar'][i],
      prize: p?.label || ['Polerón personalizado', 'Polera personalizada', 'Gorra personalizada'][i],
      image: p?.image || ['/uploads/contest/premio-poleron.png', '/uploads/contest/premio-polera.png', '/uploads/contest/premio-gorra.png'][i],
    }));
    return json({ drawnames, contestId: contest.id, contestTitle: contest.title, prizes: prizesLabels });
  }
  // ==========================================================================
  // Resto de endpoints: requieren admin
  // ==========================================================================
  const admin = requireAdmin(request);
  if (!admin) {
    // El update del sorteo se llama desde el panel admin (cliente con sesión);
    // aquí se rechaza de todas formas si no hay sesión de admin.
    return err('Sólo administradores pueden usar el módulo de marketing', 403);
  }


  // --- GET /marketing/status ------------------------------------------------
  if (route === '/marketing/status' && method === 'GET') {
    const account = await getAccount(db);
    const [postCount, scheduledCount, campaignCount, pendingReviews] = await Promise.all([
      db.collection(COLLECTIONS.MARKETING_POSTS).countDocuments({}),
      db.collection(COLLECTIONS.MARKETING_POSTS).countDocuments({ status: 'scheduled' }),
      db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).countDocuments({}),
      db.collection(COLLECTIONS.REVIEW_REQUESTS).countDocuments({ status: 'pending' }),
    ]);
    return json({
      metaAppConfigured: isMetaConfigured(),
      encryptionConfigured: isEncryptionConfigured(),
      aiConfigured: isGeneratorConfigured(),
      cronSecretConfigured: !!process.env.MARKETING_CRON_SECRET,
      account: publicAccount(account),
      stats: { postCount, scheduledCount, campaignCount, pendingReviews },
      feedUrl: `${BASE}/api/marketing/feed.csv`,
      dispatchUrl: `${BASE}/api/marketing/dispatch`,
      catalogId: process.env.META_CATALOG_ID || null,
      catalogSyncUrl: process.env.META_CATALOG_ID ? `https://graph.facebook.com/v25.0/${process.env.META_CATALOG_ID}/product_feeds` : null,
    });
  }

  // --- GET /marketing/oauth/start --------------------------------------------
  if (route === '/marketing/oauth/start' && method === 'GET') {
    if (!isMetaConfigured()) return err('META_APP_ID / META_APP_SECRET no configurados en el servidor', 500);
    if (!isEncryptionConfigured()) return err('MARKETING_ENCRYPTION_KEY no configurada en el servidor', 500);
    const state = crypto.randomBytes(24).toString('base64url');
    const now = new Date();
    await db.collection(COLLECTIONS.MARKETING_ACCOUNTS).updateOne(
      { key: ACCOUNT_KEY },
      {
        $set: { oauthState: state, updatedAt: now },
        $setOnInsert: { id: uuidv4(), key: ACCOUNT_KEY, status: 'disconnected', createdAt: now },
      },
      { upsert: true }
    );
    const redirectUri = `${BASE}/api/marketing/oauth/callback`;
    return json({ url: buildOAuthUrl({ redirectUri, state }) });
  }

  // --- POST /marketing/accounts/select ---------------------------------------
  if (route === '/marketing/accounts/select' && method === 'POST') {
    const { pageId, adAccountId } = await request.json();
    const account = await getAccount(db);
    if (!account?.availablePages?.length) return err('No hay conexión OAuth pendiente — conecta con Meta primero');

    const page = account.availablePages.find(p => p.id === pageId);
    if (!page) return err('Página no encontrada en la conexión actual');

    const pageToken = decryptToken(page.token);
    let ig = null;
    try { ig = await getInstagramAccount(page.id, pageToken); }
    catch (e) { console.warn('[marketing] IG lookup failed:', e.message); }

    const now = new Date();
    await db.collection(COLLECTIONS.MARKETING_ACCOUNTS).updateOne(
      { key: ACCOUNT_KEY },
      {
        $set: {
          pageId: page.id,
          pageName: page.name,
          pagePicture: page.picture || null,
          pageToken: encryptToken(pageToken),
          igUserId: ig?.id || null,
          igUsername: ig?.username || null,
          adAccountId: adAccountId || null,
          status: 'connected',
          connectedAt: now,
          updatedAt: now,
          availablePages: [], // limpiar tokens temporales
        },
      }
    );
    const updated = await getAccount(db);
    return json({ ok: true, account: publicAccount(updated) });
  }

  // --- DELETE /marketing/accounts ---------------------------------------------
  if (route === '/marketing/accounts' && method === 'DELETE') {
    await db.collection(COLLECTIONS.MARKETING_ACCOUNTS).deleteOne({ key: ACCOUNT_KEY });
    return json({ ok: true, disconnected: true });
  }

  // --- GET /marketing/posts ----------------------------------------------------
  if (route === '/marketing/posts' && method === 'GET') {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const q = status && status !== 'all' ? { status } : {};
    const posts = await db.collection(COLLECTIONS.MARKETING_POSTS)
      .find(q).sort({ createdAt: -1 }).limit(200).toArray();
    return json(strip(posts));
  }

  // --- POST /marketing/posts/generate -------------------------------------------
  if (route === '/marketing/posts/generate' && method === 'POST') {
    const { productId, tone, occasion, platforms, scheduledAt } = await request.json();
    if (!productId) return err('productId requerido');
    if (!isGeneratorConfigured()) return err('IA no configurada (MINIMAX_API_KEY)', 500);

    const product = await db.collection(COLLECTIONS.PRODUCTS).findOne({ id: productId });
    if (!product) return err('Producto no encontrado', 404);
    if (!product.images?.length) return err('El producto no tiene imágenes — sube al menos una para generar el post');

    // 1) Caption con IA
    const content = await generatePostContent({
      product, tone, occasion,
      platform: platforms?.length === 1 ? platforms[0] : 'both',
    });

    // 2) Imagen 1080×1080 con overlay de marca
    const postId = uuidv4();
    const { relativeUrl } = await composePostImage({
      sourceImage: product.images[0],
      productName: product.name,
      priceClp: product.basePrice || product.variants?.[0]?.price,
      fileStem: `post-${postId.slice(0, 8)}`,
    });

    const now = new Date();
    const post = {
      id: postId,
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      platforms: Array.isArray(platforms) && platforms.length ? platforms : ['facebook', 'instagram'],
      caption: content.caption,
      hashtags: content.hashtags,
      altText: content.altText,
      fullCaption: content.fullCaption,
      imageUrl: relativeUrl,
      status: scheduledAt ? 'scheduled' : 'draft',   // draft → scheduled → published | failed
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      suggestedTime: content.suggestedTime,
      fbPostId: null,
      igMediaId: null,
      publishErrors: [],
      generatedBy: { model: 'minimax', tookMs: content.tookMs, admin: admin.email || admin.id },
      createdAt: now,
      updatedAt: now,
    };
    await db.collection(COLLECTIONS.MARKETING_POSTS).insertOne(post);
    return json({ ok: true, post: strip(post) });
  }

  // --- PATCH /marketing/posts -----------------------------------------------------
  if (route === '/marketing/posts' && method === 'PATCH') {
    const { id, caption, hashtags, scheduledAt, platforms, status } = await request.json();
    if (!id) return err('id requerido');
    const post = await db.collection(COLLECTIONS.MARKETING_POSTS).findOne({ id });
    if (!post) return err('Post no encontrado', 404);
    if (post.status === 'published') return err('No se puede editar un post ya publicado');

    const set = { updatedAt: new Date() };
    if (caption !== undefined) set.caption = String(caption).slice(0, 2000);
    if (Array.isArray(hashtags)) set.hashtags = hashtags.slice(0, 12);
    if (caption !== undefined || Array.isArray(hashtags)) {
      set.fullCaption = `${set.caption ?? post.caption}\n\n${(set.hashtags ?? post.hashtags ?? []).join(' ')}`;
    }
    if (Array.isArray(platforms) && platforms.length) set.platforms = platforms;
    if (scheduledAt !== undefined) {
      set.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
      set.status = scheduledAt ? 'scheduled' : 'draft';
    }
    if (status && ['draft', 'scheduled'].includes(status)) set.status = status;

    await db.collection(COLLECTIONS.MARKETING_POSTS).updateOne({ id }, { $set: set });
    const updated = await db.collection(COLLECTIONS.MARKETING_POSTS).findOne({ id });
    return json({ ok: true, post: strip(updated) });
  }

  // --- POST /marketing/posts/publish ------------------------------------------------
  if (route === '/marketing/posts/publish' && method === 'POST') {
    const { id } = await request.json();
    if (!id) return err('id requerido');
    const post = await db.collection(COLLECTIONS.MARKETING_POSTS).findOne({ id });
    if (!post) return err('Post no encontrado', 404);
    if (post.status === 'published') return err('El post ya fue publicado');

    const account = await getAccount(db);
    if (!account || account.status !== 'connected') return err('Cuenta Meta no conectada — ve a la pestaña Conexiones');

    const result = await publishPost(db, post, account);
    if (!result.ok) return err(`Publicación falló: ${result.errors.join(' · ')}`, 502);
    return json({ ok: true, ...result });
  }

  // --- DELETE /marketing/posts?id= -------------------------------------------------
  if (route === '/marketing/posts' && method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return err('id requerido');
    const post = await db.collection(COLLECTIONS.MARKETING_POSTS).findOne({ id });
    if (!post) return err('Post no encontrado', 404);
    if (post.status === 'published') return err('No se puede eliminar un post publicado (queda como histórico)');
    await db.collection(COLLECTIONS.MARKETING_POSTS).deleteOne({ id });
    return json({ ok: true, deleted: true });
  }

  // --- GET /marketing/campaigns -----------------------------------------------------
  if (route === '/marketing/campaigns' && method === 'GET') {
    const campaigns = await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS)
      .find({}).sort({ createdAt: -1 }).limit(100).toArray();
    return json(strip(campaigns));
  }

  // --- POST /marketing/campaigns — recetas simples -----------------------------------
  // body: { recipe: 'boost_post'|'product_traffic', name, dailyBudgetClp, days,
  //         postId? (boost), productId? (traffic) }
  if (route === '/marketing/campaigns' && method === 'POST') {
    const body = await request.json();
    const { recipe, name, dailyBudgetClp, days = 7, postId, productId } = body;
    if (!recipe || !name || !dailyBudgetClp) return err('recipe, name y dailyBudgetClp son requeridos');
    if (dailyBudgetClp < 1000) return err('Presupuesto diario mínimo: $1.000 CLP');

    const account = await getAccount(db);
    if (!account || account.status !== 'connected') return err('Cuenta Meta no conectada');
    if (!account.adAccountId) return err('No hay Ad Account seleccionada — reconecta y elige una cuenta publicitaria');
    const { userToken } = accountTokens(account);
    if (!userToken) return err('Token de usuario no disponible — reconecta la cuenta Meta');

    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + days * 86400000).toISOString();

    try {
      let objective, creativeArgs, linkedEntity = {};

      if (recipe === 'boost_post') {
        const post = await db.collection(COLLECTIONS.MARKETING_POSTS).findOne({ id: postId });
        if (!post?.fbPostId) return err('El post debe estar publicado en Facebook para impulsarlo');
        objective = 'OUTCOME_ENGAGEMENT';
        creativeArgs = { postId: post.fbPostId };
        linkedEntity = { postId: post.id };
      } else if (recipe === 'product_traffic') {
        const product = await db.collection(COLLECTIONS.PRODUCTS).findOne({ id: productId });
        if (!product) return err('Producto no encontrado', 404);
        objective = 'OUTCOME_TRAFFIC';
        creativeArgs = {
          pageId: account.pageId,
          link: `${BASE}/producto/${product.slug}`,
          message: `${product.name} — impresión DTF profesional con envío a todo Chile 🚀`,
          imageUrl: product.images?.[0] ? absUrl(product.images[0]) : undefined,
        };
        linkedEntity = { productId: product.id };
      } else {
        return err(`Receta desconocida: ${recipe}`);
      }

      const { campaignId } = await createCampaign({
        adAccountId: account.adAccountId, token: userToken, name, objective,
      });
      const { adSetId } = await createAdSet({
        adAccountId: account.adAccountId, token: userToken, campaignId,
        name: `${name} — AdSet`, dailyBudgetClp,
        optimizationGoal: objective === 'OUTCOME_TRAFFIC' ? 'LINK_CLICKS' : 'POST_ENGAGEMENT',
        startTime, endTime,
      });
      const { creativeId } = await createAdCreative({
        adAccountId: account.adAccountId, token: userToken,
        name: `${name} — Creative`, ...creativeArgs,
      });
      const { adId } = await createAd({
        adAccountId: account.adAccountId, token: userToken,
        name: `${name} — Ad`, adSetId, creativeId,
      });

      const now = new Date();
      const campaign = {
        id: uuidv4(),
        recipe, name,
        dailyBudgetClp, days,
        objective,
        metaCampaignId: campaignId,
        metaAdSetId: adSetId,
        metaCreativeId: creativeId,
        metaAdId: adId,
        status: 'PAUSED', // siempre nace pausada — se activa explícitamente
        ...linkedEntity,
        createdBy: admin.email || admin.id,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).insertOne(campaign);
      return json({ ok: true, campaign: strip(campaign) });
    } catch (e) {
      console.error('[marketing] campaign creation failed:', e.message);
      return err(`Meta rechazó la campaña: ${e.message}`, 502);
    }
  }

  // --- POST /marketing/campaigns/status ------------------------------------------------
  if (route === '/marketing/campaigns/status' && method === 'POST') {
    const { id, status } = await request.json();
    if (!id || !['ACTIVE', 'PAUSED'].includes(status)) return err('id y status (ACTIVE|PAUSED) requeridos');
    const campaign = await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).findOne({ id });
    if (!campaign) return err('Campaña no encontrada', 404);

    const account = await getAccount(db);
    const { userToken } = accountTokens(account);
    if (!userToken) return err('Token no disponible — reconecta la cuenta Meta');

    await updateCampaignStatus({ campaignId: campaign.metaCampaignId, token: userToken, status });
    await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).updateOne(
      { id }, { $set: { status, updatedAt: new Date() } }
    );
    return json({ ok: true, status });
  }

  // --- GET /marketing/metrics ------------------------------------------------------------
  if (route === '/marketing/metrics' && method === 'GET') {
    const account = await getAccount(db);
    const out = { posts: [], campaigns: [], fetchedAt: new Date() };

    if (account?.status === 'connected') {
      const { userToken, pageToken } = accountTokens(account);

      // Posts publicados recientes con engagement en vivo
      const published = await db.collection(COLLECTIONS.MARKETING_POSTS)
        .find({ status: 'published' }).sort({ publishedAt: -1 }).limit(20).toArray();
      for (const p of published) {
        const row = {
          id: p.id, productName: p.productName, publishedAt: p.publishedAt,
          platforms: p.platforms, facebook: null, instagram: null,
        };
        if (p.fbPostId && pageToken) row.facebook = await getPostInsights({ postId: p.fbPostId, pageToken });
        if (p.igMediaId && pageToken) row.instagram = await getIgMediaInsights({ mediaId: p.igMediaId, pageToken });
        out.posts.push(row);
      }

      // Insights de campañas
      if (account.adAccountId && userToken) {
        try {
          out.campaigns = await getCampaignInsights({
            adAccountId: account.adAccountId, token: userToken,
          });
        } catch (e) {
          out.campaignsError = e.message;
        }
      }

      // Snapshot histórico (para gráficos sin depender de Meta)
      try {
        await db.collection(COLLECTIONS.MARKETING_METRICS).insertOne({
          id: uuidv4(), snapshot: out, createdAt: new Date(),
        });
      } catch { /* best-effort */ }
    }

    return json(out);
  }

  // ===========================================================================
  // GOOGLE ADS API
  // ===========================================================================

  // --- GET /marketing/google/oauth/status ---
  if (route === '/marketing/google/oauth/status' && method === 'GET') {
    if (!isGoogleAdsConfigured()) {
      return json({ configured: false, message: 'GOOGLE_ADS_* variables no configuradas' });
    }
    const status = await getGoogleAdsConnectionStatus(db);
    return json({ configured: true, ...status });
  }

  // --- GET /marketing/google/oauth/authorize ---
  if (route === '/marketing/google/oauth/authorize' && method === 'GET') {
    if (!isGoogleAdsConfigured()) return err('Google Ads no configurado');
    const url = buildGoogleAdsOAuthUrl();
    return json({ url });
  }

  // --- GET /marketing/google/oauth/callback ---
  if (route === '/marketing/google/oauth/callback' && method === 'GET') {
    const code = new URL(request.url).searchParams.get('code');
    if (!code) return err('Falta code en el callback');
    try {
      const tokens = await exchangeCodeForGoogleAdsToken(code);
      await saveGoogleAdsTokens(db, tokens);
      return NextResponse.redirect(`${BASE}/admin/marketing?tab=google-ads&connected=true`);
    } catch (e) {
      console.error('[marketing] Google Ads OAuth error:', e.message);
      return NextResponse.redirect(`${BASE}/admin/marketing?tab=google-ads&error=${encodeURIComponent(e.message)}`);
    }
  }

  // --- DELETE /marketing/google/oauth/disconnect ---
  if (route === '/marketing/google/oauth/disconnect' && method === 'DELETE') {
    await disconnectGoogleAds(db);
    return json({ ok: true });
  }

  // --- GET /marketing/google/campaigns ---
  if (route === '/marketing/google/campaigns' && method === 'GET') {
    try {
      const data = await listGoogleAdsCampaigns(db);
      return json({ campaigns: data.results || [] });
    } catch (e) {
      return err(`Error listando campañas: ${e.message}`, 502);
    }
  }

  // --- POST /marketing/google/campaigns ---
  if (route === '/marketing/google/campaigns' && method === 'POST') {
    const { name, budgetUsd = 50, maxCpcUsd = 0.50, focusKey, locationId } = await request.json();
    if (!name) return err('name es requerido');
    try {
      const result = await createGoogleAdsSearchCampaign(db, {
        name,
        budgetMicros: Math.round(Number(budgetUsd) * 1_000_000),
        maxCpcMicros: Math.round(Number(maxCpcUsd) * 1_000_000),
        focusKey: focusKey || null,
        locationId: locationId || undefined,
      });
      // Guardar en nuestra BD
      await db.collection('marketing_google_campaigns').insertOne({
        id: uuidv4(), name, status: 'PAUSED', focusKey,
        ...result,
        createdBy: admin.email || admin.id,
        createdAt: new Date(), updatedAt: new Date(),
      });
      return json({ ok: true, campaign: result });
    } catch (e) {
      return err(`Error creando campaña: ${e.message}`, 502);
    }
  }

  // --- POST /marketing/google/campaigns/status ---
  if (route === '/marketing/google/campaigns/status' && method === 'POST') {
    const { resource_name, status } = await request.json();
    if (!resource_name || !status) return err('resource_name y status requeridos');
    try {
      await updateGoogleAdsCampaignStatus(db, { campaignResourceName: resource_name, status });
      await db.collection('marketing_google_campaigns').updateOne(
        { campaignResourceName: resource_name },
        { $set: { status, updatedAt: new Date() } }
      );
      return json({ ok: true, status });
    } catch (e) {
      return err(`Error actualizando estado: ${e.message}`, 502);
    }
  }

  // --- GET /marketing/google/metrics ---
  if (route === '/marketing/google/metrics' && method === 'GET') {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    try {
      const data = await getGoogleAdsMetrics(db, { days });
      return json({ metrics: data.results || [] });
    } catch (e) {
      return err(`Error obteniendo métricas: ${e.message}`, 502);
    }
  }

  // --- GET /marketing/google/optimization ---
  if (route === '/marketing/google/optimization' && method === 'GET') {
    try {
      const campaignsData = await getGoogleAdsMetrics(db, {});
      const result = await generateOptimizationRecommendations(db, campaignsData);
      return json(result);
    } catch (e) {
      return err(`Error en optimización: ${e.message}`, 502);
    }
  }

  // --- POST /marketing/google/keywords ---
  if (route === '/marketing/google/keywords' && method === 'POST') {
    const { adGroupResourceName, keywords } = await request.json();
    if (!adGroupResourceName || !Array.isArray(keywords)) return err('adGroupResourceName y keywords[] requeridos');
    try {
      const results = [];
      for (const kw of keywords) {
        const res = await createGoogleAdsKeyword(db, {
          adGroupResourceName, text: kw.text, matchType: kw.matchType || 'BROAD',
        });
        results.push(res.results?.[0]?.resourceName);
      }
      return json({ ok: true, added: results.length });
    } catch (e) {
      return err(`Error agregando keywords: ${e.message}`, 502);
    }
  }

  // --- POST /marketing/google/ads ---
  if (route === '/marketing/google/ads' && method === 'POST') {
    const { adGroupResourceName, headlines, descriptions, finalUrl } = await request.json();
    if (!adGroupResourceName || !Array.isArray(headlines) || !Array.isArray(descriptions)) {
      return err('adGroupResourceName, headlines[] y descriptions[] requeridos');
    }
    try {
      const result = await createGoogleAdsResponsiveAd(db, {
        adGroupResourceName, headlines, descriptions, finalUrl,
      });
      return json({ ok: true, result: result.results?.[0] });
    } catch (e) {
      return err(`Error creando anuncio: ${e.message}`, 502);
    }
  }

  // (Las rutas públicas de concurso GET/POST /marketing/contest, /upload-proof,
  //  /progress y /participate están definidas AL INICIO del handler,
  //  antes del gate de admin, para que los clientes puedan participar.)

  // --- GET /marketing/contest/participants → listar participantes (admin) ---
  if (route === '/marketing/contest/participants' && method === 'GET') {
    if (!requireAdmin(request)) return err('No autorizado', 401);
    const params = new URL(request.url).searchParams;
    const contestId = params.get('contestId');
    if (!contestId) return err('contestId requerido');
    const participants = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS)
      .find({ contestId })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();
    return json({ participants: participants.map(strip) });
  }

    // --- POST /marketing/contest/pick-winner → seleccionar ganadores (admin) ---
  if (route === '/marketing/contest/pick-winner' && method === 'POST') {
    if (!requireAdmin(request)) return err('No autorizado', 401);
    const body = await request.json();
    const { firstPlaceId, secondPlaceId, thirdPlaceId } = body;
    if (!firstPlaceId) return err('firstPlaceId requerido');
    // Buscar el concurso activo
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
    if (!contest) return err('Concurso no encontrado o no activo');
    const winners = {};
    // 1er lugar
    const p1 = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).findOne({ id: firstPlaceId });
    if (!p1) return err('Participante 1er lugar no encontrado');
    winners.first = { name: p1.name, email: p1.email, phone: p1.phone, city: p1.city, designIdea: p1.designIdea };
    // 2do lugar (opcional)
    if (secondPlaceId) {
      const p2 = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).findOne({ id: secondPlaceId });
      if (p2) winners.second = { name: p2.name, email: p2.email, phone: p2.phone, city: p2.city, designIdea: p2.designIdea };
    }
    // 3er lugar (opcional)
    if (thirdPlaceId) {
      const p3 = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).findOne({ id: thirdPlaceId });
      if (p3) winners.third = { name: p3.name, email: p3.email, phone: p3.phone, city: p3.city, designIdea: p3.designIdea };
    }
    await db.collection(COLLECTIONS.CONTESTS).updateOne(
      { id: contest.id },
      { $set: { winners, winnerPickedAt: new Date(), status: 'ended' } }
    );
    return json({ ok: true, winners });
  }
  // --- POST /marketing/contest/pick-winners-auto → seleccionar 3 ganadores aleatorios (admin/cron) ---
  if (route === '/marketing/contest/pick-winners-auto' && method === 'POST') {
    const secret = request.headers.get('x-cron-secret');
    const isCron = secret && process.env.MARKETING_CRON_SECRET && secret === process.env.MARKETING_CRON_SECRET;
    if (!isCron && !requireAdmin(request)) return err('No autorizado', 401);
    // Buscar concurso activo terminado
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
    if (!contest) return err('No hay concurso activo');
    const count = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).countDocuments({ contestId: contest.id });
    if (count < 1) {
      await db.collection(COLLECTIONS.CONTESTS).updateOne({ id: contest.id }, { $set: { status: 'ended' } });
      return json({ ok: true, action: 'closed_no_participants' });
    }
    const participants = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).find({ contestId: contest.id }).toArray();
    // Mezclar aleatoriamente
    const shuffled = participants.sort(() => Math.random() - 0.5);
    const winners = {};
    winners.first = { name: shuffled[0].name, email: shuffled[0].email, phone: shuffled[0].phone, city: shuffled[0].city, designIdea: shuffled[0].designIdea };
    if (shuffled.length > 1) winners.second = { name: shuffled[1].name, email: shuffled[1].email, phone: shuffled[1].phone, city: shuffled[1].city, designIdea: shuffled[1].designIdea };
    if (shuffled.length > 2) winners.third = { name: shuffled[2].name, email: shuffled[2].email, phone: shuffled[2].phone, city: shuffled[2].city, designIdea: shuffled[2].designIdea };
    await db.collection(COLLECTIONS.CONTESTS).updateOne(
      { id: contest.id },
      { $set: { winners, winnerPickedAt: new Date(), status: 'ended' } }
    );
    // Enviar email de felicitación a cada ganador con la info de contacto de Sandra
    const _pb0 = Array.isArray(contest?.prizes) ? contest.prizes : [];
    const prizeByRank = {
      first: { rank: '1er lugar', prize: _pb0[0]?.label || 'Polerón personalizado' },
      second: { rank: '2do lugar', prize: _pb0[1]?.label || 'Polera personalizada' },
      third: { rank: '3er lugar', prize: _pb0[2]?.label || 'Gorra personalizada' },
    };
    for (const [rank, data] of Object.entries(prizeByRank)) {
      const w = winners[rank];
      if (!w || !w.email) continue;
      try {
        const { notifyContestWinnerByEmail } = await import('@/lib/email/notifications');
        await notifyContestWinnerByEmail({ winner: w, rankLabel: data.rank, prizeName: data.prize });
      } catch (e) {
        console.warn(`[contest] error enviando email al ganador ${rank}:`, e.message);
      }
    }
    return json({ ok: true, action: 'winners_picked', winners });
  }

  // --- GET /marketing/contest/admin → resumen del sorteo (panel admin) ---
  if (route === '/marketing/contest/admin' && method === 'GET') {
    const secretA = request.headers.get('x-cron-secret');
    const cronA = secretA && process.env.MARKETING_CRON_SECRET && secretA === process.env.MARKETING_CRON_SECRET;
    if (!cronA && !requireAdmin(request)) return err('No autorizado', 401);
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne(
      {},
      { sort: { createdAt: -1 } },
    );
    return json({ contest: strip(contest) });
  }
  // --- POST /marketing/contest/update → editar sorteo activo (admin/cron-secret) ---
  // Acepta multipart/form-data (premios: prizeImage0..2 + campos JSON) o JSON puro.
  if (route === '/marketing/contest/update' && method === 'POST') {
    const secretU = request.headers.get('x-cron-secret');
    const isCronU = secretU && process.env.MARKETING_CRON_SECRET && secretU === process.env.MARKETING_CRON_SECRET;
    if (!isCronU && !requireAdmin(request)) return err('No autorizado', 401);
    const ctU = request.headers.get('content-type') || '';
    let titleU, startDateU, endDateU, prizesU, ogImageU;
    const uploadedPrizeImages = {};
    if (ctU.includes('multipart/form-data')) {
      let formU;
      try { formU = await request.formData(); } catch (e) { return err('No se pudo leer el formulario: ' + e.message, 400); }
      titleU = String(formU.get('title') || '');
      startDateU = String(formU.get('startDate') || '');
      endDateU = String(formU.get('endDate') || '');
      const prizesRawU = String(formU.get('prizes') || '[]');
      try {
        prizesU = JSON.parse(prizesRawU);
        if (!Array.isArray(prizesU)) prizesU = [];
      } catch { prizesU = []; }
      ogImageU = String(formU.get('ogImage') || '');
      const allowedMimeU = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      for (let i = 0; i < 3; i++) {
        const f = formU.get(`prizeImage${i}`);
        if (!f || typeof f === 'string' || !f.size || f.size < 1024) continue;
        if (!allowedMimeU.includes(f.type)) continue;
        if (f.size > 5 * 1024 * 1024) continue;
        const extU = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[f.type] || 'jpg';
        const fileNameU = `premio-editado-${Date.now()}-${i}.${extU}`;
        const fileBufU = Buffer.from(await f.arrayBuffer());
        const relDirU = path.join('uploads', 'contest');
        const publicDirU = path.resolve(process.env.PUBLIC_ROOT || '/var/www/estampadosdlv/public', relDirU);
        await fs.mkdir(publicDirU, { recursive: true });
        await fs.writeFile(path.join(publicDirU, fileNameU), fileBufU);
        try { await fs.writeFile(path.join(process.cwd(), 'public', relDirU, fileNameU), fileBufU); } catch { /* noop */ }
        uploadedPrizeImages[i] = `/uploads/contest/${fileNameU}`;
      }
    } else {
      try { const b = await request.json(); titleU = b.title; startDateU = b.startDate; endDateU = b.endDate; prizesU = Array.isArray(b.prizes) ? b.prizes : []; ogImageU = b.ogImage; } catch { return err('Cuerpo inválido', 400); }
    }
    // Actualizar el sorteo activo (o el más reciente si no hay activo)
    let contestU = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: { $in: ['active', 'paused'] } });
    if (!contestU) contestU = await db.collection(COLLECTIONS.CONTESTS).findOne({}, { sort: { createdAt: -1 } });
    if (!contestU) return err('No hay ningún sorteo', 404);
    const setU = {};
    if (titleU && titleU.trim().length >= 3) setU.title = titleU.trim().slice(0, 200);
    const parseDateU = (s) => {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    };
    const startD = parseDateU(startDateU);
    const endD = parseDateU(endDateU);
    if (startD) setU.startDate = startD;
    if (endD) {
      if (startD && endD <= startD) return err('La fecha de fin debe ser posterior al inicio', 400);
      setU.endDate = endD;
    }
    if (Array.isArray(prizesU) && prizesU.length === 3) {
      const baseImages = ['/uploads/contest/premio-poleron.png', '/uploads/contest/premio-polera.png', '/uploads/contest/premio-gorra.png'];
      setU.prizes = prizesU.map((p, i) => ({
        rank: ['1er lugar', '2do lugar', '3er lugar'][i],
        label: String(p?.label || '').slice(0, 120) || ['Polerón personalizado', 'Polera personalizada', 'Gorra personalizada'][i],
        image: uploadedPrizeImages[i] || p?.image || baseImages[i],
      }));
    }
    if (ogImageU && ogImageU.startsWith('/uploads/contest/')) setU.ogImage = ogImageU.slice(0, 300);
    if (Object.keys(setU).length === 0) return err('No hay cambios que guardar', 400);
    await db.collection(COLLECTIONS.CONTESTS).updateOne({ id: contestU.id }, { $set: setU });
    const updatedU = await db.collection(COLLECTIONS.CONTESTS).findOne({ id: contestU.id });
    return json({ ok: true, contest: strip(updatedU) });
  }

  // --- POST /marketing/contest/set-status → activar/pausar/finalizar (panel admin) ---
  if (route === '/marketing/contest/set-status' && method === 'POST') {
    const secretB = request.headers.get('x-cron-secret');
    const cronB = secretB && process.env.MARKETING_CRON_SECRET && secretB === process.env.MARKETING_CRON_SECRET;
    if (!cronB && !requireAdmin(request)) return err('No autorizado', 401);
    const body = await request.json();
    const { status } = body || {};
    if (!['active', 'paused', 'ended'].includes(status)) return err('status inválido (active|paused|ended)');
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne(
      {},
      { sort: { createdAt: -1 } },
    );
    if (!contest) return err('No hay ningún sorteo', 404);
    await db.collection(COLLECTIONS.CONTESTS).updateOne(
      { id: contest.id },
      { $set: { status } },
    );
    return json({ ok: true, status, contestId: contest.id });
  }

  // Función reutilizable de selección automática de ganadores (usada por cron con secret)
  async function pickWinnersAuto(ctxLocal) {
    const { db } = ctxLocal;
    const contest = await db.collection(COLLECTIONS.CONTESTS).findOne({ status: 'active' });
    if (!contest) return err('No hay concurso activo');
    const ended = await db.collection(COLLECTIONS.CONTESTS)
      .find({ status: 'active', endDate: { $lt: new Date() } })
      .toArray();
    const results = [];
    const picks = ended.length ? ended : (contest.endDate && new Date() > new Date(contest.endDate) ? [contest] : []);
    for (const c of picks) {
      const count = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).countDocuments({ contestId: c.id });
      if (count === 0) {
        await db.collection(COLLECTIONS.CONTESTS).updateOne({ id: c.id }, { $set: { status: 'ended' } });
        results.push({ contest: c.title, action: 'closed_no_participants' });
        continue;
      }
      const participants = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS).find({ contestId: c.id }).toArray();
      const shuffled = participants.sort(() => Math.random() - 0.5);
      const winners = {};
      winners.first = { name: shuffled[0].name, email: shuffled[0].email, phone: shuffled[0].phone, city: shuffled[0].city };
      if (shuffled.length > 1) winners.second = { name: shuffled[1].name, email: shuffled[1].email, phone: shuffled[1].phone, city: shuffled[1].city };
      if (shuffled.length > 2) winners.third = { name: shuffled[2].name, email: shuffled[2].email, phone: shuffled[2].phone, city: shuffled[2].city };
      await db.collection(COLLECTIONS.CONTESTS).updateOne(
        { id: c.id },
        { $set: { winners, winnerPickedAt: new Date(), status: 'ended' } }
      );
      const _pb0 = Array.isArray(c?.prizes) ? c.prizes : [];
    const prizeByRank = {
      first: { rank: '1er lugar', prize: _pb0[0]?.label || 'Polerón personalizado' },
      second: { rank: '2do lugar', prize: _pb0[1]?.label || 'Polera personalizada' },
      third: { rank: '3er lugar', prize: _pb0[2]?.label || 'Gorra personalizada' },
    };
      for (const [rank, data] of Object.entries(prizeByRank)) {
        const w = winners[rank];
        if (!w || !w.email) continue;
        try {
          const { notifyContestWinnerByEmail } = await import('@/lib/email/notifications');
          await notifyContestWinnerByEmail({ winner: w, rankLabel: data.rank, prizeName: data.prize });
        } catch (e) {
          console.warn(`[contest] error enviando email al ganador ${rank}:`, e.message);
        }
      }
      results.push({ contest: c.title, action: 'winners_picked', winners: Object.values(winners).map(w => w.name) });
    }
    return json({ ok: true, processed: results });
  }

  // --- POST /marketing/contest/end → cerrar concurso sin ganador (admin) ---
  if (route === '/marketing/contest/end' && method === 'POST') {
    if (!requireAdmin(request)) return err('No autorizado', 401);
    const body = await request.json();
    const { contestId } = body;
    if (!contestId) return err('contestId requerido');

    await db.collection(COLLECTIONS.CONTESTS).updateOne(
      { id: contestId },
      { $set: { status: 'ended' } }
    );
    return json({ ok: true });
  }

  // --- POST /marketing/contest/create → crear concurso (admin/cron-secret) ---
  if (route === '/marketing/contest/create' && method === 'POST') {
    if (!requireAdmin(request)) return err('No autorizado', 401);
    const body = await request.json();
    const prizeText = prize || (prizes && prizes.length ? prizes.join('\n') : '');
    if (!title || !prizeText) return err('Título y premio son obligatorios');

    // Desactivar concursos activos previos
    await db.collection(COLLECTIONS.CONTESTS).updateMany(
      { status: 'active' },
      { $set: { status: 'ended' } }
    );

    const now = new Date();
    const endDate = new Date(now.getTime() + (durationDays || 90) * 24 * 60 * 60 * 1000);

    const contest = {
      id: uuidv4(),
      title: title.slice(0, 200),
      description: (description || '').slice(0, 2000),
      prize: prizeText.slice(0, 500),
      rules: (rules || '').slice(0, 5000),
      status: 'active',
      startDate: now,
      endDate,
      winners: null,
      winnerPickedAt: null,
      createdAt: now,
    };

    await db.collection(COLLECTIONS.CONTESTS).insertOne(contest);
    return json({ ok: true, contest: strip(contest) });
  }

  // Función reutilizable para crear concurso (usada por la ruta privilegiada con cron-secret)
  async function createContest(ctxLocal, body) {
    const { db } = ctxLocal;
    const { title, description, prize, prizes, rules, durationDays } = body;
    const prizeText = prize || (prizes && prizes.length ? prizes.join('\n') : '');
    if (!title || !prizeText) return err('Título y premio son obligatorios');
    await db.collection(COLLECTIONS.CONTESTS).updateMany({ status: 'active' }, { $set: { status: 'ended' } });
    const now = new Date();
    const endDate = new Date(now.getTime() + (durationDays || 90) * 24 * 60 * 60 * 1000);
    const contest = {
      id: uuidv4(),
      title: title.slice(0, 200),
      description: (description || '').slice(0, 2000),
      prize: prizeText.slice(0, 500),
      rules: (rules || '').slice(0, 5000),
      status: 'active',
      startDate: now,
      endDate,
      winners: null,
      winnerPickedAt: null,
      createdAt: now,
    };
    await db.collection(COLLECTIONS.CONTESTS).insertOne(contest);
    return json({ ok: true, contest: strip(contest) });
  }

    // --- POST /marketing/contest/auto-pick → cron: auto-seleccionar 3 ganadores ---
  if (route === '/marketing/contest/auto-pick' && method === 'POST') {
    const secret = request.headers.get('x-cron-secret');
    const isCron = secret && process.env.MARKETING_CRON_SECRET && secret === process.env.MARKETING_CRON_SECRET;
    if (!isCron && !requireAdmin(request)) return err('No autorizado', 401);
    // Buscar concursos que terminaron pero siguen 'active'
    const ended = await db.collection(COLLECTIONS.CONTESTS)
      .find({ status: 'active', endDate: { $lt: new Date() } })
      .toArray();
    const results = [];
    for (const contest of ended) {
      const count = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS)
        .countDocuments({ contestId: contest.id });
      if (count === 0) {
        await db.collection(COLLECTIONS.CONTESTS).updateOne(
          { id: contest.id },
          { $set: { status: 'ended' } }
        );
        results.push({ contest: contest.title, action: 'closed_no_participants' });
        continue;
      }
      // Seleccionar 3 ganadores aleatorios
      const participants = await db.collection(COLLECTIONS.CONTEST_PARTICIPANTS)
        .find({ contestId: contest.id })
        .toArray();
      const shuffled = participants.sort(() => Math.random() - 0.5);
      const winners = {};
      winners.first = { name: shuffled[0].name, email: shuffled[0].email, phone: shuffled[0].phone, city: shuffled[0].city };
      if (shuffled.length > 1) winners.second = { name: shuffled[1].name, email: shuffled[1].email, phone: shuffled[1].phone, city: shuffled[1].city };
      if (shuffled.length > 2) winners.third = { name: shuffled[2].name, email: shuffled[2].email, phone: shuffled[2].phone, city: shuffled[2].city };
      await db.collection(COLLECTIONS.CONTESTS).updateOne(
        { id: contest.id },
        { $set: { winners, winnerPickedAt: new Date(), status: 'ended' } }
      );
      // Enviar email de felicitación a cada ganador con la info de contacto de Sandra
      const _pb0 = Array.isArray(contest?.prizes) ? contest.prizes : [];
    const prizeByRank = {
      first: { rank: '1er lugar', prize: _pb0[0]?.label || 'Polerón personalizado' },
      second: { rank: '2do lugar', prize: _pb0[1]?.label || 'Polera personalizada' },
      third: { rank: '3er lugar', prize: _pb0[2]?.label || 'Gorra personalizada' },
    };
      for (const [rank, data] of Object.entries(prizeByRank)) {
        const w = winners[rank];
        if (!w || !w.email) continue;
        try {
          const { notifyContestWinnerByEmail } = await import('@/lib/email/notifications');
          await notifyContestWinnerByEmail({ winner: w, rankLabel: data.rank, prizeName: data.prize });
        } catch (e) {
          console.warn(`[contest] error enviando email al ganador ${rank}:`, e.message);
        }
      }
      results.push({ contest: contest.title, action: 'winners_picked', winners: Object.values(winners).map(w => w.name) });
    }
    return json({ ok: true, processed: results });
  }


  return null;
}
