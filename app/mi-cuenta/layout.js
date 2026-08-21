// Layout para /mi-cuenta — usa PublicNav + Footer (visualmente coherente con la tienda)
// pero con un side-nav vertical para el portal del cliente.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { User, Package, LogOut, ChevronRight, Home } from 'lucide-react';
import { useAuth, apiLogout } from '@/hooks/use-auth';

const NAV = [
  { href: '/mi-cuenta',         label: 'Mi cuenta', icon: User,    exact: true  },
  { href: '/mi-cuenta/pedidos', label: 'Mis pedidos', icon: Package, exact: false },
];

export default function MiCuentaLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAdmin, isOperator } = useAuth();

  // Si es admin/operator y termina aquí, ofrecémosle un atajo a admin (no lo redirigimos automáticamente
  // porque puede querer ver el portal cliente).
  useEffect(() => {
    // no-op
  }, [pathname]);

  const logout = async () => {
    await apiLogout();
    toast.success('Sesión cerrada');
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="container py-16 text-center text-slate-500">Cargando…</div>
    );
  }

  return (
    <div className="container py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-4">
        <Link href="/tienda" className="hover:text-slate-800 inline-flex items-center gap-1">
          <Home className="h-3 w-3" /> Tienda
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-slate-700 font-medium">Mi cuenta</span>
      </nav>

      {(isAdmin || isOperator) && (
        <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 p-3 flex items-center justify-between gap-3">
          <div className="text-sm text-indigo-900">
            🛡️ Estás viendo el portal como <b>{user?.role}</b>. ¿Quieres ir al panel de administración?
          </div>
          <Link href="/admin" className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md whitespace-nowrap">
            Ir al panel
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar cliente */}
        <aside className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4 bg-gradient-to-br from-orange-500 to-rose-500 text-white">
              <div className="h-10 w-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-lg font-bold">
                {(user?.fullName || user?.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="mt-2 text-sm font-bold truncate">{user?.fullName || 'Cliente'}</div>
              <div className="text-xs text-white/80 truncate">{user?.email}</div>
            </div>
            <nav className="p-2">
              {NAV.map(item => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active ? 'bg-orange-50 text-orange-700' : 'text-slate-700 hover:bg-slate-50'
                    }`}>
                    <Icon className="h-4 w-4" /> {item.label}
                  </Link>
                );
              })}
              <button onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700 transition-colors">
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div className="lg:col-span-3">
          {children}
        </div>
      </div>
    </div>
  );
}
