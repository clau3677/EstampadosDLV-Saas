'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  Filter,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  Truck,
  XCircle,
  AlertTriangle,
  Loader2,
  MapPin,
  Save,
  History,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_META = {
  pending: { label: 'Pendiente de preparar', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock3 },
  packed: { label: 'Empaquetado', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: PackageCheck },
  ready_for_pickup: { label: 'Listo para retiro', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: MapPin },
  handed_to_courier: { label: 'Entregado a courier', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Truck },
  in_transit: { label: 'En tránsito', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: Truck },
  delivered: { label: 'Entregado', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: CheckCircle2 },
  picked_up: { label: 'Retirado en taller', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: CheckCircle2 },
  failed: { label: 'Incidencia de despacho', color: 'bg-rose-100 text-rose-800 border-rose-200', icon: AlertTriangle },
  returned: { label: 'Devuelto', color: 'bg-rose-100 text-rose-800 border-rose-200', icon: XCircle },
  cancelled: { label: 'Cancelado', color: 'bg-rose-100 text-rose-800 border-rose-200', icon: XCircle },
};

const STATUS_ORDER = [
  'pending',
  'packed',
  'ready_for_pickup',
  'handed_to_courier',
  'in_transit',
  'delivered',
  'picked_up',
  'failed',
  'returned',
  'cancelled',
];

function metaFor(status) {
  return STATUS_META[status] || {
    label: status || 'Sin estado',
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: ClipboardList,
  };
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function nextStatusFor(row) {
  if (!row) return null;
  if (row.status === 'pending') return row.deliveryMethod === 'shipping' ? 'packed' : 'ready_for_pickup';
  if (row.status === 'packed') return row.deliveryMethod === 'shipping' ? 'handed_to_courier' : 'ready_for_pickup';
  if (row.status === 'ready_for_pickup') return row.deliveryMethod === 'pickup' ? 'picked_up' : null;
  if (row.status === 'handed_to_courier') return 'in_transit';
  if (row.status === 'in_transit') return 'delivered';
  if (row.status === 'failed') return row.deliveryMethod === 'shipping' ? 'handed_to_courier' : 'ready_for_pickup';
  if (row.status === 'returned') return 'packed';
  return null;
}

function actionLabel(status) {
  return metaFor(status).label;
}

function StatusBadge({ status }) {
  const meta = metaFor(status);
  const Icon = meta.icon;
  return (
    <Badge className={cn('border gap-1 whitespace-nowrap', meta.color)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

export default function LogisticaPage() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, byStatus: {}, byDeliveryMethod: {} });
  const [metrics, setMetrics] = useState({ active: 0, completed: 0, overdueCount: 0, onTimeRate: null, averageCompletionHours: null, topOverdue: [] });
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [form, setForm] = useState({ carrier: '', trackingCode: '', trackingUrl: '', proofUrl: '', proofType: 'photo', pickupCode: '', pickupPersonName: '', notes: '' });

  const selected = useMemo(() => rows.find(row => row.id === selectedId) || null, [rows, selectedId]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [listResponse, summaryResponse, metricsResponse] = await Promise.all([
        fetch('/api/fulfillment?status=all&deliveryMethod=all', { cache: 'no-store' }),
        fetch('/api/fulfillment/summary', { cache: 'no-store' }),
        fetch('/api/fulfillment/metrics', { cache: 'no-store' }),
      ]);
      const listData = await listResponse.json();
      const summaryData = await summaryResponse.json();
      const metricsData = await metricsResponse.json();
      if (!listResponse.ok) throw new Error(listData.error || 'No se pudo cargar logística');
      if (!summaryResponse.ok) throw new Error(summaryData.error || 'No se pudo cargar resumen');
      if (!metricsResponse.ok) throw new Error(metricsData.error || 'No se pudieron cargar métricas');
      setRows(Array.isArray(listData) ? listData : []);
      setSummary(summaryData || { total: 0, byStatus: {}, byDeliveryMethod: {} });
      setMetrics(metricsData || { active: 0, completed: 0, overdueCount: 0, onTimeRate: null, averageCompletionHours: null, topOverdue: [] });
      if (selectedId && !listData.some(row => row.id === selectedId)) setSelectedId(null);
    } catch (error) {
      toast.error('Error al cargar logística', { description: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedId]);

  const loadEvents = useCallback(async (row) => {
    if (!row?.id) {
      setEvents([]);
      return;
    }
    try {
      const response = await fetch(`/api/fulfillment/events?fulfillmentId=${encodeURIComponent(row.id)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la bitácora');
      setEvents(Array.isArray(data) ? data : []);
    } catch (error) {
      setEvents([]);
      toast.error('No se pudo cargar la bitácora', { description: error.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      return;
    }
    setForm({
      carrier: selected.carrier || '',
      trackingCode: selected.trackingCode || '',
      trackingUrl: selected.trackingUrl || '',
      proofUrl: selected.proofUrl || '',
      proofType: selected.proofType || 'photo',
      pickupCode: selected.pickupCode || '',
      pickupPersonName: selected.pickupPersonName || '',
      notes: selected.notes || '',
    });
    loadEvents(selected);
  }, [selected, loadEvents]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(row => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (deliveryFilter !== 'all' && row.deliveryMethod !== deliveryFilter) return false;
      if (!needle) return true;
      const order = row.order || {};
      const customer = order.customerSnapshot || {};
      return [row.orderNumber, order.orderNumber, customer.name, customer.email, row.carrier, row.trackingCode]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [rows, q, statusFilter, deliveryFilter]);

  async function syncHistoricalOrders() {
    setSyncing(true);
    try {
      const response = await fetch('/api/fulfillment/backfill?limit=5000', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo sincronizar pedidos');
      toast.success('Pedidos sincronizados', { description: `${data.created} registros creados · ${data.existing} ya existían` });
      await load();
    } catch (error) {
      toast.error('Error al sincronizar pedidos', { description: error.message });
    } finally {
      setSyncing(false);
    }
  }

  async function saveDetails() {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch('/api/fulfillment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron guardar los datos');
      toast.success('Datos logísticos guardados');
      await load();
      setSelectedId(selected.id);
      await loadEvents(data.fulfillment);
    } catch (error) {
      toast.error('Error al guardar logística', { description: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function issuePickupCode() {
    if (!selected) return;
    setTransitioning(true);
    try {
      const response = await fetch('/api/fulfillment/pickup-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo generar el código');
      toast.success('Código de retiro listo', { description: `Código: ${data.pickupCode}` });
      await load();
      setSelectedId(selected.id);
    } catch (error) {
      toast.error('No se pudo generar el código', { description: error.message });
    } finally {
      setTransitioning(false);
    }
  }

  async function transition() {
    if (!selected) return;
    const toStatus = nextStatusFor(selected);
    if (!toStatus) return;
    setTransitioning(true);
    try {
      const endpoint = toStatus === 'picked_up' ? '/api/fulfillment/pickup' : '/api/fulfillment/transition';
      const body = toStatus === 'picked_up'
        ? { id: selected.id, pickupCode: form.pickupCode, pickupPersonName: form.pickupPersonName, proofUrl: form.proofUrl, proofType: form.proofType, notes: form.notes }
        : { id: selected.id, toStatus, carrier: form.carrier, trackingCode: form.trackingCode, trackingUrl: form.trackingUrl, proofUrl: form.proofUrl, proofType: form.proofType, notes: form.notes };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Transición no permitida');
      toast.success(`Pedido actualizado: ${actionLabel(toStatus)}`);
      await load();
      setSelectedId(selected.id);
      await loadEvents(data.fulfillment);
    } catch (error) {
      toast.error('No se pudo avanzar el pedido', { description: error.message });
    } finally {
      setTransitioning(false);
    }
  }

  const selectedNext = nextStatusFor(selected);
  const readyCount = (summary.byStatus?.ready_for_pickup || 0) + (summary.byStatus?.packed || 0);
  const exceptionCount = (summary.byStatus?.failed || 0) + (summary.byStatus?.returned || 0);
  const formatHours = value => value == null ? '—' : value < 24 ? `${value} h` : `${(value / 24).toFixed(1)} d`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" />Dashboard
        </Link>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
            <Truck className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900">Logística y despachos</h1>
            <p className="text-xs text-slate-500">Fulfillment, retiro, courier y trazabilidad</p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={syncHistoricalOrders} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 mr-1.5" />}
            Sincronizar pedidos
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />Actualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Total fulfillment</div><div className="mt-1 text-2xl font-bold text-slate-900">{summary.total || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Activos</div><div className="mt-1 text-2xl font-bold text-indigo-600">{metrics.active || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Pendientes</div><div className="mt-1 text-2xl font-bold text-amber-600">{summary.byStatus?.pending || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Listos / empaquetado</div><div className="mt-1 text-2xl font-bold text-indigo-600">{readyCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">En tránsito</div><div className="mt-1 text-2xl font-bold text-orange-600">{summary.byStatus?.in_transit || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Atrasados SLA</div><div className="mt-1 text-2xl font-bold text-rose-600">{metrics.overdueCount || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Cumplimiento SLA</div><div className="mt-1 text-2xl font-bold text-emerald-600">{metrics.onTimeRate == null ? '—' : `${metrics.onTimeRate}%`}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Clock3 className="h-4 w-4 text-indigo-500" />Productividad logística</div>
              <div className="text-xs text-slate-500 mt-1">SLA interno: shipping 120 h · retiro 72 h · se recalcula con datos reales</div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600">
              <span><strong className="text-slate-900">{metrics.completed || 0}</strong> cerrados</span>
              <span><strong className="text-slate-900">{formatHours(metrics.averageCompletionHours)}</strong> tiempo medio</span>
              <span><strong className="text-slate-900">{formatHours(metrics.averageCompletionByMethod?.shipping)}</strong> despacho</span>
              <span><strong className="text-slate-900">{formatHours(metrics.averageCompletionByMethod?.pickup)}</strong> retiro</span>
            </div>
          </div>
          {metrics.topOverdue?.length > 0 ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {metrics.topOverdue.map(item => (
                <div key={item.id} className="rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2 text-xs flex items-center justify-between gap-3">
                  <div><div className="font-semibold text-rose-900">{item.orderNumber || item.orderId}</div><div className="text-rose-700">{actionLabel(item.status)} · {item.deliveryMethod === 'shipping' ? 'Despacho' : 'Retiro'}</div></div>
                  <div className="text-right text-rose-800"><div className="font-bold">{formatHours(item.ageHours)}</div><div>SLA {formatHours(item.slaHours)}</div></div>
                </div>
              ))}
            </div>
          ) : <div className="mt-3 text-xs text-emerald-700">No hay pedidos activos fuera del SLA interno en este momento.</div>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr),390px] gap-5 items-start">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-indigo-500" />Pedidos logísticos</CardTitle>
              <span className="text-xs text-slate-500">{filteredRows.length} visibles de {rows.length}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input value={q} onChange={event => setQ(event.target.value)} placeholder="Buscar pedido, cliente, courier o tracking" className="pl-9 h-9 text-xs" />
              </div>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">
                <option value="all">Todos los estados</option>
                {STATUS_ORDER.map(status => <option key={status} value={status}>{metaFor(status).label}</option>)}
              </select>
              <select value={deliveryFilter} onChange={event => setDeliveryFilter(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs">
                <option value="all">Retiro + despacho</option>
                <option value="pickup">Retiro en taller</option>
                <option value="shipping">Envío a domicilio</option>
              </select>
              <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setQ(''); setStatusFilter('all'); setDeliveryFilter('all'); }}>
                <Filter className="h-3.5 w-3.5 mr-1" />Limpiar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="h-48 flex items-center justify-center text-sm text-slate-500"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cargando logística…</div>
            ) : filteredRows.length === 0 ? (
              <div className="p-10 text-center border-t border-slate-100">
                <Package className="h-10 w-10 mx-auto text-slate-300" />
                <div className="mt-3 font-semibold text-slate-800">No hay registros logísticos visibles</div>
                <p className="mt-1 text-sm text-slate-500">Usa “Sincronizar pedidos” para crear fulfillment en los pedidos históricos.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-y border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500">Pedido</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500">Cliente</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500">Entrega</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500">Estado</th>
                      <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-slate-500">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(row => {
                      const order = row.order || {};
                      const customer = order.customerSnapshot || {};
                      const active = row.id === selectedId;
                      return (
                        <tr key={row.id} className={cn('border-b border-slate-100 transition-colors', active ? 'bg-indigo-50/60' : 'hover:bg-slate-50')}>
                          <td className="px-4 py-3 align-top">
                            <button type="button" onClick={() => setSelectedId(row.id)} className="text-left">
                              <div className="font-mono font-bold text-slate-900">{row.orderNumber || order.orderNumber || row.orderId?.slice(0, 10)}</div>
                              <div className="text-[11px] text-slate-500 mt-1">{dateLabel(row.updatedAt)}</div>
                            </button>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-800">{customer.name || 'Cliente sin nombre'}</div>
                            <div className="text-[11px] text-slate-500">{customer.email || 'Sin email'}</div>
                            {order.total != null && <div className="text-[11px] font-mono text-slate-500 mt-1">{formatCLP(order.total)}</div>}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                              {row.deliveryMethod === 'shipping' ? <Truck className="h-3.5 w-3.5 text-indigo-500" /> : <MapPin className="h-3.5 w-3.5 text-emerald-500" />}
                              {row.deliveryMethod === 'shipping' ? 'Domicilio' : 'Retiro'}
                            </div>
                            {row.trackingCode && <div className="mt-1 text-[11px] font-mono text-slate-500">{row.trackingCode}</div>}
                          </td>
                          <td className="px-4 py-3 align-top"><StatusBadge status={row.status} /></td>
                          <td className="px-4 py-3 text-right align-top">
                            <Button size="sm" variant={active ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setSelectedId(row.id)}>
                              Gestionar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="xl:sticky xl:top-5">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4 text-indigo-500" />Detalle logístico</CardTitle></CardHeader>
          <CardContent>
            {!selected ? (
              <div className="py-10 text-center text-sm text-slate-500"><Package className="h-8 w-8 mx-auto text-slate-300 mb-3" />Selecciona un pedido para gestionarlo.</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold text-slate-900">{selected.orderNumber || selected.order?.orderNumber}</div>
                    <div className="text-xs text-slate-500 mt-1">{selected.deliveryMethod === 'shipping' ? 'Envío a domicilio' : 'Retiro en taller'}</div>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                {selected.shippingAddress && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700">
                    <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" />Dirección de envío</div>
                    <div>{selected.shippingAddress.street || '—'}</div>
                    <div>{selected.shippingAddress.comuna || '—'} · {selected.shippingAddress.city || '—'} · {selected.shippingAddress.region || '—'}</div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3">
                  <label className="text-xs font-medium text-slate-700">Courier / transportista<Input className="mt-1 h-9 text-xs" value={form.carrier} onChange={event => setForm({ ...form, carrier: event.target.value })} placeholder="Chilexpress, Starken, retiro…" /></label>
                  <label className="text-xs font-medium text-slate-700">Código de seguimiento<Input className="mt-1 h-9 text-xs font-mono" value={form.trackingCode} onChange={event => setForm({ ...form, trackingCode: event.target.value })} placeholder="Ej. 123456789" /></label>
                  <label className="text-xs font-medium text-slate-700">URL de seguimiento<Input className="mt-1 h-9 text-xs" value={form.trackingUrl} onChange={event => setForm({ ...form, trackingUrl: event.target.value })} placeholder="https://…" /></label>
                  <label className="text-xs font-medium text-slate-700">Comprobante de entrega<Input className="mt-1 h-9 text-xs" value={form.proofUrl} onChange={event => setForm({ ...form, proofUrl: event.target.value })} placeholder="URL de foto, firma o documento" /></label>
                  {form.proofUrl && <label className="text-xs font-medium text-slate-700">Tipo de evidencia<select className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs" value={form.proofType} onChange={event => setForm({ ...form, proofType: event.target.value })}><option value="photo">Foto</option><option value="signature">Firma</option><option value="document">Documento</option><option value="other">Otro</option></select></label>}
                  {selected.deliveryMethod === 'pickup' && selected.status === 'ready_for_pickup' && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2"><div><div className="text-xs font-semibold text-emerald-900">Código de retiro</div><div className="text-[11px] text-emerald-700">Se valida al entregar el pedido en taller.</div></div><Button size="sm" variant="outline" className="h-8 text-xs" onClick={issuePickupCode} disabled={transitioning}>{selected.pickupCode ? 'Regenerar no' : 'Generar código'}</Button></div>
                      {selected.pickupCode && <div className="font-mono text-2xl tracking-[0.35em] text-emerald-900">{selected.pickupCode}</div>}
                      <label className="text-xs font-medium text-emerald-900">Persona que retira<Input className="mt-1 h-9 text-xs bg-white" value={form.pickupPersonName} onChange={event => setForm({ ...form, pickupPersonName: event.target.value })} placeholder="Nombre y apellido" /></label>
                    </div>
                  )}
                  {selected.status === 'picked_up' && selected.pickupPersonName && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><div className="font-semibold text-slate-800">Retiro verificado</div><div>{selected.pickupPersonName}</div><div className="text-slate-500">{dateLabel(selected.pickupVerifiedAt || selected.pickedUpAt)}</div></div>}
                  <label className="text-xs font-medium text-slate-700">Notas<Textarea className="mt-1 text-xs" rows={3} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Incidencias, horario o instrucciones…" /></label>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={saveDetails} disabled={saving || transitioning}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Guardar datos
                  </Button>
                  {selectedNext && (
                    <Button size="sm" onClick={transition} disabled={saving || transitioning || (selectedNext === 'picked_up' && (!form.pickupCode || !form.pickupPersonName))}>
                      {transitioning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                      Marcar: {actionLabel(selectedNext)}
                    </Button>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200">
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 mb-2"><History className="h-3.5 w-3.5" />Bitácora</div>
                  {events.length === 0 ? <div className="text-xs text-slate-500">Sin eventos registrados.</div> : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {events.map(event => (
                        <div key={event.id} className="text-xs border-l-2 border-indigo-200 pl-3">
                          <div className="font-medium text-slate-800">{actionLabel(event.toStatus)}</div>
                          <div className="text-slate-500">{dateLabel(event.createdAt)} · {event.actorName || 'Sistema'}</div>
                          {event.notes && <div className="text-slate-600 mt-0.5">{event.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selected.trackingUrl && (
                  <a href={selected.trackingUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1">
                    Abrir tracking <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
