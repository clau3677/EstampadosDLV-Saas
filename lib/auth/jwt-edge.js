// Edge-compatible JWT verification (for middleware). Uses jose.
import { jwtVerify } from 'jose';

const SECRET = process.env.JWT_SECRET || 'dev_only_not_secret_change_me';
const encoded = new TextEncoder().encode(SECRET);

export async function verifyTokenEdge(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encoded);
    return payload;
  } catch {
    return null;
  }
}
