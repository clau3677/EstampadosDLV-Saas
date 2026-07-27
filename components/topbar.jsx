'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles, ExternalLink, Menu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatDateLong } from '@/lib/format';
import { NotificationsBell } from '@/components/notifications-bell';
import { UserMenu } from '@/components/user-menu';

export function Topbar({ onToggleNav }) {
  // Renderizar la fecha SOLO después de hydration para evitar mismatch server/client
  // (server y cliente pueden estar en momentos distintos, ej. cruce de medianoche)
  const [today, setToday] = useState('');
  useEffect(() => {
    const d = formatDateLong(new Date());
    setToday(d.charAt(0).toUpperCase() + d.slice(1));
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 sm:gap-4 border-b border-slate-200 bg-white/80 backdrop-blur px-3 sm:px-6">
      {/* Botón hamburguesa (solo mobile) */}
      <button
        type="button"
        onClick={onToggleNav}
        className="lg:hidden shrink-0 rounded-lg p-2 -ml-1 text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 min-w-[180px]">
        <Sparkles className="h-4 w-4 text-orange-500" />
        <span suppressHydrationWarning>{today}</span>
      </div>

      <div className="flex-1 max-w-md ml-auto relative hidden sm:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="Buscar pedido, cliente, producto…"
          className="pl-9 h-10 bg-slate-50 border-slate-200 focus-visible:ring-orange-500"
        />
      </div>

      {/* Espaciador en mobile para empujar iconos a la derecha */}
      <div className="flex-1 sm:hidden" />

      {/* CTA: Ir al sitio público */}
      <Button
        asChild
        variant="outline"
        size="sm"
        className="hidden md:inline-flex border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800"
      >
        <Link href="/tienda" target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Ver sitio público
        </Link>
      </Button>

      <NotificationsBell />
      <UserMenu />
    </header>
  );
}

export default Topbar;
