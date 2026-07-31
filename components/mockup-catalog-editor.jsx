'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Trash2, Copy, RotateCw, Undo2, Redo2,
  ZoomIn, ZoomOut, Download, Shirt, Loader2, Image as ImageIcon,
  Sparkles, MousePointer2, Check, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

// ============================================================================
// PLANTILLAS DE PRENDAS DEL CATÁLOGO (imágenes PNG reales)
// ============================================================================
export const CATALOG_TEMPLATES = {
  polera_frontal: {
    id: 'polera_frontal',
    label: 'Polera (Frontal)',
    category: 'poleras',
    printArea: { x: 0.28, y: 0.28, w: 0.44, h: 0.48 },
    bgImage: '/mockups/polera-blanca.png',
  },
  polera_espalda: {
    id: 'polera_espalda',
    label: 'Polera (Espalda)',
    category: 'poleras',
    printArea: { x: 0.28, y: 0.28, w: 0.44, h: 0.48 },
    bgImage: '/mockups/polera-blanca-back.png',
  },
  poleron_frontal: {
    id: 'poleron_frontal',
    label: 'Polerón (Frontal)',
    category: 'polerones',
    printArea: { x: 0.25, y: 0.30, w: 0.50, h: 0.42 },
    bgImage: '/mockups/poleron-blanco.png',
  },
  poleron_espalda: {
    id: 'poleron_espalda',
    label: 'Polerón (Espalda)',
    category: 'polerones',
    printArea: { x: 0.25, y: 0.30, w: 0.50, h: 0.42 },
    bgImage: '/mockups/poleron-blanco-back.png',
  },
  gorra_frontal: {
    id: 'gorra_frontal',
    label: 'Gorra (Frontal)',
    category: 'gorras',
    printArea: { x: 0.35, y: 0.32, w: 0.30, h: 0.20 },
    bgImage: '/mockups/gorra-blanca.png',
  },
};

// Historial
const HISTORY_LIMIT = 30;

function snapshot(designs) {
  return designs.map(d => {
    const { imgEl, ...rest } = d;
    return JSON.parse(JSON.stringify(rest));
  });
}

function restoreImgs(snapshotArr, cache) {
  return snapshotArr.map(d => ({ ...d, imgEl: cache.get(d.id) || null }));
}

// ============================================================================
// CANVAS DEL MOCKUP CON IMAGEN REAL
// ============================================================================
function CatalogCanvas() {
  const canvasRef = useRef(null);
  const [bgImage, setBgImage] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [showPrintArea, setShowPrintArea] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState('polera_frontal');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const template = CATALOG_TEMPLATES[selectedTemplate];
  const pa = template?.printArea || { x: 0.25, y: 0.25, w: 0.50, h: 0.50 };
  const canvasSize = 600;

  // Cargar imagen de fondo (con cache-busting para forzar recarga)
  useEffect(() => {
    if (!template?.bgImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBgImage(img);
      // Forzar un redraw inmediato después de que la imagen cargue
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const cs = canvasSize * zoom;
          canvas.width = cs;
          canvas.height = cs;
          ctx.clearRect(0, 0, cs, cs);
          ctx.drawImage(img, 0, 0, cs, cs);
        }
      }, 50);
    };
    // Cache-busting: agregar timestamp para evitar caché del navegador
    img.src = `${template.bgImage}?t=${Date.now()}`;
    return () => { img.onload = null; img.src = ''; };
  }, [template?.bgImage]);

  // Pre-cargar imágenes de diseño
  const designCache = useRef(new Map());

  // Preload all design images
  useEffect(() => {
    designs.forEach(d => {
      if (!designCache.current.has(d.id) && d.imageUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          designCache.current.set(d.id, { ...d, imgEl: img });
          // Trigger re-render
          setDesigns(prev => [...prev]);
        };
        img.src = d.imageUrl;
      }
    });
  }, [designs]);

  // Dibujar canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cs = canvasSize * zoom;
    canvas.width = cs;
    canvas.height = cs;

    ctx.clearRect(0, 0, cs, cs);

    // Dibujar imagen de fondo (prenda real)
    if (bgImage) {
      // Calcular cómo escalar la imagen para que quepa en el canvas
      const imgAspect = bgImage.width / bgImage.height;
      const canvasAspect = 1; // canvas es cuadrado

      let drawW, drawH, drawX, drawY;
      if (imgAspect > canvasAspect) {
        drawW = cs * 0.95;
        drawH = drawW / imgAspect;
        drawX = (cs - drawW) / 2;
        drawY = (cs - drawH) / 2;
      } else {
        drawH = cs * 0.95;
        drawW = drawH * imgAspect;
        drawX = (cs - drawW) / 2;
        drawY = (cs - drawH) / 2;
      }
      ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
    }

    // Área de impresión (zona punteada)
    if (showPrintArea) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,100,0,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      const px = pa.x * cs;
      const py = pa.y * cs;
      const pw = pa.w * cs;
      const ph = pa.h * cs;
      ctx.strokeRect(px, py, pw, ph);
      ctx.fillStyle = 'rgba(255,100,0,0.7)';
      ctx.font = `${Math.max(10, cs * 0.018)}px system-ui`;
      ctx.fillText('Zona de impresión', px + 4, py + cs * 0.025);
      ctx.restore();
    }

    // Dibujar diseños
    for (const design of designs) {
      const cached = designCache.current.get(design.id);
      if (!cached?.imgEl) continue;

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

      ctx.drawImage(cached.imgEl, design.x, design.y, design.width, design.height);

      // Borde de selección
      if (design.id === selectedDesignId) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(design.x, design.y, design.width, design.height);

        // Handle de resize
        const hs = cs * 0.025;
        ctx.fillStyle = '#f97316';
        ctx.fillRect(design.x + design.width - hs, design.y + design.height - hs, hs, hs);
      }

      ctx.restore();
    }
  }, [bgImage, designs, selectedDesignId, zoom, canvasSize, pa, showPrintArea]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // Eventos de mouse
  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasSize * zoom / rect.width;
    const scaleY = canvasSize * zoom / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
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
      setSelectedDesignId(clickedId);
      const clicked = designs.find(d => d.id === clickedId);
      setDragState({
        designId: clickedId,
        offsetX: pos.x - clicked.x,
        offsetY: pos.y - clicked.y,
      });
    } else {
      setSelectedDesignId(null);
    }
  };

  const handleMouseMove = (e) => {
    const pos = getMousePos(e);

    if (dragState) {
      const newX = pos.x - dragState.offsetX;
      const newY = pos.y - dragState.offsetY;
      setDesigns(prev => prev.map(d =>
        d.id === dragState.designId ? { ...d, x: newX, y: newY } : d
      ));
    }

    if (resizeState) {
      const dx = pos.x - resizeState.startX;
      const sel = designs.find(d => d.id === resizeState.designId);
      if (sel) {
        const aspect = sel.width / sel.height;
        const newW = Math.max(20, resizeState.startWidth + dx);
        const newH = newW / aspect;
        setDesigns(prev => prev.map(d =>
          d.id === resizeState.designId ? { ...d, width: newW, height: newH } : d
        ));
      }
    }

    if (canvasRef.current) {
      canvasRef.current.style.cursor = dragState || resizeState ? 'grabbing' : 'default';
    }
  };

  const handleMouseUp = () => {
    if (dragState || resizeState) {
      // Push to history
      const snap = snapshot(designs);
      setHistory(prev => {
        const newH = prev.slice(0, historyIndex + 1);
        newH.push(snap);
        if (newH.length > HISTORY_LIMIT) newH.shift();
        return newH;
      });
      setHistoryIndex(prev => Math.min(prev + 1, HISTORY_LIMIT - 1));
    }
    setDragState(null);
    setResizeState(null);
  };

  const handleTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
  };

  // Funciones de gestión
  const addDesign = (imageData) => {
    const id = crypto.randomUUID();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const aspect = img.width / img.height;
      const initialW = pa.w * canvasSize * 0.4;
      const initialH = aspect >= 1 ? initialW : initialW / aspect;
      const centerX = (pa.x + pa.w / 2) * canvasSize;
      const centerY = (pa.y + pa.h / 2) * canvasSize;

      designCache.current.set(id, { id, imgEl: img });
      const newDesign = {
        id,
        imageUrl: imageData.imageUrl,
        name: imageData.name || 'Diseño',
        srcWidthPx: imageData.srcWidthPx || img.width,
        srcHeightPx: imageData.srcHeightPx || img.height,
        x: centerX - initialW / 2,
        y: centerY - initialH / 2,
        width: initialW,
        height: initialH,
        rotation: 0,
        opacity: 1,
      };

      const snap = snapshot(designs);
      setHistory(prev => {
        const newH = prev.slice(0, historyIndex + 1);
        newH.push(snap);
        if (newH.length > HISTORY_LIMIT) newH.shift();
        return newH;
      });
      setHistoryIndex(prev => prev + 1);

      setDesigns(prev => [...prev, newDesign]);
      setSelectedDesignId(id);
    };
    img.src = imageData.imageUrl;
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const snap = history[newIndex];
    const cache = new Map();
    designs.forEach(d => {
      const cached = designCache.current.get(d.id);
      if (cached?.imgEl) cache.set(d.id, cached.imgEl);
    });
    const restored = restoreImgs(snap, cache);
    restored.forEach(d => {
      if (d.imgEl) designCache.current.set(d.id, { ...d, imgEl: d.imgEl });
    });
    setDesigns(restored);
    setHistoryIndex(newIndex);
    setSelectedDesignId(null);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const snap = history[newIndex];
    const cache = new Map();
    designs.forEach(d => {
      const cached = designCache.current.get(d.id);
      if (cached?.imgEl) cache.set(d.id, cached.imgEl);
    });
    const restored = restoreImgs(snap, cache);
    restored.forEach(d => {
      if (d.imgEl) designCache.current.set(d.id, { ...d, imgEl: d.imgEl });
    });
    setDesigns(restored);
    setHistoryIndex(newIndex);
    setSelectedDesignId(null);
  };

  const removeDesign = (id) => {
    designCache.current.delete(id);
    const snap = snapshot(designs);
    setHistory(prev => {
      const newH = prev.slice(0, historyIndex + 1);
      newH.push(snap);
      if (newH.length > HISTORY_LIMIT) newH.shift();
      return newH;
    });
    setHistoryIndex(prev => prev + 1);
    setDesigns(prev => prev.filter(d => d.id !== id));
    if (selectedDesignId === id) setSelectedDesignId(null);
  };

  const duplicateDesign = (id) => {
    const src = designs.find(d => d.id === id);
    if (!src) return;
    const newId = crypto.randomUUID();
    const cached = designCache.current.get(id);
    const newDesign = {
      ...src,
      id: newId,
      x: src.x + 20,
      y: src.y + 20,
    };
    designCache.current.set(newId, cached);
    setDesigns(prev => [...prev, newDesign]);
    setSelectedDesignId(newId);
  };

  const clearDesigns = () => {
    designCache.current.clear();
    const snap = snapshot(designs);
    setHistory(prev => {
      const newH = prev.slice(0, historyIndex + 1);
      newH.push(snap);
      if (newH.length > HISTORY_LIMIT) newH.shift();
      return newH;
    });
    setHistoryIndex(prev => prev + 1);
    setDesigns([]);
    setSelectedDesignId(null);
  };

  const updateDesignLive = (id, patch) => {
    setDesigns(prev => prev.map(d =>
      d.id === id ? { ...d, ...patch } : d
    ));
  };

  // Exportar
  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) { toast.error('No hay canvas'); return; }

    // Crear canvas temporal sin la zona de impresión
    const exportCanvas = document.createElement('canvas');
    const scale = 2; // Alta resolución
    exportCanvas.width = canvasSize * scale;
    exportCanvas.height = canvasSize * scale;
    const ctx = exportCanvas.getContext('2d');

    // Dibujar fondo
    if (bgImage) {
      const imgAspect = bgImage.width / bgImage.height;
      const canvasAspect = 1;
      let drawW, drawH, drawX, drawY;
      if (imgAspect > canvasAspect) {
        drawW = canvasSize * scale * 0.95;
        drawH = drawW / imgAspect;
        drawX = (canvasSize * scale - drawW) / 2;
        drawY = (canvasSize * scale - drawH) / 2;
      } else {
        drawH = canvasSize * scale * 0.95;
        drawW = drawH * imgAspect;
        drawX = (canvasSize * scale - drawW) / 2;
        drawY = (canvasSize * scale - drawH) / 2;
      }
      ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
    }

    // Dibujar diseños
    for (const design of designs) {
      const cached = designCache.current.get(design.id);
      if (!cached?.imgEl) continue;
      ctx.save();
      ctx.globalAlpha = design.opacity || 1;
      const sx = canvasSize * scale / canvasSize;
      const cx = (design.x + design.width / 2) * sx;
      const cy = (design.y + design.height / 2) * sx;
      ctx.translate(cx, cy);
      ctx.rotate((design.rotation || 0) * Math.PI / 180);
      ctx.translate(-cx, -cy);
      ctx.drawImage(cached.imgEl, design.x * sx, design.y * sx, design.width * sx, design.height * sx);
      ctx.restore();
    }

    const dataUrl = exportCanvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.download = `mockup-${template.label.replace(/\s|\(/g, '_').replace(/\)/g, '')}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    toast.success('Mockup exportado');
  };

  const selectedDesign = designs.find(d => d.id === selectedDesignId);

  const garmentTypes = [
    { group: 'Poleras', items: ['polera_frontal', 'polera_espalda'] },
    { group: 'Polerones', items: ['poleron_frontal', 'poleron_espalda'] },
    { group: 'Gorras', items: ['gorra_frontal'] },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-140px)]">
      {/* ============ CANVAS CENTRAL ============ */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex items-center justify-between w-full max-w-[600px] mb-4">
          <div className="flex items-center gap-3">
            <Link href="/tienda" className="text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Editor de Mockups</h1>
            <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">
              {template?.label}
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
            <Button
              size="sm"
              className="bg-gradient-to-r from-orange-500 to-rose-500 text-white"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Exportar PNG
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div className="relative rounded-xl overflow-hidden shadow-xl border border-slate-200 bg-white"
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
          <Button variant="outline" size="sm"
            onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-slate-500 font-mono">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm"
            onClick={() => setZoom(z => Math.min(2, z + 0.1))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <div className="ml-4 flex items-center gap-2">
            <Switch checked={showPrintArea} onCheckedChange={setShowPrintArea} />
            <span className="text-xs text-slate-600">Zona de impresión</span>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-slate-500 max-w-md">
          Arrastra los diseños para posicionarlos. Usa el handle naranja para redimensionar.
        </div>
      </div>

      {/* ============ SIDEBAR ============ */}
      <div className="w-full lg:w-80 xl:w-96 shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
          <div className="p-4 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">
            {/* Selector de tipo de prenda */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Tipo de prenda</h3>
              <div className="space-y-2">
                {garmentTypes.map(group => (
                  <div key={group.group}>
                    <div className="text-xs text-slate-500 font-medium mb-1">{group.group}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map(id => {
                        const t = CATALOG_TEMPLATES[id];
                        const active = selectedTemplate === id;
                        return (
                          <button
                            key={id}
                            onClick={() => {
                              setSelectedTemplate(id);
                              setDesigns([]);
                              setSelectedDesignId(null);
                              setHistory([]);
                              setHistoryIndex(-1);
                              designCache.current.clear();
                            }}
                            className={`
                              px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                              ${active
                                ? 'bg-orange-500 text-white shadow-md'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}
                            `}
                          >
                            {t?.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                <strong>{template?.label}</strong> — Imagen real del catálogo.
              </div>
            </div>

            {/* Subir diseño */}
            <div className="border-t border-slate-100 pt-4">
              <DesignUploader addDesign={addDesign} />
            </div>

            {/* Biblioteca */}
            <div className="border-t border-slate-100 pt-4">
              <LibraryPicker onSelect={addDesign} />
            </div>

            {/* Capas */}
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" />
                Capas ({designs.length})
              </h3>
              <LayersList
                designs={designs}
                selectedDesignId={selectedDesignId}
                onSelect={setSelectedDesignId}
                onRemove={removeDesign}
              />
            </div>

            {/* Propiedades del diseño seleccionado */}
            {selectedDesign && (
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Propiedades</h3>
                <DesignProperties
                  design={selectedDesign}
                  onUpdate={(patch) => updateDesignLive(selectedDesign.id, patch)}
                  onDuplicate={() => duplicateDesign(selectedDesign.id)}
                  onRemove={() => removeDesign(selectedDesign.id)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR: SUBIR DISEÑO
// ============================================================================
function DesignUploader({ addDesign }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  const handleFiles = async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name}: solo imágenes`);
        continue;
      }
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
      } catch {
        toast.error('Error al subir imagen');
      }
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
      <h3 className="text-sm font-semibold text-slate-700">Biblioteca</h3>
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
              onClick={() => { setSelectedFolder(f.name); setPage(1); }}
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
                onClick={() => {
                  onSelect({
                    imageUrl: item.imageUrl,
                    name: item.name,
                    srcWidthPx: item.srcWidthPx,
                    srcHeightPx: item.srcHeightPx,
                  });
                  fetch(`/api/design-library/${item.id}/use`, { method: 'POST' }).catch(() => {});
                  toast.success(`${item.name} agregado al mockup`);
                }}
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
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
              <span className="text-xs text-slate-500">{page} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// LISTA DE CAPAS
// ============================================================================
function LayersList({ designs, selectedDesignId, onSelect, onRemove }) {
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
          onClick={() => onSelect(d.id)}
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
            onClick={(e) => { e.stopPropagation(); onRemove(d.id); }}
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
// PROPIEDADES DEL DISEÑO
// ============================================================================
function DesignProperties({ design, onUpdate, onDuplicate, onRemove }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 truncate max-w-[160px]">{design.name}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onDuplicate} title="Duplicar">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={onRemove} title="Eliminar">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-600">Rotación: {design.rotation}°</label>
        <Slider
          value={[design.rotation || 0]}
          min={0}
          max={360}
          step={1}
          onValueChange={([v]) => onUpdate({ rotation: v })}
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-xs text-slate-600">Opacidad: {Math.round((design.opacity || 1) * 100)}%</label>
        <Slider
          value={[(design.opacity || 1) * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={([v]) => onUpdate({ opacity: v / 100 })}
          className="mt-1"
        />
      </div>

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
// COMPONENTE PRINCIPAL
// ============================================================================
export default function MockupCatalogEditor() {
  return <CatalogCanvas />;
}
