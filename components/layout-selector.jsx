'use client';

import { usePathname } from 'next/navigation';
import { SidebarNav } from '@/components/sidebar-nav';
import { Topbar } from '@/components/topbar';
import { PublicNav } from '@/components/public-nav';
import { PublicFooter } from '@/components/public-footer';
import { CartDrawer } from '@/components/cart-drawer';
import ChatWidget from '@/components/chat-widget';
import MobileActionBar from '@/components/mobile-action-bar';

// Rutas totalmente aisladas: login/registro se pintan solas, sin nav, sin footer.
const BARE_PREFIXES = ['/login', '/registro'];

// Rutas públicas con PublicNav + Footer (incluye /mi-cuenta para clientes).
const PUBLIC_PREFIXES = ['/tienda', '/producto', '/checkout', '/servicios', '/contacto', '/mi-cuenta'];

export default function LayoutSelector({ children }) {
  const pathname = usePathname();

  const isBare = BARE_PREFIXES.some(p => pathname === p || pathname?.startsWith(p + '/'));
  if (isBare) return <>{children}</>;

  const isPublic = PUBLIC_PREFIXES.some(p => pathname?.startsWith(p));

  if (isPublic) {
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

  return (
    <div className="min-h-screen">
      <SidebarNav />
      <div className="lg:pl-64">
        <Topbar />
        <main className="px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
