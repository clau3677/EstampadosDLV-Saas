'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Users, Search, RefreshCw, Plus, X, Save, Trash2, Mail, Phone, MapPin,
  User as UserIcon, ArrowLeft, TrendingUp, ClipboardList, ShoppingCart, MessageCircle,
  Globe, Layers, Zap, Crown, Truck, AlertTriangle, Star, Sparkles, Tag as TagIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/format';
import { cn } from '@/lib/utils';

const fetcher = (url) => fetch(url, { cache: 'no-store' }).then(r => r.json());

// ---------------------------------------------------------------------------
// Metadata visual
// ---------------------------------------------------------------------------
const TAG_META = {
  vip:        { label: 'VIP',        icon: Crown,         classes: 'bg-amber-100 text-amber-900 border-amber-300' },
  mayorista:  { label: 'Mayorista',  icon: Truck,         classes: 'bg-blue-100 text-blue-900 border-blue-300' },
  express:    { label: 'Exprés',     icon: Zap,           classes: 'bg-orange-100 text-orange-900 border-orange-300' },
  moroso:     { label: 'Moroso',     icon: AlertTriangle, classes: 'bg-rose-100 text-rose-900 border-rose-300' },
  recurrente: { label: 'Recurrente', icon: Star,          classes: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  nuevo:      { label: 'Nuevo',      icon: Sparkles,      classes: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300' },
};
const CHANNEL_META = {
  web:      { label: 'Web',      icon: Globe,         color: 'bg-blue-500' },
  pos:      { label: 'POS',      icon: ShoppingCart,  color: 'bg-orange-500' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500' },
  manual:   { label: 'Manual',   icon: UserIcon,      color: 'bg-slate-500' },
};

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?';
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysAgo(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function timeAgo(iso) {
  const d = daysAgo(iso);
  if (d === null) return '—';
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 30) return `hace ${d} días`;
  if (d < 365) return `hace ${Math.floor(d / 30)} meses`;
  return `hace ${Math.floor(d / 365)} años`;
}
function avatarColor(name = '') {
  const palette = ['from-orange-400 to-rose-500', 'from-blue-400 to-indigo-500', 'from-emerald-400 to-teal-500', 'from-fuchsia-400 to-pink-500', 'from-amber-400 to-orange-500', 'from-slate-400 to-slate-600'];
  const h = String(name).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return palette[h % palette.length];
}

// ============================================================================
// PAGE
// ============================================================================
export default function ClientesPage() {
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('all');
  const [sort, setSort] = useState('lastOrderAt');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    if (tag !== 'all') params.set('tag', tag);
    if (sort) params.set('sort', sort);
    return `/api/customers?${params}`;
  }, [tag, sort]);

  const { data, error, isLoading, isValidating, mutate } = useSWR(swrKey, fetcher, {
    refreshInterval: 60_000,
    keepPreviousData: true,
  });

  const customers = data?.customers || [];
  const kpis = data?.kpis || { totalCustomers: 0, activeCustomers: 0, totalRevenue: 0, avgLtv: 0 };

  const filtered = useMemo(() => {
    if (!q.trim()) return customers;
    const qLow = q.trim().toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(qLow) ||
      (c.email || '').toLowerCase().includes(qLow) ||
      (c.phone || '').includes(qLow) ||
      (c.rut || '').toLowerCase().includes(qLow)
    );
  }, [customers, q]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Volver al Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()} disabled={isValidating}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', isValidating && 'animate-spin')} />
            Refrescar
          </Button>
          <Button size="sm" onClick={() => setCreating(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Nuevo cliente
          </Button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md flex items-center justify-center">
          <Users className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-slate-500">Base de datos unificada · Web + POS + WhatsApp + Manual</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Total clientes" value={kpis.totalCustomers} icon={Users} tone="blue" />
        <Kpi title="Activos (90 días)" value={kpis.activeCustomers} icon={TrendingUp} tone="emerald" />
        <Kpi title="Ingresos totales" value={formatCLP(kpis.totalRevenue)} icon={ClipboardList} tone="orange" isText />
        <Kpi title="LTV promedio" value={formatCLP(kpis.avgLtv)} icon={Star} tone="fuchsia" isText />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por nombre, email, teléfono o RUT…"
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Ordenar:</span>
              <select
                className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="lastOrderAt">Último pedido</option>
                <option value="totalSpent">LTV (mayor)</option>
                <option value="ordersCount"># pedidos</option>
                <option value="name">Nombre A-Z</option>
                <option value="createdAt">Más nuevos</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs por tag */}
      <Tabs value={tag} onValueChange={setTag}>
        <TabsList className="bg-slate-100 flex flex-wrap h-auto">
          <TabsTrigger value="all" className="data-[state=active]:bg-white">Todos</TabsTrigger>
          {Object.entries(TAG_META).map(([k, meta]) => (
            <TabsTrigger key={k} value={k} className="data-[state=active]:bg-white">
              <meta.icon className="h-3.5 w-3.5 mr-1.5" />{meta.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Cargando clientes…</div>
      ) : error ? (
        <div className="text-center py-12 text-rose-500 text-sm">Error al cargar clientes</div>
      ) : filtered.length === 0 ? (
        <EmptyState q={q} onCreate={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <CustomerCard key={c.id} c={c} onClick={() => setSelectedId(c.id)} />
          ))}
        </div>
      )}

      <div className="text-xs text-slate-400 text-right">
        Mostrando {filtered.length} de {customers.length} · última actualización {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
      </div>

      {/* Detail sheet */}
      {selectedId && (
        <CustomerDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => mutate()}
          onDeleted={() => { setSelectedId(null); mutate(); }}
        />
      )}
      {creating && (
        <CustomerCreate onClose={() => setCreating(false)} onCreated={() => { setCreating(false); mutate(); }} />
      )}
    </div>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================
function Kpi({ title, value, icon: Icon, tone = 'slate', isText = false }) {
  const tones = {
    blue: 'from-blue-500 to-indigo-600',
    emerald: 'from-emerald-500 to-teal-600',
    orange: 'from-orange-500 to-rose-500',
    fuchsia: 'from-fuchsia-500 to-pink-600',
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{title}</p>
            <p className={cn('mt-1 font-bold text-slate-900 truncate', isText ? 'text-lg' : 'text-2xl')}>{value}</p>
          </div>
          <div className={cn('h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm shrink-0', tones[tone])}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerCard({ c, onClick }) {
  const isActive = c.lastOrderAt && daysAgo(c.lastOrderAt) <= 90;
  return (
    <Card
      className="hover:shadow-md cursor-pointer transition-all hover:border-orange-200 hover:-translate-y-0.5"
      onClick={onClick}
    >
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className={cn('h-12 w-12 rounded-full bg-gradient-to-br shadow-sm flex items-center justify-center text-white font-bold text-sm shrink-0', avatarColor(c.name))}>
            {initials(c.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-900 truncate">{c.name || 'Sin nombre'}</h3>
              {isActive && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Activo" />}
            </div>
            {c.email && (
              <p className="text-xs text-slate-500 truncate flex items-center gap-1"><Mail className="h-3 w-3 shrink-0" />{c.email}</p>
            )}
            {c.phone && (
              <p className="text-xs text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{c.phone}</p>
            )}
          </div>
        </div>

        {/* Tags */}
        {(c.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {c.tags.map(t => {
              const meta = TAG_META[t] || { label: t, icon: TagIcon, classes: 'bg-slate-100 text-slate-700 border-slate-200' };
              const IconT = meta.icon;
              return (
                <span key={t} className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border', meta.classes)}>
                  <IconT className="h-2.5 w-2.5" />{meta.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Channels */}
        {(c.channels || []).length > 0 && (
          <div className="flex items-center gap-1 mt-3">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Canales:</span>
            {c.channels.map(ch => {
              const meta = CHANNEL_META[ch] || CHANNEL_META.manual;
              const IconCh = meta.icon;
              return (
                <div key={ch} className={cn('h-5 w-5 rounded flex items-center justify-center', meta.color)} title={meta.label}>
                  <IconCh className="h-3 w-3 text-white" />
                </div>
              );
            })}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100">
          <Stat label="Pedidos" value={c.ordersCount || 0} />
          <Stat label="LTV" value={formatCLP(c.totalSpent || 0)} small />
          <Stat label="Último" value={timeAgo(c.lastOrderAt)} small />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="text-center min-w-0">
      <p className={cn('font-bold text-slate-900 truncate', small ? 'text-xs' : 'text-lg')}>{value}</p>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}

function EmptyState({ q, onCreate }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Users className="h-8 w-8 text-slate-400" />
        </div>
        <p className="font-medium text-slate-900">{q ? 'Sin resultados' : 'Aún no hay clientes'}</p>
        <p className="text-sm text-slate-500 mt-1">
          {q ? 'Prueba con otro criterio de búsqueda' : 'Los clientes se crean automáticamente al recibir pedidos con email/teléfono/RUT.'}
        </p>
        {!q && (
          <Button onClick={onCreate} className="mt-6 bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Crear cliente manual
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------
function CustomerDetail({ id, onClose, onSaved, onDeleted }) {
  const { data, mutate: mutateDetail, isLoading } = useSWR(`/api/customers/${id}`, fetcher);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !editing) {
      setForm({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        rut: data.rut || '',
        address: data.address || '',
        notes: data.notes || '',
        tags: data.tags || [],
      });
    }
  }, [data, editing]);

  const toggleTag = (t) => {
    setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      toast.success('Cliente actualizado');
      setEditing(false);
      mutateDetail();
      onSaved?.();
    } catch (e) {
      toast.error('Error al guardar', { description: e.message });
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm('¿Eliminar este cliente? Los pedidos históricos quedarán intactos.')) return;
    try {
      const r = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      toast.success('Cliente eliminado');
      onDeleted?.();
    } catch (e) {
      toast.error('Error al eliminar', { description: e.message });
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        {isLoading || !data ? (
          <div className="py-12 text-center text-slate-500 text-sm">Cargando…</div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className={cn('h-14 w-14 rounded-full bg-gradient-to-br shadow-sm flex items-center justify-center text-white font-bold', avatarColor(data.name))}>
                  {initials(data.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl">{data.name || 'Sin nombre'}</DialogTitle>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                    {data.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{data.email}</span>}
                    {data.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{data.phone}</span>}
                    {data.rut && <span>RUT {data.rut}</span>}
                  </div>
                </div>
              </div>
            </DialogHeader>

            {/* Stats 360° */}
            <div className="grid grid-cols-4 gap-2">
              <MiniStat label="Pedidos" value={data.ordersCount || 0} />
              <MiniStat label="LTV" value={formatCLP(data.totalSpent || 0)} />
              <MiniStat label="Primer pedido" value={fmtDate(data.firstOrderAt)} />
              <MiniStat label="Último pedido" value={fmtDate(data.lastOrderAt)} />
            </div>

            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre">
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </Field>
                  <Field label="Email">
                    <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" />
                  </Field>
                  <Field label="Teléfono">
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </Field>
                  <Field label="RUT">
                    <Input value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })} placeholder="12.345.678-9" />
                  </Field>
                </div>
                <Field label="Dirección">
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </Field>
                <Field label="Etiquetas">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(TAG_META).map(([k, meta]) => {
                      const active = form.tags.includes(k);
                      const Icon = meta.icon;
                      return (
                        <button
                          type="button"
                          key={k}
                          onClick={() => toggleTag(k)}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors',
                            active ? meta.classes : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                          )}
                        >
                          <Icon className="h-3 w-3" />{meta.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Notas internas">
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
                </Field>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Tags */}
                {(data.tags || []).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {data.tags.map(t => {
                      const meta = TAG_META[t] || { label: t, icon: TagIcon, classes: 'bg-slate-100 text-slate-700 border-slate-200' };
                      const IconT = meta.icon;
                      return (
                        <span key={t} className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border', meta.classes)}>
                          <IconT className="h-3 w-3" />{meta.label}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">Sin etiquetas asignadas</div>
                )}
                {/* Direccion */}
                {data.address && (
                  <p className="text-sm text-slate-700 flex items-start gap-2"><MapPin className="h-4 w-4 text-slate-400 mt-0.5" />{data.address}</p>
                )}
                {/* Notas */}
                {data.notes && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                    <p className="text-[10px] uppercase tracking-wide text-amber-800 font-medium mb-1">Notas internas</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{data.notes}</p>
                  </div>
                )}
                {/* Canales */}
                {(data.channels || []).length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Canales usados:</span>
                    {data.channels.map(ch => {
                      const meta = CHANNEL_META[ch] || CHANNEL_META.manual;
                      const IconCh = meta.icon;
                      return (
                        <span key={ch} className={cn('inline-flex items-center gap-1 text-xs text-white px-1.5 py-0.5 rounded-md', meta.color)}>
                          <IconCh className="h-3 w-3" />{meta.label}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Order history */}
            {!editing && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-2 mt-4">
                  <ClipboardList className="h-4 w-4" />
                  Historial de pedidos ({(data.orders || []).length})
                </h4>
                {(data.orders || []).length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center">Aún no hay pedidos</p>
                ) : (
                  <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                    {data.orders.map(o => {
                      const chMeta = CHANNEL_META[o.channel] || CHANNEL_META.manual;
                      const ChIcon = chMeta.icon;
                      return (
                        <Link
                          key={o.id}
                          href={`/pedidos?highlight=${o.orderNumber}`}
                          className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-md transition-colors"
                        >
                          <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', chMeta.color)}>
                            <ChIcon className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-900">{o.orderNumber}</span>
                          <span className="text-xs text-slate-500 flex-1 truncate">{fmtDate(o.createdAt)}</span>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-medium',
                            o.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                            o.status === 'cancelled' ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-700'
                          )}>{o.status}</span>
                          <span className="text-xs font-semibold text-slate-900 whitespace-nowrap">{formatCLP(o.total)}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              {editing ? (
                <>
                  <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                    <X className="h-4 w-4 mr-1.5" /> Cancelar
                  </Button>
                  <Button onClick={save} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
                    <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Guardando…' : 'Guardar'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={remove} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 mr-auto">
                    <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
                  </Button>
                  <Button variant="outline" onClick={onClose}>Cerrar</Button>
                  <Button onClick={() => setEditing(true)} className="bg-orange-500 hover:bg-orange-600 text-white">Editar</Button>
                </>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-md p-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900 truncate">{value}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------
function CustomerCreate({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', rut: '', address: '', notes: '', tags: [] });
  const [saving, setSaving] = useState(false);

  const toggleTag = (t) => {
    setForm(f => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t] }));
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return; }
    if (!form.email && !form.phone && !form.rut) {
      toast.error('Ingresa al menos email, teléfono o RUT');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'manual' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      toast.success('Cliente creado', { description: form.name });
      onCreated?.();
    } catch (e) {
      toast.error('Error al crear', { description: e.message });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nombre *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Juan Pérez" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@example.cl" /></Field>
            <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+56 9 1234 5678" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="RUT"><Input value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })} placeholder="12.345.678-9" /></Field>
            <Field label="Dirección"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Calle 123, Santiago" /></Field>
          </div>
          <Field label="Etiquetas">
            <div className="flex flex-wrap gap-2">
              {Object.entries(TAG_META).map(([k, meta]) => {
                const active = form.tags.includes(k);
                const Icon = meta.icon;
                return (
                  <button
                    type="button"
                    key={k}
                    onClick={() => toggleTag(k)}
                    className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border', active ? meta.classes : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')}
                  >
                    <Icon className="h-3 w-3" />{meta.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Notas internas"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Preferencias, historial, alertas…" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Guardando…' : 'Crear cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
