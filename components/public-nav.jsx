'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Printer, ShoppingBag, Layers, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCart, cartCount } from '@/lib/cart-store';
import { cn } from '@/lib/utils';

export function PublicNav() {
  const pathname = usePathname();
  const items = useCart(s => s.items);
  const open = useCart(s => s.open);
  const count = cartCount(items);

  const link = (href, label) => (
    <Link
      href={href}
      className={cn(
        'text-sm font-medium transition-colors',
        pathname?.startsWith(href) ? 'text-orange-600' : 'text-slate-700 hover:text-slate-900'
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="container flex h-16 items-center gap-6">
        <Link href="/tienda" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-md shadow-orange-500/20">
            <Printer className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900 leading-tight">Estampados DLV</div>
            <div className="text-[10px] uppercase tracking-widest text-orange-500">DTF & DTF UV · Chile</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-5 ml-4">
          {link('/tienda', 'Catálogo')}
          <Link href="/gang-sheet" className="text-sm font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />Sube tu diseño
          </Link>
          {link('/contacto', 'Contacto')}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={open}
            variant="outline"
            className="relative border-slate-200 hover:border-orange-300 hover:bg-orange-50"
          >
            <ShoppingBag className="h-4 w-4 mr-2" />
            Carrito
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {count}
              </span>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}

export default PublicNav;
