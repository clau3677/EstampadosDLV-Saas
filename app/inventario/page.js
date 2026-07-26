'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, PackageSearch, Search, Plus, Minus, AlertTriangle,
  Droplet, Layers, ScrollText, Loader2, TrendingDown, RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatCLP, formatDateTime, formatNumber } from '@/lib/format';

// ============================================================================
// Inventario Dual — Comercial (prendas, DTF x metro) + Insumos (film, tintas)
// ============================================================================

const SUPPLY_ICONS = {
  film_pet: Layers,
  film_uv: Layers,
  ink_cyan: Droplet,
  ink_magenta: Droplet,
  ink_yellow: Droplet,
  ink_black: Droplet,
  ink_white: Droplet,
  ink_varnish: Droplet,
  poliamida: ScrollText,
};

const SUPPLY_COLORS = {
  film_pet:   { bg: 'bg-slate-500',    ring: 'ring-slate-200'   },
  film_uv:    { bg: 'bg-teal-500',     ring: 'ring-teal-200'    },
  ink_cyan:   { bg: 'bg-cyan-500',     ring: 'ring-cyan-200'    },
  ink_magenta:{ bg: 'bg-fuchsia-500',  ring: 'ring-fuchsia-200' },
  ink_yellow: { bg: 'bg-yellow-400',   ring: 'ring-yellow-200'  },
  ink_black:  { bg: 'bg-slate-900',    ring: 'ring-slate-300'   },
  ink_white:  { bg: 'bg-white border border-slate-300', ring: 'ring-slate-200' },
  ink_varnish:{ bg: 'bg-gradient-to-br from-amber-300 to-yellow-500', ring: 'ring-amber-200' },
  poliamida:  { bg: 'bg-orange-500',   ring: 'ring-orange-200'  },
};

function StockBar({ current, min }) {
  // Barra visual: 0 - 3x min alert como escala
  const scale = Math.max(min * 3, current);
  const pct = Math.min(100, (current / scale) * 100);
  const critical = current <= min * 0.5;
  const low = current <= min;
  const color = critical ? 'bg-rose-500' : low ? 'bg-amber-500' : 'bg-emerald-500';
  const bgTrack = critical ? 'bg-rose-100' : low ? 'bg-amber-100' : 'bg-slate-100';
  return (
    <div className={`h-2 rounded-full overflow-hidden ${bgTrack}`}>
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function AdjustDialog({ open, onOpenChange, item, itemType, onDone }) {
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setDelta(0); setReason(''); } }, [open]);

  if (!item) return null;

  const currentQty = itemType === 'supply' ? item.currentQuantity : item.quantity;
  const unit = itemType === 'supply' ? (item.unit || '') : 'un.';

  const submit = async () => {
    if (!delta) return toast.error('Ingresa una cantidad');
    setSubmitting(true);
    try {
      const r = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, itemId: item.id, delta: Number(delta), reason }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success('Stock actualizado', { description: `Nuevo saldo: ${data.newQuantity} ${unit}` });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e.message || 'Error al ajustar');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="font-semibold text-slate-900">{item.name || item.code}</div>
            <div className="text-xs text-slate-500">Actual: <span className="font-mono font-semibold">{currentQty} {unit}</span></div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Cambio (positivo o negativo)</label>
            <div className="mt-1 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDelta((d) => Number(d) - 10)}><Minus className="h-3 w-3" /></Button>
              <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className="text-center font-mono" />
              <Button variant="outline" size="sm" onClick={() => setDelta((d) => Number(d) + 10)}><Plus className="h-3 w-3" /></Button>
            </div>
            <div className="text-xs text-slate-500 mt-1">Saldo nuevo: <span className="font-mono font-semibold">{Number(currentQty) + Number(delta || 0)} {unit}</span></div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Motivo</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reposición proveedor / Merma / Corrección inventario…" rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting || !delta} className="bg-orange-500 hover:bg-orange-600">
            {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</> : 'Confirmar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplyCard({ supply, onAdjust }) {
  const Icon = SUPPLY_ICONS[supply.type] || Droplet;
  const colors = SUPPLY_COLORS[supply.type] || { bg: 'bg-slate-500', ring: 'ring-slate-200' };
  const isLow = supply.currentQuantity <= supply.minAlert;
  const isCritical = supply.currentQuantity <= supply.minAlert * 0.5;

  return (
    <Card className={`border-slate-200/70 ${isLow ? 'ring-2 ' + (isCritical ? 'ring-rose-200' : 'ring-amber-200') : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-lg ${colors.bg} flex items-center justify-center shrink-0 ring-2 ${colors.ring}`}>
            <Icon className={`h-5 w-5 ${supply.type === 'ink_white' ? 'text-slate-700' : 'text-white'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="font-semibold text-slate-900 text-sm truncate">{supply.name}</div>
              {isLow && (
                <Badge variant="secondary" className={`text-[10px] px-1.5 h-4 ${isCritical ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{isCritical ? 'Crítico' : 'Bajo'}
                </Badge>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-mono">{supply.code}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-bold text-slate-900 font-mono leading-none">
                {formatNumber(supply.currentQuantity)}
                <span className="text-sm font-medium text-slate-500 ml-1">{supply.unit}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Mínimo: <span className="font-mono">{supply.minAlert} {supply.unit}</span></div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-slate-700">{formatCLP(supply.cost)}</div>
              <div className="text-[10px] text-slate-500">c/u</div>
            </div>
          </div>
          <div className="mt-2">
            <StockBar current={supply.currentQuantity} min={supply.minAlert} />
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[10px] text-slate-500">Última reposición: {formatDateTime(supply.lastRestockAt)}</div>
          <Button size="sm" variant="outline" onClick={() => onAdjust(supply)} className="h-7 text-xs">
            Ajustar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InventarioPage() {
  const [tab, setTab] = useState('supplies');
  const [supplies, setSupplies] = useState([]);
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [adjusting, setAdjusting] = useState(null); // { item, type }

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, cRes, pRes] = await Promise.all([
        fetch('/api/inventory/supplies'),
        fetch('/api/inventory/commercial'),
        fetch('/api/products'),
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      const pData = await pRes.json();
      setSupplies(Array.isArray(sData) ? sData : []);
      setStock(Array.isArray(cData) ? cData : []);
      setProducts(Array.isArray(pData) ? pData : []);
    } catch (e) {
      toast.error('Error al cargar inventario');
      setSupplies([]);
      setStock([]);
      setProducts([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filteredSupplies = (Array.isArray(supplies) ? supplies : []).filter(s =>
    !query || s.name?.toLowerCase().includes(query.toLowerCase()) || s.code?.toLowerCase().includes(query.toLowerCase())
  );

  // Enrich stock rows with product/variant info
  const productMap = Object.fromEntries((Array.isArray(products) ? products : []).map(p => [p.id, p]));
  const enrichedStock = (Array.isArray(stock) ? stock : []).map(s => {
    const p = productMap[s.productId];
    const v = p?.variants?.find(v => v.id === s.variantId);
    return { ...s, productName: p?.name, category: p?.category, variantName: v?.name, sku: v?.sku };
  });
  const filteredStock = enrichedStock.filter(s =>
    !query || s.productName?.toLowerCase().includes(query.toLowerCase()) || s.sku?.toLowerCase().includes(query.toLowerCase())
  );

  const suppliesCritical = (Array.isArray(supplies) ? supplies : []).filter(s => s.currentQuantity <= s.minAlert).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" />Dashboard
        </Link>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <PackageSearch className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900">Inventario Dual</div>
            <div className="text-xs text-slate-500">Comercial + Insumos de producción</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {suppliesCritical > 0 && (
            <Badge className="bg-rose-100 text-rose-700 border border-rose-200">
              <AlertTriangle className="h-3 w-3 mr-1" />{suppliesCritical} en alerta
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Actualizar
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="bg-slate-100/60">
            <TabsTrigger value="supplies" className="text-xs">Insumos de Producción ({supplies.length})</TabsTrigger>
            <TabsTrigger value="commercial" className="text-xs">Stock Comercial ({stock.length})</TabsTrigger>
          </TabsList>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Buscar…" className="pl-9 h-9 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <TabsContent value="supplies" className="mt-4">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-slate-500 text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />Cargando insumos…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSupplies.map(s => (
                <SupplyCard key={s.id} supply={s} onAdjust={(item) => setAdjusting({ item, type: 'supply' })} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="commercial" className="mt-4">
          {loading ? (
            <div className="h-40 flex items-center justify-center text-slate-500 text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />Cargando stock…
            </div>
          ) : (
            <Card className="border-slate-200/70">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Producto</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Variante</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">SKU</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Stock</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Reservado</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Mínimo</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map(s => {
                        const isLow = s.quantity <= s.minStockAlert;
                        return (
                          <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                            <td className="px-4 py-3 font-medium text-slate-900">{s.productName || '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{s.variantName || '—'}</td>
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.sku || '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-mono font-bold ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>{s.quantity}</span>
                              {isLow && <AlertTriangle className="h-3 w-3 text-rose-500 inline ml-1" />}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-600">{s.reservedQuantity || 0}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-500">{s.minStockAlert}</td>
                            <td className="px-4 py-3 text-right">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdjusting({ item: s, type: 'commercial' })}>
                                Ajustar
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AdjustDialog
        open={!!adjusting}
        onOpenChange={(v) => !v && setAdjusting(null)}
        item={adjusting?.item}
        itemType={adjusting?.type}
        onDone={load}
      />
    </div>
  );
}
