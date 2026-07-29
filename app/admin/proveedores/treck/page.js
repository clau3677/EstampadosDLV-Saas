'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Loader2, HardHat, Search, ShoppingBag, Package, RefreshCw, CheckCircle2,
  Filter, DollarSign, Sparkles, ExternalLink, AlertCircle, Palette, Ruler,
  Download, History, Layers, Zap, Clock, PowerOff, Power, Boxes,
  ShieldAlert, Flame, TreePine, Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatCLP } from '@/lib/format';

// Colores + iconos por tipo de "workwear"
const WORKWEAR_TYPE_META = {
  trabajo:  { label: 'Ropa de trabajo',  icon: Wrench,       color: 'bg-orange-100 text-orange-800 border-orange-200',   grad: 'from-orange-500 to-amber-500' },
  tecnica:  { label: 'Ropa técnica',     icon: ShieldAlert,  color: 'bg-blue-100 text-blue-800 border-blue-200',         grad: 'from-blue-500 to-cyan-500' },
  ignifuga: { label: 'Ropa ignífuga',    icon: Flame,        color: 'bg-rose-100 text-rose-800 border-rose-200',         grad: 'from-rose-500 to-red-600' },
  outdoor:  { label: 'Ropa outdoor',     icon: TreePine,     color: 'bg-emerald-100 text-emerald-800 border-emerald-200', grad: 'from-emerald-500 to-teal-600' },
  otros:    { label: 'Otros',            icon: Package,      color: 'bg-slate-100 text-slate-700 border-slate-200',       grad: 'from-slate-500 to-slate-700' },
};

const RANGE_PRESETS = [
  { label: 'Vista rápida (50)',    from: 0,   to: 49,  full: false },
  { label: 'Extendida (200)',      from: 0,   to: 199, full: false },
  { label: 'Todo el catálogo',     from: 0,   to: 447, full: true  },
];

export default function TreckImportPage() {
  const [scanRange, setScanRange] = useState({ from: 0, to: 49, full: false });
  const [markupPercent, setMarkupPercent] = useState(40);
  const [paraphrase, setParaphrase] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { scanId, products, count, totalInCatalog }
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [workwearFilter, setWorkwearFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [importFilter, setImportFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { done, total, currentBatch, stats }
  const [importResult, setImportResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [imported, setImported] = useState([]);
  const [history, setHistory] = useState([]);

  const [cronSettings, setCronSettings] = useState(null);
  const [cronToggling, setCronToggling] = useState(false);
  const [syncingInventory, setSyncingInventory] = useState(false);

  useEffect(() => { loadImported(); loadHistory(); loadCronSettings(); }, []);

  const loadImported = async () => {
    try {
      const r = await fetch('/api/import/treck/imported', { credentials: 'include' });
      const d = await r.json();
      setImported(Array.isArray(d) ? d : []);
    } catch { setImported([]); }
  };
  const loadHistory = async () => {
    try {
      const r = await fetch('/api/import/treck/history', { credentials: 'include' });
      const d = await r.json();
      setHistory(Array.isArray(d) ? d : []);
    } catch { setHistory([]); }
  };
  const loadCronSettings = async () => {
    try {
      const r = await fetch('/api/import/treck/cron/settings', { credentials: 'include' });
      const d = await r.json();
      setCronSettings(d);
    } catch { setCronSettings(null); }
  };
  const toggleCron = async (enabled) => {
    setCronToggling(true);
    try {
      const r = await fetch('/api/import/treck/cron/settings', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      toast.success(enabled ? 'Cron activado' : 'Cron desactivado', {
        description: enabled
          ? 'Los precios se actualizarán automáticamente cada día a las 00:45'
          : 'La actualización automática está pausada. Puedes ejecutarla manualmente.',
      });
      loadCronSettings();
    } catch (err) {
      toast.error('No se pudo cambiar', { description: err.message });
    } finally { setCronToggling(false); }
  };

  const syncInventory = async () => {
    if (!confirm(`¿Sincronizar inventario comercial para los ${imported.length} productos importados?\n\nEsto creará stock records faltantes con cantidad 99 (marcados como "Bajo pedido").`)) return;
    setSyncingInventory(true);
    try {
      const r = await fetch('/api/import/treck/sync-inventory', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      toast.success(`Inventario sincronizado`, {
        description: `${d.stockRecordsCreated} nuevos, ${d.stockRecordsUpdated} actualizados`,
      });
    } catch (err) {
      toast.error('No se pudo sincronizar', { description: err.message });
    } finally { setSyncingInventory(false); }
  };

  const runScan = async () => {
    setScanning(true);
    setSelectedIds(new Set());
    setImportResult(null);
    try {
      const r = await fetch('/api/import/treck/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          from: scanRange.from,
          to: scanRange.to,
          full: scanRange.full,
          force: true,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      setScanResult(d);
      toast.success(`Escaneo completo: ${d.count} productos`, {
        description: d.cached
          ? 'Usando cache reciente'
          : `Catálogo Treck total: ${d.totalInCatalog} productos`,
      });
    } catch (err) {
      toast.error('Escaneo falló', { description: err.message });
    } finally { setScanning(false); }
  };

  const brands = useMemo(() => {
    if (!scanResult) return [];
    const set = new Set(scanResult.products.map(p => p.supplierBrand));
    return Array.from(set).sort();
  }, [scanResult]);

  const filtered = useMemo(() => {
    if (!scanResult) return [];
    return scanResult.products.filter(p => {
      if (workwearFilter !== 'all' && p.workwearType !== workwearFilter) return false;
      if (brandFilter !== 'all' && p.supplierBrand !== brandFilter) return false;
      if (importFilter === 'new' && p.alreadyImported) return false;
      if (importFilter === 'existing' && !p.alreadyImported) return false;
      if (stockFilter === 'in' && !p.hasStock) return false;
      if (stockFilter === 'out' && p.hasStock) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(`${p.shortName} ${p.fullName} ${p.supplierBrand}`.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [scanResult, workwearFilter, brandFilter, importFilter, stockFilter, search]);

  const toggleAll = (checked) => {
    if (checked) setSelectedIds(new Set(filtered.map(p => p.supplierProductId)));
    else setSelectedIds(new Set());
  };
  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const runImport = async () => {
    if (selectedIds.size === 0) return toast.error('Selecciona al menos 1 producto');
    setImporting(true);
    setImportResult(null);
    setImportProgress(null);

    // Chunk selectedIds en tandas para evitar timeout del ingress (~60-90s).
    // Con paráfrasis: ~7-8s por producto → chunks de 5 = ~40s (margen seguro).
    // Sin paráfrasis: ~0.3s por producto → chunks de 20 = ~6s (rápido).
    const CHUNK_SIZE = paraphrase ? 5 : 20;
    const allIds = Array.from(selectedIds);
    const chunks = [];
    for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
      chunks.push(allIds.slice(i, i + CHUNK_SIZE));
    }

    const agg = { attempted: 0, created: 0, updated: 0, failed: 0, details: [] };

    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      setImportProgress({
        currentChunk: idx + 1,
        totalChunks: chunks.length,
        processed: idx * CHUNK_SIZE,
        total: allIds.length,
        stats: { ...agg },
      });

      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await fetch('/api/import/treck/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            scanId: scanResult.scanId,
            selectedIds: chunk,
            markupPercent,
            paraphrase,
          }),
        });

        // Manejo defensivo: si el proxy responde con HTML (504/502), no se puede parsear como JSON
        const contentType = r.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await r.text();
          throw new Error(`Chunk ${idx + 1}/${chunks.length} — respuesta no JSON (posible timeout): ${text.slice(0, 100)}`);
        }
        // eslint-disable-next-line no-await-in-loop
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);

        agg.attempted += d.attempted || 0;
        agg.created   += d.created || 0;
        agg.updated   += d.updated || 0;
        agg.failed    += d.failed || 0;
        if (Array.isArray(d.details)) agg.details.push(...d.details);
      } catch (err) {
        console.error(`[treck:import] chunk ${idx + 1} failed:`, err);
        agg.failed += chunk.length;
        agg.details.push({ chunk: idx + 1, action: 'chunk_failed', error: err.message });
        toast.error(`Chunk ${idx + 1}/${chunks.length} falló`, {
          description: err.message.slice(0, 120),
        });
      }
    }

    setImportProgress({
      currentChunk: chunks.length,
      totalChunks: chunks.length,
      processed: allIds.length,
      total: allIds.length,
      stats: { ...agg },
    });
    setImportResult(agg);

    const successful = agg.created + agg.updated;
    if (successful > 0) {
      toast.success(`Import completo: ${agg.created} creados, ${agg.updated} actualizados`, {
        description: agg.failed > 0 ? `${agg.failed} fallaron` : 'Todos ok',
      });
    } else {
      toast.error('Import falló completamente', {
        description: `Ninguno de los ${allIds.length} productos se procesó correctamente`,
      });
    }

    loadImported();
    loadHistory();
    setImporting(false);
    // Refresh scan tras un delay para dejar terminar syncs pendientes
    setTimeout(runScan, 500);
  };

  const runRefreshPrices = async () => {
    if (!confirm(`¿Actualizar precios de ${imported.length} productos ya importados? Puede tomar varios minutos.`)) return;
    setRefreshing(true);
    try {
      const r = await fetch('/api/import/treck/refresh-prices', {
        method: 'POST',
        credentials: 'include',
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      toast.success(`Precios actualizados: ${d.updated}/${d.updated + d.unchanged}`, {
        description: d.failed ? `${d.failed} fallaron` : 'Sin errores',
      });
      loadImported();
      loadHistory();
    } catch (err) {
      toast.error('Refresh falló', { description: err.message });
    } finally { setRefreshing(false); }
  };

  const stats = useMemo(() => {
    if (!scanResult) return null;
    const ps = scanResult.products;
    const byType = {};
    ps.forEach(p => { byType[p.workwearType] = (byType[p.workwearType] || 0) + 1; });
    return {
      total: ps.length,
      totalInCatalog: scanResult.totalInCatalog,
      alreadyImported: ps.filter(p => p.alreadyImported).length,
      newOnes: ps.filter(p => !p.alreadyImported).length,
      inStock: ps.filter(p => p.hasStock).length,
      byType,
    };
  }, [scanResult]);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center shadow-md">
              <HardHat className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Importar de Treck</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Ropa de seguridad, técnica, ignífuga y outdoor. Markup +{markupPercent}% aplicado automáticamente.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://www.treck.cl/home/vestuario" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />Ver sitio proveedor
            </a>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="import">
        <TabsList>
          <TabsTrigger value="import">
            <Download className="h-3.5 w-3.5 mr-1.5" />Importar catálogo
          </TabsTrigger>
          <TabsTrigger value="imported">
            <Package className="h-3.5 w-3.5 mr-1.5" />Ya importados ({imported.length})
          </TabsTrigger>
          <TabsTrigger value="automation">
            <Zap className="h-3.5 w-3.5 mr-1.5" />Automatización
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5 mr-1.5" />Historial
          </TabsTrigger>
        </TabsList>

        {/* ====================== TAB 1: IMPORTAR ====================== */}
        <TabsContent value="import" className="space-y-4 mt-4">
          {/* CONFIG */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-600">Desde offset</Label>
                <Input type="number" min={0} max={500} value={scanRange.from}
                  onChange={e => setScanRange(r => ({ ...r, from: Math.max(0, parseInt(e.target.value || 0, 10)) }))}
                  className="mt-1.5" />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-600">Hasta offset</Label>
                <Input type="number" min={0} max={500} value={scanRange.to}
                  onChange={e => setScanRange(r => ({ ...r, to: parseInt(e.target.value || 49, 10) }))}
                  className="mt-1.5" />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-600">Markup</Label>
                <div className="mt-1.5 relative">
                  <Input type="number" min={0} max={200} value={markupPercent}
                    onChange={e => setMarkupPercent(parseInt(e.target.value || 40, 10))} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-widest text-slate-600 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />IA Paraphrase
                </Label>
                <div className="mt-2 flex items-center gap-2 h-10">
                  <Switch checked={paraphrase} onCheckedChange={setParaphrase} />
                  <span className="text-xs text-slate-600">{paraphrase ? 'Activado' : 'Desactivado'}</span>
                </div>
              </div>
              <Button onClick={runScan} disabled={scanning}
                className="h-10 bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 text-white">
                {scanning
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Escaneando…</>
                  : <><Search className="h-4 w-4 mr-2" />Escanear catálogo</>}
              </Button>
            </div>

            {/* Presets rápidos */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 self-center mr-1">Presets:</span>
              {RANGE_PRESETS.map(preset => {
                const active = scanRange.from === preset.from && scanRange.to === preset.to && scanRange.full === preset.full;
                return (
                  <button
                    key={preset.label}
                    onClick={() => setScanRange(preset)}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                      active
                        ? 'bg-orange-100 border-orange-300 text-orange-800 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {scanResult?.totalInCatalog > 0 && (
                <span className="text-xs text-slate-500 self-center ml-2">
                  Total Treck: <b className="text-slate-800">{scanResult.totalInCatalog}</b> productos
                </span>
              )}
            </div>

            {scanning && (
              <div className="mt-3 rounded-md bg-orange-50 border border-orange-200 p-3 text-sm text-orange-900 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Escaneando {scanRange.full ? 'todo el catálogo' : `${scanRange.to - scanRange.from + 1} productos`} vía VTEX API con rate-limit cortés. Puede tomar 10-90 segundos…
              </div>
            )}
          </div>

          {/* STATS + FILTERS */}
          {scanResult && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: 'Encontrados',   value: stats.total,          color: 'from-slate-500 to-slate-700' },
                  { label: 'Nuevos',        value: stats.newOnes,        color: 'from-emerald-500 to-teal-600' },
                  { label: 'Ya importados', value: stats.alreadyImported, color: 'from-orange-500 to-rose-500' },
                  { label: 'Con stock',     value: stats.inStock,        color: 'from-blue-500 to-cyan-600' },
                  { label: 'Categorías',    value: Object.keys(stats.byType).length, color: 'from-amber-500 to-orange-500' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                    <div className={`text-2xl font-bold tracking-tight bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* FILTROS */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-slate-500" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Filtros:</span>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <Input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)}
                      className="pl-8 h-9 w-48 text-sm" />
                  </div>
                  <Select value={workwearFilter} onValueChange={setWorkwearFilter}>
                    <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas categorías</SelectItem>
                      {Object.entries(WORKWEAR_TYPE_META).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label} ({stats.byType[k] || 0})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas marcas</SelectItem>
                      {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={importFilter} onValueChange={setImportFilter}>
                    <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="new">Sólo nuevos</SelectItem>
                      <SelectItem value="existing">Ya importados</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={stockFilter} onValueChange={setStockFilter}>
                    <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todo stock</SelectItem>
                      <SelectItem value="in">Con stock</SelectItem>
                      <SelectItem value="out">Sin stock</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="ml-auto text-xs text-slate-500">
                    Mostrando <b className="text-slate-800">{filtered.length}</b> de {stats.total}
                    <span className="mx-2">·</span>
                    <b className="text-orange-600">{selectedIds.size}</b> seleccionados
                  </div>
                </div>
              </div>

              {/* ACTION BAR */}
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-rose-50 shadow-sm p-4">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline"
                    onClick={() => toggleAll(true)}
                    disabled={filtered.length === 0}>
                    Seleccionar todo ({filtered.length})
                  </Button>
                  <Button size="sm" variant="outline"
                    onClick={() => setSelectedIds(new Set(filtered.filter(p => !p.alreadyImported).map(p => p.supplierProductId)))}
                    disabled={filtered.length === 0}>
                    Sólo nuevos
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleAll(false)}
                    disabled={selectedIds.size === 0}>
                    Limpiar
                  </Button>
                </div>
                <div className="ml-auto flex items-center gap-2 text-sm text-slate-700">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                  Import cost estimado: ~$0.001 × <b>{selectedIds.size}</b> = <b className="font-mono">${(selectedIds.size * 0.001).toFixed(3)}</b> MiniMax
                </div>
                <Button onClick={runImport} disabled={importing || selectedIds.size === 0}
                  className="bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-700 hover:to-rose-700 text-white font-semibold">
                  {importing
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando…</>
                    : <><Download className="h-4 w-4 mr-2" />Importar {selectedIds.size} productos</>}
                </Button>
              </div>

              {/* PROGRESS BAR (durante import por chunks) */}
              {importing && importProgress && (
                <div className="rounded-2xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-white shadow-md p-5">
                  <div className="flex items-start gap-3">
                    <Loader2 className="h-6 w-6 text-orange-600 animate-spin shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <div>
                          <div className="font-bold text-orange-900">
                            Procesando chunk {importProgress.currentChunk} de {importProgress.totalChunks}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {importProgress.processed} de {importProgress.total} productos procesados
                            {' · '}
                            <b className="text-emerald-700">{importProgress.stats.created} creados</b>
                            {' · '}
                            <b className="text-blue-700">{importProgress.stats.updated} actualizados</b>
                            {importProgress.stats.failed > 0 && <> · <b className="text-rose-600">{importProgress.stats.failed} fallidos</b></>}
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-orange-700 font-mono">
                          {Math.round((importProgress.processed / importProgress.total) * 100)}%
                        </div>
                      </div>
                      <div className="mt-3 h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-orange-500 to-rose-500 transition-all duration-500 rounded-full"
                             style={{ width: `${(importProgress.processed / importProgress.total) * 100}%` }} />
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">
                        No cierres esta pestaña. Cada chunk procesa hasta {paraphrase ? 5 : 20} productos con IA + descarga de imágenes (~40-60s por chunk).
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* IMPORT RESULT */}
              {importResult && !importing && (
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm p-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-bold text-emerald-900">Importación completada</div>
                      <div className="mt-1 text-sm text-slate-700">
                        <b>{importResult.created}</b> creados · <b>{importResult.updated}</b> actualizados
                        {importResult.failed > 0 && <> · <b className="text-rose-600">{importResult.failed} fallaron</b></>}
                      </div>
                      <Button asChild size="sm" variant="outline" className="mt-3">
                        <Link href="/tienda" target="_blank"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Ver en la tienda</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((p) => {
                  const meta = WORKWEAR_TYPE_META[p.workwearType] || WORKWEAR_TYPE_META.otros;
                  const Icon = meta.icon;
                  const checked = selectedIds.has(p.supplierProductId);
                  return (
                    <label key={p.supplierProductId}
                      className={`group cursor-pointer rounded-2xl border-2 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden ${
                        checked ? 'border-orange-500 ring-2 ring-orange-200' : 'border-slate-200 hover:border-slate-300'
                      } ${p.alreadyImported ? 'opacity-90' : ''}`}>
                      <div className="relative aspect-square bg-slate-100">
                        {p.previewImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.previewImage} alt={p.shortName}
                            className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Package className="h-16 w-16 text-slate-300" />
                          </div>
                        )}
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleOne(p.supplierProductId)}
                          className="absolute top-2 left-2 h-5 w-5 bg-white border-slate-300 shadow"
                        />
                        <div className="absolute top-2 right-2 flex flex-col gap-1">
                          {p.alreadyImported && (
                            <Badge className="bg-orange-500 text-white border-0 shadow">Ya importado</Badge>
                          )}
                          {!p.hasStock && (
                            <Badge className="bg-rose-500 text-white border-0 shadow">Sin stock</Badge>
                          )}
                        </div>
                        <Badge className={`absolute bottom-2 left-2 ${meta.color} border shadow-sm inline-flex items-center gap-1`}>
                          <Icon className="h-3 w-3" />{meta.label}
                        </Badge>
                        <Badge className="absolute bottom-2 right-2 bg-white text-slate-700 border border-slate-200 shadow-sm">
                          {p.supplierBrand}
                        </Badge>
                      </div>
                      <div className="p-3">
                        <div className="text-[11px] text-slate-500 font-mono">ID {p.supplierProductId}{p.supplierCode ? ` · ${p.supplierCode}` : ''}</div>
                        <div className="mt-0.5 font-semibold text-slate-900 text-sm line-clamp-2 min-h-[2.5rem]">{p.shortName}</div>
                        <div className="mt-2 flex items-baseline justify-between">
                          <div>
                            <div className="text-[11px] text-slate-500">Proveedor</div>
                            <div className="text-sm font-mono text-slate-700 line-through">{formatCLP(p.priceWholesale)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] text-orange-600 font-semibold">Con +{markupPercent}%</div>
                            <div className="text-lg font-mono font-bold text-orange-700">{formatCLP(p.finalPrice)}</div>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="inline-flex items-center gap-1" title="colores"><Palette className="h-3 w-3" />{p.colorsCount}</span>
                          <span className="inline-flex items-center gap-1" title="tallas"><Ruler className="h-3 w-3" />{p.sizesCount}</span>
                          <span className="inline-flex items-center gap-1" title="fotos"><Layers className="h-3 w-3" />{p.totalImages}</span>
                          <a href={p.supplierUrl} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="ml-auto text-orange-600 hover:text-orange-700 inline-flex items-center gap-0.5">
                            Ver <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {filtered.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <AlertCircle className="h-8 w-8 mx-auto text-slate-400" />
                  <p className="mt-2 text-sm text-slate-600">Ningún producto coincide con los filtros.</p>
                </div>
              )}
            </>
          )}

          {!scanResult && !scanning && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <HardHat className="h-10 w-10 mx-auto text-slate-400" />
              <div className="mt-3 font-semibold text-slate-800">Escanea el catálogo de Treck</div>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Treck usa VTEX. El sistema paginará automáticamente el catálogo /vestuario (448 productos)
                trayendo nombre, marca, tallas, colores, fotos y precio. Con el preset &quot;Vista rápida&quot; obtienes
                los primeros 50 productos en pocos segundos.
              </p>
            </div>
          )}
        </TabsContent>

        {/* ====================== TAB 2: YA IMPORTADOS ====================== */}
        <TabsContent value="imported" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Productos sincronizados con Treck</h2>
              <p className="text-xs text-slate-500 mt-0.5">Total: <b>{imported.length}</b> productos</p>
            </div>
            <Button onClick={runRefreshPrices} disabled={refreshing || imported.length === 0}
              variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50">
              {refreshing
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Actualizando…</>
                : <><RefreshCw className="h-4 w-4 mr-2" />Actualizar precios</>}
            </Button>
          </div>

          {imported.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <Package className="h-8 w-8 mx-auto text-slate-400" />
              <p className="mt-2 text-sm text-slate-500">Aún no has importado productos. Ve al tab &quot;Importar catálogo&quot;.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-500 font-semibold">
                  <tr>
                    <th className="text-left px-4 py-3">Producto</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Marca</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Tipo</th>
                    <th className="text-right px-4 py-3">Costo</th>
                    <th className="text-right px-4 py-3">Venta</th>
                    <th className="text-right px-4 py-3 hidden lg:table-cell">Margen</th>
                    <th className="text-center px-4 py-3">Estado</th>
                    <th className="text-right px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {imported.map(p => {
                    const wtype = p.workwearType || p.subcategory || 'otros';
                    const meta = WORKWEAR_TYPE_META[wtype] || WORKWEAR_TYPE_META.otros;
                    return (
                      <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-md bg-slate-100 overflow-hidden shrink-0">
                              {p.images?.[0] && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 line-clamp-1">{p.name}</div>
                              <div className="text-[11px] text-slate-500 font-mono">ID {p.supplierProductId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-slate-700">{p.supplierBrand}</td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <Badge className={`${meta.color} border`}>{meta.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{formatCLP(p.supplierPrice)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-orange-700">{formatCLP(p.basePrice)}</td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-bold">
                            +{p.markupPercent}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.active
                            ? <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200">Activo</Badge>
                            : <Badge className="bg-slate-100 text-slate-700 border">Inactivo</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/producto/${p.slug}`} target="_blank">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ====================== TAB 3: AUTOMATIZACIÓN ====================== */}
        <TabsContent value="automation" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={`rounded-2xl border shadow-sm p-6 transition-colors ${
              cronSettings?.enabled
                ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
                : 'border-slate-200 bg-gradient-to-br from-slate-50 to-white'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                  cronSettings?.enabled ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'
                }`}>
                  {cronSettings?.enabled ? <Power className="h-5 w-5 text-white" /> : <PowerOff className="h-5 w-5 text-white" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900">Actualización automática de precios</h3>
                    {cronSettings === null
                      ? <Badge className="bg-slate-200 text-slate-700 border-0"><Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />Cargando</Badge>
                      : cronSettings.enabled
                      ? <Badge className="bg-emerald-500 text-white border-0">Activo</Badge>
                      : <Badge className="bg-slate-400 text-white border-0">Pausado</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Ejecuta refresh vía VTEX API para todos los productos Treck importados. Actualiza sólo
                    precios (no descripciones ni fotos).
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-white/70 border border-slate-200 px-4 py-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Horario</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {cronSettings?.humanSchedule || 'Diariamente a las 00:45 hrs Chile'}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">cron: {cronSettings?.schedule || '45 3 * * *'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 font-semibold">
                      {cronSettings?.enabled ? 'ON' : 'OFF'}
                    </span>
                    <Switch
                      checked={!!cronSettings?.enabled}
                      onCheckedChange={toggleCron}
                      disabled={cronToggling || cronSettings === null}
                    />
                  </div>
                </div>

                {cronSettings?.lastRunAt && (
                  <div className="rounded-lg bg-white/70 border border-slate-200 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Última ejecución</div>
                    <div className="mt-1 text-sm text-slate-800">
                      {new Date(cronSettings.lastRunAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                    {cronSettings.lastRunStats && (
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-600">
                        <span>Actualizados: <b>{cronSettings.lastRunStats.updated || 0}</b></span>
                        <span>Sin cambios: <b>{cronSettings.lastRunStats.unchanged || 0}</b></span>
                        {cronSettings.lastRunStats.failed > 0 && (
                          <span className="text-rose-600">Fallidos: <b>{cronSettings.lastRunStats.failed}</b></span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={runRefreshPrices}
                  disabled={refreshing || imported.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {refreshing
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ejecutando refresh…</>
                    : <><RefreshCw className="h-4 w-4 mr-2" />Ejecutar ahora ({imported.length} productos)</>}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white shadow-sm p-6">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Boxes className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900">Inventario comercial</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Crea automáticamente registros de stock para cada variante (color × talla) de productos
                    importados, marcados como <b>Bajo pedido · Treck</b>.
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-white/70 border border-slate-200 px-4 py-3 text-sm">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Cómo funciona</div>
                  <ul className="text-slate-700 space-y-1 text-xs list-disc pl-4">
                    <li>Cada variante (por ejemplo Talla L · Azul) recibe stock inicial de <b>99 unidades</b>.</li>
                    <li>No sobrescribe stock ajustado manualmente.</li>
                    <li>Los productos aparecen en <code className="font-mono bg-slate-100 px-1 rounded">/inventario</code> como &quot;on-demand&quot;.</li>
                    <li>Cuando un cliente compra, tu pedido a Treck se hace en el mismo momento.</li>
                  </ul>
                </div>

                <Button
                  onClick={syncInventory}
                  disabled={syncingInventory || imported.length === 0}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {syncingInventory
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sincronizando…</>
                    : <><Boxes className="h-4 w-4 mr-2" />Sincronizar inventario ({imported.length} productos)</>}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                <b>Modelo bajo pedido:</b> Los productos Treck se ordenan a tu proveedor cuando un cliente
                compra. No necesitas mantener stock físico. El cron diario verifica cambios de precio en
                treck.cl (VTEX API) y ajusta automáticamente el precio de venta (con markup +40%).
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ====================== TAB 4: HISTORIAL ====================== */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <h2 className="font-bold text-slate-900">Últimas 20 operaciones</h2>
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <History className="h-8 w-8 mx-auto text-slate-400" />
              <p className="mt-2 text-sm text-slate-500">Aún no hay historial.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    h.type === 'refresh_prices'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {h.type === 'refresh_prices' ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">
                      {h.type === 'refresh_prices' ? 'Actualización de precios' : 'Import de productos'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {new Date(h.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                    <div className="mt-1 text-sm text-slate-700 flex flex-wrap gap-3">
                      {h.stats && (
                        <>
                          {'created' in h.stats && <span>Creados: <b>{h.stats.created}</b></span>}
                          {'updated' in h.stats && <span>Actualizados: <b>{h.stats.updated}</b></span>}
                          {'unchanged' in h.stats && <span>Sin cambios: <b>{h.stats.unchanged}</b></span>}
                          {'failed' in h.stats && h.stats.failed > 0 && <span className="text-rose-600">Fallidos: <b>{h.stats.failed}</b></span>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
