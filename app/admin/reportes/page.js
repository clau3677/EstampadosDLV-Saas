'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  LineChart, ArrowLeft, RefreshCw, TrendingUp, TrendingDown, ShoppingBag,
  DollarSign, Users, Factory, AlertTriangle, Package, Bot, Download,
} from 'lucide-react';
import { formatCLP } from '@/lib/format';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';

const CHART_COLORS = ['#059669', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#ec4899'];

const RANGES = [
  { days: 7,  label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
  { days: 365, label: '1a' },
];

export default function ReportesPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [production, setProduction] = useState(null);
  const [inventoryAlerts, setInventoryAlerts] = useState(null);
  const [agent, setAgent] = useState(null);
  const [channels, setChannels] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = `days=${days}`;
      const [o, ts, tp, pr, ia, ag, ch] = await Promise.all([
        fetch(`/api/reports/overview?${q}`).then((r) => r.json()),
        fetch(`/api/reports/sales-timeseries?${q}`).then((r) => r.json()),
        fetch(`/api/reports/top-products?${q}&limit=8`).then((r) => r.json()),
        fetch(`/api/reports/production?${q}`).then((r) => r.json()),
        fetch(`/api/reports/inventory-alerts`).then((r) => r.json()),
        fetch(`/api/reports/agent?${q}`).then((r) => r.json()),
        fetch(`/api/reports/channels?${q}`).then((r) => r.json()),
      ]);
      setOverview(o);
      setTimeseries(ts.series || []);
      setTopProducts(tp.products || []);
      setProduction(pr);
      setInventoryAlerts(ia);
      setAgent(ag);
      setChannels(ch);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const exportCSV = () => {
    const rows = [
      ['Fecha', 'Ingresos CLP', 'Órdenes'],
      ...timeseries.map(t => [t.date, t.revenue, t.orders]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ventas_${days}d_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <LineChart className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reportes</h1>
              <p className="text-slate-500 mt-1 text-sm">Analítica operacional y financiera del taller</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex rounded-lg border overflow-hidden bg-white">
              {RANGES.map(r => (
                <button
                  key={r.days}
                  onClick={() => setDays(r.days)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    days === r.days ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refrescar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Ingresos"
          value={formatCLP(overview?.revenue || 0)}
          delta={overview?.comparison?.revenueDeltaPct}
          color="emerald"
          subtitle={`${overview?.orderCount || 0} pedido${overview?.orderCount === 1 ? '' : 's'}`}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Ingresos confirmados"
          value={formatCLP(overview?.paidRevenue || 0)}
          color="blue"
          subtitle="pagados / en producción / listos"
        />
        <KpiCard
          icon={TrendingUp}
          label="Ticket promedio"
          value={formatCLP(overview?.avgTicket || 0)}
          delta={overview?.comparison?.orderDeltaPct}
          color="purple"
          subtitle="por pedido"
        />
        <KpiCard
          icon={Factory}
          label="En producción"
          value={overview?.productionActive || 0}
          color="amber"
          subtitle={`${overview?.printers || 0} impresora${overview?.printers === 1 ? '' : 's'} activas`}
        />
      </div>

      <Tabs defaultValue="ventas" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="ventas"><DollarSign className="h-3.5 w-3.5 mr-1.5" />Ventas</TabsTrigger>
          <TabsTrigger value="canales"><Users className="h-3.5 w-3.5 mr-1.5" />Canales</TabsTrigger>
          <TabsTrigger value="produccion"><Factory className="h-3.5 w-3.5 mr-1.5" />Producción</TabsTrigger>
          <TabsTrigger value="inventario"><Package className="h-3.5 w-3.5 mr-1.5" />Inventario</TabsTrigger>
          <TabsTrigger value="agente"><Bot className="h-3.5 w-3.5 mr-1.5" />Agente IA</TabsTrigger>
        </TabsList>

        {/* VENTAS */}
        <TabsContent value="ventas" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ingresos por día</CardTitle>
              <CardDescription>Serie temporal · CLP</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeseries} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" fontSize={11} tickFormatter={(v) => v.slice(5)} />
                    <YAxis fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v) => [formatCLP(v), 'Ingresos']}
                      labelFormatter={(v) => `Fecha: ${v}`}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#059669" fill="url(#revGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top productos</CardTitle>
              <CardDescription>Ranking por ingresos</CardDescription>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-6">Sin ventas en el período</div>
              ) : (
                <TopProductsList products={topProducts} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CANALES */}
        <TabsContent value="canales" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <ChannelPie title="Por canal" data={channels?.channel || []} />
            <ChannelPie title="Por método de pago" data={channels?.payment || []} />
            <ChannelPie title="Por entrega" data={channels?.delivery || []} />
          </div>
        </TabsContent>

        {/* PRODUCCIÓN */}
        <TabsContent value="produccion" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Throughput por impresora</CardTitle>
                <CardDescription>Ítems completados en el período</CardDescription>
              </CardHeader>
              <CardContent>
                {(!production?.throughput || production.throughput.length === 0) ? (
                  <div className="text-sm text-slate-400 text-center py-6">Sin completados</div>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={production.throughput}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="printer" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="completed" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Estado actual del Kanban</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(production?.kanbanState || []).map((s, i) => (
                    <div key={s.status} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full`} style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-sm capitalize">{s.status}</span>
                      </div>
                      <span className="font-semibold">{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pre-Prensa (Zero-Click)</CardTitle>
              <CardDescription>Exportaciones a hot folders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {['sent_to_hotfolder', 'failed', 'pending'].map((st) => {
                  const row = (production?.prePress || []).find((r) => r.status === st);
                  return (
                    <div key={st} className={`rounded-lg border p-3 ${row?.count ? 'bg-slate-50' : ''}`}>
                      <div className="text-xs text-slate-500 uppercase tracking-wide">{st.replace('_', ' ')}</div>
                      <div className="text-2xl font-bold mt-1">{row?.count || 0}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INVENTARIO */}
        <TabsContent value="inventario" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Insumos bajo mínimo
                </CardTitle>
                <CardDescription>Requieren reposición</CardDescription>
              </CardHeader>
              <CardContent>
                {(!inventoryAlerts?.suppliesLow || inventoryAlerts.suppliesLow.length === 0) ? (
                  <div className="text-sm text-emerald-600 text-center py-6 flex items-center justify-center gap-1.5">
                    ✅ Todos los insumos en niveles normales
                  </div>
                ) : (
                  <div className="space-y-2">
                    {inventoryAlerts.suppliesLow.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 bg-amber-50/40 border-amber-200">
                        <div>
                          <div className="text-sm font-medium">{s.name}</div>
                          <div className="text-xs text-slate-500">{s.category}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{s.currentStock} {s.unit}</div>
                          <div className="text-xs text-amber-600">mín. {s.minimumStock}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  Variantes sin stock disponible
                </CardTitle>
                <CardDescription>Del inventario comercial</CardDescription>
              </CardHeader>
              <CardContent>
                {(!inventoryAlerts?.commercialLow || inventoryAlerts.commercialLow.length === 0) ? (
                  <div className="text-sm text-emerald-600 text-center py-6">✅ Todo disponible</div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {inventoryAlerts.commercialLow.map((c) => (
                      <div key={c.variantId} className="flex items-center justify-between rounded-lg border p-3 bg-rose-50/40 border-rose-200">
                        <div>
                          <div className="text-sm font-medium">{c.productName}</div>
                          <div className="text-xs text-slate-500">{c.variant}</div>
                        </div>
                        <Badge variant="destructive" className="text-[10px]">0 disp.</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AGENTE IA */}
        <TabsContent value="agente" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard icon={Bot} label="Conversaciones" value={agent?.conversations || 0} color="purple" subtitle={`${Object.entries(agent?.bySource || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}`} />
            <KpiCard icon={Users} label="Escalaciones" value={agent?.escalated || 0} color="amber" subtitle={`${agent?.escalationRate || 0}% tasa`} />
            <KpiCard icon={ShoppingBag} label="Drafts creados" value={agent?.drafts || 0} color="emerald" subtitle="borradores generados" />
            <KpiCard icon={LineChart} label="Tokens" value={(agent?.totalTokens || 0).toLocaleString('es-CL')} color="blue" subtitle="del plan Yearly Max" />
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Mensajes por rol</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {['user', 'assistant', 'tool'].map((role) => (
                  <div key={role} className="rounded-lg border p-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide">{role}</div>
                    <div className="text-2xl font-bold mt-1">{agent?.messagesByRole?.[role] || 0}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top Products — lista visual con barras de progreso (mejor que BarChart cuando
// los nombres son largos)
// ---------------------------------------------------------------------------
function TopProductsList({ products }) {
  const maxRevenue = Math.max(...products.map(p => p.revenue || 0), 1);
  const totalRevenue = products.reduce((s, p) => s + (p.revenue || 0), 0);

  return (
    <div className="space-y-3">
      {products.map((p, idx) => {
        const pct = ((p.revenue || 0) / maxRevenue) * 100;
        const sharePct = totalRevenue > 0 ? ((p.revenue || 0) / totalRevenue) * 100 : 0;
        return (
          <div key={p.name + idx} className="group">
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <span className={`shrink-0 h-6 w-6 rounded-md text-xs font-bold flex items-center justify-center ${
                  idx === 0 ? 'bg-emerald-100 text-emerald-700' :
                  idx === 1 ? 'bg-slate-200 text-slate-700' :
                  idx === 2 ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 leading-tight break-words" title={p.name}>
                    {p.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {p.quantity} unidad{p.quantity === 1 ? '' : 'es'} · {sharePct.toFixed(1)}% del total
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-slate-900 tabular-nums">
                  {formatCLP(p.revenue || 0)}
                </div>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  idx === 0 ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' :
                  idx <= 2 ? 'bg-emerald-500' :
                  'bg-emerald-400/70'
                }`}
                style={{ width: `${Math.max(pct, 2)}%` }}
              />
            </div>
          </div>
        );
      })}

      {totalRevenue > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 pt-3 mt-2 border-t">
          <span>Total top {products.length}</span>
          <span className="font-semibold text-slate-700 tabular-nums">{formatCLP(totalRevenue)}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------
const COLOR_MAP = {
  emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-500/20',
  blue:    'from-blue-500 to-blue-600 shadow-blue-500/20',
  purple:  'from-purple-500 to-fuchsia-600 shadow-purple-500/20',
  amber:   'from-amber-500 to-orange-600 shadow-amber-500/20',
  rose:    'from-rose-500 to-red-600 shadow-rose-500/20',
};

function KpiCard({ icon: Icon, label, value, subtitle, delta, color = 'emerald' }) {
  const isPositive = delta === undefined ? null : delta >= 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold mt-1 truncate">{value}</div>
            {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
            {delta !== undefined && Number.isFinite(delta) && (
              <div className={`text-xs mt-1 flex items-center gap-0.5 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {isPositive ? '+' : ''}{delta}% vs período anterior
              </div>
            )}
          </div>
          <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${COLOR_MAP[color]} flex items-center justify-center text-white shadow-md shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Channel breakdown pie
// ---------------------------------------------------------------------------
function ChannelPie({ title, data }) {
  const total = data.reduce((s, d) => s + (d.revenue || 0), 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-6">Sin data</div>
        ) : (
          <>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                    {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatCLP(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend verticalAlign="bottom" fontSize={10} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-xs text-center text-slate-500 mt-1">
              Total: {formatCLP(total)}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
