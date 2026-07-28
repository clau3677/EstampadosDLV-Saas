// =============================================================================
// Cifrado de tokens Meta — AES-256-GCM (auditoría jul-2026)
// -----------------------------------------------------------------------------
// Los access tokens de Meta (usuario, página, ad account) NUNCA se guardan en
// claro en MongoDB. Se cifran con MARKETING_ENCRYPTION_KEY (32 bytes hex o
// cualquier string — se deriva con SHA-256).
//
// Generar clave:  openssl rand -hex 32
// =============================================================================
import crypto from 'crypto';

function getKey() {
  const raw = process.env.MARKETING_ENCRYPTION_KEY;
  if (!raw) throw new Error('MARKETING_ENCRYPTION_KEY no configurada');
  // Deriva siempre 32 bytes exactos independiente del formato de la env var
  return crypto.createHash('sha256').update(raw).digest();
}

export function isEncryptionConfigured() {
  return !!process.env.MARKETING_ENCRYPTION_KEY;
}

/** Cifra un string → "iv:tag:ciphertext" en base64url */
export function encryptToken(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

/** Descifra "iv:tag:ciphertext" → string plano. Lanza si el tag no valida. */
export function decryptToken(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = String(payload).split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('token cifrado con formato inválido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
  return dec.toString('utf8');
}
