'use client';

import { useState, lazy, Suspense } from 'react';
import { usePathname } from 'next/navigation';

// Lazy load componentes pesados para reducir JS inicial
const SidebarNav = lazy(() => import('@/components/sidebar-nav').then(m => ({ default: m.SidebarNav })));
const Topbar = lazy(() => import('@/components/topbar').then(m => ({ default: m.Topbar })));
const PublicNav = lazy(() => import('@/components/public-nav').then(m => ({ default: m.PublicNav })));
const PublicFooter = lazy(() => import('@/components/public-footer').then(m => ({ default: m.PublicFooter })));
const CartDrawer = lazy(() => import('@/components/cart-drawer').then(m => ({ default: m.CartDrawer })));
const ChatWidget = lazy(() => import('@/components/chat-widget'));
const MobileActionBar = lazy(() => import('@/components/mobile-action-bar').then(m => ({ default: m.default })));

// Rutas totalmente aisladas: login/registro se pintan solas, sin nav, sin footer.
const BARE_PREFIXES = ['/login', '/registro', '/mockup'];

// Rutas de admin con sidebar (verificar ANTES que las públicas).
const ADMIN_PREFIXES = ['/admin', '/gang-sheet', '/prospeccion'];

// Rutas públicas con PublicNav + Footer.
const PUBLIC_PREFIXES = ['/', '/tienda', '/producto', '/checkout', '/servicios', '/contacto', '/mi-cuenta', '/concurso', '/logo-creator'];

function startsWithExactPrefix(pathname, prefixes) {
  return prefixes.some(p => {
    if (p === '/') return pathname === '/' || pathname === '';
    return pathname === p || pathname.startsWith(p + '/');
  });
}

export default function LayoutSelector({ children }) {
  const pathname = usePathname() || '/';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // 1) Bare pages (sin nav, sin footer).
  if (startsWithExactPrefix(pathname, BARE_PREFIXES)) return <>{children}</>;

  // 2) Admin pages (sidebar + topbar) — verificar ANTES que públicas porque '/' matchea todo.
  if (startsWithExactPrefix(pathname, ADMIN_PREFIXES)) {
    return (
      <div className="min-h-screen">
        <Suspense fallback={<div className="h-14 bg-slate-100" />}>
          <SidebarNav
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
        </Suspense>
        <div className="lg:pl-64">
          <Suspense fallback={<div className="h-16 bg-slate-100 border-b" />}>
            <Topbar onToggleNav={() => setMobileNavOpen(v => !v)} />
          </Suspense>
          <main className="px-4 sm:px-6 py-6 sm:py-8">{children}</main>
        </div>
      </div>
    );
  }

  // 3) Public pages (PublicNav + Footer).
  if (startsWithExactPrefix(pathname, PUBLIC_PREFIXES)) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Suspense fallback={<div className="h-16 bg-slate-100 border-b" />}>
          <PublicNav />
        </Suspense>
        <main className="flex-1">{children}</main>
        <Suspense fallback={null}>
          <PublicFooter />
        </Suspense>
        <Suspense fallback={null}>
          <CartDrawer />
        </Suspense>
        <Suspense fallback={null}>
          <ChatWidget />
        </Suspense>
        <Suspense fallback={null}>
          <MobileActionBar />
        </Suspense>
      </div>
    );
  }

  // 4) Fallback — layout admin.
  return (
    <div className="min-h-screen">
      <Suspense fallback={<div className="h-14 bg-slate-100" />}>
        <SidebarNav
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      </Suspense>
      <div className="lg:pl-64">
        <Suspense fallback={<div className="h-16 bg-slate-100 border-b" />}>
          <Topbar onToggleNav={() => setMobileNavOpen(v => !v)} />
        </Suspense>
        <main className="px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
