// Password hashing utilities using bcryptjs (pure JS, works in serverless).
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export async function hashPassword(plain) {
  if (!plain || typeof plain !== 'string') throw new Error('Password requerido');
  if (plain.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  try { return await bcrypt.compare(plain, hash); }
  catch { return false; }
}
