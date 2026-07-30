'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { SidebarNav } from '@/components/sidebar-nav';
import { Topbar } from '@/components/topbar';
import { PublicNav } from '@/components/public-nav';
import { PublicFooter } from '@/components/public-footer';
import { CartDrawer } from '@/components/cart-drawer';
import ChatWidget from '@/components/chat-widget';
import MobileActionBar from '@/components/mobile-action-bar';

// Rutas totalmente aisladas: login/registro se pintan solas, sin nav, sin footer.
const BARE_PREFIXES = ['/login', '/registro', '/mockup'];

// Rutas de admin con sidebar (verificar ANTES que las públicas).
const ADMIN_PREFIXES = ['/admin', '/gang-sheet'];

// Rutas públicas con PublicNav + Footer.
const PUBLIC_PREFIXES = ['/', '/tienda', '/producto', '/checkout', '/servicios', '/contacto', '/mi-cuenta'];

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
        <SidebarNav
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="lg:pl-64">
          <Topbar onToggleNav={() => setMobileNavOpen(v => !v)} />
          <main className="px-4 sm:px-6 py-6 sm:py-8">{children}</main>
        </div>
      </div>
    );
  }

  // 3) Public pages (PublicNav + Footer).
  if (startsWithExactPrefix(pathname, PUBLIC_PREFIXES)) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <PublicNav />
        <main className="flex-1">{children}</main>
        <PublicFooter />
        <CartDrawer />
        <ChatWidget />
        <MobileActionBar />
      </div>
    );
  }

  // 4) Fallback — layout admin.
  return (
    <div className="min-h-screen">
      <SidebarNav
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="lg:pl-64">
        <Topbar onToggleNav={() => setMobileNavOpen(v => !v)} />
        <main className="px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
