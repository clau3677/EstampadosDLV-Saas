'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Trash2, Copy, RotateCw, Undo2, Redo2,
  ZoomIn, ZoomOut, Download, Shirt, Loader2, Image as ImageIcon,
  Sparkles, MousePointer2, ChevronDown, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useMockupStore, GARMENT_TEMPLATES, GARMENT_COLORS } from '@/lib/mockup-store';

// ============================================================================
// CANVAS DEL MOCKUP
// ============================================================================
function MockupCanvas() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const {
    selectedTemplate, garmentColor, designs, selectedDesignId,
    zoom, canvasSize,
    updateDesignLive, selectDesign, deselectDesign, commitDesignChange,
  } = useMockupStore();

  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [showPrintArea, setShowPrintArea] = useState(true);

  const template = GARMENT_TEMPLATES[selectedTemplate];
  const pa = template?.printArea || { x: 0.25, y: 0.25, w: 0.50, h: 0.50 };

  // Dibujar canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cs = canvasSize * zoom;
    canvas.width = cs;
    canvas.height = cs;

    ctx.clearRect(0, 0, cs, cs);

    // Fondo de la prenda (coloreado)
    const color = GARMENT_COLORS[garmentColor];
    ctx.fillStyle = color?.hex || '#FFFFFF';
    // Dibujar forma de prenda aproximada según tipo
    drawGarmentShape(ctx, cs, garmentColor, selectedTemplate);

    // Área de impresión (zona punteada)
    if (showPrintArea) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,100,0,0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      const px = pa.x * cs;
      const py = pa.y * cs;
      const pw = pa.w * cs;
      const ph = pa.h * cs;
      ctx.strokeRect(px, py, pw, ph);
      // Etiqueta
      ctx.fillStyle = 'rgba(255,100,0,0.7)';
      ctx.font = `${Math.max(10, cs * 0.018)}px system-ui`;
      ctx.fillText('Zona de impresión', px + 4, py + cs * 0.025);
      ctx.restore();
    }

    // Dibujar diseños
    for (const design of designs) {
      if (!design.imgEl) continue;
      ctx.save();
      ctx.globalAlpha = design.opacity || 1;

      // Centro de rotación
      const cx = design.x + design.width / 2;
      const cy = design.y + design.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((design.rotation || 0) * Math.PI / 180);
      ctx.translate(-cx, -cy);

      // Sombra si seleccionado
      if (design.id === selectedDesignId) {
        ctx.shadowColor = 'rgba(249,115,22,0.6)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      ctx.drawImage(design.imgEl, design.x, design.y, design.width, design.height);

      // Borde de selección
      if (design.id === selectedDesignId) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(design.x, design.y, design.width, design.height);

        // Handle de resize (esquina inferior derecha)
        const hs = cs * 0.025;
        ctx.fillStyle = '#f97316';
        ctx.fillRect(design.x + design.width - hs, design.y + design.height - hs, hs, hs);
      }

      ctx.restore();
    }
  }, [selectedTemplate, garmentColor, designs, selectedDesignId, zoom, canvasSize, pa, showPrintArea]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // Eventos de mouse
  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e) => {
    const pos = getMousePos(e);
    const cs = canvasSize * zoom;

    // Verificar si clic en handle de resize
    if (selectedDesignId) {
      const sel = designs.find(d => d.id === selectedDesignId);
      if (sel) {
        const hs = cs * 0.025;
        const hx = sel.x + sel.width - hs;
        const hy = sel.y + sel.height - hs;
        if (pos.x >= hx && pos.x <= hx + hs && pos.y >= hy && pos.y <= hy + hs) {
          setResizeState({
            designId: sel.id,
            startWidth: sel.width,
            startHeight: sel.height,
            startX: pos.x,
            startY: pos.y,
          });
          return;
        }
      }
    }

    // Verificar si clic en un diseño (de atrás hacia adelante)
    let clickedId = null;
    for (let i = designs.length - 1; i >= 0; i--) {
      const d = designs[i];
      if (pos.x >= d.x && pos.x <= d.x + d.width &&
          pos.y >= d.y && pos.y <= d.y + d.height) {
        clickedId = d.id;
        break;
      }
    }

    if (clickedId) {
      selectDesign(clickedId);
      const clicked = designs.find(d => d.id === clickedId);
      setDragState({
        designId: clickedId,
        offsetX: pos.x - clicked.x,
        offsetY: pos.y - clicked.y,
      });
    } else {
      deselectDesign();
    }
  };

  const handleMouseMove = (e) => {
    const pos = getMousePos(e);

    if (dragState) {
      const newX = pos.x - dragState.offsetX;
      const newY = pos.y - dragState.offsetY;
      updateDesignLive(dragState.designId, { x: newX, y: newY });
    }

    if (resizeState) {
      const dx = pos.x - resizeState.startX;
      const dy = pos.y - resizeState.startY;
      const newW = Math.max(20, resizeState.startWidth + dx);
      // Mantener proporción
      const sel = designs.find(d => d.id === resizeState.designId);
      if (sel) {
        const aspect = sel.width / sel.height;
        const newH = newW / aspect;
        updateDesignLive(resizeState.designId, { width: newW, height: newH });
      }
    }

    // Cambiar cursor
    if (canvasRef.current) {
      canvasRef.current.style.cursor = dragState || resizeState ? 'grabbing' : 'default';
    }
  };

  const handleMouseUp = () => {
    if (dragState || resizeState) {
      commitDesignChange();
    }
    setDragState(null);
    setResizeState(null);
  };

  // Touch support
  const handleTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
    handleMouseDown(fakeEvent);
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
    handleMouseMove(fakeEvent);
  };

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden shadow-xl border border-slate-200 bg-white"
        style={{ width: canvasSize * zoom, height: canvasSize * zoom }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
          className="block w-full h-full"
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button
          variant="outline" size="sm"
          onClick={() => useMockupStore.setState(z => ({ zoom: Math.max(0.5, z.zoom - 0.1) }))}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-slate-500 font-mono">{Math.round(zoom * 100)}%</span>
        <Button
          variant="outline" size="sm"
          onClick={() => useMockupStore.setState(z => ({ zoom: Math.min(2, z.zoom + 0.1) }))}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <div className="ml-4 flex items-center gap-2">
          <Switch checked={showPrintArea} onCheckedChange={setShowPrintArea} />
          <span className="text-xs text-slate-600">Zona de impresión</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DIBUJAR FORMA DE PRENDA EN CANVAS
// ============================================================================
function drawGarmentShape(ctx, cs, colorName, templateId) {
  const color = GARMENT_COLORS[colorName];
  const hex = color?.hex || '#FFFFFF';

  // Gradiente sutil para dar profundidad
  const gradient = ctx.createLinearGradient(0, 0, cs, cs);
  gradient.addColorStop(0, hex);
  gradient.addColorStop(1, adjustBrightness(hex, -15));

  ctx.fillStyle = gradient;

  const isGarra = templateId.includes('gorra');
  const isPoleron = templateId.includes('poleron');
  const isBack = templateId.includes('espalda') || templateId.includes('back') || templateId.includes('lateral');

  if (isGarra) {
    // Forma de gorra
    drawCapShape(ctx, cs, isBack, hex);
  } else {
    // Forma de polera/polerón
    drawTshirtShape(ctx, cs, isPoleron, isBack, hex);
  }
}

function drawTshirtShape(ctx, cs, isHoodie, isBack, hex) {
  const w = cs;
  const h = cs;
  const neckW = w * 0.12;
  const neckH = h * 0.05;
  const shoulderY = h * 0.12;
  const armW = w * 0.12;
  const armEndY = isHoodie ? h * 0.22 : h * 0.18;
  const bodyBottomY = h * 0.88;

  ctx.beginPath();
  // Cuello
  ctx.moveTo(w / 2 - neckW, shoulderY + neckH);
  if (isBack) {
    ctx.lineTo(w / 2 - neckW, shoulderY + neckH * 0.5);
    ctx.quadraticCurveTo(w / 2, shoulderY, w / 2 + neckW, shoulderY + neckH * 0.5);
  } else {
    ctx.lineTo(w / 2 - neckW, shoulderY);
    ctx.quadraticCurveTo(w / 2, shoulderY + neckH, w / 2 + neckW, shoulderY);
  }
  ctx.lineTo(w / 2 + neckW, shoulderY + neckH);
  // Hombro derecho + manga
  ctx.lineTo(w * 0.5 + w * 0.22, shoulderY);
  ctx.lineTo(w * 0.5 + w * 0.22 + armW, armEndY);
  ctx.lineTo(w * 0.5 + w * 0.22 + armW * 0.3, armEndY + 5);
  // Cuerpo derecho
  ctx.lineTo(w * 0.72, bodyBottomY);
  // Bottom
  ctx.lineTo(w * 0.28, bodyBottomY);
  // Cuerpo izquierdo
  ctx.lineTo(w * 0.5 - w * 0.22 - armW * 0.3, armEndY + 5);
  ctx.lineTo(w * 0.5 - w * 0.22 - armW, armEndY);
  ctx.lineTo(w * 0.5 - w * 0.22, shoulderY);
  ctx.closePath();
  ctx.fill();

  // Detalles
  ctx.strokeStyle = adjustBrightness(hex, -30);
  ctx.lineWidth = 1.5;
  // Costura cuello
  ctx.beginPath();
  if (isBack) {
    ctx.moveTo(w / 2 - neckW, shoulderY + neckH * 0.5);
    ctx.quadraticCurveTo(w / 2, shoulderY - 2, w / 2 + neckW, shoulderY + neckH * 0.5);
  } else {
    ctx.moveTo(w / 2 - neckW, shoulderY);
    ctx.quadraticCurveTo(w / 2, shoulderY + neckH + 3, w / 2 + neckW, shoulderY);
  }
  ctx.stroke();

  // Si es polerón, agregar capucha
  if (isHoodie && !isBack) {
    ctx.fillStyle = adjustBrightness(hex, -8);
    ctx.beginPath();
    ctx.moveTo(w / 2 - neckW * 1.5, shoulderY - 2);
    ctx.quadraticCurveTo(w / 2, shoulderY - h * 0.08, w / 2 + neckW * 1.5, shoulderY - 2);
    ctx.lineTo(w / 2 + neckW * 1.2, shoulderY + 3);
    ctx.quadraticCurveTo(w / 2, shoulderY - h * 0.05, w / 2 - neckW * 1.2, shoulderY + 3);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCapShape(ctx, cs, isSide, hex) {
  const w = cs;
  const h = cs;
  const capTopY = h * 0.25;
  const capBottomY = h * 0.55;
  const brimEndY = h * 0.60;

  if (isSide) {
    // Vista lateral de gorra
    ctx.beginPath();
    ctx.moveTo(w * 0.35, capTopY);
    ctx.quadraticCurveTo(w * 0.35, h * 0.20, w * 0.55, h * 0.20);
    ctx.quadraticCurveTo(w * 0.75, h * 0.20, w * 0.75, capTopY);
    ctx.lineTo(w * 0.75, capBottomY);
    // Visera
    ctx.quadraticCurveTo(w * 0.80, capBottomY + 5, w * 0.85, brimEndY);
    ctx.lineTo(w * 0.85, brimEndY + 3);
    ctx.lineTo(w * 0.30, brimEndY + 3);
    ctx.lineTo(w * 0.30, brimEndY);
    ctx.quadraticCurveTo(w * 0.30, capBottomY, w * 0.35, capBottomY);
    ctx.closePath();
    ctx.fill();
  } else {
    // Vista frontal de gorra
    ctx.beginPath();
    // Corona
    ctx.moveTo(w * 0.30, capTopY);
    ctx.quadraticCurveTo(w * 0.30, h * 0.18, w * 0.50, h * 0.18);
    ctx.quadraticCurveTo(w * 0.70, h * 0.18, w * 0.70, capTopY);
    // Cuerpo
    ctx.lineTo(w * 0.70, capBottomY);
    // Visera
    ctx.quadraticCurveTo(w * 0.75, capBottomY + 8, w * 0.82, brimEndY);
    ctx.lineTo(w * 0.82, brimEndY + 4);
    ctx.lineTo(w * 0.18, brimEndY + 4);
    ctx.lineTo(w * 0.18, brimEndY);
    ctx.quadraticCurveTo(w * 0.25, capBottomY + 8, w * 0.30, capBottomY);
    ctx.closePath();
    ctx.fill();

    // Costura central
    ctx.strokeStyle = adjustBrightness(hex, -20);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.50, h * 0.18);
    ctx.lineTo(w * 0.50, capBottomY);
    ctx.stroke();

    // Botón superior
    ctx.fillStyle = adjustBrightness(hex, -25);
    ctx.beginPath();
    ctx.arc(w * 0.50, h * 0.18, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function adjustBrightness(hex, amount) {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + amount));
  return `rgb(${r},${g},${b})`;
}

// ============================================================================
// SIDEBAR: SELECCIÓN DE PRENDA Y COLOR
// ============================================================================
function GarmentSelector() {
  const { selectedTemplate, setTemplate, garmentColor, setColor } = useMockupStore();

  const garmentTypes = [
    { group: 'Poleras', items: ['polera_frontal', 'polera_espalda'] },
    { group: 'Polerones', items: ['poleron_frontal', 'poleron_espalda'] },
    { group: 'Gorras', items: ['gorra_frontal', 'gorra_lateral'] },
  ];

  return (
    <div className="space-y-4">
      {/* Selector de tipo de prenda */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Tipo de prenda</h3>
        <div className="space-y-2">
          {garmentTypes.map(group => (
            <div key={group.group}>
              <div className="text-xs text-slate-500 font-medium mb-1">{group.group}</div>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map(id => {
                  const t = GARMENT_TEMPLATES[id];
                  const active = selectedTemplate === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setTemplate(id)}
                      className={`
                        px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                        ${active
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}
                      `}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selector de color */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Color de prenda</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(GARMENT_COLORS).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setColor(key)}
              className={`
                w-8 h-8 rounded-full border-2 transition-all
                ${garmentColor === key
                  ? 'border-orange-500 scale-110 shadow-md'
                  : 'border-slate-200 hover:border-slate-400'}
              `}
              style={{ backgroundColor: val.hex }}
              title={val.label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR: SUBIR DISEÑO
// ============================================================================
function DesignUploader({ onFile }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const handleFiles = async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name}: solo imágenes`);
        continue;
      }
      onFile(file);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(Array.from(e.dataTransfer.files)); }}
      onClick={() => inputRef.current?.click()}
      className={`
        cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-all
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
      <Upload className="h-5 w-5 text-orange-500 mx-auto" />
      <div className="mt-2 text-sm font-medium text-slate-700">Subir diseño</div>
      <div className="text-xs text-slate-500">PNG, JPG, WEBP</div>
    </div>
  );
}

// ============================================================================
// SIDEBAR: BIBLIOTECA DE DISEÑOS
// ============================================================================
function LibraryPicker({ onSelect }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');

  useEffect(() => {
    loadLibrary();
  }, [search, selectedFolder, page]);

  const loadLibrary = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: '24' });
      if (search) params.set('search', search);
      if (selectedFolder) params.set('folder', selectedFolder);
      const r = await fetch(`/api/design-library?${params}`);
      if (r.ok) {
        const data = await r.json();
        setItems(data.items || []);
        setTotalPages(data.totalPages || 1);
        setFolders(data.folders || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar en la biblioteca..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="h-9 text-sm"
      />
      {folders.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedFolder('')}
            className={`px-2 py-0.5 rounded text-[10px] ${!selectedFolder ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Todos
          </button>
          {folders.slice(0, 8).map(f => (
            <button
              key={f.name}
              onClick={() => setSelectedFolder(f.name)}
              className={`px-2 py-0.5 rounded text-[10px] ${selectedFolder === f.name ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />Cargando...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          Sin resultados
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 max-h-[240px] overflow-y-auto">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className="group relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-orange-400 hover:shadow-md transition-all bg-slate-50"
              >
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-contain p-1"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="ghost" size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                ‹
              </Button>
              <span className="text-xs text-slate-500">{page} / {totalPages}</span>
              <Button
                variant="ghost" size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                ›
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// SIDEBAR: PROPIEDADES DEL DISEÑO SELECCIONADO
// ============================================================================
function DesignProperties() {
  const { selectedDesignId, designs, updateDesignLive, commitDesignChange, removeDesign, duplicateDesign } = useMockupStore();
  const design = designs.find(d => d.id === selectedDesignId);

  if (!design) {
    return (
      <div className="text-center py-4 text-slate-400 text-sm">
        <MousePointer2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
        Selecciona un diseño para editar sus propiedades
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 truncate max-w-[160px]">{design.name}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => duplicateDesign(design.id)} title="Duplicar">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => removeDesign(design.id)} title="Eliminar">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Rotación */}
      <div>
        <label className="text-xs text-slate-600">Rotación: {design.rotation}°</label>
        <Slider
          value={[design.rotation || 0]}
          min={0}
          max={360}
          step={1}
          onValueChange={([v]) => updateDesignLive(design.id, { rotation: v })}
          onValueCommit={() => commitDesignChange()}
          className="mt-1"
        />
      </div>

      {/* Opacidad */}
      <div>
        <label className="text-xs text-slate-600">Opacidad: {Math.round((design.opacity || 1) * 100)}%</label>
        <Slider
          value={[(design.opacity || 1) * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={([v]) => updateDesignLive(design.id, { opacity: v / 100 })}
          onValueCommit={() => commitDesignChange()}
          className="mt-1"
        />
      </div>

      {/* Dimensiones */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-slate-600">Ancho: {Math.round(design.width)}px</label>
        </div>
        <div>
          <label className="text-xs text-slate-600">Alto: {Math.round(design.height)}px</label>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PANEL DE DISEÑOS (lista de capas)
// ============================================================================
function LayersList() {
  const { designs, selectedDesignId, selectDesign, removeDesign } = useMockupStore();

  if (designs.length === 0) {
    return (
      <div className="text-center py-4 text-slate-400 text-xs">
        Sin diseños. Sube uno o elige de la biblioteca.
      </div>
    );
  }

  return (
    <div className="space-y-1 max-h-[160px] overflow-y-auto">
      {[...designs].reverse().map(d => (
        <div
          key={d.id}
          onClick={() => selectDesign(d.id)}
          className={`
            flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all
            ${selectedDesignId === d.id
              ? 'bg-orange-50 border border-orange-200'
              : 'hover:bg-slate-50 border border-transparent'}
          `}
        >
          <img src={d.imageUrl} alt="" className="w-6 h-6 object-contain rounded" />
          <span className="text-xs text-slate-700 truncate flex-1">{d.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); removeDesign(d.id); }}
            className="text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// EXPORTAR MOCKUP
// ============================================================================
function ExportButton() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) { toast.error('No hay canvas'); return; }
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.download = `mockup-${useMockupStore.getState().selectedTemplate}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Mockup exportado');
    } catch {
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      size="sm"
      className="bg-gradient-to-r from-orange-500 to-rose-500 text-white"
      onClick={handleExport}
      disabled={exporting}
    >
      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
      Exportar PNG
    </Button>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL DEL EDITOR
// ============================================================================
export default function MockupEditor() {
  const {
    designs, selectedTemplate, selectedDesignId,
    undo, redo, historyIndex, history,
    addDesign, clearDesigns,
  } = useMockupStore();

  const [activeTab, setActiveTab] = useState('garment'); // garment | upload | library
  const [uploading, setUploading] = useState(0);

  // Subir archivo
  const handleFile = async (file) => {
    setUploading(n => n + 1);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/uploads/design', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('upload failed');
      const data = await r.json();
      addDesign({
        imageUrl: data.url,
        name: data.originalName,
        srcWidthPx: data.widthPx,
        srcHeightPx: data.heightPx,
      });
      toast.success(`${data.originalName} agregado al mockup`);
    } catch (e) {
      toast.error('Error al subir imagen');
    } finally {
      setUploading(n => n - 1);
    }
  };

  // Elegir de biblioteca
  const handleLibrarySelect = (item) => {
    addDesign({
      imageUrl: item.imageUrl,
      name: item.name,
      srcWidthPx: item.srcWidthPx,
      srcHeightPx: item.srcHeightPx,
    });
    // Registrar uso
    fetch(`/api/design-library/${item.id}/use`, { method: 'POST' }).catch(() => {});
    toast.success(`${item.name} agregado al mockup`);
    setActiveTab('garment');
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-140px)]">
      {/* ============ CANVAS CENTRAL ============ */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Header */}
        <div className="flex items-center justify-between w-full max-w-[600px] mb-4">
          <div className="flex items-center gap-3">
            <Link href="/tienda" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Editor de Mockups</h1>
            <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">
              {GARMENT_TEMPLATES[selectedTemplate]?.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={undo} disabled={historyIndex <= 0} title="Deshacer">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1} title="Rehacer">
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={clearDesigns} disabled={designs.length === 0} title="Limpiar">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <ExportButton />
          </div>
        </div>

        {/* Canvas */}
        <MockupCanvas />

        {/* Leyenda */}
        <div className="mt-4 text-center text-xs text-slate-500 max-w-md">
          Arrastra los diseños para posicionarlos. Usa el handle naranja (esquina inferior derecha) para redimensionar.
          Haz clic fuera para deseleccionar.
        </div>
      </div>

      {/* ============ SIDEBAR ============ */}
      <div className="w-full lg:w-80 xl:w-96 shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            {[
              { id: 'garment', label: 'Prenda', icon: Shirt },
              { id: 'upload', label: 'Subir', icon: Upload },
              { id: 'library', label: 'Biblioteca', icon: Sparkles },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                `}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Contenido de tabs */}
          <div className="p-4 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {activeTab === 'garment' && (
              <>
                <GarmentSelector />
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Capas ({designs.length})</h3>
                  <LayersList />
                  {selectedDesignId && (
                    <div className="border-t border-slate-100 pt-4 mt-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">Propiedades</h3>
                      <DesignProperties />
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'upload' && (
              <>
                <DesignUploader onFile={handleFile} />
                {uploading > 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Subiendo {uploading} archivo(s)...
                  </div>
                )}
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Capas ({designs.length})</h3>
                  <LayersList />
                  {selectedDesignId && (
                    <div className="border-t border-slate-100 pt-4 mt-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">Propiedades</h3>
                      <DesignProperties />
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'library' && (
              <>
                <LibraryPicker onSelect={handleLibrarySelect} />
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Capas ({designs.length})</h3>
                  <LayersList />
                  {selectedDesignId && (
                    <div className="border-t border-slate-100 pt-4 mt-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-2">Propiedades</h3>
                      <DesignProperties />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
