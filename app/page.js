'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign, Package, Zap, AlertTriangle, TrendingUp,
  Printer, Clock, CheckCircle2, Layers, ShoppingCart,
  KanbanSquare, PackageSearch, ArrowUpRight, Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCLP, formatNumber, formatDateTime } from '@/lib/format';

const KPI = ({ icon: Icon, label, value, trend, tone = 'orange' }) => {
  const tones = {
    orange: 'from-orange-500 to-rose-500',
    blue:   'from-blue-500 to-indigo-500',
    green:  'from-emerald-500 to-teal-500',
    amber:  'from-amber-500 to-orange-500',
  };
  return (
    <Card className="relative overflow-hidden border-slate-200/70 shadow-sm hover:shadow-md transition-shadow">
      <div className={`absolute -top-8 -right-8 h-28 w-28 rounded-full bg-gradient-to-br ${tones[tone]} opacity-10`} />
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center shadow-sm`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          {trend && (
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-200">
              <TrendingUp className="h-3 w-3 mr-1" />{trend}
            </Badge>
          )}
        </div>
        <div className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{value}</div>
        <div className="text-sm text-slate-500 mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
};

const PrinterCard = ({ printer, status, queue, maxWidth, channels, color, icon: Icon }) => (
  <Card className="border-slate-200/70 hover:border-slate-300 hover:shadow-sm transition-all">
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-lg ${color} flex items-center justify-center`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-slate-900">{printer}</div>
            <div className="text-xs text-slate-500">Lienzo máx. {maxWidth} cm</div>
          </div>
        </div>
        <span className={`inline-flex h-2.5 w-2.5 rounded-full ${status === 'printing' ? 'bg-emerald-500 animate-pulse' : status === 'idle' ? 'bg-slate-300' : 'bg-amber-500'}`} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {channels.map((c) => (
          <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono font-semibold">{c}</span>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-slate-900">{queue}</div>
          <div className="text-xs text-slate-500">en cola</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium text-slate-700">
            {status === 'printing' ? 'Imprimiendo' : status === 'idle' ? 'En reposo' : 'Mantención'}
          </div>
          <div className="text-[11px] text-slate-500">últ. cambio: hace 4 min</div>
        </div>
      </div>
    </CardContent>
  </Card>
);

const ModuleCard = ({ href, title, description, icon: Icon, accent }) => (
  <Link href={href} className="group">
    <Card className="h-full border-slate-200/70 hover:border-orange-300 hover:shadow-lg transition-all cursor-pointer">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className={`h-10 w-10 rounded-lg ${accent} flex items-center justify-center`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
        </div>
        <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  </Link>
);

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    try {
      const r = await fetch('/api/dashboard/summary');
      if (r.ok) setStats(await r.json());
    } catch (e) { /* silent */ }
  };

  useEffect(() => { load(); }, []);

  const seed = async () => {
    setSeeding(true);
    try {
      await fetch('/api/seed', { method: 'POST' });
      await load();
    } finally { setSeeding(false); }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Panorama operacional del taller — {new Date().toLocaleDateString('es-CL')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={seed} disabled={seeding}>
            {seeding ? 'Sembrando…' : 'Cargar datos demo'}
          </Button>
          <Button className="bg-orange-500 hover:bg-orange-600">
            <ShoppingCart className="h-4 w-4 mr-2" />Nueva Venta POS
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats ? (
          <>
            <KPI icon={DollarSign} tone="orange" label="Ventas hoy"        value={formatCLP(stats.salesToday)}  trend="+12%" />
            <KPI icon={Package}    tone="blue"   label="Pedidos en cola"   value={formatNumber(stats.pendingOrders)} />
            <KPI icon={Zap}        tone="green"  label="Metros impresos hoy" value={`${formatNumber(stats.metersToday)} m`} />
            <KPI icon={AlertTriangle} tone="amber" label="Alertas stock"     value={formatNumber(stats.stockAlerts)} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        )}
      </div>

      {/* Impresoras */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Estado de Impresoras</h2>
            <p className="text-sm text-slate-500">Enrutamiento automático · Digital Factory v11</p>
          </div>
          <Link href="/kanban">
            <Button variant="ghost" size="sm" className="text-slate-600">Ver Kanban <ArrowUpRight className="h-3 w-3 ml-1" /></Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PrinterCard printer="Epson R1390"       maxWidth={31} queue={stats?.printerQueues?.epson_r1390 ?? 0}  status="printing" channels={['C','M','Y','K','W']}     color="bg-gradient-to-br from-blue-500 to-indigo-600" icon={Printer} />
          <PrinterCard printer="Prestige R2 Pro"   maxWidth={33} queue={stats?.printerQueues?.prestige_r2_pro ?? 0} status="printing" channels={['C','M','Y','K','W']}     color="bg-gradient-to-br from-purple-500 to-fuchsia-600" icon={Printer} />
          <PrinterCard printer="DTF UV (Rígidos)"  maxWidth={60} queue={stats?.printerQueues?.dtf_uv ?? 0}        status="idle"     channels={['C','M','Y','K','W','V']} color="bg-gradient-to-br from-emerald-500 to-teal-600" icon={Printer} />
        </div>
      </div>

      {/* Módulos + Actividad */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Accesos rápidos</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ModuleCard href="/pos"         title="POS · Punto de Venta"  description="Apertura/cierre de caja, boletas y ventas en local con sincronización omnicanal."       icon={ShoppingCart} accent="bg-gradient-to-br from-orange-500 to-rose-500" />
            <ModuleCard href="/gang-sheet"  title="Gang Sheet Builder"    description="Editor visual, cotización por mm, IA para quitar fondo y escalar resolución."          icon={Layers}       accent="bg-gradient-to-br from-purple-500 to-fuchsia-500" />
            <ModuleCard href="/pre-prensa"  title="Pre-Prensa Zero-Click"  description="Exporta PNG/TIFF 300 DPI y enruta a Hot Folders de Digital Factory automáticamente."    icon={Zap}          accent="bg-gradient-to-br from-amber-500 to-orange-500" />
            <ModuleCard href="/kanban"     title="Kanban Producción"      description="3 colas independientes con estados Recibido → Impresión → Curado → Listo."            icon={KanbanSquare} accent="bg-gradient-to-br from-blue-500 to-indigo-500" />
            <ModuleCard href="/inventario" title="Inventario Dual"        description="Stock comercial + insumos de producción (film, tintas CMYK+W+V, poliamida)."          icon={PackageSearch} accent="bg-gradient-to-br from-emerald-500 to-teal-500" />
            <ModuleCard href="/tienda"     title="Tienda Web Pública"     description="Catálogo SEO-friendly de prendas y DTF por metro con checkout omnicanal."            icon={ShoppingCart} accent="bg-gradient-to-br from-slate-700 to-slate-900" />
          </div>
        </div>

        {/* Actividad reciente */}
        <Card className="border-slate-200/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-500" />Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(stats?.recentActivity ?? []).length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-8">
                No hay actividad todavía. Toca <span className="font-semibold text-slate-700">&ldquo;Cargar datos demo&rdquo;</span> para ver el sistema en acción.
              </div>
            ) : (
              (stats?.recentActivity ?? []).map((ev, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="mt-1 h-2 w-2 rounded-full bg-orange-500 shrink-0" />
                  <div className="flex-1">
                    <div className="text-slate-800">{ev.message}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(ev.at)}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reglas de hardware */}
      <Card className="border-orange-200/50 bg-gradient-to-br from-orange-50/50 to-rose-50/50">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900 text-sm">Reglas de hardware activas</div>
              <div className="text-xs text-slate-600 mt-1">
                El sistema restringe estrictamente los lienzos según especificaciones de cada impresora para evitar daños en los equipos.
                <span className="font-medium"> Epson R1390 ≤ 31 cm</span> · <span className="font-medium">Prestige R2 Pro ≤ 33 cm</span> · <span className="font-medium">DTF UV incluye canal Blanco + Barniz</span>.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
