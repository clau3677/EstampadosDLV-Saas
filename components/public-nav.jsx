'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Printer, ShoppingBag, Layers, User, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart, cartCount } from '@/lib/cart-store';
import { useAuth } from '@/hooks/use-auth';
import { UserMenu } from '@/components/user-menu';
import { cn } from '@/lib/utils';

export function PublicNav() {
  const pathname = usePathname();
  const items = useCart(s => s.items);
  const open = useCart(s => s.open);
  const count = cartCount(items);
  const { user } = useAuth();

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
            <span className="hidden sm:inline">Carrito</span>
            {count > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {count}
              </span>
            )}
          </Button>

          {user ? (
            <UserMenu />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex text-slate-700">
                <Link href="/login"><LogIn className="h-3.5 w-3.5 mr-1" />Ingresar</Link>
              </Button>
              <Button asChild size="sm" className="bg-orange-500 hover:bg-orange-600 hidden md:inline-flex">
                <Link href="/registro"><User className="h-3.5 w-3.5 mr-1" />Crear cuenta</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export default PublicNav;
