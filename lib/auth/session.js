// Server-side session helpers for API routes and Server Components.
import { cookies } from 'next/headers';
import { verifyToken } from './jwt';

export const AUTH_COOKIE = process.env.AUTH_COOKIE || 'dlv_token';

// Read token from request cookies (for API route ctx.request) OR next/headers cookies().
export function tokenFromRequest(request) {
  if (!request) return null;
  const cookieHeader = request.headers?.get?.('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|; )${AUTH_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getUserFromRequest(request) {
  const token = tokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

// For use in Server Components / Route Handlers (App Router)
export async function getUserFromCookies() {
  try {
    const store = await cookies();
    const token = store.get(AUTH_COOKIE)?.value;
    if (!token) return null;
    return verifyToken(token);
  } catch { return null; }
}

// Cookie serialization helpers
export function buildAuthCookie(token, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const parts = [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export function clearAuthCookie() {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
