// =============================================================================
// Meta Graph API Client — Facebook Pages + Instagram + Marketing API
// -----------------------------------------------------------------------------
// Única puerta a Meta. Config vía env:
//   META_APP_ID       → App ID de developers.facebook.com
//   META_APP_SECRET   → App Secret
//   META_API_VERSION  → v25.0 (por defecto)
//
// Scopes requeridos en el OAuth dialog:
//   pages_manage_posts, pages_read_engagement, pages_show_list,
//   instagram_basic, instagram_content_publish,
//   ads_management, ads_read, business_management
// =============================================================================

const API_VERSION = process.env.META_API_VERSION || 'v25.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

export function isMetaConfigured() {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

// Scopes para modo desarrollo (antes de publicar la app en Live mode).
// pages_manage_posts y pages_manage_metadata son Advanced Access pero funcionan
// para usuarios con rol en la app (admin/desarrollador) sin necesidad de App Review.
// business_management es Standard Access — permite listar páginas del Business Manager.
export const META_SCOPES_DEV = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
  'public_profile',
].join(',');

// Scopes completos para cuando la app esté en modo Live (publicada).
export const META_SCOPES_FULL = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_show_list',
  'pages_manage_metadata',
  'instagram_basic',
  'instagram_content_publish',
  'ads_management',
  'ads_read',
  'business_management',
].join(',');

/** Devuelve los scopes apropiados según el modo de la app.
 *  Si hay variable META_APP_LIVE_MODE=true usa los scopes completos.
 */
export function getMetaScopes() {
  return process.env.META_APP_LIVE_MODE === 'true'
    ? META_SCOPES_FULL
    : META_SCOPES_DEV;
}

async function graphFetch(path, { method = 'GET', token, params = {}, body = null } = {}) {
  const url = new URL(`${GRAPH}${path}`);
  if (token) url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  }
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url.toString(), opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    const msg = e.error_user_msg || e.message || `Meta API error ${res.status}`;
    const error = new Error(msg);
    error.metaCode = e.code;
    error.metaSubcode = e.error_subcode;
    error.status = res.status;
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/** URL del diálogo OAuth de Meta (se abre en popup/redirect desde el panel). */
export function buildOAuthUrl({ redirectUri, state }) {
  const url = new URL(`https://www.facebook.com/${API_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', process.env.META_APP_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', getMetaScopes());
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

/** code → user access token (corto) → long-lived (~60 días) */
export async function exchangeCodeForToken({ code, redirectUri }) {
  const short = await graphFetch('/oauth/access_token', {
    params: {
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      redirect_uri: redirectUri,
      code,
    },
  });
  const long = await graphFetch('/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID,
      client_secret: process.env.META_APP_SECRET,
      fb_exchange_token: short.access_token,
    },
  });
  return { accessToken: long.access_token, expiresIn: long.expires_in || null };
}

/** Páginas administradas por el usuario (incluye page access tokens). */
export async function getManagedPages(userToken) {
  const data = await graphFetch('/me/accounts', {
    token: userToken,
    params: { fields: 'id,name,access_token,category,picture{url}' },
  });
  return data.data || [];
}

/** Páginas del Business Manager — para cuando la app está conectada al BM.
 *  Busca el primer Business Manager del usuario y lista sus páginas.
 */
export async function getBusinessManagerPages(userToken) {
  try {
    // Obtener todos los Business Managers del usuario
    const bmList = await graphFetch('/me/businesses', {
      token: userToken,
      params: { fields: 'id,name,owned_pages{id,name,access_token,category,picture{url}}' },
    });
    // Agregar todas las páginas de todos los BMs
    const allPages = [];
    for (const bm of (bmList.data || [])) {
      for (const page of (bm.owned_pages?.data || [])) {
        allPages.push(page);
      }
    }
    return allPages;
  } catch (e) {
    console.warn('[meta-client] getBusinessManagerPages failed:', e.message);
    return [];
  }
}

/** Combina páginas personales + Business Manager, sin duplicados. */
export async function getAllManagedPages(userToken) {
  const [personal, bm] = await Promise.all([
    getManagedPages(userToken),
    getBusinessManagerPages(userToken),
  ]);
  const seen = new Set();
  const combined = [];
  for (const p of [...personal, ...bm]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      combined.push(p);
    }
  }
  return combined;
}

/** Cuenta IG Business vinculada a una página (o null). */
export async function getInstagramAccount(pageId, pageToken) {
  const data = await graphFetch(`/${pageId}`, {
    token: pageToken,
    params: { fields: 'instagram_business_account{id,username,profile_picture_url}' },
  });
  return data.instagram_business_account || null;
}

/** Ad accounts del usuario. */
export async function getAdAccounts(userToken) {
  const data = await graphFetch('/me/adaccounts', {
    token: userToken,
    params: { fields: 'id,account_id,name,currency,account_status' },
  });
  return data.data || [];
}

// ---------------------------------------------------------------------------
// Publicación — Facebook Page
// ---------------------------------------------------------------------------

/** Publica una foto con caption en la página. imageUrl debe ser público. */
export async function publishFacebookPhoto({ pageId, pageToken, imageUrl, caption }) {
  const data = await graphFetch(`/${pageId}/photos`, {
    method: 'POST',
    token: pageToken,
    params: { url: imageUrl, message: caption || '' },
  });
  return { photoId: data.id, postId: data.post_id || data.id };
}

/** Post de solo texto/enlace en el feed de la página. */
export async function publishFacebookFeed({ pageId, pageToken, message, link }) {
  const data = await graphFetch(`/${pageId}/feed`, {
    method: 'POST',
    token: pageToken,
    params: { message: message || '', ...(link ? { link } : {}) },
  });
  return { postId: data.id };
}

// ---------------------------------------------------------------------------
// Publicación — Instagram (contenedor → publish)
// ---------------------------------------------------------------------------

/** Publica una imagen JPEG (URL pública) con caption en IG Business. */
export async function publishInstagramPhoto({ igUserId, pageToken, imageUrl, caption, altText }) {
  const container = await graphFetch(`/${igUserId}/media`, {
    method: 'POST',
    token: pageToken,
    params: {
      image_url: imageUrl,
      caption: caption || '',
      ...(altText ? { alt_text: altText.slice(0, 1000) } : {}),
    },
  });
  const published = await graphFetch(`/${igUserId}/media_publish`, {
    method: 'POST',
    token: pageToken,
    params: { creation_id: container.id },
  });
  return { containerId: container.id, mediaId: published.id };
}

/** Cuota de publicación IG (límite 100 posts/24h). */
export async function getInstagramPublishingLimit(igUserId, pageToken) {
  const data = await graphFetch(`/${igUserId}/content_publishing_limit`, {
    token: pageToken,
    params: { fields: 'quota_usage,config' },
  });
  return data.data?.[0] || { quota_usage: 0 };
}

// ---------------------------------------------------------------------------
// Marketing API — Campañas (recetas simples)
// ---------------------------------------------------------------------------

/** Crea campaña (siempre PAUSED — el admin la activa desde Meta o el panel). */
export async function createCampaign({ adAccountId, token, name, objective }) {
  const data = await graphFetch(`/act_${adAccountId}/campaigns`, {
    method: 'POST',
    token,
    params: {
      name,
      objective, // OUTCOME_TRAFFIC | OUTCOME_ENGAGEMENT | OUTCOME_SALES
      status: 'PAUSED',
      special_ad_categories: '[]',
    },
  });
  return { campaignId: data.id };
}

export async function createAdSet({
  adAccountId, token, campaignId, name,
  dailyBudgetClp, optimizationGoal = 'LINK_CLICKS',
  billingEvent = 'IMPRESSIONS', startTime, endTime,
}) {
  const data = await graphFetch(`/act_${adAccountId}/adsets`, {
    method: 'POST',
    token,
    params: {
      name,
      campaign_id: campaignId,
      // CLP no usa decimales: daily_budget va en unidades mínimas (pesos)
      daily_budget: String(Math.round(dailyBudgetClp)),
      billing_event: billingEvent,
      optimization_goal: optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: {
        geo_locations: { countries: ['CL'] },
        age_min: 18,
        age_max: 65,
      },
      status: 'PAUSED',
      ...(startTime ? { start_time: startTime } : {}),
      ...(endTime ? { end_time: endTime } : {}),
    },
  });
  return { adSetId: data.id };
}

/** Creative desde un post existente de la página (boost) o desde link_data. */
export async function createAdCreative({ adAccountId, token, name, pageId, postId, link, message, imageUrl }) {
  const params = { name };
  if (postId) {
    params.object_story_id = postId; // boost de post existente
  } else {
    params.object_story_spec = {
      page_id: pageId,
      link_data: {
        link,
        message: message || '',
        ...(imageUrl ? { picture: imageUrl } : {}),
      },
    };
  }
  const data = await graphFetch(`/act_${adAccountId}/adcreatives`, {
    method: 'POST', token, params,
  });
  return { creativeId: data.id };
}

export async function createAd({ adAccountId, token, name, adSetId, creativeId }) {
  const data = await graphFetch(`/act_${adAccountId}/ads`, {
    method: 'POST',
    token,
    params: {
      name,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: 'PAUSED',
    },
  });
  return { adId: data.id };
}

export async function updateCampaignStatus({ campaignId, token, status }) {
  await graphFetch(`/${campaignId}`, {
    method: 'POST', token, params: { status }, // ACTIVE | PAUSED
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export async function getCampaignInsights({ adAccountId, token, datePreset = 'last_30d' }) {
  const data = await graphFetch(`/act_${adAccountId}/insights`, {
    token,
    params: {
      level: 'campaign',
      date_preset: datePreset,
      fields: 'campaign_id,campaign_name,impressions,reach,clicks,spend,ctr,cpm,actions',
    },
  });
  return data.data || [];
}

/** Engagement de un post de página (likes, comments, shares, impressions). */
export async function getPostInsights({ postId, pageToken }) {
  try {
    const data = await graphFetch(`/${postId}`, {
      token: pageToken,
      params: { fields: 'shares,likes.summary(true),comments.summary(true)' },
    });
    return {
      likes: data.likes?.summary?.total_count || 0,
      comments: data.comments?.summary?.total_count || 0,
      shares: data.shares?.count || 0,
    };
  } catch {
    return { likes: 0, comments: 0, shares: 0 };
  }
}

/** Métricas de un media de IG. */
export async function getIgMediaInsights({ mediaId, pageToken }) {
  try {
    const data = await graphFetch(`/${mediaId}/insights`, {
      token: pageToken,
      params: { metric: 'reach,likes,comments,saved,shares' },
    });
    const out = {};
    for (const m of data.data || []) out[m.name] = m.values?.[0]?.value ?? 0;
    return out;
  } catch {
    return {};
  }
}
