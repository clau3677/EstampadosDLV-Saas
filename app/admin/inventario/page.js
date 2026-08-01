'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, PackageSearch, Search, Plus, Minus, AlertTriangle,
  Droplet, Layers, ScrollText, Loader2, RefreshCw, Edit3, Trash2, MoreVertical,
  FileUp, Image as ImageIcon, Star,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { NewSupplyDialog } from '@/components/new-supply-dialog';
import { NewProductDialog } from '@/components/new-product-dialog';
import { EditSupplyDialog } from '@/components/edit-supply-dialog';
import { EditProductDialog } from '@/components/edit-product-dialog';
import { CsvImportDialog } from '@/components/csv-import-dialog';
import { formatCLP, formatDateTime, formatNumber } from '@/lib/format';

// ============================================================================
// Inventario Dual — Comercial (prendas, DTF x metro) + Insumos (film, tintas)
// Ahora con CRUD completo: crear, editar, eliminar, ajustar, importar CSV.
// ============================================================================

const SUPPLY_ICONS_MAP = {
  film_pet: Layers, film_uv: Layers,
  ink_cyan: Droplet, ink_magenta: Droplet, ink_yellow: Droplet,
  ink_black: Droplet, ink_white: Droplet, ink_varnish: Droplet,
  poliamida: ScrollText,
};
const iconForSupply = (type) => {
  if (SUPPLY_ICONS_MAP[type]) return SUPPLY_ICONS_MAP[type];
  if (type?.startsWith('film_')) return Layers;
  if (type?.startsWith('ink_'))  return Droplet;
  if (type?.startsWith('poli'))  return ScrollText;
  return Droplet;
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
const colorForSupply = (type) => SUPPLY_COLORS[type] || { bg: 'bg-slate-500', ring: 'ring-slate-200' };

function StockBar({ current, min }) {
  const scale = Math.max(min * 3, current);
  const pct = scale > 0 ? Math.min(100, (current / scale) * 100) : 0;
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
        <DialogHeader><DialogTitle>Ajustar stock</DialogTitle></DialogHeader>
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

function SupplyCard({ supply, onAdjust, onEdit, onDelete }) {
  const Icon = iconForSupply(supply.type);
  const colors = colorForSupply(supply.type);
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 -mr-1 text-slate-400 hover:text-slate-700">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(supply)}>
                <Edit3 className="h-3.5 w-3.5 mr-2" />Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(supply)} className="text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <div className="mt-2"><StockBar current={supply.currentQuantity} min={supply.minAlert} /></div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[10px] text-slate-500 truncate">
            {supply.supplier ? `Prov: ${supply.supplier}` : `Últ. rep: ${formatDateTime(supply.lastRestockAt)}`}
          </div>
          <Button size="sm" variant="outline" onClick={() => onAdjust(supply)} className="h-7 text-xs">Ajustar</Button>
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
  const [adjusting, setAdjusting] = useState(null);
  const [editingSupply, setEditingSupply] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);   // {type:'supply'|'product', item}
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

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
      setSupplies([]); setStock([]); setProducts([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleFeatured = async (product) => {
    const newValue = !product.featured;
    // Actualización optimista: aplicar el cambio en la UI antes de que el
    // servidor responda para que se sienta instantáneo.
    setProducts(list =>
      (Array.isArray(list) ? list : []).map(p => p.id === product.id ? { ...p, featured: newValue } : p)
    );
    try {
      const r = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, featured: newValue }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      toast.success(newValue ? '⭐ Marcado como destacado' : 'Ya no es destacado', {
        description: product.name,
      });
    } catch (e) {
      // Revertir si falla
      setProducts(list =>
        (Array.isArray(list) ? list : []).map(p => p.id === product.id ? { ...p, featured: !newValue } : p)
      );
      toast.error('Error al actualizar', { description: e.message });
    }
  };

  const filteredSupplies = (Array.isArray(supplies) ? supplies : []).filter(s =>
    !query || s.name?.toLowerCase().includes(query.toLowerCase()) || s.code?.toLowerCase().includes(query.toLowerCase())
  );

  const productMap = Object.fromEntries((Array.isArray(products) ? products : []).map(p => [p.id, p]));
  const enrichedStock = (Array.isArray(stock) ? stock : []).map(s => {
    const p = productMap[s.productId];
    const v = p?.variants?.find(v => v.id === s.variantId);
    return { ...s, productName: p?.name, category: p?.category, subcategory: p?.subcategory, supplier: p?.supplier, supplierBrand: p?.supplierBrand, variantName: v?.name, sku: v?.sku, productImages: p?.images };
  });

  // Extractar proveedores únicos del stock enriquecido
  const uniqueSuppliers = [...new Set(
    enrichedStock
      .filter(s => s.supplier)
      .map(s => s.supplier)
  )];
  const supplierLabels = { cottonext: 'Cottonext', textilryu: 'Textil Ryu', treck: 'Treck' };
  const supplierOptions = uniqueSuppliers.map(s => ({ value: s, label: supplierLabels[s] || s }));

  // Extraer tipo de prenda desde el nombre del producto
  // Palabras clave para identificar el tipo de prenda
  const PRODUCT_TYPE_KEYWORDS = [
    // Ropa
    { keyword: 'polerón', group: 'Polerones' },
    { keyword: 'poleron', group: 'Polerones' },
    { keyword: 'polera', group: 'Poleras' },
    { keyword: 'pantalón', group: 'Pantalones' },
    { keyword: 'pantalon', group: 'Pantalones' },
    { keyword: 'pantalones', group: 'Pantalones' },
    { keyword: 'short', group: 'Shorts' },
    { keyword: 'camisa', group: 'Camisas' },
    { keyword: 'camiseta', group: 'Camisetas' },
    { keyword: 'sudadera', group: 'Sudaderas' },
    { keyword: 'buzo', group: 'Buzos' },
    // Gorras y accesorios
    { keyword: 'gorra', group: 'Gorras' },
    { keyword: 'gorro', group: 'Gorros' },
    { keyword: 'tazón', group: 'Tazones' },
    { keyword: 'tazon', group: 'Tazones' },
    { keyword: 'botella', group: 'Botellas' },
    { keyword: 'llavero', group: 'Llaveros' },
    { keyword: 'mousepad', group: 'Mouse pads' },
    { keyword: 'mouse pad', group: 'Mouse pads' },
    // Ropa de trabajo
    { keyword: 'ignífuga', group: 'Ropa ignífuga' },
    { keyword: 'ignifuga', group: 'Ropa ignífuga' },
    { keyword: 'técnica', group: 'Ropa técnica' },
    { keyword: 'tecnica', group: 'Ropa técnica' },
    { keyword: 'outdoor', group: 'Ropa outdoor' },
    { keyword: 'trabajo', group: 'Ropa de trabajo' },
    // DTF
    { keyword: 'dtf textil', group: 'DTF Textil' },
    { keyword: 'dtf uv', group: 'DTF UV' },
  ];

  // Función para extraer el tipo de prenda de un nombre de producto
  const getProductType = (name) => {
    if (!name) return 'Otros';
    const lower = name.toLowerCase();
    // Buscar coincidencias, priorizando palabras más largas primero
    const sorted = [...PRODUCT_TYPE_KEYWORDS].sort((a, b) => b.keyword.length - a.keyword.length);
    for (const kw of sorted) {
      if (lower.includes(kw.keyword)) return kw.group;
    }
    // Si no hay coincidencia, usar las primeras 3 palabras del nombre como identificador
    const words = name.split(' ').filter(w => w.length > 2);
    if (words.length >= 2) {
      return words.slice(0, 3).join(' ');
    }
    return name;
  };

  // Enriquecer stock con tipo de prenda extraído
  const stockWithTypes = enrichedStock.map(s => ({
    ...s,
    productType: getProductNameGroup(s.productName)
  }));

  // Agrupar nombres similares usando palabras clave
  function getProductNameGroup(name) {
    if (!name) return 'Otros';
    const lower = name.toLowerCase();
    const sorted = [...PRODUCT_TYPE_KEYWORDS].sort((a, b) => b.keyword.length - a.keyword.length);
    for (const kw of sorted) {
      if (lower.includes(kw.keyword)) return kw.group;
    }
    return 'Otros';
  }

  // Obtener tipos únicos filtrados por proveedor
  const stockForTypes = filterSupplier
    ? stockWithTypes.filter(s => s.supplier === filterSupplier)
    : stockWithTypes;
  const uniqueTypes = [...new Set(stockForTypes.map(s => s.productType))].sort();
  const typeOptions = uniqueTypes.map(t => ({ value: t, label: t }));

  const filteredStock = enrichedStock.filter(s => {
    const productType = getProductNameGroup(s.productName);
    // Filtro de búsqueda por texto
    const matchQuery = !query || s.productName?.toLowerCase().includes(query.toLowerCase()) || s.sku?.toLowerCase().includes(query.toLowerCase());
    // Filtro por proveedor
    const matchSupplier = !filterSupplier || s.supplier === filterSupplier;
    // Filtro por tipo de prenda (basado en nombre del producto)
    const matchType = !filterCategory || productType === filterCategory;
    return matchQuery && matchSupplier && matchType;
  });

  const suppliesCritical = (Array.isArray(supplies) ? supplies : []).filter(s => s.currentQuantity <= s.minAlert).length;

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      let r, url, body;
      if (confirmDelete.type === 'supply') {
        url = '/api/inventory/supplies';
        body = { id: confirmDelete.item.id };
      } else {
        url = '/api/products';
        body = { id: confirmDelete.item.id, hard: true };
      }
      r = await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success('Eliminado');
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error('No se pudo eliminar', { description: e.message });
    }
  };

  return (
    <div className="space-y-4">
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {suppliesCritical > 0 && (
            <Badge className="bg-rose-100 text-rose-700 border border-rose-200">
              <AlertTriangle className="h-3 w-3 mr-1" />{suppliesCritical} en alerta
            </Badge>
          )}
          <CsvImportDialog kind={tab === 'supplies' ? 'supplies' : 'products'} onImported={load} />
          {tab === 'supplies'
            ? <NewSupplyDialog onCreated={load} />
            : <NewProductDialog onCreated={load} />
          }
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />Actualizar
          </Button>
        </div>
      </div>

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
                <SupplyCard
                  key={s.id}
                  supply={s}
                  onAdjust={(item) => setAdjusting({ item, type: 'supply' })}
                  onEdit={(item) => setEditingSupply(item)}
                  onDelete={(item) => setConfirmDelete({ type: 'supply', item })}
                />
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
            <>
              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  <option value="">Todos los proveedores</option>
                  {supplierOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  disabled={filterSupplier && typeOptions.length === 0}
                >
                  <option value="">{filterSupplier ? 'Todos los tipos' : 'Todos los tipos'}</option>
                  {typeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {(filterSupplier || filterCategory) && (
                  <button
                    onClick={() => { setFilterSupplier(''); setFilterCategory(''); }}
                    className="h-9 px-3 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  >
                    Limpiar filtros
                  </button>
                )}
                <span className="text-xs text-slate-500 ml-2">
                  {filteredStock.length} resultado{filteredStock.length !== 1 ? 's' : ''}
                </span>
              </div>
              <Card className="border-slate-200/70">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600 w-12"></th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Producto</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Variante</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">SKU</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Disponible</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Mínimo</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map(s => {
                        const available = (s.quantity || 0) - (s.reservedQuantity || 0);
                        const isLow = available <= s.minStockAlert;
                        const product = productMap[s.productId];
                        const isFeatured = !!product?.featured;
                        return (
                          <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                            <td className="px-3 py-2">
                              {s.productImages?.length > 0 ? (
                                <img src={s.productImages[0]} alt="" className="h-9 w-9 rounded object-cover border border-slate-200" />
                              ) : (
                                <div className="h-9 w-9 rounded bg-slate-100 border border-slate-200 flex items-center justify-center">
                                  <ImageIcon className="h-4 w-4 text-slate-400" />
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 font-medium text-slate-900">
                              <div className="flex items-center gap-1.5">
                                {isFeatured && (
                                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" aria-label="Destacado" />
                                )}
                                <span>{s.productName || '—'}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-slate-700">{s.variantName || '—'}</td>
                            <td className="px-3 py-3 font-mono text-xs text-slate-500">{s.sku || '—'}</td>
                            <td className="px-3 py-3 text-right">
                              <span className={`font-mono font-bold ${isLow ? 'text-rose-600' : 'text-emerald-600'}`}>{available}</span>
                              {isLow && <AlertTriangle className="h-3 w-3 text-rose-500 inline ml-1" />}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-600">
                              {s.quantity || 0}{(s.reservedQuantity || 0) > 0 ? <span className="text-amber-500 text-xs ml-1">({(s.reservedQuantity || 0)} res.)</span> : ''}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-500">{s.minStockAlert}</td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className={`h-7 w-7 p-0 ${isFeatured ? 'text-amber-500 hover:bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}
                                  title={isFeatured ? 'Quitar de destacados' : 'Marcar como destacado'}
                                  onClick={() => product && toggleFeatured(product)}
                                  disabled={!product}
                                >
                                  <Star className={`h-4 w-4 ${isFeatured ? 'fill-amber-500' : ''}`} />
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdjusting({ item: s, type: 'commercial' })}>
                                  Ajustar
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700">
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => product && setEditingProduct(product)}>
                                      <Edit3 className="h-3.5 w-3.5 mr-2" />Editar producto
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => product && toggleFeatured(product)}>
                                      <Star className={`h-3.5 w-3.5 mr-2 ${isFeatured ? 'text-amber-500 fill-amber-500' : ''}`} />
                                      {isFeatured ? 'Quitar de destacados' : 'Marcar como destacado'}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => product && setConfirmDelete({ type: 'product', item: product })}
                                      className="text-rose-600 focus:text-rose-700 focus:bg-rose-50">
                                      <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar producto
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            </>
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

      <EditSupplyDialog
        supply={editingSupply}
        open={!!editingSupply}
        onOpenChange={(v) => !v && setEditingSupply(null)}
        onSaved={load}
      />

      <EditProductDialog
        product={editingProduct}
        open={!!editingProduct}
        onOpenChange={(v) => !v && setEditingProduct(null)}
        onSaved={load}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {confirmDelete?.type === 'supply' ? 'insumo' : 'producto'} &quot;{confirmDelete?.item?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.type === 'supply'
                ? 'Se eliminará permanentemente. Debe tener stock 0.'
                : 'Se eliminará el producto y todas sus variantes de stock. No se puede eliminar si tiene pedidos asociados.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-rose-600 hover:bg-rose-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
