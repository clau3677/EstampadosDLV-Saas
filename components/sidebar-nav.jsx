'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  LayoutDashboard, ShoppingCart, Layers, Zap, KanbanSquare, FileText,
  PackageSearch, Store, Users, LineChart, Wrench, LogOut, Printer, Settings2,
  Globe, MessageCircle, Mail, Sparkles, MessageSquare, ClipboardList, Truck, HardHat, X, UserPlus,
  Library, Megaphone, Box,
} from 'lucide-react';

// Secciones completas para admin/operator
const ADMIN_SECTIONS = [
  {
    label: 'General',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { href: '/admin/pos',    label: 'POS · Punto de Venta', icon: ShoppingCart, badge: 'Caja' },
      { href: '/admin/cotizador', label: 'Cotizador',        icon: FileText, badge: 'PDF' },
      { href: '/admin/pedidos',label: 'Pedidos',              icon: ClipboardList },
      { href: '/admin/logistica', label: 'Logística y despachos', icon: Truck },
      { href: '/tienda', label: 'Ver tienda pública',          icon: Store },
    ],
  },
  {
    label: 'Diseño',
    items: [
      { href: '/gang-sheet', label: 'Gang Sheet Builder', icon: Layers, badge: 'AI' },
      { href: '/admin/design-library', label: 'Biblioteca GSB', icon: Library },
      { href: '/mockup', label: 'Mockup 3D', icon: Box, badge: '3D' },
      { href: '/logo-creator', label: 'Creador de Logos', icon: Sparkles, badge: 'Gratis' },
    ],
  },
  {
    label: 'Producción',
    items: [
      { href: '/admin/pre-prensa', label: 'Pre-Prensa (Zero-Click)', icon: Zap },
      { href: '/admin/kanban',     label: 'Kanban Producción',        icon: KanbanSquare },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { href: '/admin/inventario',   label: 'Inventario Dual',   icon: PackageSearch },
      { href: '/admin/clientes',     label: 'Clientes',          icon: Users },
      { href: '/admin/proveedores/cottonext', label: 'Proveedor Cottonext', icon: Truck, badge: 'Ropa' },
      { href: '/admin/proveedores/textilryu', label: 'Proveedor Textil Ryu', icon: Truck, badge: 'Gorras' },
      { href: '/admin/proveedores/treck',     label: 'Proveedor Treck',      icon: HardHat, badge: 'Seguridad' },
      { href: '/admin/reportes',     label: 'Reportes',          icon: LineChart },
      { href: '/admin/mantenimiento',label: 'Mantenimiento',     icon: Wrench },
    ],
  },
  {
    label: 'Automatización',
    items: [
      { href: '/admin/agente',    label: 'Agente IA',   icon: Sparkles,      badge: 'MiniMax' },
      { href: '/admin/bandeja',   label: 'Bandeja',     icon: MessageSquare },
      { href: '/admin/whatsapp',  label: 'WhatsApp',    icon: MessageCircle, badge: 'Zero-cost' },
      { href: '/admin/emails',    label: 'Emails SMTP', icon: Mail,          badge: 'Zero-cost' },
      { href: '/admin/marketing', label: 'Marketing',   icon: Megaphone,     badge: 'Meta' },
      { href: '/prospeccion', label: 'Prospección B2B', icon: UserPlus, badge: 'V5' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/admin/usuarios',      label: 'Usuarios / Cajeros', icon: Users },
      { href: '/landings',      label: 'Landings SEO',       icon: Globe },
      { href: '/admin/configuracion', label: 'Configuración',      icon: Settings2 },
    ],
  },
];

// Secciones minimal para customers (solo las que necesitan)
const CUSTOMER_SECTIONS = [
  {
    label: 'General',
    items: [
      { href: '/tienda', label: 'Tienda Pública', icon: Store },
    ],
  },
  {
    label: 'Mis pedidos',
    items: [
      { href: '/mi-cuenta', label: 'Mis Pedidos', icon: ClipboardList },
    ],
  },
];

export function SidebarNav({ mobileOpen = false, onMobileClose = () => {} }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  // Bloquear scroll del body cuando el drawer está abierto en mobile.
  useEffect(() => {
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileOpen]);

  // Determinar secciones según rol
  const isAdmin = user?.role === 'admin' || user?.role === 'operator';
  const sections = isAdmin ? ADMIN_SECTIONS : CUSTOMER_SECTIONS;

  // Datos del usuario para el footer
  const userDisplayName = user?.name || user?.email?.split('@')[0] || 'Usuario';
  const userEmail = user?.email || '';
  const userInitials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email || 'U')[0].toUpperCase();
  const roleLabel = isAdmin ? 'ADMIN' : 'CLIENTE';

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
        <Link href={isAdmin ? '/admin' : '/tienda'} className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Printer className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-white leading-tight tracking-tight truncate">Estampados DLV</div>
            <div className="text-[10px] uppercase tracking-widest text-orange-400/80">
              {isAdmin ? 'Sistema Operativo' : roleLabel}
            </div>
          </div>
        </Link>

        {/* Botón cerrar (solo mobile) */}
        <button
          type="button"
          onClick={onMobileClose}
          className="lg:hidden shrink-0 -mr-1 rounded-md p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              {section.label}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onMobileClose}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                        active
                          ? 'bg-slate-800/80 text-white shadow-inner ring-1 ring-slate-700'
                          : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-orange-400' : 'text-slate-500 group-hover:text-slate-300')} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400 ring-1 ring-orange-500/30">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer con datos reales del usuario */}
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-900 transition-colors">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs font-bold ring-1 ring-slate-700">
            {loading ? '?' : userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{loading ? '...' : userDisplayName}</div>
            <div className="text-[11px] text-slate-500 truncate">{loading ? 'Cargando...' : `${userEmail} · ${roleLabel}`}</div>
          </div>
          <Link href="/login" className="text-slate-500 hover:text-slate-200" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Backdrop (solo cuando el drawer está abierto en mobile) */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity lg:hidden',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />

      {/* Sidebar (fixed en todas las pantallas; slide en mobile, siempre visible en desktop) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-slate-950 text-slate-200 border-r border-slate-800',
          'transform transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0 lg:z-40', // Siempre visible en desktop
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}

export default SidebarNav;
