// JWT sign/verify for API routes (Node.js runtime).
import jwt from 'jsonwebtoken';

const SECRET  = process.env.JWT_SECRET || 'dev_only_not_secret_change_me';
const EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload) {
  // payload: { id, email, role, fullName }
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}
