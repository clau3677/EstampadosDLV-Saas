'use client';

// ============================================================================
// TextToolModal (N) — permite agregar texto al gang sheet como diseño
// Renderiza el texto a un canvas HTML5 y lo agrega al store como si fuera
// una imagen normal. Preview en tiempo real.
// ----------------------------------------------------------------------------
// Presets de fuente: 8 fuentes web-safe + Google Fonts populares.
// Renderiza a 300 DPI: si el usuario pide texto de 100mm de ancho, generamos
// canvas ~1181px de ancho (100mm × 300dpi / 25.4).
// ============================================================================
import { useState, useEffect, useRef } from 'react';
import { Type, Bold, Italic, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

const FONTS = [
  { label: 'Sans (Inter)', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif (Georgia)', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono (Menlo)', value: 'Menlo, monospace' },
  { label: 'Bebas Neue', value: '"Bebas Neue", Impact, sans-serif' },
  { label: 'Impact', value: 'Impact, sans-serif' },
  { label: 'Courier', value: 'Courier, monospace' },
  { label: 'Comic', value: '"Comic Sans MS", cursive' },
  { label: 'Fantasy', value: 'Papyrus, fantasy' },
];

const COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#f59e0b',
  '#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899',
];

const DPI = 300;
const MM_TO_INCH = 1 / 25.4;

export default function TextToolModal({ open, onClose, onAdd }) {
  const [text, setText] = useState('Tu texto aquí');
  const [font, setFont] = useState(FONTS[0].value);
  const [fontSize, setFontSize] = useState(80);   // en pixels
  const [color, setColor] = useState('#000000');
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const previewRef = useRef(null);

  // Preview canvas: redibujar en cada cambio
  useEffect(() => {
    if (!open) return;
    const canvas = previewRef.current;
    if (!canvas) return;

    // Medir el texto primero con un canvas invisible
    const meas = document.createElement('canvas').getContext('2d');
    const weight = bold ? 'bold' : 'normal';
    const style = italic ? 'italic' : 'normal';
    const fontString = `${style} ${weight} ${fontSize}px ${font}`;
    meas.font = fontString;

    const lines = text.split('\n');
    const widths = lines.map(l => meas.measureText(l || ' ').width);
    const maxW = Math.max(...widths, 10);
    const lineHeight = Math.round(fontSize * 1.15);
    const totalH = lineHeight * lines.length;

    // Padding para descensos/ascensos
    const pad = Math.round(fontSize * 0.15);
    canvas.width = Math.ceil(maxW + pad * 2);
    canvas.height = Math.ceil(totalH + pad * 2);

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = fontString;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      ctx.fillText(line || ' ', pad, pad + i * lineHeight);
    });
  }, [text, font, fontSize, color, bold, italic, open]);

  const handleAdd = async () => {
    if (!text.trim()) {
      toast.error('Escribe algún texto primero');
      return;
    }
    setPreparing(true);
    try {
      const canvas = previewRef.current;
      if (!canvas) throw new Error('preview no disponible');

      // Convertir a PNG dataURL
      const dataUrl = canvas.toDataURL('image/png');
      const widthPx = canvas.width;
      const heightPx = canvas.height;

      // Calcular dimensiones "físicas" iniciales: asumimos 300 DPI
      // → widthMm = widthPx * 25.4 / 300
      const widthMm = Math.max(20, Math.round((widthPx * 25.4) / DPI));
      const heightMm = Math.max(10, Math.round((heightPx * 25.4) / DPI));

      // Cargar como HTMLImageElement para Konva
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });

      onAdd({
        imageUrl: dataUrl,
        name: `Texto: ${text.slice(0, 30)}${text.length > 30 ? '…' : ''}`,
        srcWidthPx: widthPx,
        srcHeightPx: heightPx,
        dpiOriginal: DPI,
        image: img,
        preferredWidthMm: widthMm,
        preferredHeightMm: heightMm,
      });
      toast.success('Texto agregado al pliego', { description: `${widthMm}×${heightMm}mm · ${DPI} DPI` });
      onClose();
    } catch (e) {
      toast.error('No se pudo agregar el texto', { description: e.message });
    } finally {
      setPreparing(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Type className="h-5 w-5 text-orange-500" />
            Agregar texto al pliego
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Texto */}
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-1 block">Texto</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:border-orange-400 resize-none"
              placeholder="Escribe algo..."
              autoFocus
            />
            <div className="text-[10px] text-slate-500 mt-1">Máximo 200 caracteres · Usa Enter para múltiples líneas</div>
          </div>

          {/* Controles */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">Fuente</label>
              <select
                value={font}
                onChange={(e) => setFont(e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-slate-300 text-sm focus:outline-none focus:border-orange-400"
              >
                {FONTS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1 block">
                Tamaño: <span className="font-mono text-orange-600">{fontSize}px</span>
              </label>
              <input
                type="range"
                min={20} max={300} step={5}
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="w-full accent-orange-500"
              />
            </div>
          </div>

          {/* Estilo + Color */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setBold(!bold)}
                className={`px-3 h-9 border-r border-slate-200 transition-colors ${bold ? 'bg-orange-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                title="Negrita"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setItalic(!italic)}
                className={`px-3 h-9 transition-colors ${italic ? 'bg-orange-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                title="Cursiva"
              >
                <Italic className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700">Color:</span>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded border-2 transition-all ${color === c ? 'border-slate-900 scale-110 shadow' : 'border-slate-300'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-6 w-8 rounded border border-slate-300 cursor-pointer"
                title="Color personalizado"
              />
            </div>
          </div>

          {/* Preview */}
          <div>
            <div className="text-xs font-semibold text-slate-700 mb-1">Vista previa</div>
            <div
              className="rounded-lg border-2 border-dashed border-slate-300 p-6 flex items-center justify-center overflow-auto"
              style={{
                backgroundImage: 'linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%, #f1f5f9), linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%, #f1f5f9)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 8px 8px',
                minHeight: 120,
                maxHeight: 300,
              }}
            >
              <canvas ref={previewRef} style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain' }} />
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono text-center">
              Se agregará como PNG a 300 DPI · Podrás redimensionar en el canvas
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={preparing || !text.trim()} className="bg-orange-500 hover:bg-orange-600">
            {preparing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Procesando…</> : <><Plus className="h-4 w-4 mr-1" />Agregar al pliego</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
