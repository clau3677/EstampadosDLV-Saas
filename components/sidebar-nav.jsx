'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ShoppingCart, Layers, Zap, KanbanSquare,
  PackageSearch, Store, Users, LineChart, Wrench, LogOut, Printer, Settings2, Globe, MessageCircle, Mail, Sparkles, MessageSquare, ClipboardList, Truck,
} from 'lucide-react';

const SECTIONS = [
  {
    label: 'General',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { href: '/pos',    label: 'POS · Punto de Venta', icon: ShoppingCart, badge: 'Caja' },
      { href: '/pedidos',label: 'Pedidos',              icon: ClipboardList },
      { href: '/tienda', label: 'Tienda Web',            icon: Store },
    ],
  },
  {
    label: 'Diseño',
    items: [
      { href: '/gang-sheet', label: 'Gang Sheet Builder', icon: Layers, badge: 'AI' },
    ],
  },
  {
    label: 'Producción',
    items: [
      { href: '/pre-prensa', label: 'Pre-Prensa (Zero-Click)', icon: Zap },
      { href: '/kanban',     label: 'Kanban Producción',        icon: KanbanSquare },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { href: '/inventario',   label: 'Inventario Dual',   icon: PackageSearch },
      { href: '/clientes',     label: 'Clientes',          icon: Users },
      { href: '/proveedores/cottonext', label: 'Proveedores', icon: Truck, badge: 'Cottonext' },
      { href: '/reportes',     label: 'Reportes',          icon: LineChart },
      { href: '/mantenimiento',label: 'Mantenimiento',     icon: Wrench },
    ],
  },
  {
    label: 'Automatización',
    items: [
      { href: '/agente',   label: 'Agente IA',   icon: Sparkles,      badge: 'MiniMax' },
      { href: '/bandeja',  label: 'Bandeja',     icon: MessageSquare },
      { href: '/whatsapp', label: 'WhatsApp',    icon: MessageCircle, badge: 'Zero-cost' },
      { href: '/emails',   label: 'Emails SMTP', icon: Mail,          badge: 'Zero-cost' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/usuarios',      label: 'Usuarios / Cajeros', icon: Users },
      { href: '/landings',      label: 'Landings SEO',       icon: Globe },
      { href: '/configuracion', label: 'Configuración',      icon: Settings2 },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col bg-slate-950 text-slate-200 border-r border-slate-800">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-800">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Printer className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-white leading-tight tracking-tight">Estampados DLV</div>
            <div className="text-[10px] uppercase tracking-widest text-orange-400/80">Sistema Operativo</div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {SECTIONS.map((section) => (
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

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-900 transition-colors">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs font-bold ring-1 ring-slate-700">
            DL
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">Diego (Admin)</div>
            <div className="text-[11px] text-slate-500 truncate">admin@estampadosdlv.cl</div>
          </div>
          <button className="text-slate-500 hover:text-slate-200" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default SidebarNav;
