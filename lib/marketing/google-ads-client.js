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

const GOOGLE_ADS_SCOPES = 'https://www.googleapis.com/auth/adwords';

// --- Geo Targeting ---
// Criteria IDs de Google Ads para ubicación (Geo Target Constants)
// Fuente: https://developers.google.com/google-ads/api/data/geotargets
const GEO_TARGETS = {
  // Chile (país) = 2152
  CHILE: 2152,
  // Región de Valparaíso = 20178
  VALPARAISO_REGION: 20178,
};

// --- Idiomas ---
// Códigos de idioma de Google Ads: https://developers.google.com/google-ads/api/data/codes-formats#languages
const LANGUAGE_CODES = {
  ESPANOL: 1003, // Español
  INGLES: 1000,  // Inglés
};

// --- Focos de negocio (categorías de productos) ---
// Keywords base por foco que se usan para generar campañas automáticamente
const BUSINESS_FOCUSES = {
  dtf_textil: {
    name: 'DTF Textil',
    keywords: ['dtf textil', 'impresión dtf textil', 'estampado dtf tela', 'dtf textil precio', 'impresión textil dtf'],
    headlines: [
      'DTF Textil Profesional',
      'Impresión DTF Textil',
      'Estampado Textil DTF',
      'DTF Alta Definición',
      'Estampados DTF Chile',
      'DTF Textil Calidad',
      'Impresión Textil Pro',
      'DTF Textil Premium',
      'Estampa tu Marca',
      'DTF Textil Estampados DLV',
    ],
    descriptions: [
      'Impresión DTF textil profesional con despacho a todo Chile. Alta definición y durabilidad.',
      'Estampados DTF de alta calidad para tus prendas. Colores vibrantes y resistencia al lavado.',
      'DTF textil profesional en Estampados DLV. Precios mayoristas y atención personalizada.',
    ],
  },
  dtf_uv: {
    name: 'DTF UV',
    keywords: ['dtf uv', 'impresión dtf uv', 'estampado uv', 'dtf uv precio', 'impresión uv profesional'],
    headlines: [
      'DTF UV Profesional',
      'Impresión DTF UV',
      'Estampado UV Premium',
      'DTF UV Alta Calidad',
      'Impresión UV Chile',
      'DTF UV Estampados DLV',
      'Estampado UV Duradero',
      'DTF UV Para Todo',
      'Impresión UV Estampados',
      'DTF UV Calidad Pro',
    ],
    descriptions: [
      'Impresión DTF UV profesional con despacho a todo Chile. Ideal para superficies rígidas y flexibles.',
      'DTF UV de alta definición. Estampa en cualquier material: vidrio, madera, metal, acrílico y más.',
      'DTF UV en Estampados DLV. Calidad profesional, colores vibrantes y máxima durabilidad.',
    ],
  },
  ropa_lisa: {
    name: 'Ropa Lisa',
    keywords: ['ropa lisa', 'prendas lisas al por mayor', 'polerones lisos', 'camisetas lisas mayoreo', 'ropa sin estampado'],
    headlines: [
      'Ropa Lisa al por Mayor',
      'Polerones y Camisetas Lisas',
      'Prendas Lisas Calidad',
      'Ropa Lisa Estampados DLV',
      'Polerones Lisos Mayoreo',
      'Camisetas Lisas Premium',
      'Ropa Lisa para Estampar',
      'Prendas Base Calidad',
      'Polerones Lisos Chile',
      'Ropa Lisa Estampados',
    ],
    descriptions: [
      'Ropa lisa al por mayor para tu negocio de estampado. Polerones, camisetas y más en calidad premium.',
      'Prendas lisas de alta calidad en Estampados DLV. Variedad de tallas, colores y estilos.',
      'Ropa lisa para estampar. Polerones y camisetas al por mayor con despacho a todo Chile.',
    ],
  },
  gorras: {
    name: 'Gorras',
    keywords: ['gorras', 'gorras al por mayor', 'gorras personalizables', 'gorras bordanas', 'gorras trucker'],
    headlines: [
      'Gorras al por Mayor',
      'Gorras Personalizables',
      'Gorras Premium',
      'Gorras Estampados DLV',
      'Gorras Trucker Mayoreo',
      'Gorras Bordadas Calidad',
      'Gorras para Estampar',
      'Gorras Trucker Chile',
      'Gorras Premium Calidad',
      'Gorras para tu Marca',
    ],
    descriptions: [
      'Gorras al por mayor en Estampados DLV. Variedad de estilos: trucker, snapback y más.',
      'Gorras premium personalizables. Ideal para tu marca o negocio. Despacho a todo Chile.',
      'Gorras de alta calidad en Estampados DLV. Malla, algodón, mezclilla. Precios mayoristas.',
    ],
  },
  ropa_trabajo: {
    name: 'Ropa de Trabajo',
    keywords: ['ropa de trabajo', 'uniformes trabajo', 'ropa laboral', 'uniformes empresariales', 'ropa corporativa'],
    headlines: [
      'Ropa de Trabajo',
      'Uniformes Empresariales',
      'Ropa Laboral Premium',
      'Uniformes Estampados DLV',
      'Ropa Corporativa',
      'Uniformes Calidad Pro',
      'Ropa Trabajo Chile',
      'Uniformes para Empresas',
      'Ropa Laboral Estampados',
      'Uniformes Personalizados',
    ],
    descriptions: [
      'Ropa de trabajo y uniformes empresariales en Estampados DLV. Personalización y despacho a todo Chile.',
      'Uniformes corporativos de alta calidad. Polos, camisas, pantalones y más. Precios mayoristas.',
      'Ropa laboral en Estampados DLV. Variedad de modelos y tallas para tu empresa. Cotiza ahora.',
    ],
  },
};

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

// Exportar BUSINESS_FOCUSES y GEO_TARGETS para uso externo
export { BUSINESS_FOCUSES, GEO_TARGETS, LANGUAGE_CODES };

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
const GOOGLE_ACCOUNT_KEY = 'google-ads';

export async function saveGoogleAdsTokens(db, tokens) {
  if (!isEncryptionConfigured()) throw new Error('MARKETING_ENCRYPTION_KEY no configurada');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (tokens.expiresIn || 3600) * 1000);
  await db.collection('marketing_google_accounts').updateOne(
    { provider: GOOGLE_ACCOUNT_KEY },
    {
      $set: {
        provider: GOOGLE_ACCOUNT_KEY,
        accessToken: encryptToken(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
        expiresAt,
        status: 'connected',
        connectedAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
}

export async function getGoogleAdsTokens(db) {
  const doc = await db.collection('marketing_google_accounts').findOne({ provider: GOOGLE_ACCOUNT_KEY });
  if (!doc || doc.status !== 'connected') return null;
  if (!doc.accessToken) return null;

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
    refreshToken: refreshToken,
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
  if (!tokens) throw new Error('Google Ads no conectado — reconecta la cuenta en Marketing > Google Ads > Conexión');

  const url = `${GOOGLE_ADS_API}${path}`;
  const headers = {
    'Authorization': `Bearer ${tokens.accessToken}`,
    'developer-token': getDeveloperToken(),
    'login-customer-id': getCustomerId(),
    'Content-Type': 'application/json',
  };

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  console.log(`[GoogleAds] ${method} ${path}`);

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errMsg = data?.error?.message || data?.error?.details?.[0]?.errors?.[0]?.message || `Google Ads API error ${res.status}`;
    console.error(`[GoogleAds] ERROR ${res.status}: ${errMsg}`, JSON.stringify(data).slice(0, 500));

    // Si el token expiró (401), intentar refresh automático
    if (res.status === 401 && tokens.refreshToken) {
      console.log('[GoogleAds] Intentando refresh token...');
      try {
        await refreshGoogleAdsToken(db, tokens.refreshToken);
        const newTokens = await getGoogleAdsTokens(db);
        if (newTokens?.accessToken) {
          headers['Authorization'] = `Bearer ${newTokens.accessToken}`;
          console.log('[GoogleAds] Token refresh exitoso, reintentando request...');
          const res2 = await fetch(url, { method, headers, body: opts.body });
          const data2 = await res2.json().catch(() => ({}));
          if (res2.ok) return data2;
          const errMsg2 = data2?.error?.message || data2?.error?.details?.[0]?.errors?.[0]?.message || `Google Ads API error ${res2.status}`;
          throw new Error(errMsg2);
        }
      } catch (refreshErr) {
        console.error('[GoogleAds] Refresh falló:', refreshErr.message);
      }
    }

    // Mensajes más descriptivos para errores comunes
    if (res.status === 403) throw new Error(`Permiso denegado por Google Ads. Verifica que la cuenta ${getCustomerId()} tenga acceso.`);
    if (res.status === 400) throw new Error(`Solicitud inválida: ${errMsg}`);
    if (res.status === 404) throw new Error('Recurso no encontrado en Google Ads API.');
    if (res.status === 429) throw new Error('Límite de solicitudes excedido. Intenta de nuevo en unos segundos.');
    throw new Error(errMsg);
  }

  console.log(`[GoogleAds] OK ${method} ${path}`);
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

/**
 * Obtener productos del stock comercial que estén activos y con stock > 0
 * para orientar campañas solo a productos disponibles.
 */
export async function getStockProducts(db) {
  const stockRows = await db.collection('commercial_stock')
    .find({ quantity: { $gt: 0 } })
    .toArray();

  if (stockRows.length === 0) return [];

  const productIds = [...new Set(stockRows.map(s => s.productId))];
  const products = await db.collection('products')
    .find({ id: { $in: productIds }, active: true })
    .toArray();

  return products;
}

/**
 * Obtener keywords de productos en stock, filtrados por focos de negocio
 */
export async function getStockKeywordsByFocus(db, focusKey) {
  const focus = BUSINESS_FOCUSES[focusKey];
  if (!focus) return [];

  const stockProducts = await getStockProducts(db);
  if (stockProducts.length === 0) return focus.keywords;

  // Generar keywords adicionales basadas en los productos en stock
  const productKeywords = stockProducts.map(p => p.name?.toLowerCase() || '');
  const allKeywords = [...focus.keywords, ...productKeywords.filter(Boolean).slice(0, 20)];
  return [...new Set(allKeywords)];
}

/**
 * Crear criterio de ubicación para una campaña (geolocalización)
 */
export async function addCampaignLocation(db, { campaignResourceName, locationId = GEO_TARGETS.VALPARAISO_REGION, negative = false }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/campaignCriteria:mutate`, {
    operations: [
      {
        create: {
          campaign: campaignResourceName,
          location: {
            geoTargetConstant: `geoTargetConstants/${locationId}`,
          },
          negative,
        },
      },
    ],
  });
}

/**
 * Crear criterio de idioma para una campaña
 */
export async function addCampaignLanguage(db, { campaignResourceName, languageCode = LANGUAGE_CODES.ESPANOL }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/campaignCriteria:mutate`, {
    operations: [
      {
        create: {
          campaign: campaignResourceName,
          language: {
            languageConstant: `languageConstants/${languageCode}`,
          },
        },
      },
    ],
  });
}

/**
 * Configurar opciones de ubicación (presencia + interés = 2, solo presencia = 1)
 * 2 = "Presencia: personas en tu ubicación objetivo" (más preciso)
 * 1 = "Presencia o interés: personas en o interesadas en tu ubicación" (más alcance)
 */
export async function setCampaignLocationOption(db, { campaignResourceName, option = 2 }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/campaigns:mutate`, {
    operations: [
      {
        update: {
          resourceName: campaignResourceName,
          campaignServingStatus: 'ELIGIBLE',
          locationOption: option,
        },
      },
    ],
  });
}

/**
 * Crear campaña de búsqueda orientada a un foco de negocio específico,
 * geolocalizada en Región de Valparaíso, con productos en stock.
 */
export async function createGoogleAdsSearchCampaign(db, {
  name,
  budgetMicros = 50000000,
  maxCpcMicros = 500000,
  focusKey = null,         // ej: 'dtf_textil', 'dtf_uv', 'gorras', etc.
  locationId = GEO_TARGETS.VALPARAISO_REGION, // default: Región de Valparaíso
  languageCode = LANGUAGE_CODES.ESPANOL,
}) {
  const customerId = getCustomerId();

  // 1. Crear presupuesto de campaña
  const budgetRes = await adsApiFetch(db, 'POST', `/customers/${customerId}/campaignBudgets:mutate`, {
    operations: [
      {
        create: {
          amountMicros: String(budgetMicros),
          name: `Budget - ${name}`,
          deliveryMethod: 'STANDARD',
        },
      },
    ],
  });
  const budgetResourceName = budgetRes.results?.[0]?.resourceName;
  if (!budgetResourceName) throw new Error('No se pudo crear el presupuesto');

  // 2. Crear campaña con configuración optimizada
  const campaignRes = await adsApiFetch(db, 'POST', `/customers/${customerId}/campaigns:mutate`, {
    operations: [
      {
        create: {
          name,
          advertisingChannelType: 'SEARCH',
          status: 'PAUSED',
          campaignBudget: budgetResourceName,
          manualCpc: { enhancedCpcEnabled: true },
          // Solo Red de Búsqueda de Google (no Display, no Partners)
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: true,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          // Opción de ubicación: solo personas en la ubicación objetivo
          locationOption: 2,
          // Frecuencia de anuncios
          frequencyCap: {
            impressions: 100,
            timeUnit: 'MONTH',
            level: 'AD_GROUP',
          },
        },
      },
    ],
  });
  const campaignResourceName = campaignRes.results?.[0]?.resourceName;
  if (!campaignResourceName) throw new Error('No se pudo crear la campaña');

  const campaignId = campaignResourceName.split('/').pop();

  // 3. Agregar criterio de ubicación (Región de Valparaíso)
  try {
    await addCampaignLocation(db, { campaignResourceName, locationId });
  } catch (e) {
    console.warn('No se pudo agregar ubicación:', e.message);
    // No es fatal, la campaña funciona sin esto
  }

  // 4. Agregar criterio de idioma (Español)
  try {
    await addCampaignLanguage(db, { campaignResourceName, languageCode });
  } catch (e) {
    console.warn('No se pudo agregar idioma:', e.message);
  }

  // 5. Crear grupo de anuncios
  const adGroupRes = await adsApiFetch(db, 'POST', `/customers/${customerId}/adGroups:mutate`, {
    operations: [
      {
        create: {
          name: `${name} - Grupo Principal`,
          status: 'ENABLED',
          campaign: campaignResourceName,
          type: 'SEARCH_STANDARD',
          cpcBidMicros: String(maxCpcMicros),
        },
      },
    ],
  });
  const adGroupResourceName = adGroupRes.results?.[0]?.resourceName;
  if (!adGroupResourceName) throw new Error('No se pudo crear el grupo de anuncios');

  // 6. Si hay un focus, agregar keywords y anuncios automáticos
  if (focusKey && BUSINESS_FOCUSES[focusKey]) {
    const focus = BUSINESS_FOCUSES[focusKey];

    // Agregar keywords
    try {
      for (const kw of focus.keywords) {
        await createGoogleAdsKeyword(db, { adGroupResourceName, text: kw, matchType: 'BROAD' });
      }
    } catch (e) {
      console.warn('No se pudieron agregar keywords:', e.message);
    }

    // Agregar anuncio responsive search
    try {
      const finalUrl = 'https://estampadosdlv.com/tienda';
      await createGoogleAdsResponsiveAd(db, {
        adGroupResourceName,
        headlines: focus.headlines,
        descriptions: focus.descriptions,
        finalUrl,
      });
    } catch (e) {
      console.warn('No se pudo crear anuncio:', e.message);
    }
  }

  return {
    campaignResourceName,
    campaignId,
    budgetResourceName,
    adGroupResourceName,
    locationId,
    focusKey,
  };
}

export async function createGoogleAdsAdGroup(db, { campaignResourceName, name, maxCpcMicros = 500000 }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/adGroups:mutate`, {
    operations: [
      {
        create: {
          name: name || `${campaignResourceName.split('/').pop()} - Ad Group`,
          status: 'ENABLED',
          campaign: campaignResourceName,
          type: 'SEARCH_STANDARD',
          cpcBidMicros: String(maxCpcMicros),
        },
      },
    ],
  });
}

export async function createGoogleAdsKeyword(db, { adGroupResourceName, text, matchType = 'BROAD' }) {
  return adsApiFetch(db, 'POST', `/customers/${getCustomerId()}/adGroupCriteria:mutate`, {
    operations: [
      {
        create: {
          adGroup: adGroupResourceName,
          keyword: { text, matchType },
          status: 'ENABLED',
          negative: false,
        },
      },
    ],
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
    operations: [
      {
        update: {
          resourceName: campaignResourceName,
          status,
        },
      },
    ],
    partialFailure: false,
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
