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
  getManagedPages, getInstagramAccount, getAdAccounts,
  publishFacebookPhoto, publishInstagramPhoto, getInstagramPublishingLimit,
  createCampaign, createAdSet, createAdCreative, createAd, updateCampaignStatus,
  getCampaignInsights, getPostInsights, getIgMediaInsights,
} from '@/lib/marketing/meta-client';
import { generatePostContent, isGeneratorConfigured } from '@/lib/marketing/post-generator';
import { composePostImage } from '@/lib/marketing/image-composer';
import { dispatchDueReviewRequests } from '@/lib/marketing/reviews';
import {
  isGoogleAdsConfigured, buildOAuthUrl as buildGoogleOAuthUrl,
  exchangeCodeForToken as exchangeGoogleCode, getAdsService,
  createSearchCampaign, createAdGroup, createResponsiveSearchAd,
  getCampaignMetrics, getAccountMetrics, getKeywords,
  updateCampaignBid, updateCampaignBudget, updateCampaignStatus as updateGoogleCampaignStatus,
} from '@/lib/marketing/google-ads-client';
import { generateOptimizationReport, generateAdCopy } from '@/lib/marketing/google-ads-optimizer';
import crypto from 'crypto';

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
  if (!pageToken) throw new Error('Cuenta Meta sin page token — reconecta la cuenta');

  const imageUrl = absUrl(post.imageUrl);
  const results = { facebook: null, instagram: null };
  const errors = [];

  if (post.platforms?.includes('facebook') && account.pageId) {
    try {
      results.facebook = await publishFacebookPhoto({
        pageId: account.pageId,
        pageToken,
        imageUrl,
        caption: post.fullCaption || post.caption,
      });
    } catch (e) {
      errors.push(`facebook: ${e.message}`);
    }
  }

  if (post.platforms?.includes('instagram') && account.igUserId) {
    try {
      const limit = await getInstagramPublishingLimit(account.igUserId, pageToken);
      if ((limit.quota_usage || 0) >= 95) {
        errors.push('instagram: cuota de publicación 24h casi agotada (95+/100)');
      } else {
        results.instagram = await publishInstagramPhoto({
          igUserId: account.igUserId,
          pageToken,
          imageUrl,
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
        updatedAt: now,
      },
    }
  );
  return { ok: !!anyOk, results, errors };
}

// -----------------------------------------------------------------------------
// Handler principal
// -----------------------------------------------------------------------------

export default async function handleMarketing(ctx) {
  const { method, route, db, request } = ctx;
  if (!route.startsWith('/marketing')) return null;

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
        `${price} CLP`,
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

    const summary = { scheduledPosts: 0, publishedPosts: 0, failedPosts: 0, reviews: null };

    // 1) Publicar posts programados vencidos
    const account = await getAccount(db);
    if (account?.pageToken) {
      const now = new Date();
      const duePosts = await db.collection(COLLECTIONS.MARKETING_POSTS)
        .find({ status: 'scheduled', scheduledAt: { $lte: now } })
        .sort({ scheduledAt: 1 }).limit(10).toArray();
      summary.scheduledPosts = duePosts.length;
      for (const post of duePosts) {
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
      const pages = await getManagedPages(accessToken);
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
  // Resto de endpoints: requieren admin
  // ==========================================================================
  const admin = requireAdmin(request);
  if (!admin) return err('Sólo administradores pueden usar el módulo de marketing', 403);

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

  // ==========================================================================
  // GOOGLE ADS — Status
  // ==========================================================================
  if (route === '/marketing/google/status' && method === 'GET') {
    const account = await db.collection(COLLECTIONS.MARKETING_ACCOUNTS)
      .findOne({ key: GOOGLE_ACCOUNT_KEY });
    const campaigns = await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS)
      .find({ provider: 'google_ads' }).sort({ createdAt: -1 }).limit(100).toArray();

    return json({
      googleAdsConfigured: isGoogleAdsConfigured(),
      account: account ? {
        id: account.id,
        status: account.status,
        customerEmail: account.customerEmail || null,
        connectedAt: account.connectedAt || null,
      } : null,
      campaignCount: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
    });
  }

  // ==========================================================================
  // GOOGLE ADS — OAuth start
  // ==========================================================================
  if (route === '/marketing/google/oauth/start' && method === 'GET') {
    if (!isGoogleAdsConfigured()) {
      return err('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_CUSTOMER_ID no configurados', 500);
    }
    if (!isEncryptionConfigured()) {
      return err('MARKETING_ENCRYPTION_KEY no configurada', 500);
    }
    const state = crypto.randomBytes(24).toString('base64url');
    const now = new Date();
    await db.collection(COLLECTIONS.MARKETING_ACCOUNTS).updateOne(
      { key: GOOGLE_ACCOUNT_KEY },
      {
        $set: { oauthState: state, updatedAt: now },
        $setOnInsert: { id: uuidv4(), key: GOOGLE_ACCOUNT_KEY, status: 'disconnected', createdAt: now },
      },
      { upsert: true }
    );
    return json({ url: buildGoogleOAuthUrl({ state }) });
  }

  // ==========================================================================
  // GOOGLE ADS — OAuth callback
  // ==========================================================================
  if (route === '/marketing/google/oauth/callback' && method === 'GET') {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error_description') || url.searchParams.get('error');

    const redirectTo = (msg) =>
      NextResponse.redirect(`${BASE}/admin/marketing?googleConnected=${msg}`);

    if (errorParam) return redirectTo(`error&detail=${encodeURIComponent(errorParam)}`);
    if (!code || !state) return redirectTo('error&detail=missing_code');

    const pending = await db.collection(COLLECTIONS.MARKETING_ACCOUNTS)
      .findOne({ key: GOOGLE_ACCOUNT_KEY });
    if (!pending?.oauthState || pending.oauthState !== state) {
      return redirectTo('error&detail=invalid_state');
    }

    try {
      const { accessToken, refreshToken, expiresIn } = await exchangeGoogleCode({ code });
      const now = new Date();
      await db.collection(COLLECTIONS.MARKETING_ACCOUNTS).updateOne(
        { key: GOOGLE_ACCOUNT_KEY },
        {
          $set: {
            accessToken: encryptToken(accessToken),
            refreshToken: refreshToken ? encryptToken(refreshToken) : null,
            tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
            status: 'connected',
            connectedAt: now,
            oauthState: null,
            updatedAt: now,
          },
        }
      );
      return redirectTo('ok');
    } catch (e) {
      console.error('[marketing] google oauth callback failed:', e.message);
      return redirectTo(`error&detail=${encodeURIComponent(e.message)}`);
    }
  }

  // ==========================================================================
  // GOOGLE ADS — Disconnect
  // ==========================================================================
  if (route === '/marketing/google/accounts' && method === 'DELETE') {
    await db.collection(COLLECTIONS.MARKETING_ACCOUNTS).deleteOne({ key: GOOGLE_ACCOUNT_KEY });
    return json({ ok: true, disconnected: true });
  }

  // ==========================================================================
  // GOOGLE ADS — Crear campaña con IA
  // ==========================================================================
  if (route === '/marketing/google/campaigns' && method === 'POST') {
    if (!isGeneratorConfigured()) {
      return err('IA no configurada (MINIMAX_API_KEY)', 500);
    }

    const body = await request.json();
    const { productId, name, dailyBudgetClp, days = 7, adFocus } = body;
    if (!name || !dailyBudgetClp) return err('name y dailyBudgetClp son requeridos');
    if (dailyBudgetClp < 1000) return err('Presupuesto diario mínimo: $1.000 CLP');

    const account = await db.collection(COLLECTIONS.MARKETING_ACCOUNTS)
      .findOne({ key: GOOGLE_ACCOUNT_KEY });
    if (!account || account.status !== 'connected') {
      return err('Google Ads no conectado — ve a la pestaña Google Ads y conecta tu cuenta');
    }

    const accessToken = decryptToken(account.accessToken);
    if (!accessToken) return err('Token de Google no disponible — reconecta la cuenta');

    // Obtener producto y generar copy con IA
    let product = null;
    let adCopyResult = null;
    if (productId) {
      product = await db.collection(COLLECTIONS.PRODUCTS).findOne({ id: productId });
      if (!product) return err('Producto no encontrado', 404);
    }

    if (product) {
      try {
        adCopyResult = await generateAdCopy({
          productName: product.name,
          productDescription: product.description || product.name,
          productPrice: product.basePrice || product.variants?.[0]?.price,
          adFocus: adFocus || 'tráfico a ficha de producto',
        });
      } catch (e) {
        console.warn('[marketing] IA ad copy generation failed:', e.message);
        adCopyResult = null;
      }
    }

    // Generar copy por defecto si no hay producto o falló la IA
    const defaultHeadlines = adCopyResult?.headlines || [
      'Impresión DTF Profesional',
      'Estampados DLV',
      'Diseños Personalizados',
      'Envío a Todo Chile',
      'Calidad Garantizada',
      'DTF Textil y UV',
      'Compra Ahora',
      'Cotiza Gratis',
      'Los Mejores Precios',
      'Impresión de Alta Calidad',
    ];
    const defaultDescriptions = adCopyResult?.descriptions || [
      'Impresión DTF profesional para poleras, polerones y más. Envío a todo Chile.',
      'Calidad garantizada y los mejores precios en impresión DTF. Cotiza gratis.',
      'Personaliza tus diseños con impresión DTF de alta calidad. Compra ahora.',
    ];

    try {
      const service = await getAdsService(accessToken);
      const campaignName = name || `${product?.name || 'Campaña DTF'} — Google Ads`;
      const targetUrl = product
        ? `${BASE}/producto/${product.slug}`
        : BASE;

      const { campaignId } = await createSearchCampaign({
        service,
        name: campaignName,
        dailyBudgetClp,
        targetUrl,
      });

      const adGroupId = (await createAdGroup({
        service,
        campaignId,
        name: `${campaignName} — Grupo`,
      })).adGroupId;

      const { adId } = await createResponsiveSearchAd({
        service,
        adGroupId,
        headlines: defaultHeadlines,
        descriptions: defaultDescriptions,
        finalUrl: targetUrl,
        displayUrlPath: ['dtf', 'impresion'],
      });

      const now = new Date();
      const campaign = {
        id: uuidv4(),
        provider: 'google_ads',
        recipe: 'search_campaign',
        name: campaignName,
        dailyBudgetClp,
        days,
        status: 'PAUSED',
        googleCampaignId: campaignId,
        googleAdGroupId: adGroupId,
        googleAdId: adId,
        productId: product?.id || null,
        productName: product?.name || null,
        createdBy: admin.email || admin.id,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).insertOne(campaign);
      return json({ ok: true, campaign: strip(campaign) });
    } catch (e) {
      console.error('[marketing] google campaign creation failed:', e.message);
      return err(`Google Ads rechazó la campaña: ${e.message}`, 502);
    }
  }

  // ==========================================================================
  // GOOGLE ADS — Listar campañas
  // ==========================================================================
  if (route === '/marketing/google/campaigns' && method === 'GET') {
    const campaigns = await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS)
      .find({ provider: 'google_ads' }).sort({ createdAt: -1 }).limit(100).toArray();
    return json(strip(campaigns));
  }

  // ==========================================================================
  // GOOGLE ADS — Cambiar estado de campaña
  // ==========================================================================
  if (route === '/marketing/google/campaigns/status' && method === 'POST') {
    const { id, status: newStatus } = await request.json();
    if (!id || !['ACTIVE', 'PAUSED'].includes(newStatus)) {
      return err('id y status (ACTIVE|PAUSED) requeridos');
    }
    const campaign = await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS)
      .findOne({ id, provider: 'google_ads' });
    if (!campaign) return err('Campaña de Google Ads no encontrada', 404);

    const account = await db.collection(COLLECTIONS.MARKETING_ACCOUNTS)
      .findOne({ key: GOOGLE_ACCOUNT_KEY });
    const accessToken = decryptToken(account?.accessToken);
    if (!accessToken) return err('Token no disponible — reconecta Google Ads');

    try {
      const service = await getAdsService(accessToken);
      await updateGoogleCampaignStatus({
        service,
        campaignId: campaign.googleCampaignId,
        status: newStatus,
      });
      await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).updateOne(
        { id },
        { $set: { status: newStatus, updatedAt: new Date() } }
      );
      return json({ ok: true, status: newStatus });
    } catch (e) {
      console.error('[marketing] google campaign status update failed:', e.message);
      return err(`Error actualizando campaña: ${e.message}`, 502);
    }
  }

  // ==========================================================================
  // GOOGLE ADS — Métricas
  // ==========================================================================
  if (route === '/marketing/google/metrics' && method === 'GET') {
    const account = await db.collection(COLLECTIONS.MARKETING_ACCOUNTS)
      .findOne({ key: GOOGLE_ACCOUNT_KEY });
    if (!account || account.status !== 'connected') {
      return err('Google Ads no conectado');
    }

    const accessToken = decryptToken(account.accessToken);
    if (!accessToken) return err('Token no disponible — reconecta');

    const url = new URL(request.url);
    const daysBack = Number(url.searchParams.get('days') || 7);

    try {
      const service = await getAdsService(accessToken);
      const [accountMetrics, campaignMetrics] = await Promise.all([
        getAccountMetrics({ service, daysBack: 7 }).catch((e) => ({ error: e.message })),
        getCampaignMetrics({ service, daysBack }).catch((e) => ({ error: e.message })),
      ]);
      return json({
        accountMetrics,
        campaignMetrics,
        period: { start: new Date(Date.now() - daysBack * 86400000).toISOString(), end: new Date().toISOString() },
        fetchedAt: new Date(),
      });
    } catch (e) {
      console.error('[marketing] google metrics failed:', e.message);
      return err(`Error obteniendo métricas: ${e.message}`, 502);
    }
  }

  // ==========================================================================
  // GOOGLE ADS — IA Optimización
  // ==========================================================================
  if (route === '/marketing/google/optimize' && method === 'POST') {
    if (!isGeneratorConfigured()) {
      return err('IA no configurada (MINIMAX_API_KEY)', 500);
    }

    const account = await db.collection(COLLECTIONS.MARKETING_ACCOUNTS)
      .findOne({ key: GOOGLE_ACCOUNT_KEY });
    if (!account || account.status !== 'connected') {
      return err('Google Ads no conectado');
    }

    const accessToken = decryptToken(account.accessToken);
    if (!accessToken) return err('Token no disponible — reconecta');

    const { campaignId, adGroupId } = await request.json();

    try {
      const service = await getAdsService(accessToken);
      const [accountMetrics, campaignMetrics, keywords] = await Promise.all([
        getAccountMetrics({ service, daysBack: 7 }),
        getCampaignMetrics({ service, daysBack: 30 }),
        adGroupId ? getKeywords({ service, adGroupId }) : [],
      ]);

      const report = await generateOptimizationReport({
        accountMetrics,
        campaignMetrics,
        keywords,
      });

      // Guardar reporte en DB
      const reportDoc = {
        id: uuidv4(),
        campaignId: campaignId || null,
        provider: 'google_ads',
        report: report.report,
        rawText: report.rawText,
        model: report.model,
        tookMs: report.tookMs,
        createdAt: new Date(),
      };
      await db.collection(COLLECTIONS.MARKETING_METRICS).insertOne(reportDoc);

      return json({ ok: true, report: report.report });
    } catch (e) {
      console.error('[marketing] google optimization failed:', e.message);
      return err(`Error generando optimización: ${e.message}`, 502);
    }
  }

  // ==========================================================================
  // GOOGLE ADS — Aplicar recomendación de optimización
  // ==========================================================================
  if (route === '/marketing/google/optimize/apply' && method === 'POST') {
    const { type, target, value, campaignId, budgetId } = await request.json();
    if (!type || !target) return err('type y target requeridos');

    const account = await db.collection(COLLECTIONS.MARKETING_ACCOUNTS)
      .findOne({ key: GOOGLE_ACCOUNT_KEY });
    if (!account || account.status !== 'connected') {
      return err('Google Ads no conectado');
    }

    const accessToken = decryptToken(account.accessToken);
    if (!accessToken) return err('Token no disponible — reconecta');

    try {
      const service = await getAdsService(accessToken);

      if (type === 'bid' && target && value) {
        // value en CLP, convertir a micros
        const micros = Math.round(Number(value) * 1_000_000);
        await updateCampaignBid({ service, campaignId: target, newBidMicros: micros });
        await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).updateOne(
          { googleCampaignId: target },
          { $set: { manualCpcMicros: micros, updatedAt: new Date() } }
        );
      } else if (type === 'budget' && target && value) {
        const micros = Math.round(Number(value) * 1_000_000);
        await updateCampaignBudget({ service, budgetId: target, newAmountMicros: micros });
        await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).updateOne(
          { googleCampaignId: target },
          { $set: { dailyBudgetMicros: micros, updatedAt: new Date() } }
        );
      } else if (type === 'status' && target) {
        await updateGoogleCampaignStatus({ service, campaignId: target, status: value });
        await db.collection(COLLECTIONS.MARKETING_CAMPAIGNS).updateOne(
          { googleCampaignId: target },
          { $set: { status: value, updatedAt: new Date() } }
        );
      } else {
        return err(`Acción no soportada: ${type}`);
      }

      return json({ ok: true, applied: { type, target, value } });
    } catch (e) {
      console.error('[marketing] google optimize apply failed:', e.message);
      return err(`Error aplicando recomendación: ${e.message}`, 502);
    }
  }

  return null;
}
