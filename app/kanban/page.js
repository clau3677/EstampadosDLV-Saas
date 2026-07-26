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
  RefreshCw, ChevronRight, CheckCircle2, Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const PRINTERS = [
  { key: 'epson_r1390',     label: 'Epson R1390',     shortLabel: 'Epson',    color: 'from-blue-500 to-indigo-600' },
  { key: 'prestige_r2_pro', label: 'Prestige R2 Pro', shortLabel: 'Prestige', color: 'from-purple-500 to-fuchsia-600' },
  { key: 'dtf_uv',          label: 'DTF UV',          shortLabel: 'UV',       color: 'from-emerald-500 to-teal-600' },
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

function QueueCard({ item, isDragging }) {
  const printer = PRINTERS.find(p => p.key === item.printer);
  const isExpress = item.priority === 'express';

  return (
    <div
      className={`
        rounded-lg border bg-white p-3 shadow-sm select-none
        ${isExpress ? 'border-orange-400 ring-1 ring-orange-200' : 'border-slate-200'}
        ${isDragging ? 'opacity-40' : ''}
        hover:border-slate-300 transition-colors
      `}
    >
      <div className="flex items-start justify-between gap-2">
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

function DraggableCard({ item }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing touch-none">
      <QueueCard item={item} isDragging={isDragging} />
    </div>
  );
}

function StatusColumn({ status, items }) {
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
        {items.map(item => <DraggableCard key={item.id} item={item} />)}
        {items.length === 0 && (
          <div className="h-24 flex items-center justify-center text-xs text-slate-400 italic">Vacío</div>
        )}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [printerFilter, setPrinterFilter] = useState('all');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/production/queue');
      if (r.ok) setItems(await r.json());
    } catch (e) {
      toast.error('Error al cargar cola');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
        <TabsList className="bg-slate-100/60">
          <TabsTrigger value="all" className="text-xs">Todas ({items.length})</TabsTrigger>
          {PRINTERS.map(p => (
            <TabsTrigger key={p.key} value={p.key} className="text-xs">
              <div className={`h-3 w-3 rounded bg-gradient-to-br ${p.color} mr-1.5`} />
              {p.label} ({items.filter(i => i.printer === p.key).length})
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
              <StatusColumn key={s.key} status={s} items={byStatus[s.key] || []} />
            ))}
          </div>
          <DragOverlay>
            {activeItem ? <QueueCard item={activeItem} /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
