// =============================================================================
// Cliente Google Ads API — OAuth 2.0, campañas, métricas
// -----------------------------------------------------------------------------
// Variables de entorno requeridas:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID
//   GOOGLE_ADS_REFRESH_TOKEN (obtenido tras OAuth)
//   GOOGLE_ADS_REDIRECT_URI (para el flujo OAuth)
// =============================================================================

import { google } from 'googleapis';

const REDIRECT_URI = process.env.GOOGLE_ADS_REDIRECT_URI ||
  `${(process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '')}/api/marketing/google/oauth/callback`;

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
];

// -----------------------------------------------------------------------------
// Configuración
// -----------------------------------------------------------------------------

export function isGoogleAdsConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

// -----------------------------------------------------------------------------
// OAuth
// -----------------------------------------------------------------------------

export function buildOAuthUrl({ state }) {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent',
    state,
    redirect_uri: REDIRECT_URI,
  });
}

export async function exchangeCodeForToken({ code }) {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken({
    code,
    redirect_uri: REDIRECT_URI,
  });
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : null,
  };
}

// -----------------------------------------------------------------------------
// Google Ads API client helper
// -----------------------------------------------------------------------------

export async function getAdsService(accessToken) {
  // Usamos el endpoint REST de Google Ads API v17
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  return {
    customerId,
    developerToken,
    accessToken,
    base: `https://googleads.googleapis.com/v17/customers/${customerId}`,
  };
}

async function adsRequest({ service, method, path, body, params }) {
  const url = new URL(`${service.base}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
  }

  const headers = {
    'Authorization': `Bearer ${service.accessToken}`,
    'developer-token': service.developerToken,
    'login-customer-id': service.customerId,
    'Content-Type': 'application/json',
  };

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url.toString(), opts);
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Google Ads API error ${res.status}: ${errBody}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// -----------------------------------------------------------------------------
// Campañas
// -----------------------------------------------------------------------------

export async function createSearchCampaign({ service, name, dailyBudgetClp, targetUrl }) {
  const budgetName = `customers/${service.customerId}/campaignBudgets/-1`;

  const campaign = {
    name,
    advertisingChannelType: 'SEARCH',
    status: 'PAUSED',
    manualCpc: { enhancedCpcEnabled: true },
    campaignBudget: budgetName,
    languageConstants: ['languageConstants/1012'], // español
    targetUrl: targetUrl || undefined,
    biddingStrategy: {
      type: 'MANUAL_CPC',
    },
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: true,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    },
  };

  const campaignResult = await adsRequest({
    service,
    method: 'POST',
    path: '/campaigns:mutate',
    body: {
      operations: [{ create: campaign }],
    },
  });

  const campaignId = campaignResult?.results?.[0]?.resourceName;
  if (!campaignId) throw new Error('No se pudo crear la campaña');

  // Crear presupuesto
  const budgetResult = await adsRequest({
    service,
    method: 'POST',
    path: '/campaignBudgets:mutate',
    body: {
      operations: [{
        create: {
          name: `${name} — Budget`,
          amountMicros: String(Math.round(dailyBudgetClp * 1_000_000)), // CLP a micros
          deliveryMethod: 'STANDARD',
        },
      }],
    },
  });

  const budgetId = budgetResult?.results?.[0]?.resourceName;
  if (budgetId) {
    // Actualizar campaña con el presupuesto real
    await adsRequest({
      service,
      method: 'POST',
      path: '/campaigns:mutate',
      body: {
        operations: [{
          update: {
            resourceName: campaignId,
            campaignBudget: budgetId,
          },
          updateMask: 'campaign_budget',
        }],
      },
    });
  }

  return { campaignId, budgetId };
}

export async function createAdGroup({ service, campaignId, name }) {
  const adGroupResult = await adsRequest({
    service,
    method: 'POST',
    path: '/adGroups:mutate',
    body: {
      operations: [{
        create: {
          name,
          campaign: campaignId,
          status: 'ENABLED',
          type: 'SEARCH_STANDARD',
          cpcBidMicros: String(200_000_000), // $200 CLP bid default
        },
      }],
    },
  });

  const adGroupId = adGroupResult?.results?.[0]?.resourceName;
  if (!adGroupId) throw new Error('No se pudo crear el grupo de anuncios');
  return { adGroupId };
}

export async function createResponsiveSearchAd({ service, adGroupId, headlines, descriptions, finalUrl, displayUrlPath }) {
  const adResource = {
    adGroup: adGroupId,
    status: 'ENABLED',
    type: 'RESPONSIVE_SEARCH_AD',
    responsiveSearchAd: {
      headlines: headlines.map((text) => ({ text })),
      descriptions: descriptions.map((text) => ({ text })),
      path1: displayUrlPath?.[0] || '',
      path2: displayUrlPath?.[1] || '',
    },
    finalUrls: [finalUrl],
  };

  const adResult = await adsRequest({
    service,
    method: 'POST',
    path: '/ads:mutate',
    body: {
      operations: [{ create: adResource }],
    },
  });

  const adId = adResult?.results?.[0]?.resourceName;
  if (!adId) throw new Error('No se pudo crear el anuncio');
  return { adId };
}

// -----------------------------------------------------------------------------
// Métricas
// -----------------------------------------------------------------------------

export async function getCampaignMetrics({ service, daysBack = 30 }) {
  const startDate = formatDate(new Date(Date.now() - daysBack * 86400000));
  const endDate = formatDate(new Date());

  const query = `
    SELECT
      campaign.name,
      campaign.status,
      campaign.id,
      metrics.clicks,
      metrics.impressions,
      metrics.cost_micros,
      metrics.average_cpc,
      metrics.ctr,
      metrics.conversions,
      metrics.conversions_value,
      metrics.all_conversions,
      metrics.search_impression_share,
      segments.date
    FROM campaign
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
    ORDER BY segments.date DESC
  `;

  const result = await adsRequest({
    service,
    method: 'POST',
    path: '/googleAds:search',
    body: { query },
  });

  const rows = result?.results || [];
  return rows.map((row) => {
    const c = row.campaign || {};
    const m = row.metrics || {};
    return {
      campaignId: c.id,
      campaignName: c.name,
      campaignStatus: c.status,
      clicks: m.clicks || 0,
      impressions: m.impressions || 0,
      costMicros: m.cost_micros || '0',
      costClp: Math.round(Number(m.cost_micros || 0) / 1_000_000),
      averageCpc: m.average_cpc || 0,
      ctr: m.ctr || 0,
      conversions: m.conversions || 0,
      conversionsValue: m.conversions_value || 0,
      allConversions: m.all_conversions || 0,
      searchImpressionShare: m.search_impression_share || 0,
      date: row.segments?.date,
    };
  });
}

export async function getAccountMetrics({ service, daysBack = 7 }) {
  const startDate = formatDate(new Date(Date.now() - daysBack * 86400000));
  const endDate = formatDate(new Date());

  const query = `
    SELECT
      metrics.clicks,
      metrics.impressions,
      metrics.cost_micros,
      metrics.ctr,
      metrics.conversions,
      metrics.conversions_value,
      metrics.active_view_impressions
    FROM customer
    WHERE segments.date >= '${startDate}' AND segments.date <= '${endDate}'
  `;

  const result = await adsRequest({
    service,
    method: 'POST',
    path: '/googleAds:search',
    body: { query },
  });

  const rows = result?.results || [];
  const totals = rows.reduce((acc, row) => {
    const m = row.metrics || {};
    acc.clicks += Number(m.clicks || 0);
    acc.impressions += Number(m.impressions || 0);
    acc.costMicros += Number(m.cost_micros || 0);
    acc.conversions += Number(m.conversions || 0);
    acc.conversionsValue += Number(m.conversions_value || 0);
    return acc;
  }, { clicks: 0, impressions: 0, costMicros: 0, conversions: 0, conversionsValue: 0 });

  return {
    ...totals,
    costClp: Math.round(totals.costMicros / 1_000_000),
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    averageCpc: totals.clicks > 0 ? (totals.costMicros / 1_000_000) / totals.clicks : 0,
    conversionRate: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
    costPerConversion: totals.conversions > 0 ? (totals.costMicros / 1_000_000) / totals.conversions : 0,
    period: { start: startDate, end: endDate },
  };
}

// -----------------------------------------------------------------------------
// Keywords
// -----------------------------------------------------------------------------

export async function getKeywords({ service, adGroupId }) {
  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.ctr,
      metrics.average_cpc,
      ad_group_criterion.status,
      ad_group_criterion.quality_score
    FROM keyword_view
    WHERE ad_group.id = ${adGroupId.split('/').pop()}
    ORDER BY metrics.clicks DESC
    LIMIT 50
  `;

  const result = await adsRequest({
    service,
    method: 'POST',
    path: '/googleAds:search',
    body: { query },
  });

  return (result?.results || []).map((row) => ({
    text: row.adGroupCriterion?.keyword?.text,
    matchType: row.adGroupCriterion?.keyword?.match_type,
    status: row.adGroupCriterion?.status,
    qualityScore: row.adGroupCriterion?.quality_score,
    impressions: row.metrics?.impressions || 0,
    clicks: row.metrics?.clicks || 0,
    costMicros: row.metrics?.cost_micros || '0',
    costClp: Math.round(Number(row.metrics?.cost_micros || 0) / 1_000_000),
    ctr: row.metrics?.ctr || 0,
    averageCpc: row.metrics?.average_cpc || 0,
  }));
}

// -----------------------------------------------------------------------------
// Optimización de campaña
// -----------------------------------------------------------------------------

export async function updateCampaignBid({ service, campaignId, newBidMicros }) {
  await adsRequest({
    service,
    method: 'POST',
    path: '/campaigns:mutate',
    body: {
      operations: [{
        update: {
          resourceName: campaignId,
          manualCpc: { enhancedCpcEnabled: true, cpcBidMicros: String(newBidMicros) },
        },
        updateMask: 'manual_cpc',
      }],
    },
  });
  return { ok: true };
}

export async function updateCampaignBudget({ service, budgetId, newAmountMicros }) {
  await adsRequest({
    service,
    method: 'POST',
    path: '/campaignBudgets:mutate',
    body: {
      operations: [{
        update: {
          resourceName: budgetId,
          amountMicros: String(newAmountMicros),
        },
        updateMask: 'amount_micros',
      }],
    },
  });
  return { ok: true };
}

export async function updateCampaignStatus({ service, campaignId, status }) {
  await adsRequest({
    service,
    method: 'POST',
    path: '/campaigns:mutate',
    body: {
      operations: [{
        update: {
          resourceName: campaignId,
          status,
        },
        updateMask: 'status',
      }],
    },
  });
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------------

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}
