'use client';

// ============================================================================
// PreviewModal (L) — modal de revisión final antes de confirmar el pedido
// Muestra:
//   • Mini-visualización del pliego (escalado 1:X)
//   • Lista de diseños con DPI/dimensiones
//   • Advertencias (low DPI, solapamiento)
//   • Resumen de precio + botones "Editar" y "Confirmar"
// ============================================================================
import { CheckCircle2, AlertTriangle, ShoppingCart, ArrowLeft, Loader2, Layers, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { formatCLP } from '@/lib/format';

export default function PreviewModal({
  open, onClose, onConfirm, submitting,
  designs, canvasWidthMm, canvasLengthMm, quote, express, printerLabel,
  overlaps, lowDpiCount,
}) {
  if (!open) return null;

  // Escala del preview: max 220px de ancho o 400px de alto
  const previewMaxW = 220;
  const previewMaxH = 400;
  const scaleW = previewMaxW / canvasWidthMm;
  const scaleH = previewMaxH / canvasLengthMm;
  const scale = Math.min(scaleW, scaleH);
  const previewW = canvasWidthMm * scale;
  const previewH = canvasLengthMm * scale;

  const hasIssues = overlaps > 0 || lowDpiCount > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ShoppingCart className="h-5 w-5 text-orange-500" />
            Revisar y confirmar pedido
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[240px,1fr] gap-6">
          {/* Preview visual */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
              Vista previa
            </div>
            <div className="rounded-lg border-2 border-slate-200 bg-slate-50 p-3">
              <div
                className="relative bg-white border border-slate-300 mx-auto shadow-inner"
                style={{ width: previewW, height: previewH }}
              >
                {designs.map((d) => (
                  <div
                    key={d.id}
                    className="absolute overflow-hidden"
                    style={{
                      left: d.xMm * scale,
                      top:  d.yMm * scale,
                      width: d.widthMm * scale,
                      height: d.heightMm * scale,
                      transform: `rotate(${d.rotation || 0}deg)`,
                      transformOrigin: 'top left',
                    }}
                  >
                    {d.imageUrl && (
                      <img
                        src={d.imageUrl}
                        alt={d.name}
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>{(canvasWidthMm/10).toFixed(0)} × {(canvasLengthMm/10).toFixed(1)} cm</span>
                <span>Escala 1:{Math.round(1/scale)}</span>
              </div>
            </div>
          </div>

          {/* Detalles */}
          <div className="space-y-4">
            {/* Info del equipo */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">
                Equipo de producción
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-600" />
                <span className="font-semibold text-slate-900">{printerLabel}</span>
                {express && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-orange-500 text-white rounded font-bold uppercase">Exprés</span>
                )}
              </div>
            </div>

            {/* Advertencias */}
            {hasIssues && (
              <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-rose-900">
                  <AlertTriangle className="h-4 w-4" />Revisar antes de confirmar
                </div>
                {overlaps > 0 && (
                  <div className="text-xs text-rose-700">
                    • {overlaps} diseño{overlaps === 1 ? '' : 's'} se solapa{overlaps === 1 ? '' : 'n'} en el lienzo
                  </div>
                )}
                {lowDpiCount > 0 && (
                  <div className="text-xs text-rose-700">
                    • {lowDpiCount} diseño{lowDpiCount === 1 ? '' : 's'} tiene DPI menor a 300 (calidad puede verse afectada)
                  </div>
                )}
              </div>
            )}
            {!hasIssues && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span className="text-emerald-900">Todo se ve perfecto — sin solapamientos ni problemas de resolución</span>
              </div>
            )}

            {/* Lista de diseños */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
                Diseños ({designs.length})
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {designs.map((d, idx) => {
                  const dpi = d.widthMm > 0 ? Math.round(d.srcWidthPx / (d.widthMm / 25.4)) : 0;
                  return (
                    <div key={d.id} className="flex items-center gap-2 p-2 text-xs">
                      <span className="text-slate-400 font-mono w-4">{idx + 1}.</span>
                      <img src={d.imageUrl} alt="" className="h-8 w-8 object-contain bg-slate-100 rounded" />
                      <span className="flex-1 truncate">{d.name}</span>
                      <span className="text-slate-500 font-mono">{d.widthMm}×{d.heightMm}mm</span>
                      <span className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded ${
                        dpi >= 300 ? 'bg-emerald-100 text-emerald-700' :
                        dpi >= 200 ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>{dpi} DPI</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Resumen precio */}
            {quote && (
              <div className="rounded-lg border-2 border-orange-200 bg-orange-50 p-4">
                <div className="grid grid-cols-2 gap-y-1 text-sm">
                  <span className="text-slate-600 flex items-center gap-1"><Ruler className="h-3 w-3" />Largo cobrado</span>
                  <span className="text-right font-mono font-semibold">{(quote.billableMm / 10).toFixed(1)} cm</span>
                  <span className="text-slate-600">Subtotal</span>
                  <span className="text-right font-mono">{formatCLP(quote.subtotal)}</span>
                  {quote.surcharge > 0 && (
                    <>
                      <span className="text-orange-700">Recargo exprés</span>
                      <span className="text-right font-mono text-orange-700">+{formatCLP(quote.surcharge)}</span>
                    </>
                  )}
                  <span className="text-slate-600">IVA 19%</span>
                  <span className="text-right font-mono">{formatCLP(quote.tax)}</span>
                </div>
                <div className="mt-2 pt-2 border-t border-orange-200 flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-widest font-semibold text-slate-700">Total</span>
                  <span className="text-3xl font-bold text-slate-900 font-mono">{formatCLP(quote.total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={submitting} className="w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4 mr-1" />Volver a editar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting || designs.length === 0}
            className={`w-full sm:w-auto h-11 text-base ${hasIssues ? 'bg-rose-500 hover:bg-rose-600' : 'bg-orange-500 hover:bg-orange-600'}`}
          >
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creando pedido…</>
                        : <><ShoppingCart className="h-4 w-4 mr-2" />
                            {hasIssues ? `Confirmar de todos modos` : `Confirmar pedido · ${quote ? formatCLP(quote.total) : ''}`}
                          </>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
