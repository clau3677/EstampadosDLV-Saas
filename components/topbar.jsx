'use client';

import { Bell, Search, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDateLong } from '@/lib/format';

export function Topbar() {
  const today = formatDateLong(new Date());
  const capitalized = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 backdrop-blur px-6">
      <div className="hidden md:flex items-center gap-2 text-sm text-slate-500">
        <Sparkles className="h-4 w-4 text-orange-500" />
        <span>{capitalized}</span>
      </div>

      <div className="flex-1 max-w-md ml-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="Buscar pedido, cliente, producto…"
          className="pl-9 h-10 bg-slate-50 border-slate-200 focus-visible:ring-orange-500"
        />
      </div>

      <button className="relative rounded-full p-2 hover:bg-slate-100 transition-colors" aria-label="Notificaciones">
        <Bell className="h-5 w-5 text-slate-600" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
      </button>
    </header>
  );
}

export default Topbar;
