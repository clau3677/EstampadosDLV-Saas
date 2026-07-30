// =============================================================================
// Google Ads API Client — OAuth 2.0 + Google Ads API v17
// -----------------------------------------------------------------------------
// Config vía env:
//   GOOGLE_ADS_CLIENT_ID         → OAuth client ID (Google Cloud)
//   GOOGLE_ADS_CLIENT_SECRET     → OAuth client secret
//   GOOGLE_ADS_DEVELOPER_TOKEN   → Developer token (ads.developers.google.com)
//   GOOGLE_ADS_CUSTOMER_ID       → Customer ID (ej: 3163005633)
//   GOOGLE_ADS_REDIRECT_URI      → https://estampadosdlv.com/api/marketing/google/oauth/callback
//
// Tokens cifrados con MARKETING_ENCRYPTION_KEY (AES-256-GCM)
// =============================================================================
import { encryptToken, decryptToken, isEncryptionConfigured } from './crypto';

const GOOGLE_ADS_API_VERSION = 'v17';
const GOOGLE_ADS_API = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

const GOOGLE_ADS_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'https://www.googleapis.com/auth/adwords.reportdownload',
].join(' ');

// --- Helpers ---
function getRedirectUri() {
  return process.env.GOOGLE_ADS_REDIRECT_URI || 'https://estampadosdlv.com/api/marketing/google/oauth/callback';
}

function getClientId() {
  return process.env.GOOGLE_ADS_CLIENT_ID;
}

function getClientSecret() {
  return process.env.GOOGLE_ADS_CLIENT_SECRET;
}

function getDeveloperToken() {
  return process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
}

function getCustomerId() {
  const id = process.env.GOOGLE_ADS_CUSTOMER_ID || '';
  // Si tiene guiones (316-300-5633), quitarlos
  return id.replace(/-/g, '');
}

export function isGoogleAdsConfigured() {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

// --- OAuth 2.0 ---

export function buildGoogleAdsOAuthUrl() {
  const clientId = getClientId();
  if (!clientId) throw new Error('GOOGLE_ADS_CLIENT_ID no configurado');

  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_ADS_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForGoogleAdsToken(code) {
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || `Google OAuth error ${res.status}`);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
  };
}

// --- Storage ---
// Guarda/carga tokens desde la colección MARKETING_GOOGLE_ACCOUNTS
const GOOGLE_ACCOUNT_KEY = 'google-ads';

export async function saveGoogleAdsTokens(db, tokens) {
  if (!isEncryptionConfigured()) throw new Error('MARKETING_ENCRYPTION_KEY no configurada');
  const now = new Date();
  const doc = {
    provider: GOOGLE_ACCOUNT_KEY,
    accessToken: encryptToken(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
    expiresIn: tokens.expiresIn,
    customerId: getCustomerId(),
    status: 'connected',
    connectedAt: now,
    expiresAt: new Date(now.getTime() + (tokens.expiresIn || 3600) * 1000),
    updatedAt: now,
  };
  await db.collection('marketing_google_accounts')
    .updateOne({ provider: GOOGLE_ACCOUNT_KEY }, { $set: doc }, { upsert: true });
  return doc;
}

export async function getGoogleAdsTokens(db) {
  const doc = await db.collection('marketing_google_accounts')
    .findOne({ provider: GOOGLE_ACCOUNT_KEY });
  if (!doc || doc.status !== 'connected') return null;
  const tokens = {
    accessToken: decryptToken(doc.accessToken),
    refreshToken: doc.refreshToken ? decryptToken(doc.refreshToken) : null,
    expiresAt: doc.expiresAt,
  };
  // Si expiró, intentar refresh
  if (tokens.expiresAt && new Date(tokens.expiresAt) < new Date()) {
    if (!tokens.refreshToken) return null;
    return await refreshGoogleAdsToken(db, tokens.refreshToken);
  }
  return tokens;
}

export async function refreshGoogleAdsToken(db, refreshToken) {
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || `Token refresh failed ${res.status}`);
  const newTokens = {
    accessToken: data.access_token,
    refreshToken: refreshToken, // no cambia
    expiresIn: data.expires_in,
  };
  await saveGoogleAdsTokens(db, newTokens);
  return { ...newTokens, refreshToken };
}

export async function disconnectGoogleAds(db) {
  await db.collection('marketing_google_accounts')
    .updateOne({ provider: GOOGLE_ACCOUNT_KEY }, { $set: { status: 'disconnected', updatedAt: new Date() } });
}

export async function getGoogleAdsConnectionStatus(db) {
  const doc = await db.collection('marketing_google_accounts')
    .findOne({ provider: GOOGLE_ACCOUNT_KEY });
  return {
    connected: doc?.status === 'connected',
    customerId: getCustomerId(),
    connectedAt: doc?.connectedAt,
  };
}

// --- Google Ads API Requests ---

async function adsApiFetch(db, method, path, body = null) {
  const tokens = await getGoogleAdsTokens(db);
  if (!tokens) throw new Error('Google Ads no conectado — reconecta la cuenta');

  const url = `${GOOGLE_ADS_API}${path}`;
  const headers = {
    'Authorization': `Bearer ${tokens.accessToken}`,
    'developer-token': getDeveloperToken(),
    'login-customer-id': getCustomerId(),
    'Content-Type': 'application/json',
  };

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errMsg = data?.error?.message || `Google Ads API error ${res.status}`;
    // Si es token expired (401), intentar refresh
    if (res.status === 401 && tokens.refreshToken) {
      await refreshGoogleAdsToken(db, tokens.refreshToken);
      const newTokens = await getGoogleAdsTokens(db);
      headers['Authorization'] = `Bearer ${newTokens.accessToken}`;
      const res2 = await fetch(url, { method, headers, body: opts.body });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) throw new Error(data2?.error?.message || `Google Ads API error ${res2.status}`);
      return data2;
    }
    throw new Error(errMsg);
  }
  return data;
}

// --- Campaigns ---

export async function listGoogleAdsCampaigns(db) {
  const query = `
    SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
           campaign_serving_status.serving_status, metrics.clicks, metrics.impressions,
           metrics.cost_micros, metrics.ctr, metrics.average_cpc, metrics.conversions
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY campaign.id DESC
    LIMIT 50
  `;
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/googleAds:search`, { query });
}

export async function createGoogleAdsSearchCampaign(db, { name, budgetMicros = 50000000, maxCpcMicros = 500000 }) {
  // 1. Crear campaña
  const campaignOp = {
    operation: {
      create: {
        name,
        advertisingChannelType: 'SEARCH',
        status: 'PAUSED',
        biddingStrategyType: 'MANUAL_CPC',
        manualCpc: { enhancedCpcEnabled: true },
      },
    },
  };
  const campaignRes = await adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/campaigns:mutate`, campaignOp);
  const campaignResourceName = campaignRes.results?.[0]?.resourceName;
  if (!campaignResourceName) throw new Error('No se pudo crear la campaña');

  // Extraer ID del resource name: customers/3163005633/campaigns/12345
  const campaignId = campaignResourceName.split('/').pop();

  // 2. Crear presupuesto de campaña
  const budgetRes = await adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/campaignBudgets:mutate`, {
    operation: {
      create: {
        amountMicros: String(budgetMicros), // 50 USD = 50,000,000 micros
        name: `Budget - ${name}`,
        deliveryMethod: 'STANDARD',
      },
    },
  });
  const budgetResourceName = budgetRes.results?.[0]?.resourceName;

  // 3. Asignar presupuesto a la campaña
  await adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/campaigns:mutate`, {
    operation: {
      update: {
        resourceName: campaignResourceName,
        campaignBudget: budgetResourceName,
      },
    },
  });

  // 4. Crear grupo de anuncios
  const adGroupRes = await adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/adGroups:mutate`, {
    operation: {
      create: {
        name: `${name} - Ad Group`,
        status: 'ENABLED',
        campaign: campaignResourceName,
        type: 'SEARCH_STANDARD',
        cpcBidMicros: String(maxCpcMicros),
      },
    },
  });
  const adGroupResourceName = adGroupRes.results?.[0]?.resourceName;

  return {
    campaignResourceName,
    campaignId,
    adGroupResourceName,
  };
}

export async function createGoogleAdsAdGroup(db, { campaignResourceName, name, maxCpcMicros = 500000 }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/adGroups:mutate`, {
    operation: {
      create: {
        name: name || `${campaignResourceName.split('/').pop()} - Ad Group`,
        status: 'ENABLED',
        campaign: campaignResourceName,
        type: 'SEARCH_STANDARD',
        cpcBidMicros: String(maxCpcMicros),
      },
    },
  });
}

export async function createGoogleAdsKeyword(db, { adGroupResourceName, text, matchType = 'BROAD' }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/adGroupCriteria:mutate`, {
    operation: {
      create: {
        adGroup: adGroupResourceName,
        keyword: { text, matchType },
        status: 'ENABLED',
      },
    },
  });
}

export async function createGoogleAdsResponsiveAd(db, { adGroupResourceName, headlines, descriptions, finalUrl }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/ads:mutate`, {
    operations: [
      {
        create: {
          adGroup: adGroupResourceName,
          responsiveSearchAd: {
            headlines: headlines.map(h => ({ text: h })),
            descriptions: descriptions.map(d => ({ text: d })),
          },
          finalUrls: [finalUrl],
        },
      },
    ],
  });
}

export async function updateGoogleAdsCampaignStatus(db, { campaignResourceName, status }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/campaigns:mutate`, {
    operation: {
      update: {
        resourceName: campaignResourceName,
        status,
      },
    },
  });
}

export async function getGoogleAdsMetrics(db, { campaignIds = [], days = 30 } = {}) {
  const whereClause = campaignIds.length > 0
    ? `WHERE campaign.id IN (${campaignIds.map(id => `${id}`).join(',')})`
    : '';
  const query = `
    SELECT campaign.id, campaign.name, campaign.status,
           metrics.clicks, metrics.impressions, metrics.cost_micros,
           metrics.ctr, metrics.average_cpc, metrics.conversions,
           metrics.average_cpm
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      ${whereClause}
    ORDER BY campaign.id DESC
    LIMIT 50
  `;
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/googleAds:search`, { query });
}

// Exportar constantes necesarias para el handler
export const _INTERNALS = {
  getRedirectUri,
  getClientId,
  getClientSecret,
  getDeveloperToken,
  getCustomerId,
  GOOGLE_ACCOUNT_KEY,
};

