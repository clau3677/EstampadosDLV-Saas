'use client';

import { useEffect, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDateLong } from '@/lib/format';
import { NotificationsBell } from '@/components/notifications-bell';

export function Topbar() {
  // Renderizar la fecha SOLO después de hydration para evitar mismatch server/client
  // (server y cliente pueden estar en momentos distintos, ej. cruce de medianoche)
  const [today, setToday] = useState('');
  useEffect(() => {
    const d = formatDateLong(new Date());
    setToday(d.charAt(0).toUpperCase() + d.slice(1));
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 backdrop-blur px-6">
      <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 min-w-[220px]">
        <Sparkles className="h-4 w-4 text-orange-500" />
        <span suppressHydrationWarning>{today}</span>
      </div>

      <div className="flex-1 max-w-md ml-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="Buscar pedido, cliente, producto…"
          className="pl-9 h-10 bg-slate-50 border-slate-200 focus-visible:ring-orange-500"
        />
      </div>

      <NotificationsBell />
    </header>
  );
}

export default Topbar;
