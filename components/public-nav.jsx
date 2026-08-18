'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Printer, ShoppingBag, Layers, User, LogIn, Menu, X, Sparkles } from 'lucide-react';
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
  const [menuOpen, setMenuOpen] = useState(false);

  const link = (href, label, icon) => (
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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center gap-2 sm:gap-4">
        {/* Logo */}
        <Link href="/tienda" className="flex min-w-0 items-center gap-2">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-md shadow-orange-500/20">
            <Printer className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="font-bold text-slate-900 truncate">Estampados DLV</div>
            <div className="hidden sm:block text-[10px] uppercase tracking-widest text-orange-500">DTF & DTF UV · Chile</div>
          </div>
        </Link>

        {/* Links de escritorio */}
        <nav className="hidden lg:flex items-center gap-5 ml-4">
          {link('/tienda', 'Catálogo')}
          <Link href="/gang-sheet" className="text-sm font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />Sube tu diseño
          </Link>
          {link('/blog', 'Blog')}
          {link('/contacto', 'Contacto')}
          <Link href="/logo-creator" className={cn("text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-rose-600 px-3 py-1.5 rounded-lg hover:opacity-90 transition inline-flex items-center gap-1.5", pathname?.startsWith('/logo-creator') && 'ring-2 ring-orange-300')}>
            <Sparkles className="h-3.5 w-3.5" />Crea tu logo gratis
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button
            onClick={open}
            variant="outline"
            aria-label={`Carrito de compras (${count} artículos)`}
            className="relative shrink-0 border-slate-200 hover:border-orange-300 hover:bg-orange-50"
          >
            <ShoppingBag className="h-4 w-4 sm:mr-2" />
            <span className="hidden md:inline">Carrito</span>
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
              <Button asChild size="sm" className="bg-orange-500 hover:bg-orange-600 hidden md:inline-flex">
                <Link href="/registro"><User className="h-3.5 w-3.5 mr-1" />Crear cuenta</Link>
              </Button>
            </>
          )}

          {/* Menú hamburguesa móvil */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuOpen(v => !v)}
            className="shrink-0 lg:hidden text-slate-700"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Menú móvil desplegable */}
      {menuOpen && (
        <div className="lg:hidden border-t border-slate-100 bg-white px-4 py-3 shadow-lg">
          <nav className="flex flex-col gap-1">
            {[
              ['/tienda', 'Catálogo'],
              ['/gang-sheet', 'Sube tu diseño'],
              ['/logo-creator', '✨ Crea tu logo gratis'],
              ['/blog', 'Blog'],
              ['/contacto', 'Contacto'],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  pathname?.startsWith(href) ? 'bg-orange-50 text-orange-600' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                {label}
              </Link>
            ))}
            {!user && (
              <>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogIn className="h-4 w-4" /> Ingresar
                </Link>
                <Link
                  href="/registro"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
                >
                  <User className="h-4 w-4" /> Crear cuenta
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

export default PublicNav;
