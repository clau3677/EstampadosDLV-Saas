'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Layers, Upload, Trash2, Copy, RotateCw,
  Zap, AlertTriangle, CheckCircle2, Loader2, Wand2, Plus,
  ShoppingCart, Ruler, Sparkles,
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
            <Link href="/configuracion" className="text-orange-600 text-sm font-semibold hover:underline">
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
    mode, printerCode, printerData, canvasWidthMm, designs, selectedId, express,
    setMode, addDesign, removeDesign, duplicate, rotate90,
    select, setExpress, autoArrange, currentQuote, effectiveDpi, designWarnings,
  } = useGangSheet();

  const [uploading, setUploading] = useState(0);
  const [submitting, setSubmitting] = useState(false);

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
          description: `${data.widthPx}×${data.heightPx}px · ${data.dpi} DPI original`,
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

  // Teclado: Delete elimina seleccionado
  useEffect(() => {
    const onKey = (e) => {
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // No borrar si el foco está en un input
        if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
        removeDesign(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, removeDesign]);

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
      });
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
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" />Dashboard
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
          <Button variant="outline" size="sm" onClick={autoArrange} disabled={designs.length === 0}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />Auto-organizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => useGangSheet.getState().reset()}>Cambiar modo</Button>
        </div>
      </div>

      {/* Layout: Canvas + Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-4">
        {/* CANVAS */}
        <div className="space-y-3">
          <GangSheetCanvas />

          {/* Toolbar del diseño seleccionado */}
          {selected && (
            <Card className="border-slate-200/70">
              <CardContent className="p-3 flex flex-wrap items-center gap-3">
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
                <div className="ml-auto flex items-center gap-1">
                  <RemoveBgButton
                    imageUrl={selected.imageUrl}
                    onDone={(data) => {
                      // Cargar la nueva imagen (sin fondo) y reemplazar en el diseño seleccionado
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
              </CardContent>
            </Card>
          )}
        </div>

        {/* PANEL DERECHO */}
        <div className="space-y-4">
          {/* Upload */}
          <Card className="border-slate-200/70">
            <CardContent className="p-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Subir diseños</div>
              <Uploader onFile={handleFile} />
              {uploading > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                  Procesando {uploading} archivo{uploading !== 1 && 's'}…
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lista de diseños */}
          {designs.length > 0 && (
            <Card className="border-slate-200/70">
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                  Diseños ({designs.length})
                </div>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {designs.map((d) => {
                    const dpi = effectiveDpi(d);
                    const warns = designWarnings(d);
                    return (
                      <button
                        key={d.id}
                        onClick={() => select(d.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-all ${
                          selectedId === d.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <img src={d.imageUrl} alt="" className="h-10 w-10 object-contain rounded bg-slate-100 border border-slate-200" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">{d.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{d.widthMm}×{d.heightMm}mm</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                            dpi >= 300 ? 'bg-emerald-100 text-emerald-700' : dpi >= 200 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {dpi} DPI
                          </span>
                          {warns.length > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        </div>
                      </button>
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
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Ancho útil</span>
                    <span className="font-mono font-semibold">{(canvasWidthMm/10).toFixed(0)} cm</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600 mt-1">
                    <span>Largo utilizado</span>
                    <span className="font-mono font-semibold">{(q.lengthMm/10).toFixed(1)} cm</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-600 mt-1">
                    <span>Largo cobrado {q.billableMm > q.lengthMm && <span className="text-[10px] text-amber-600">(mín.)</span>}</span>
                    <span className="font-mono font-semibold">{(q.billableMm/10).toFixed(1)} cm</span>
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

                  <Button
                    onClick={confirmOrder}
                    disabled={submitting || designs.length === 0}
                    className="w-full mt-4 bg-orange-500 hover:bg-orange-600 h-11 text-base"
                  >
                    {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creando pedido…</> : <><ShoppingCart className="h-4 w-4 mr-2" />Confirmar Pedido</>}
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
              <div className="flex items-start gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>DPI ≥ 300 recomendado para impresión nítida.</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Arrastra las esquinas para redimensionar (mantiene proporción).</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Suprimir o ⌫ elimina el diseño seleccionado.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
