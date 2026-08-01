// Next.js middleware — protege /admin y /mi-cuenta.
// Runs in the Edge Runtime — uses jose for JWT verification.
import { NextResponse } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth/jwt-edge';

const AUTH_COOKIE = process.env.AUTH_COOKIE || 'dlv_token';

// Rutas 100% públicas (sin token, sin redirect).
// '/' es la tienda pública — siempre accesible.
const PUBLIC_PATHS = [
  '/',
  '/tienda', '/producto', '/checkout', '/servicios', '/contacto',
  '/login', '/registro', '/api', '/uploads', '/mockup', '/mockups',
  '/_next', '/favicon', '/robots', '/sitemap', '/manifest', '/og-image',
];

// Rutas de cliente — requieren token pero cualquier rol (customer/admin/operator).
const CUSTOMER_PATHS = ['/mi-cuenta', '/gang-sheet'];

// Rutas de admin — requieren token admin/operator.
const ADMIN_PATHS = ['/admin'];

function isMatch(pathname, list) {
  return list.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'));
}

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;

  // Public — always allow.
  if (isMatch(pathname, PUBLIC_PATHS)) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const payload = await verifyTokenEdge(token);

  // Customer paths — need any valid session.
  if (isMatch(pathname, CUSTOMER_PATHS)) {
    if (!payload) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname + (search || ''));
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Admin paths — need admin/operator session.
  if (isMatch(pathname, ADMIN_PATHS)) {
    if (!payload) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname + (search || ''));
      return NextResponse.redirect(url);
    }
    if (payload.role !== 'admin' && payload.role !== 'operator') {
      const url = req.nextUrl.clone();
      url.pathname = '/mi-cuenta';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Any other unmatched route — redirect to login.
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname + (search || ''));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude static assets from middleware to keep it fast.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|uploads|downloads|mockups|og-image\.png).*)',
  ],
};
