// /app/lib/api/drive/_helpers.js
// ============================================================================
// Helpers para Google Drive OAuth 2.0:
//   • encryptJson / decryptJson (AES-256-GCM para tokens en Mongo)
//   • getOAuthClient (client con auto-refresh via 'tokens' event)
//   • getDrive (drive v3 API client)
//   • retry (backoff exponencial para rate limits)
//   • REDIRECT_URI y SCOPES centralizados
// ============================================================================
import crypto from 'node:crypto';
import { google } from 'googleapis';

const ALG = 'aes-256-gcm';

export const DRIVE_COLLECTION_CONNS  = 'drive_connections';
export const DRIVE_COLLECTION_ASSETS = 'drive_assets';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

// Redirect URI dinámico: se calcula desde NEXT_PUBLIC_BASE_URL para producción
// y también acepta localhost para dev.
export function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${base}/api/drive/oauth/callback`;
}

// -------------------------------------------------------------------------
// Encriptación AES-256-GCM. La clave master vive en env DRIVE_TOKEN_ENC_KEY
// (base64, 32 bytes). Cada blob usa un IV aleatorio único.
// -------------------------------------------------------------------------
function getEncKey() {
  const raw = process.env.DRIVE_TOKEN_ENC_KEY;
  if (!raw) throw new Error('DRIVE_TOKEN_ENC_KEY missing in .env');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DRIVE_TOKEN_ENC_KEY must decode to 32 bytes');
  return key;
}

export function encryptJson(value) {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv:         iv.toString('base64'),
    tag:        tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptJson(blob) {
  if (!blob?.iv || !blob?.tag || !blob?.ciphertext) return null;
  const key = getEncKey();
  const decipher = crypto.createDecipheriv(ALG, key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plain.toString('utf8'));
}

// -------------------------------------------------------------------------
// Devuelve un OAuth2Client con credenciales cargadas y auto-refresh
// via el evento 'tokens' que persiste rotaciones en Mongo.
// -------------------------------------------------------------------------
export async function getOAuthClient(db, adminId) {
  const conn = await db.collection(DRIVE_COLLECTION_CONNS).findOne({ adminId });
  if (!conn) throw new Error('DRIVE_NOT_CONNECTED');

  const accessTok  = decryptJson(conn.accessTokenEnc);
  const refreshTok = decryptJson(conn.refreshTokenEnc);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri(),
  );
  oauth2Client.setCredentials({
    access_token:  accessTok?.access_token,
    refresh_token: refreshTok?.refresh_token,
    expiry_date:   conn.expiryDate,
    scope:         (conn.scopes || []).join(' '),
    token_type:    'Bearer',
  });

  // Persistir rotaciones automáticas de token
  oauth2Client.on('tokens', async (t) => {
    const update = { updatedAt: new Date() };
    if (t.access_token) update.accessTokenEnc = encryptJson({ access_token: t.access_token });
    if (t.refresh_token) update.refreshTokenEnc = encryptJson({ refresh_token: t.refresh_token });
    if (t.expiry_date) update.expiryDate = t.expiry_date;
    try {
      await db.collection(DRIVE_COLLECTION_CONNS).updateOne({ adminId }, { $set: update });
    } catch (e) {
      console.error('[drive/oauth] failed to persist rotated tokens:', e.message);
    }
  });
  // Auto-refresh expired access tokens using the refresh token
  try { await oauth2Client.refreshTokenIfNeeded(); } catch (e) { console.warn("[drive] token refresh failed:", e.message); }

  return oauth2Client;
}

export async function getDrive(db, adminId) {
  const auth = await getOAuthClient(db, adminId);
  return google.drive({ version: 'v3', auth });
}

// -------------------------------------------------------------------------
// Retry con backoff exponencial para rate limits y errores transitorios.
// -------------------------------------------------------------------------
export async function withRetry(fn, tries = 5) {
  let delay = 500;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      const status = e?.code ?? e?.response?.status;
      if (![401, 403, 429, 500, 502, 503, 504].includes(Number(status))) throw e;
      if (i === tries - 1) throw e;
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, delay + Math.random() * 1000));
      delay = Math.min(delay * 2, 32000);
    }
  }
  throw new Error('withRetry exhausted');
}

// -------------------------------------------------------------------------
// Sanitiza nombre de archivo para uso local
// -------------------------------------------------------------------------
export function sanitizeName(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}
