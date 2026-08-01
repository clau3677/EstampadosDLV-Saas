'use client';

import { useState, useRef, useEffect } from 'react';

import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Layers, Upload, Trash2, Copy, RotateCw,
  Zap, AlertTriangle, CheckCircle2, Loader2, Wand2, Plus,
  ShoppingCart, Ruler, Sparkles, Scissors, Undo2, Redo2, Keyboard,
  Magnet, ZoomIn, ZoomOut, RotateCcw as ZoomReset, MousePointer2, Eye,
  Type, Library, AlignLeft, AlignCenter, AlignRight,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import GangSheetCanvas from '@/components/gang-sheet-canvas-wrapper';
import { RemoveBgButton } from '@/components/remove-bg-button';
import { useGangSheet } from '@/lib/gang-sheet-store';
import { PRICING } from '@/lib/pricing';
import { formatCLP, formatNumber } from '@/lib/format';
import { trimTransparentPixels, loadImageFromDataUrl } from '@/lib/gang-sheet/trim-transparency';
import DraftsButton from '@/components/gang-sheet-drafts-button';
import PreviewModal from '@/components/gang-sheet-preview-modal';
import TextToolModal from '@/components/gang-sheet-text-tool';
import DesignLibraryPicker from '@/components/gang-sheet-library-picker';

// ============================================================================
// MODAL DE SELECCIÓN INICIAL (bloquea el editor hasta que se elija el equipo)
// Lee dinámicamente todos los equipos activos desde /api/printers
// ============================================================================
function SetupModal({ onSelect }) {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/printers?active=true');
        if (r.ok && alive) {
          const list = await r.json();
          setPrinters(Array.isArray(list) ? list : []);
        }
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-8 py-6 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-md">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Elige tu equipo de impresión</h2>
              <p className="text-sm text-slate-500">Cada máquina tiene un ancho útil máximo. No podrás cambiar este valor después.</p>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="h-40 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando equipos…
          </div>
        ) : printers.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-slate-500 text-sm mb-2">No hay equipos activos configurados.</div>
            <Link href="/admin/configuracion" className="text-orange-600 text-sm font-semibold hover:underline">
              → Configurar equipos
            </Link>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {printers.map((p) => (
              <button
                key={p.id || p.code}
                onClick={() => onSelect(p)}
                className="group text-left rounded-xl border border-slate-200 hover:border-orange-400 hover:shadow-xl bg-white p-5 transition-all"
              >
                <div className={`h-11 w-11 rounded-lg bg-gradient-to-br ${p.color || 'from-slate-500 to-slate-700'} flex items-center justify-center shadow-md`}>
                  <Ruler className="h-5 w-5 text-white" />
                </div>
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900">{p.label}</h3>
                  {p.type === 'dtf_uv' && <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px]">UV</Badge>}
                </div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">Ancho útil {(p.widthMm/10).toFixed(0)} cm</div>
                {p.notes && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{p.notes}</p>}
                <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600 space-y-0.5">
                  <div><span className="font-mono font-semibold">{formatCLP(p.pricePerMm * 1000)}</span> / metro</div>
                  <div>Mínimo <span className="font-mono font-semibold">{(p.minLengthMm || 100) / 10} cm</span></div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.supportsWhite && <Badge variant="outline" className="text-[9px] h-4 px-1">Canal blanco</Badge>}
                    {p.supportsVarnish && <Badge variant="outline" className="text-[9px] h-4 px-1">Barniz UV</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PANEL DE UPLOAD (drag & drop + click)
// ============================================================================
function Uploader({ onFile }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const handleFiles = async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name}: sólo imágenes`);
        continue;
      }
      onFile(file);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handleFiles(Array.from(e.dataTransfer.files));
      }}
      onClick={() => inputRef.current?.click()}
      className={`
        cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all
        ${drag ? 'border-orange-500 bg-orange-50' : 'border-slate-300 hover:border-orange-400 hover:bg-slate-50'}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />
      <div className="h-10 w-10 rounded-lg bg-orange-500/10 text-orange-600 mx-auto flex items-center justify-center">
        <Upload className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-medium text-slate-900">Arrastra tus diseños aquí</div>
      <div className="text-xs text-slate-500 mt-0.5">o haz clic para seleccionar · PNG, JPG, WEBP</div>
    </div>
  );
}

// ============================================================================
// PÁGINA PRINCIPAL
// ============================================================================
export default function GangSheetPage() {
  const {
    mode, printerCode, printerData, canvasWidthMm, designs, selectedId, selectedIds, express,
    manualLengthMm,
    setMode, addDesign, removeDesign, removeMany, duplicate, duplicateNTimes, rotate90,
    select, selectAll, setExpress, autoArrange, resolveOverlaps, currentQuote, effectiveDpi, designWarnings,
    computedLengthMm, setManualLengthMm, reset,
    undo, redo, canUndo, canRedo,
    applyTrimResult, hasOverlaps, detectOverlaps, moveSelected,
    // Sprint 2
    snapEnabled, snapGridMm, setSnapEnabled, setSnapGridMm,
    zoom, zoomIn, zoomOut, zoomReset,
    // Sprint 4
    alignSelected,
    // Sprint 5 — QualityScorecard + Gap dinámico
    qualityScore, canSubmit, nestGapMm, setNestGap,
  } = useGangSheet();

  const [uploading, setUploading] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [autofill, setAutofill] = useState({ count: 6, gap: 5 });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [textToolOpen, setTextToolOpen] = useState(false);
  const overlapping = detectOverlaps();
  const multiSelectCount = selectedIds?.length || 0;
  const lowDpiCount = designs.filter(d => effectiveDpi(d) < 300).length;
  const quality = qualityScore();

  // ==========================================================================
  // Carga un borrador guardado en localStorage al builder actual (K)
  // ==========================================================================
  const loadDraft = async (draft) => {
    // 1. Cambiar el modo/printer si es diferente
    if (draft.printerCode && draft.printerCode !== printerCode) {
      try {
        const r = await fetch(`/api/printers?active=true`);
        const list = await r.json();
        const p = Array.isArray(list) ? list.find(x => x.code === draft.printerCode) : null;
        if (p) setMode(p);
      } catch { /* keep current mode */ }
    }
    // 2. Limpiar diseños actuales (sin borrar historia — el usuario puede undo)
    useGangSheet.setState({ designs: [], selectedId: null, selectedIds: [] });

    // 3. Pre-cargar cada imagen y agregarla
    for (const d of draft.designs) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          addDesign({
            imageUrl: d.imageUrl,
            name: d.name,
            srcWidthPx: d.srcWidthPx,
            srcHeightPx: d.srcHeightPx,
            dpiOriginal: d.dpiOriginal,
            image: img,
          });
          // Sobrescribir posición/tamaño/rotación con los del draft
          const st = useGangSheet.getState();
          const justAddedId = st.designs[st.designs.length - 1]?.id;
          if (justAddedId) {
            useGangSheet.getState().updateDesignLive(justAddedId, {
              xMm: d.xMm, yMm: d.yMm,
              widthMm: d.widthMm, heightMm: d.heightMm,
              rotation: d.rotation || 0,
            });
          }
          resolve();
        };
        img.onerror = () => {
          console.warn(`No se pudo cargar imagen del draft: ${d.imageUrl}`);
          resolve();
        };
        img.src = d.imageUrl;
      });
    }
    // Deseleccionar
    select(null);
  };

  // Preload de HTMLImageElement al agregar un diseño
  const handleFile = async (file) => {
    setUploading((n) => n + 1);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/uploads/design', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('upload failed');
      const data = await r.json();

      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        addDesign({
          imageUrl: data.url,
          name: data.originalName,
          srcWidthPx: data.widthPx,
          srcHeightPx: data.heightPx,
          dpiOriginal: data.dpi,
          image: img,
        });
        toast.success(`${data.originalName} agregado`, {
          description: data.upscaled
            ? `${data.originalWidthPx}×${data.originalHeightPx}px → ${data.widthPx}×${data.heightPx}px · Auto-mejorada a 300 DPI (${data.upscaleFactor}×)`
            : `${data.widthPx}×${data.heightPx}px · 300 DPI`,
        });
      };
      img.onerror = () => toast.error('No se pudo cargar la imagen');
      img.src = data.url;
    } catch (e) {
      toast.error('Error al subir imagen', { description: e.message });
    } finally {
      setUploading((n) => n - 1);
    }
  };

  // ==========================================================================
  // TRIM TRANSPARENT PIXELS (B) — client-side, sin llamada al servidor
  // ==========================================================================
  const handleTrim = async () => {
    if (!selectedId) return;
    const src = designs.find(d => d.id === selectedId);
    if (!src) return;
    setTrimming(true);
    try {
      const result = await trimTransparentPixels(src.imageUrl);
      if (!result) {
        toast.warning('La imagen está 100% transparente — nada que recortar');
        return;
      }
      if (result.skipped) {
        toast.info('La imagen ya está optimizada', { description: `Ahorro < 1%` });
        return;
      }
      const newImg = await loadImageFromDataUrl(result.dataUrl);
      applyTrimResult(selectedId, result, newImg);
      const savedPct = Math.round(result.savedPct * 100);
      toast.success('Bordes transparentes recortados', {
        description: `Ahorro ${savedPct}% · ${result.originalWidthPx}×${result.originalHeightPx}px → ${result.widthPx}×${result.heightPx}px`,
      });
    } catch (e) {
      toast.error('No se pudo recortar la imagen', { description: e.message });
    } finally {
      setTrimming(false);
    }
  };

  // ==========================================================================
  // KEYBOARD SHORTCUTS (F)
  //   • Delete / Backspace      → eliminar seleccionado
  //   • Ctrl+Z                  → undo
  //   • Ctrl+Y / Ctrl+Shift+Z   → redo
  //   • Ctrl+D                  → duplicar seleccionado
  //   • Escape                  → deseleccionar
  //   • Flechas                 → mover seleccionado 1mm
  //   • Shift+Flechas           → mover 10mm
  // ==========================================================================
  useEffect(() => {
    const onKey = (e) => {
      // No interceptar si el foco está en un input/textarea
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Undo / Redo (global, no requiere selección)
      if (ctrl && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if (ctrl && ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
        e.preventDefault(); redo(); return;
      }
      // (E) Ctrl+A → seleccionar todo
      if (ctrl && (e.key === 'a' || e.key === 'A')) {
        if (designs.length === 0) return;
        e.preventDefault(); selectAll(); return;
      }
      if (e.key === 'Escape') { select(null); return; }

      // Acciones que requieren selección
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        // (E) Si hay multi-select, borrar todos
        if (selectedIds && selectedIds.length > 1) removeMany(selectedIds);
        else removeDesign(selectedId);
        return;
      }
      if (ctrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault(); duplicate(selectedId); return;
      }
      // Movimiento por flechas
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowUp')    { e.preventDefault(); moveSelected(0, -step); return; }
      if (e.key === 'ArrowDown')  { e.preventDefault(); moveSelected(0, +step); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSelected(-step, 0); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); moveSelected(+step, 0); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, selectedIds, designs.length, removeDesign, removeMany, undo, redo, duplicate, moveSelected, select, selectAll]);

  const q = currentQuote();
  const selected = designs.find(d => d.id === selectedId);

  const confirmOrder = async () => {
    if (designs.length === 0) return toast.error('Agrega al menos un diseño');
    setSubmitting(true);
    try {
      const r = await fetch('/api/gang-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          printerCode,       // enviamos también el code del printer dinámico
          canvasWidthMm,
          express,
          designs: designs.map(d => ({
            imageUrl: d.imageUrl,
            name: d.name,
            srcWidthPx: d.srcWidthPx,
            srcHeightPx: d.srcHeightPx,
            xMm: d.xMm, yMm: d.yMm, widthMm: d.widthMm, heightMm: d.heightMm,
            rotation: d.rotation,
          })),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      toast.success('¡Pedido creado!', {
        description: `${data.orderNumber} · ${formatCLP(data.total)} · Enviado a ${data.printerLabel}`,
        action: {
          label: 'Ver pedido',
          onClick: () => { window.location.href = `/admin/pedidos?highlight=${data.orderNumber}`; },
        },
      });
      // Limpiar el lienzo tras confirmar el pedido para no crear duplicados
      reset();
      setPreviewOpen(false);
    } catch (e) {
      toast.error('Error al crear pedido', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mode) return <SetupModal onSelect={setMode} />;

  // Resolver cfg de forma dinámica: printerData tiene prioridad, PRICING como fallback
  const cfg = printerData
    ? {
        label: `${printerData.label} · ${(printerData.widthMm/10).toFixed(0)} cm`,
        color: printerData.color || 'from-slate-500 to-slate-700',
      }
    : (PRICING[mode] || { label: mode, color: 'from-slate-500 to-slate-700' });

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" />Panel Admin
        </Link>
        <span className="text-slate-300">/</span>
        <div className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${cfg.color} flex items-center justify-center`}>
            <Layers className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900">Gang Sheet Builder</div>
            <div className="text-xs text-slate-500">{cfg.label} · Ancho máx {(canvasWidthMm/10).toFixed(0)} cm</div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* (H) Zoom controls */}
          <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden shadow-sm bg-white">
            <button type="button" onClick={zoomOut} title="Alejar (Ctrl+Rueda)"
              className="px-2 h-8 text-slate-700 hover:bg-slate-50 border-r border-slate-200">
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={zoomReset} title="Restablecer zoom"
              className="px-2 h-8 text-[11px] font-mono font-semibold text-slate-700 hover:bg-slate-50 border-r border-slate-200 min-w-[46px]">
              {Math.round((zoom || 1) * 100)}%
            </button>
            <button type="button" onClick={zoomIn} title="Acercar (Ctrl+Rueda)"
              className="px-2 h-8 text-slate-700 hover:bg-slate-50">
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* (G) Snap-to-grid */}
          <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden shadow-sm bg-white">
            <button
              type="button"
              onClick={() => setSnapEnabled(!snapEnabled)}
              title={snapEnabled ? `Snap ON — grilla ${snapGridMm}mm` : 'Activar snap-to-grid'}
              className={`px-2 h-8 border-r border-slate-200 transition-colors ${snapEnabled ? 'bg-orange-500 text-white' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              <Magnet className="h-3.5 w-3.5" />
            </button>
            <select
              value={snapGridMm}
              onChange={(e) => setSnapGridMm(e.target.value)}
              disabled={!snapEnabled}
              className="h-8 px-1 text-[11px] font-mono bg-white text-slate-700 outline-none disabled:opacity-40"
            >
              {[1, 2, 5, 10, 20].map(v => <option key={v} value={v}>{v}mm</option>)}
            </select>
          </div>

          {/* Undo / Redo (F) */}
          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo()}
              title="Deshacer (Ctrl+Z)"
              className="px-2.5 h-8 text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-white transition-colors border-r border-slate-200"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo()}
              title="Rehacer (Ctrl+Y)"
              className="px-2.5 h-8 text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-white transition-colors"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* (K) Drafts (guardar/cargar borradores) */}
          <DraftsButton
            store={{ mode, printerCode, canvasWidthMm, designs }}
            onLoad={loadDraft}
          />

          <Button variant="outline" size="sm" onClick={() => autoArrange()} disabled={designs.length === 0} title="Auto-organizar con nesting inteligente (rotación automática)">
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />Auto-organizar
          </Button>

          {/* (G) Gap dinámico para auto-nesting */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <label htmlFor="nest-gap" className="whitespace-nowrap">Gap:</label>
            <select
              id="nest-gap"
              value={nestGapMm}
              onChange={(e) => setNestGap(Number(e.target.value))}
              className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              title="Espacio entre diseños al auto-organizar. 0mm para corte preciso, 5mm para seguridad."
            >
              <option value={0}>0 mm</option>
              <option value={1}>1 mm</option>
              <option value={2}>2 mm</option>
              <option value={3}>3 mm</option>
              <option value={5}>5 mm</option>
              <option value={10}>10 mm</option>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => useGangSheet.getState().reset()}>Cambiar modo</Button>
        </div>
      </div>

      {/* (E) Banner de multi-select con acciones de alineación (P) */}
      {multiSelectCount > 1 && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 flex flex-wrap items-center gap-3 text-sm">
          <MousePointer2 className="h-4 w-4 text-orange-600" />
          <span className="font-semibold text-orange-900">
            {multiSelectCount} diseños seleccionados
          </span>

          {/* (P) Alignment tools */}
          <div className="inline-flex rounded-md border border-orange-300 overflow-hidden bg-white shadow-sm">
            <button type="button" onClick={() => alignSelected('left')} title="Alinear a la izquierda"
              className="px-2 h-8 text-slate-700 hover:bg-orange-50 border-r border-orange-200"><AlignLeft className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => alignSelected('center-h')} title="Centrar horizontal"
              className="px-2 h-8 text-slate-700 hover:bg-orange-50 border-r border-orange-200"><AlignCenter className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => alignSelected('right')} title="Alinear a la derecha"
              className="px-2 h-8 text-slate-700 hover:bg-orange-50 border-r border-orange-200"><AlignRight className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => alignSelected('top')} title="Alinear arriba"
              className="px-2 h-8 text-slate-700 hover:bg-orange-50 border-r border-orange-200"><AlignStartVertical className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => alignSelected('center-v')} title="Centrar vertical"
              className="px-2 h-8 text-slate-700 hover:bg-orange-50 border-r border-orange-200"><AlignCenterVertical className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => alignSelected('bottom')} title="Alinear abajo"
              className="px-2 h-8 text-slate-700 hover:bg-orange-50 border-r border-orange-200"><AlignEndVertical className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => alignSelected('distribute-h')} disabled={multiSelectCount < 3}
              title="Distribuir horizontalmente (requiere 3+)"
              className="px-2 h-8 text-slate-700 hover:bg-orange-50 border-r border-orange-200 disabled:text-slate-300 disabled:hover:bg-white">
              <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => alignSelected('distribute-v')} disabled={multiSelectCount < 3}
              title="Distribuir verticalmente (requiere 3+)"
              className="px-2 h-8 text-slate-700 hover:bg-orange-50 disabled:text-slate-300 disabled:hover:bg-white">
              <AlignVerticalDistributeCenter className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => removeMany(selectedIds)} className="border-rose-300 text-rose-700 hover:bg-rose-100">
              <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar {multiSelectCount}
            </Button>
            <Button size="sm" variant="outline" onClick={() => select(null)}>Deseleccionar</Button>
          </div>
        </div>
      )}

      {/* Banner de solapamiento (D) */}
      {overlapping.size > 0 && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 flex items-start gap-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-rose-900">
              {overlapping.size} diseño{overlapping.size === 1 ? '' : 's'} se está{overlapping.size === 1 ? '' : 'n'} solapando
            </div>
            <div className="text-xs text-rose-700 mt-0.5">
              Los bordes rojos punteados indican los diseños afectados. Sepáralos manualmente o usa <b>Auto-organizar</b>.
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => resolveOverlaps()} className="border-rose-300 text-rose-700 hover:bg-rose-100">
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />Resolver
          </Button>
        </div>
      )}

      {/* Layout: Canvas + Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-4">
        {/* CANVAS */}
        <div className="space-y-3">
          <GangSheetCanvas />

          {/* Toolbar del diseño seleccionado */}
          {selected && (
            <Card className="border-slate-200/70">
              <CardContent className="p-3 space-y-3">
                {/* Fila 1: identidad + acciones rápidas */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Seleccionado</div>
                  <div className="text-sm font-medium text-slate-900 truncate max-w-[180px]">{selected.name}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    {selected.widthMm}×{selected.heightMm}mm · {effectiveDpi(selected)} DPI
                  </div>
                  {designWarnings(selected).length > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />{designWarnings(selected)[0].msg}
                    </Badge>
                  )}
                  {overlapping.has(selected.id) && (
                    <Badge variant="secondary" className="bg-rose-100 text-rose-800 border border-rose-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />Solapado
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-1 flex-wrap">
                    <RemoveBgButton
                      imageUrl={selected.imageUrl}
                      onDone={(data) => {
                        const img = new window.Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => {
                          useGangSheet.getState().updateDesign(selected.id, {
                            imageUrl: data.url,
                            srcWidthPx: data.widthPx,
                            srcHeightPx: data.heightPx,
                            image: img,
                          });
                        };
                        img.src = data.url;
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTrim}
                      disabled={trimming || selected._trimmed}
                      title="Recorta píxeles transparentes de los bordes"
                    >
                      {trimming ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Scissors className="h-3.5 w-3.5 mr-1" />}
                      {selected._trimmed ? 'Ya recortado' : 'Trim'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => rotate90(selected.id)}>
                      <RotateCw className="h-3.5 w-3.5 mr-1" />90°
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => duplicate(selected.id)}>
                      <Copy className="h-3.5 w-3.5 mr-1" />Duplicar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => removeDesign(selected.id)} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar
                    </Button>
                  </div>
                </div>

                {/* Fila 2: Autofill (A) — imposición automática de N copias */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-semibold text-slate-700">Autofill</span>
                  </div>
                  <label className="text-xs text-slate-600 flex items-center gap-1">
                    Copias
                    <input
                      type="number"
                      min={1} max={100}
                      value={autofill.count}
                      onChange={(e) => setAutofill(a => ({ ...a, count: Math.max(1, Math.min(100, parseInt(e.target.value || '1', 10))) }))}
                      className="w-14 h-7 px-1.5 rounded border border-slate-300 text-sm font-mono focus:outline-none focus:border-orange-400"
                    />
                  </label>
                  <label className="text-xs text-slate-600 flex items-center gap-1">
                    Gap
                    <input
                      type="number"
                      min={0} max={50}
                      value={autofill.gap}
                      onChange={(e) => setAutofill(a => ({ ...a, gap: Math.max(0, Math.min(50, parseInt(e.target.value || '0', 10))) }))}
                      className="w-12 h-7 px-1.5 rounded border border-slate-300 text-sm font-mono focus:outline-none focus:border-orange-400"
                    />
                    <span>mm</span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      duplicateNTimes(selected.id, autofill.count, autofill.gap);
                      toast.success(`${autofill.count} copias imposadas`, { description: `Gap ${autofill.gap}mm` });
                    }}
                    disabled={autofill.count < 1}
                    className="border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />Imposar {autofill.count}×
                  </Button>
                  <span className="text-[10px] text-slate-500 italic ml-auto">
                    Llena filas hasta el ancho del lienzo
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* PANEL DERECHO */}
        <div className="space-y-4">
          {/* Upload + Texto + Biblioteca (N + O) */}
          <Card className="border-slate-200/70">
            <CardContent className="p-4 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Agregar diseños</div>
              <Uploader onFile={handleFile} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => setTextToolOpen(true)}>
                  <Type className="h-3.5 w-3.5 mr-1.5" />Añadir Texto
                </Button>
                <DesignLibraryPicker onSelect={addDesign} />
              </div>
              {uploading > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                  Procesando {uploading} archivo{uploading !== 1 && 's'}…
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lista de diseños (J - Layers panel mejorado) */}
          {designs.length > 0 && (
            <Card className="border-slate-200/70">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Capas ({designs.length})
                  </div>
                  {designs.length > 1 && (
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-[10px] font-mono text-slate-500 hover:text-orange-600"
                    >
                      Seleccionar todo
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                  {designs.map((d, idx) => {
                    const dpi = effectiveDpi(d);
                    const warns = designWarnings(d);
                    const isSel = selectedIds?.includes(d.id) || selectedId === d.id;
                    const isOverlap = overlapping.has(d.id);
                    return (
                      <div
                        key={d.id}
                        onClick={(e) => {
                          const additive = e.ctrlKey || e.metaKey || e.shiftKey;
                          select(d.id, additive ? 'toggle' : 'replace');
                        }}
                        className={`group flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                          isSel ? 'border-orange-400 bg-orange-50 shadow-sm' :
                          isOverlap ? 'border-rose-300 bg-rose-50/40' :
                          'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="text-[10px] font-mono text-slate-400 w-4 text-right">{idx + 1}</div>
                        <img src={d.imageUrl} alt="" className="h-9 w-9 object-contain rounded bg-white border border-slate-200 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{d.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                            <span>{d.widthMm}×{d.heightMm}mm</span>
                            {d.rotation ? <span className="text-orange-600">↻{d.rotation}°</span> : null}
                            {d._trimmed && <Scissors className="h-2.5 w-2.5 text-emerald-600" />}
                            {isOverlap && <span className="text-rose-600 font-bold">⚠</span>}
                          </div>
                        </div>
                        <span className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded ${
                          dpi >= 300 ? 'bg-emerald-100 text-emerald-700' :
                          dpi >= 200 ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {dpi}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); duplicate(d.id); }}
                            title="Duplicar"
                            className="h-6 w-6 rounded flex items-center justify-center text-slate-500 hover:text-orange-600 hover:bg-white"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeDesign(d.id); }}
                            title="Eliminar"
                            className="h-6 w-6 rounded flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-white"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cotización en vivo */}
          <Card className="border-orange-200/70 bg-gradient-to-br from-orange-50/50 to-rose-50/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-orange-500" />
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-700">Cotización en vivo</div>
              </div>

              {q ? (
                <>
                  {/* Control de largo del lienzo */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Largo del lienzo</span>
                        {manualLengthMm && <span className="text-[9px] bg-orange-100 text-orange-700 rounded px-1 font-mono">MANUAL</span>}
                      </div>
                      {manualLengthMm && (
                        <button
                          type="button"
                          onClick={() => setManualLengthMm(null)}
                          className="text-[10px] text-slate-500 hover:text-orange-600 underline underline-offset-2"
                        >
                          restablecer
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={10}
                        max={500}
                        step={5}
                        value={Math.round(computedLengthMm() / 10)}
                        onChange={(e) => setManualLengthMm(parseInt(e.target.value || '0', 10) * 10)}
                        className="w-20 h-8 rounded-md border border-slate-300 px-2 text-sm font-mono focus:outline-none focus:border-orange-400"
                      />
                      <span className="text-xs text-slate-600">cm</span>
                      <div className="flex-1 flex gap-1 justify-end">
                        {[50, 100, 150, 200].map(cm => (
                          <button
                            key={cm}
                            type="button"
                            onClick={() => setManualLengthMm(cm * 10)}
                            className={`h-6 px-1.5 text-[10px] rounded border transition-all font-mono ${
                              Math.round(computedLengthMm() / 10) === cm
                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                : 'border-slate-200 hover:border-slate-400 text-slate-600'
                            }`}
                          >
                            {cm}cm
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-tight">
                      Ajusta el pliego según tu producción. <b>El cobro es solo por el contenido real</b> abajo.
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Ancho útil</span>
                    <span className="font-mono font-semibold">{(canvasWidthMm/10).toFixed(0)} cm</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600 mt-1">
                    <span>Largo pliego</span>
                    <span className="font-mono font-semibold">{(computedLengthMm()/10).toFixed(0)} cm</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600 mt-1">
                    <span>Largo cobrado {q.billableMm > q.lengthMm && <span className="text-[10px] text-amber-600">(mín.)</span>}</span>
                    <span className="font-mono font-semibold text-emerald-700">{(q.billableMm/10).toFixed(1)} cm</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600 mt-1">
                    <span>Tarifa</span>
                    <span className="font-mono font-semibold">{formatCLP((q.pricePerMm || 0) * 1000)}/m</span>
                  </div>

                  <div className="my-3 h-px bg-slate-200" />

                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span>Subtotal</span>
                    <span className="font-mono">{formatCLP(q.subtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <Zap className={`h-3.5 w-3.5 ${express ? 'text-orange-500' : 'text-slate-400'}`} />
                      <span className="text-sm text-slate-700">Exprés (+30%)</span>
                    </div>
                    <Switch checked={express} onCheckedChange={setExpress} />
                  </div>

                  {express && (
                    <div className="flex items-center justify-between text-sm text-orange-700 mt-1">
                      <span>Recargo exprés</span>
                      <span className="font-mono">+{formatCLP(q.surcharge)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm text-slate-600 mt-2">
                    <span>IVA 19%</span>
                    <span className="font-mono">{formatCLP(q.tax)}</span>
                  </div>

                  <div className="my-3 h-px bg-slate-200" />

                  <div className="flex items-end justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-700">Total</span>
                    <span className="text-2xl font-bold text-slate-900 font-mono">{formatCLP(q.total)}</span>
                  </div>

                  {/* (Q) QualityScorecard — Barra de calidad en tiempo real */}
                  {designs.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Calidad del pliego</span>
                        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                          quality.status === 'perfect' ? 'bg-emerald-100 text-emerald-700' :
                          quality.status === 'good'    ? 'bg-blue-100 text-blue-700' :
                          quality.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                                                         'bg-rose-100 text-rose-700'
                        }`}>
                          {quality.score}%
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            quality.status === 'perfect' ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
                            quality.status === 'good'    ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                            quality.status === 'warning' ? 'bg-gradient-to-r from-amber-400 to-amber-600' :
                                                           'bg-gradient-to-r from-rose-400 to-rose-600'
                          }`}
                          style={{ width: `${quality.score}%` }}
                        />
                      </div>
                      {/* Detalles de calidad */}
                      {quality.details.map((d, i) => (
                        <div key={i} className={`text-[10px] mt-1 flex items-center gap-1 ${
                          d.type === 'error'   ? 'text-rose-700' :
                          d.type === 'warning' ? 'text-amber-700' :
                                                 'text-emerald-700'
                        }`}>
                          {d.type === 'error'   ? '✕' :
                           d.type === 'warning' ? '⚠' :
                                                  '✓'}
                          {d.msg}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Hard-Stop: botón deshabilitado si hay errores críticos */}
                  <Button
                    onClick={() => setPreviewOpen(true)}
                    disabled={submitting || designs.length === 0 || !canSubmit()}
                    className={`w-full mt-4 h-11 text-base ${
                      canSubmit()
                        ? 'bg-orange-500 hover:bg-orange-600'
                        : 'bg-slate-300 cursor-not-allowed'
                    }`}
                    title={!canSubmit()
                      ? `No se puede confirmar: ${
                          overlapping.size > 0
                            ? `${overlapping.size} diseño${overlapping.size === 1 ? '' : 's'} solapado${overlapping.size === 1 ? '' : 's'}.`
                            : 'Hay diseños con DPI < 150 (pixelados).'
                        }`
                      : undefined
                    }
                  >
                    {canSubmit()
                      ? <><Eye className="h-4 w-4 mr-2" />Revisar y Confirmar</>
                      : <><AlertTriangle className="h-4 w-4 mr-2" />Corrige los errores para confirmar</>
                    }
                  </Button>
                </>
              ) : (
                <div className="text-sm text-slate-500 text-center py-6">Selecciona un tipo</div>
              )}
            </CardContent>
          </Card>

          {/* Hints */}
          <Card className="border-slate-200/70 bg-slate-50/50">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Keyboard className="h-3.5 w-3.5 text-slate-600" />
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-700">Atajos de teclado</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 font-mono">
                <div><kbd className="kbd">Del</kbd> Eliminar</div>
                <div><kbd className="kbd">Ctrl+Z</kbd> Deshacer</div>
                <div><kbd className="kbd">Ctrl+D</kbd> Duplicar</div>
                <div><kbd className="kbd">Ctrl+Y</kbd> Rehacer</div>
                <div><kbd className="kbd">Ctrl+A</kbd> Sel. todo</div>
                <div><kbd className="kbd">Esc</kbd> Deseleccionar</div>
                <div><kbd className="kbd">←↑↓→</kbd> Mover 1mm</div>
                <div><kbd className="kbd">Shift+←↑↓→</kbd> 10mm</div>
                <div className="col-span-2"><kbd className="kbd">Ctrl+Rueda</kbd> Zoom · <kbd className="kbd">Ctrl+Clic</kbd> Multi-select</div>
              </div>
              <div className="h-px bg-slate-200 my-2" />
              <div className="flex items-start gap-2 text-[11px] text-slate-600">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                <span>DPI ≥ 300 recomendado para nitidez de impresión.</span>
              </div>
              <div className="flex items-start gap-2 text-[11px] text-slate-600">
                <Scissors className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                <span><b>Trim</b> quita bordes transparentes (ahorra rollo).</span>
              </div>
              <div className="flex items-start gap-2 text-[11px] text-slate-600">
                <Wand2 className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                <span><b>Auto-organizar</b> optimiza con rotación automática.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* (L) Preview modal antes de confirmar el pedido */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onConfirm={confirmOrder}
        submitting={submitting}
        designs={designs}
        canvasWidthMm={canvasWidthMm}
        canvasLengthMm={computedLengthMm()}
        quote={q}
        express={express}
        printerLabel={cfg.label}
        overlaps={overlapping.size}
        lowDpiCount={lowDpiCount}
      />

      {/* (N) Text Tool modal */}
      <TextToolModal
        open={textToolOpen}
        onClose={() => setTextToolOpen(false)}
        onAdd={addDesign}
      />
    </div>
  );
}
