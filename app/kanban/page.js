'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
  DragOverlay, closestCorners,
} from '@dnd-kit/core';
import {
  ArrowLeft, KanbanSquare, Printer, Zap, User, Clock, Package,
  RefreshCw, ChevronRight, CheckCircle2, Loader2, X, Ban, Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { formatCLP, formatDateTime } from '@/lib/format';

// ============================================================================
// Kanban de Producción — 3 impresoras (Epson, Prestige, DTF UV) con 4 estados
// Drag & drop entre columnas usando @dnd-kit/core.
// ============================================================================

const STATUSES = [
  { key: 'received',  label: 'Recibido',      color: 'text-slate-600',   dot: 'bg-slate-400' },
  { key: 'printing',  label: 'En Impresión',  color: 'text-blue-600',    dot: 'bg-blue-500 animate-pulse' },
  { key: 'curing',    label: 'Curado',        color: 'text-purple-600',  dot: 'bg-purple-500' },
  { key: 'ready',     label: 'Listo',         color: 'text-emerald-600', dot: 'bg-emerald-500' },
];

// Fallback usado solo si la API de printers está caída
const FALLBACK_PRINTERS = [
  { code: 'epson_r1390',     label: 'Epson R1390',     shortLabel: 'Epson',    color: 'from-blue-500 to-indigo-600' },
  { code: 'prestige_r2_pro', label: 'Prestige R2 Pro', shortLabel: 'Prestige', color: 'from-purple-500 to-fuchsia-600' },
  { code: 'dtf_uv',          label: 'DTF UV',          shortLabel: 'UV',       color: 'from-emerald-500 to-teal-600' },
];

function timeAgo(date) {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function QueueCard({ item, isDragging, printersMap, onRemoveClick }) {
  const printer = printersMap[item.printer] || { color: 'from-slate-500 to-slate-700', label: item.printer };
  const isExpress = item.priority === 'express';

  return (
    <div
      className={`
        relative rounded-lg border bg-white p-3 shadow-sm select-none
        ${isExpress ? 'border-orange-400 ring-1 ring-orange-200' : 'border-slate-200'}
        ${isDragging ? 'opacity-40' : ''}
        hover:border-slate-300 transition-colors group
      `}
    >
      {/* Botón X para quitar/cancelar - visible siempre en mobile, hover en desktop */}
      {onRemoveClick && !isDragging && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemoveClick(item);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-1.5 right-1.5 z-10 h-6 w-6 rounded-md flex items-center justify-center bg-white/90 border border-slate-200 shadow-sm text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
          aria-label="Quitar del Kanban"
          title="Quitar del Kanban"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex items-start justify-between gap-2 pr-6">
        <div className="font-mono text-[11px] font-bold text-slate-700">
          {item.order?.orderNumber || '—'}
        </div>
        <div className="flex items-center gap-1">
          {isExpress && (
            <Badge className="bg-orange-500/15 text-orange-700 border border-orange-500/30 h-5 px-1.5 text-[10px] font-semibold">
              <Zap className="h-2.5 w-2.5 mr-0.5" />EXPRÉS
            </Badge>
          )}
          <div className={`h-5 w-5 rounded bg-gradient-to-br ${printer?.color} flex items-center justify-center`} title={printer?.label}>
            <Printer className="h-3 w-3 text-white" />
          </div>
        </div>
      </div>

      <div className="mt-2 text-sm font-medium text-slate-900 truncate">
        {item.order?.customerName || 'Cliente'}
      </div>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
        <div className="flex items-center gap-1">
          <Package className="h-3 w-3" />
          {(item.lengthMm / 10).toFixed(1)} cm
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(item.startedAt || item.order?.createdAt)}
        </div>
      </div>

      {item.order?.total && (
        <div className="mt-2 pt-2 border-t border-slate-100 text-xs font-mono font-semibold text-slate-700">
          {formatCLP(item.order.total)}
        </div>
      )}
    </div>
  );
}

function DraggableCard({ item, printersMap, onRemoveClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing touch-none">
      <QueueCard item={item} isDragging={isDragging} printersMap={printersMap} onRemoveClick={onRemoveClick} />
    </div>
  );
}

function StatusColumn({ status, items, printersMap, onRemoveClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.key });
  return (
    <div
      ref={setNodeRef}
      className={`
        flex flex-col rounded-xl p-3 min-h-[500px] transition-colors
        ${isOver ? 'bg-orange-50 ring-2 ring-orange-300' : 'bg-slate-50/60'}
      `}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${status.color}`}>{status.label}</span>
        </div>
        <span className="text-xs font-mono text-slate-500">{items.length}</span>
      </div>

      <div className="flex-1 space-y-2">
        {items.map(item => <DraggableCard key={item.id} item={item} printersMap={printersMap} onRemoveClick={onRemoveClick} />)}
        {items.length === 0 && (
          <div className="h-24 flex items-center justify-center text-xs text-slate-400 italic">Vacío</div>
        )}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const [items, setItems] = useState([]);
  const [printers, setPrinters] = useState(FALLBACK_PRINTERS);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [printerFilter, setPrinterFilter] = useState('all');

  // Estado para el diálogo de quitar/cancelar
  const [removeItem, setRemoveItem] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [processingRemove, setProcessingRemove] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = async () => {
    setLoading(true);
    try {
      const [rq, rp] = await Promise.all([
        fetch('/api/production/queue'),
        fetch('/api/printers?active=true'),
      ]);
      if (rq.ok) setItems(await rq.json());
      if (rp.ok) {
        const list = await rp.json();
        if (Array.isArray(list) && list.length > 0) setPrinters(list);
      }
    } catch (e) {
      toast.error('Error al cargar cola');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Map code → printer para lookup rápido en QueueCard
  const printersMap = useMemo(() => {
    const m = {};
    printers.forEach(p => { m[p.code || p.key] = p; });
    return m;
  }, [printers]);

  const filtered = useMemo(() => {
    if (printerFilter === 'all') return items;
    return items.filter(i => i.printer === printerFilter);
  }, [items, printerFilter]);
  const byStatus = useMemo(() => {
    const map = { received: [], printing: [], curing: [], ready: [] };
    filtered.forEach(i => (map[i.status] || (map[i.status] = [])).push(i));
    // Priorizar Express
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => (b.priority === 'express' ? 1 : 0) - (a.priority === 'express' ? 1 : 0));
    });
    return map;
  }, [filtered]);

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  const onDragEnd = async (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const item = active.data.current?.item;
    const toStatus = over.id;
    if (!item || item.status === toStatus) return;
    if (!['received','printing','curing','ready'].includes(toStatus)) return;

    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: toStatus, startedAt: toStatus === 'printing' && !i.startedAt ? new Date().toISOString() : i.startedAt, completedAt: toStatus === 'ready' ? new Date().toISOString() : i.completedAt } : i));

    try {
      const r = await fetch('/api/production/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, toStatus }),
      });
      if (!r.ok) throw new Error();
      toast.success(`${item.order?.orderNumber || 'Pedido'} → ${STATUSES.find(s => s.key === toStatus)?.label}`);
    } catch (e) {
      toast.error('Error al mover, recargando');
      load();
    }
  };

  // Quitar SÓLO esta tarjeta del Kanban (deja el pedido intacto)
  const handleRemoveFromKanban = async () => {
    if (!removeItem) return;
    setProcessingRemove(true);
    try {
      const r = await fetch('/api/production/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: removeItem.id }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo quitar la tarjeta');
        return;
      }
      toast.success('Tarjeta quitada del Kanban', {
        description: 'El pedido sigue existiendo. Puedes verlo en /pedidos',
      });
      setItems(prev => prev.filter(i => i.id !== removeItem.id));
      setRemoveItem(null);
    } catch (e) {
      toast.error('Error de red', { description: e.message });
    } finally {
      setProcessingRemove(false);
    }
  };

  // Cancelar el PEDIDO completo (marca cancelled + libera stock + quita TODAS sus tarjetas)
  const handleCancelOrder = async () => {
    if (!removeItem?.orderId) return;
    setProcessingRemove(true);
    try {
      const r = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: removeItem.orderId, reason: cancelReason.trim() }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo cancelar el pedido');
        return;
      }
      toast.success(`Pedido ${removeItem.order?.orderNumber || ''} cancelado`, {
        description: 'Stock liberado y tarjetas removidas del Kanban',
      });
      // Sacar del Kanban local todas las tarjetas del mismo pedido
      setItems(prev => prev.filter(i => i.orderId !== removeItem.orderId));
      setRemoveItem(null);
      setCancelReason('');
    } catch (e) {
      toast.error('Error de red', { description: e.message });
    } finally {
      setProcessingRemove(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" />Dashboard
        </Link>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <KanbanSquare className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900">Kanban de Producción</div>
            <div className="text-xs text-slate-500">Arrastra tarjetas para cambiar estado</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Actualizar
          </Button>
        </div>
      </div>

      {/* Filtros por impresora */}
      <Tabs value={printerFilter} onValueChange={setPrinterFilter}>
        <TabsList className="bg-slate-100/60 flex-wrap h-auto">
          <TabsTrigger value="all" className="text-xs">Todas ({items.length})</TabsTrigger>
          {printers.map(p => (
            <TabsTrigger key={p.code || p.key} value={p.code || p.key} className="text-xs">
              <div className={`h-3 w-3 rounded bg-gradient-to-br ${p.color} mr-1.5`} />
              {p.label} ({items.filter(i => i.printer === (p.code || p.key)).length})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Board */}
      {loading && items.length === 0 ? (
        <div className="h-96 flex items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando cola…
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Package className="h-8 w-8 text-slate-400 mx-auto" />
            <div className="mt-3 text-sm font-medium text-slate-700">La cola está vacía</div>
            <div className="text-xs text-slate-500 mt-1">Ve al Dashboard y toca “Cargar datos demo” para ver el sistema en acción.</div>
            <Link href="/"><Button variant="outline" size="sm" className="mt-4">Volver al Dashboard</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(e) => setActiveId(e.active.id)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {STATUSES.map(s => (
              <StatusColumn
                key={s.key}
                status={s}
                items={byStatus[s.key] || []}
                printersMap={printersMap}
                onRemoveClick={setRemoveItem}
              />
            ))}
          </div>
          <DragOverlay>
            {activeItem ? <QueueCard item={activeItem} printersMap={printersMap} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Diálogo: Quitar tarjeta / Cancelar pedido */}
      <Dialog open={!!removeItem} onOpenChange={(v) => { if (!v) { setRemoveItem(null); setCancelReason(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-rose-600" />
              {removeItem?.order?.orderNumber || 'Tarjeta'}
            </DialogTitle>
            <DialogDescription>
              Elige qué hacer con esta tarjeta:
            </DialogDescription>
          </DialogHeader>

          {/* Opción 1: quitar sólo la tarjeta */}
          <div className="rounded-lg border border-slate-200 p-3 hover:border-slate-300 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                  <X className="h-3.5 w-3.5 text-slate-600" />
                  Quitar del Kanban
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Elimina esta tarjeta específica de la cola de producción. El pedido sigue existiendo en <b>/pedidos</b>.
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRemoveFromKanban}
                disabled={processingRemove}
              >
                {processingRemove
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : 'Quitar'}
              </Button>
            </div>
          </div>

          {/* Opción 2: cancelar el pedido completo */}
          <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3">
            <div className="font-semibold text-sm text-rose-900 flex items-center gap-1.5">
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              Cancelar el pedido completo
            </div>
            <div className="text-xs text-rose-800/80 mt-1">
              Marca el pedido como <b>Cancelado</b>, libera el stock reservado y quita <b>todas</b> las tarjetas del Kanban que pertenecen a este pedido.
            </div>
            <div className="mt-2">
              <label className="text-[10px] font-semibold text-slate-700 uppercase tracking-wide mb-1 block">
                Motivo (opcional)
              </label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej. Cliente no pagó la transferencia dentro del plazo"
                className="min-h-[60px] text-xs"
              />
            </div>
            <Button
              size="sm"
              onClick={handleCancelOrder}
              disabled={processingRemove || !removeItem?.orderId}
              className="mt-2 w-full bg-rose-600 hover:bg-rose-700"
            >
              {processingRemove
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Procesando…</>
                : <><Ban className="h-3.5 w-3.5 mr-1.5" />Cancelar pedido completo</>}
            </Button>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRemoveItem(null); setCancelReason(''); }} disabled={processingRemove}>
              Volver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
