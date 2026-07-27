'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ClipboardList, RefreshCw, Search, Filter, ArrowLeft, ExternalLink,
  CheckCircle2, Clock, Package, Truck, XCircle, AlertTriangle,
  Zap, ShoppingCart, Layers, Globe, MessageCircle, Store, Printer,
  Ban, Trash2, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { formatCLP } from '@/lib/format';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Estilos por estado
// ---------------------------------------------------------------------------
const STATUS_META = {
  pending:       { label: 'Pendiente pago', color: 'bg-amber-100 text-amber-800 border-amber-200',       icon: Clock },
  paid:          { label: 'Pagado',         color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle2 },
  in_production: { label: 'En producción',  color: 'bg-blue-100 text-blue-800 border-blue-200',           icon: Layers },
  ready:         { label: 'Listo',          color: 'bg-purple-100 text-purple-800 border-purple-200',     icon: Package },
  delivered:     { label: 'Entregado',      color: 'bg-slate-100 text-slate-700 border-slate-200',        icon: Truck },
  cancelled:     { label: 'Cancelado',      color: 'bg-rose-100 text-rose-700 border-rose-200',           icon: XCircle },
};

const PRODUCTION_META = {
  not_started: { label: 'Sin iniciar', color: 'bg-slate-100 text-slate-700' },
  received:    { label: 'Recibido',    color: 'bg-blue-100 text-blue-800' },
  printing:    { label: 'Imprimiendo', color: 'bg-orange-100 text-orange-800' },
  curing:      { label: 'Curado',      color: 'bg-purple-100 text-purple-800' },
  ready:       { label: 'Listo',       color: 'bg-emerald-100 text-emerald-700' },
};

const CHANNEL_META = {
  web:      { label: 'Web',      icon: Globe,         color: 'bg-blue-500' },
  pos:      { label: 'POS',      icon: ShoppingCart,  color: 'bg-orange-500' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500' },
};

const PAYMENT_META = {
  pending:  { label: 'Pendiente', color: 'text-amber-700' },
  paid:     { label: 'Pagado',    color: 'text-emerald-700' },
  refunded: { label: 'Devuelto',  color: 'text-slate-500' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const now = new Date();
  const d = new Date(iso);
  const diff = Math.max(0, Math.floor((now - d) / 1000));
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
export default function PedidosPage() {
  const params = useSearchParams();
  const router = useRouter();
  const highlightNumber = params.get('highlight');

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/orders', { cache: 'no-store' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Error al cargar pedidos', { description: e.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-abrir el detalle si viene ?highlight=DLV-...
  useEffect(() => {
    if (!highlightNumber || !orders.length) return;
    const o = orders.find(x => x.orderNumber === highlightNumber);
    if (o) openDetail(o);
    // Limpia el query param después de usarlo
    router.replace('/pedidos', { scroll: false });
  }, [highlightNumber, orders, router]);

  const openDetail = async (order) => {
    setSelectedOrder(order);
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/orders/lookup?number=${encodeURIComponent(order.orderNumber)}`);
      const data = await r.json();
      if (r.ok) setOrderItems(data.items || []);
    } catch { /* ignore */ }
    finally { setLoadingDetail(false); }
  };

  const cancelOrder = async () => {
    if (!selectedOrder) return;
    setCancelling(true);
    try {
      const r = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: selectedOrder.id, reason: cancelReason.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo cancelar el pedido');
        return;
      }
      toast.success(`Pedido ${selectedOrder.orderNumber} cancelado`, {
        description: 'Se liberó el stock reservado y se removió del Kanban',
      });
      setCancelDialogOpen(false);
      setCancelReason('');
      // Actualizar el estado local sin recargar toda la lista
      setOrders(prev => prev.map(o =>
        o.id === selectedOrder.id ? { ...o, status: 'cancelled', cancelReason: cancelReason.trim(), cancelledAt: new Date().toISOString() } : o
      ));
      setSelectedOrder(prev => prev ? { ...prev, status: 'cancelled', cancelReason: cancelReason.trim() } : null);
    } catch (e) {
      toast.error('Error de red al cancelar', { description: e.message });
    } finally {
      setCancelling(false);
    }
  };

  const deleteOrder = async () => {
    if (!selectedOrder) return;
    setDeleting(true);
    try {
      const r = await fetch('/api/orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: selectedOrder.id }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo eliminar el pedido');
        return;
      }
      toast.success(`Pedido ${selectedOrder.orderNumber} eliminado permanentemente`);
      setDeleteConfirmOpen(false);
      setSelectedOrder(null);
      setOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
    } catch (e) {
      toast.error('Error de red al eliminar', { description: e.message });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const qLow = q.trim().toLowerCase();
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (channelFilter !== 'all' && o.channel !== channelFilter) return false;
      if (qLow) {
        const hit =
          o.orderNumber?.toLowerCase().includes(qLow) ||
          o.customerSnapshot?.name?.toLowerCase().includes(qLow) ||
          o.customerSnapshot?.email?.toLowerCase().includes(qLow) ||
          o.customerSnapshot?.phone?.toLowerCase().includes(qLow);
        if (!hit) return false;
      }
      return true;
    });
  }, [orders, q, statusFilter, channelFilter]);

  // Contadores por estado (para las pestañas)
  const counts = useMemo(() => {
    const c = { all: orders.length };
    for (const s of Object.keys(STATUS_META)) c[s] = 0;
    orders.forEach(o => { if (STATUS_META[o.status]) c[o.status] += 1; });
    return c;
  }, [orders]);

  const kpis = useMemo(() => {
    const pending = orders.filter(o => o.status === 'pending' || o.status === 'in_production').length;
    const revenue = orders
      .filter(o => o.status !== 'cancelled')
      .reduce((s, o) => s + (o.total || 0), 0);
    const express = orders.filter(o => o.priority === 'express').length;
    const inProd = orders.filter(o => ['in_production'].includes(o.status) || ['received', 'printing', 'curing'].includes(o.productionStatus)).length;
    return { pending, revenue, express, inProd };
  }, [orders]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Breadcrumb + refresh */}
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Volver al Dashboard
        </Link>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={cn('h-4 w-4 mr-1.5', refreshing && 'animate-spin')} />
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 shadow-md flex items-center justify-center">
          <ClipboardList className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pedidos</h1>
          <p className="text-slate-500">Todos los pedidos del taller (Web, POS, WhatsApp, Gang Sheet)</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Total pedidos" value={orders.length} icon={ClipboardList} tone="slate" />
        <Kpi title="Pendientes" value={kpis.pending} icon={Clock} tone="amber" />
        <Kpi title="En producción" value={kpis.inProd} icon={Layers} tone="blue" />
        <Kpi title="Facturado (no cancelado)" value={formatCLP(kpis.revenue)} icon={CheckCircle2} tone="emerald" isText />
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por número, nombre, email o teléfono…"
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><Filter className="h-3.5 w-3.5" /> Canal:</span>
              <select
                className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="web">Web</option>
                <option value="pos">POS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs por estado */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-slate-100 flex flex-wrap h-auto">
          <TabsTrigger value="all" className="data-[state=active]:bg-white">
            Todas <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{counts.all || 0}</Badge>
          </TabsTrigger>
          {Object.entries(STATUS_META).map(([k, meta]) => (
            <TabsTrigger key={k} value={k} className="data-[state=active]:bg-white">
              {meta.label} <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{counts[k] || 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={statusFilter} className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">Cargando pedidos…</div>
          ) : filtered.length === 0 ? (
            <EmptyState q={q} />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">N° Pedido</th>
                      <th className="text-left px-4 py-3 font-medium">Cliente</th>
                      <th className="text-left px-4 py-3 font-medium">Canal</th>
                      <th className="text-left px-4 py-3 font-medium">Estado</th>
                      <th className="text-left px-4 py-3 font-medium">Producción</th>
                      <th className="text-right px-4 py-3 font-medium">Total</th>
                      <th className="text-left px-4 py-3 font-medium">Pago</th>
                      <th className="text-left px-4 py-3 font-medium">Creado</th>
                      <th className="text-right px-4 py-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => {
                      const s = STATUS_META[o.status] || STATUS_META.pending;
                      const ps = PRODUCTION_META[o.productionStatus] || PRODUCTION_META.not_started;
                      const ch = CHANNEL_META[o.channel] || CHANNEL_META.web;
                      const pay = PAYMENT_META[o.paymentStatus] || PAYMENT_META.pending;
                      const StatusIcon = s.icon;
                      const ChIcon = ch.icon;
                      const isHighlighted = o.orderNumber === highlightNumber;
                      return (
                        <tr
                          key={o.id}
                          className={cn(
                            'border-b border-slate-100 hover:bg-orange-50/30 cursor-pointer transition-colors',
                            isHighlighted && 'bg-orange-50 ring-1 ring-orange-200'
                          )}
                          onClick={() => openDetail(o)}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                            {o.orderNumber}
                            {o.priority === 'express' && (
                              <Badge className="ml-2 bg-orange-500 hover:bg-orange-500 text-white h-5 text-[10px]">
                                <Zap className="h-3 w-3 mr-0.5" />EXPRÉS
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900 truncate max-w-[220px]">
                              {o.customerSnapshot?.name || <span className="text-slate-400 italic">Sin nombre</span>}
                            </div>
                            {o.customerSnapshot?.email && (
                              <div className="text-xs text-slate-500 truncate max-w-[220px]">{o.customerSnapshot.email}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={cn('h-6 w-6 rounded-md flex items-center justify-center', ch.color)}>
                                <ChIcon className="h-3.5 w-3.5 text-white" />
                              </div>
                              <span className="text-xs text-slate-700">{ch.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border', s.color)}>
                              <StatusIcon className="h-3 w-3" />
                              {s.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-block px-2 py-1 rounded-md text-xs font-medium', ps.color)}>
                              {ps.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                            {formatCLP(o.total || 0)}
                          </td>
                          <td className={cn('px-4 py-3 text-xs font-medium', pay.color)}>
                            {pay.label}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            <div>{formatDate(o.createdAt)}</div>
                            <div className="text-[10px] text-slate-400">{timeAgo(o.createdAt)}</div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(o); }}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 text-xs text-slate-500">
                Mostrando {filtered.length} de {orders.length} pedidos
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal de detalle */}
      <Dialog open={!!selectedOrder} onOpenChange={(v) => { if (!v) { setSelectedOrder(null); setOrderItems([]); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {!selectedOrder ? (
            <>
              <DialogHeader>
                <DialogTitle>Cargando pedido…</DialogTitle>
              </DialogHeader>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{selectedOrder.orderNumber}</span>
                  {(() => {
                    const s = STATUS_META[selectedOrder.status] || STATUS_META.pending;
                    const StatusIcon = s.icon;
                    return (
                      <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border', s.color)}>
                        <StatusIcon className="h-3 w-3" />{s.label}
                      </span>
                    );
                  })()}
                  {selectedOrder.priority === 'express' && (
                    <Badge className="bg-orange-500 hover:bg-orange-500 text-white h-5 text-[10px]">
                      <Zap className="h-3 w-3 mr-0.5" />EXPRÉS
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  Creado {formatDate(selectedOrder.createdAt)} · Canal: {CHANNEL_META[selectedOrder.channel]?.label || selectedOrder.channel}
                </DialogDescription>
              </DialogHeader>

              {/* Cliente */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Nombre"   value={selectedOrder.customerSnapshot?.name || '—'} />
                <InfoRow label="Email"    value={selectedOrder.customerSnapshot?.email || '—'} />
                <InfoRow label="Teléfono" value={selectedOrder.customerSnapshot?.phone || '—'} />
                <InfoRow label="RUT"      value={selectedOrder.customerSnapshot?.rut   || '—'} />
              </div>

              <Separator />

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Ítems del pedido
                </h4>
                {loadingDetail ? (
                  <div className="text-center py-6 text-sm text-slate-500">Cargando ítems…</div>
                ) : orderItems.length === 0 ? (
                  <div className="text-center py-6 text-sm text-slate-500">Sin ítems</div>
                ) : (
                  <div className="space-y-2">
                    {orderItems.map((it) => (
                      <div key={it.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {it.type === 'gang_sheet' ? (
                                <Badge className="bg-fuchsia-500 hover:bg-fuchsia-500 text-white h-5 text-[10px]">
                                  <Layers className="h-3 w-3 mr-0.5" />GANG SHEET
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="h-5 text-[10px]">PRODUCTO</Badge>
                              )}
                              <span className="text-xs text-slate-500">×{it.quantity}</span>
                            </div>
                            <p className="font-medium text-sm text-slate-900">{it.name}</p>
                            {it.gangSheetSpec && (
                              <div className="mt-1 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1"><Printer className="h-3 w-3" />{it.gangSheetSpec.printerType}</span>
                                <span>·</span>
                                <span>{it.gangSheetSpec.widthCm}cm × {(it.gangSheetSpec.lengthMm/10).toFixed(1)}cm</span>
                                <span>·</span>
                                <span>{it.gangSheetSpec.designsCount} diseño{it.gangSheetSpec.designsCount !== 1 && 's'}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <div className="font-semibold text-sm text-slate-900">{formatCLP(it.totalPrice)}</div>
                            <div className="text-[10px] text-slate-500">{formatCLP(it.unitPrice)} c/u</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Totales */}
              <div className="space-y-1.5 text-sm">
                <TotalRow label="Subtotal"    value={formatCLP(selectedOrder.subtotal || 0)} />
                {(selectedOrder.discount || 0) > 0 && (
                  <TotalRow label="Descuento" value={`- ${formatCLP(selectedOrder.discount)}`} />
                )}
                {(selectedOrder.shipping || 0) > 0 && (
                  <TotalRow label="Envío"     value={formatCLP(selectedOrder.shipping)} />
                )}
                <TotalRow label="IVA 19%"     value={formatCLP(selectedOrder.tax || 0)} />
                <Separator />
                <TotalRow label="Total" value={formatCLP(selectedOrder.total || 0)} bold />
              </div>

              {/* Acciones rápidas */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href="/kanban" target="_blank" rel="noopener">
                  <Button variant="outline" size="sm">
                    <Layers className="h-3.5 w-3.5 mr-1.5" />
                    Ver en Kanban
                  </Button>
                </Link>
                <Link href="/pre-prensa" target="_blank" rel="noopener">
                  <Button variant="outline" size="sm">
                    <Zap className="h-3.5 w-3.5 mr-1.5" />
                    Pre-Prensa
                  </Button>
                </Link>

                {/* Botón CANCELAR: sólo si NO está cancelado ni entregado */}
                {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setCancelReason(''); setCancelDialogOpen(true); }}
                    className="ml-auto border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                  >
                    <Ban className="h-3.5 w-3.5 mr-1.5" />
                    Cancelar pedido
                  </Button>
                )}

                {/* Botón ELIMINAR: sólo si YA está cancelado */}
                {selectedOrder.status === 'cancelled' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="ml-auto border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Eliminar permanentemente
                  </Button>
                )}
              </div>

              {/* Motivo de cancelación (si aplica) */}
              {selectedOrder.status === 'cancelled' && selectedOrder.cancelReason && (
                <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  <div className="font-semibold mb-0.5">Motivo de cancelación:</div>
                  <div>{selectedOrder.cancelReason}</div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo: confirmar cancelación con motivo */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-rose-600" />
              Cancelar pedido {selectedOrder?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Esta acción cambiará el pedido a estado <b>Cancelado</b>, liberará el stock reservado y quitará todas las tarjetas asociadas del Kanban de producción.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Motivo (opcional, se guarda en el historial)
            </label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ej. El cliente desistió del pago por transferencia"
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>
              Volver
            </Button>
            <Button
              onClick={cancelOrder}
              disabled={cancelling}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {cancelling
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Cancelando…</>
                : <><Ban className="h-3.5 w-3.5 mr-1.5" />Confirmar cancelación</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo: confirmar eliminación permanente */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600" />
              ¿Eliminar el pedido permanentemente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán del sistema el pedido <b>{selectedOrder?.orderNumber}</b>, todos sus ítems y cualquier tarjeta remanente en el Kanban.
              <br /><br />
              <span className="text-red-700 font-semibold">Esta acción no se puede deshacer.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteOrder(); }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Eliminando…</>
                : <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Sí, eliminar</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------
function Kpi({ title, value, icon: Icon, tone = 'slate', isText = false }) {
  const tones = {
    slate:   'from-slate-500 to-slate-700',
    amber:   'from-amber-500 to-orange-600',
    blue:    'from-blue-500 to-indigo-600',
    emerald: 'from-emerald-500 to-teal-600',
  };
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{title}</p>
            <p className={cn('mt-1 font-bold text-slate-900', isText ? 'text-lg' : 'text-2xl')}>{value}</p>
          </div>
          <div className={cn('h-10 w-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm', tones[tone])}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</p>
      <p className="text-sm text-slate-900 truncate">{value}</p>
    </div>
  );
}

function TotalRow({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(bold ? 'font-bold text-slate-900 text-base' : 'text-slate-600')}>{label}</span>
      <span className={cn(bold ? 'font-bold text-slate-900 text-base' : 'font-medium text-slate-900')}>{value}</span>
    </div>
  );
}

function EmptyState({ q }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <ClipboardList className="h-8 w-8 text-slate-400" />
        </div>
        <p className="font-medium text-slate-900">
          {q ? 'Sin resultados' : 'No hay pedidos aún'}
        </p>
        <p className="text-sm text-slate-500 mt-1">
          {q
            ? 'Intenta con otro criterio de búsqueda o cambia el filtro.'
            : 'Cuando se creen pedidos (Web, POS, WhatsApp o Gang Sheet Builder) aparecerán aquí.'}
        </p>
        {!q && (
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <Link href="/gang-sheet">
              <Button variant="outline" size="sm">
                <Layers className="h-3.5 w-3.5 mr-1.5" />Gang Sheet
              </Button>
            </Link>
            <Link href="/pos">
              <Button variant="outline" size="sm">
                <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />POS
              </Button>
            </Link>
            <Link href="/tienda">
              <Button variant="outline" size="sm">
                <Store className="h-3.5 w-3.5 mr-1.5" />Tienda
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
