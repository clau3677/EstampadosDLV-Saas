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
// PLANTILLAS DE PRENDAS - FOTOS REALES DEL CATÁLOGO
// ============================================================================
const CATALOG_PRODUCT_TEMPLATES = [
  // Poleras
  { id: 'polera-blanca', label: 'Polera Blanca', category: 'poleras', 
    printArea: { x: 0.28, y: 0.28, w: 0.44, h: 0.48 },
    bgImage: '/mockups/polera-blanca-real.png' },
  { id: 'polera-roja', label: 'Polera Roja', category: 'poleras',
    printArea: { x: 0.28, y: 0.32, w: 0.44, h: 0.48 },
    bgImage: '/uploads/proveedor/cottonext/00cd8f6ed8c08819.jpg' },
  { id: 'polera-gris', label: 'Polera Gris', category: 'poleras',
    printArea: { x: 0.28, y: 0.28, w: 0.44, h: 0.48 },
    bgImage: '/uploads/proveedor/cottonext/0117cd2f0571f3fd.jpg' },
  { id: 'polera-negra-hammer', label: 'Polera Negra', category: 'poleras',
    printArea: { x: 0.28, y: 0.28, w: 0.44, h: 0.48 },
    bgImage: '/uploads/proveedor/cottonext/be165532e420cda8.jpg' },
  { id: 'polera-gildan-5000', label: 'Polera Gildan 5000', category: 'poleras',
    printArea: { x: 0.28, y: 0.28, w: 0.44, h: 0.48 },
    bgImage: '/uploads/proveedor/cottonext/e04df29255fac050.jpg' },
  { id: 'polera-gildan-64000', label: 'Polera Gildan 64000', category: 'poleras',
    printArea: { x: 0.28, y: 0.28, w: 0.44, h: 0.48 },
    bgImage: '/uploads/proveedor/cottonext/33c472ed26654f42.jpg' },
  // Polerones
  { id: 'poleron-blanco', label: 'Polerón Blanco', category: 'polerones',
    printArea: { x: 0.25, y: 0.30, w: 0.50, h: 0.42 },
    bgImage: '/mockups/poleron-blanco-real.png' },
  { id: 'poleron-crew', label: 'Polerón Crew', category: 'polerones',
    printArea: { x: 0.25, y: 0.30, w: 0.50, h: 0.42 },
    bgImage: '/uploads/proveedor/cottonext/e3c4adf1652e2d09.png' },
  { id: 'poleron-canguro', label: 'Polerón Canguro', category: 'polerones',
    printArea: { x: 0.25, y: 0.30, w: 0.50, h: 0.42 },
    bgImage: '/uploads/proveedor/cottonext/e3e1b6eabae95719.png' },
  { id: 'poleron-bomber', label: 'Polerón Bomber', category: 'polerones',
    printArea: { x: 0.25, y: 0.30, w: 0.50, h: 0.42 },
    bgImage: '/uploads/proveedor/cottonext/14fd520205a50fe9.png' },
  // Gorras
  { id: 'gorra-blanca', label: 'Gorra Blanca', category: 'gorras',
    printArea: { x: 0.35, y: 0.32, w: 0.30, h: 0.20 },
    bgImage: '/mockups/gorra-blanca-real.png' },
  { id: 'gorra-5panel', label: 'Gorra 5Panel', category: 'gorras',
    printArea: { x: 0.35, y: 0.30, w: 0.30, h: 0.22 },
    bgImage: '/uploads/proveedor/cottonext/c43d1ab79b92f768.jpg' },
  { id: 'gorra-6panel', label: 'Gorra 6Panel', category: 'gorras',
    printArea: { x: 0.35, y: 0.30, w: 0.30, h: 0.22 },
    bgImage: '/uploads/proveedor/cottonext/c156a6cfe2e46d77.jpg' },
  { id: 'gorro-beanie', label: 'Gorro Beanie', category: 'gorras',
    printArea: { x: 0.30, y: 0.28, w: 0.40, h: 0.30 },
    bgImage: '/uploads/proveedor/cottonext/c43d1ab79b92f768.jpg' },
];

// Mapeo por ID para acceso rápido
const TEMPLATE_MAP = Object.fromEntries(
  CATALOG_PRODUCT_TEMPLATES.map(t => [t.id, t])
);

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
// CANVAS DEL MOCKUP CON IMAGEN REAL Y BLEND PROFESIONAL
// ============================================================================
function CatalogCanvas() {
  const canvasRef = useRef(null);
  const [bgImage, setBgImage] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState('polera-blanca');
  const [showPrintArea, setShowPrintArea] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const designCache = useRef(new Map());
  const canvasSize = 800;

  const template = TEMPLATE_MAP[selectedTemplate] || TEMPLATE_MAP['polera-blanca'];
  const pa = template.printArea;

  // Cargar imagen de fondo
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setBgImage(img);
    img.onerror = () => { toast.error('Error al cargar imagen de la prenda'); };
    img.src = template.bgImage;
  }, [selectedTemplate]);

  // Cache de imágenes de diseño
  useEffect(() => {
    designs.forEach(d => {
      if (designCache.current.has(d.id)) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        designCache.current.set(d.id, { imgEl: img });
        drawCanvas();
      };
      img.src = d.imageUrl;
    });
  }, [designs]);

  // ============================================================================
  // FUNCIÓN DE BLEND PROFESIONAL: integra el diseño con la textura de la prenda
  // Usa la luminosidad del fondo para simular sombras y relieve
  // ============================================================================
  const drawDesignWithBlend = (ctx, design, bgCtx, bgCanvas, dx, dy, dw, dh) => {
    const cached = designCache.current.get(design.id);
    if (!cached?.imgEl) return;

    ctx.save();
    
    // Centro de rotación
    const cx = design.x + design.width / 2;
    const cy = design.y + design.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((design.rotation || 0) * Math.PI / 180);
    ctx.translate(-cx, -cy);

    // === BLEND PROFESIONAL ===
    // 1. Dibujar el diseño normalmente
    ctx.drawImage(cached.imgEl, design.x, design.y, design.width, design.height);
    
    // 2. Crear un canvas temporal con la región del fondo detrás del diseño
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = design.width;
    tempCanvas.height = design.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Dibujar la porción del fondo que está detrás del diseño
    const bgScaleX = dw / bgCanvas.width;
    const bgScaleY = dh / bgCanvas.height;
    tempCtx.drawImage(
      bgCanvas,
      design.x - dx, design.y - dy, design.width, design.height,
      0, 0, design.width, design.height
    );
    
    // 3. Obtener los datos de píxeles del fondo para calcular luminosidad
    const bgData = tempCtx.getImageData(0, 0, design.width, design.height);
    
    // 4. Obtener los datos de píxeles del diseño
    const designCanvas = document.createElement('canvas');
    designCanvas.width = design.width;
    designCanvas.height = design.height;
    const designCtx = designCanvas.getContext('2d');
    designCtx.drawImage(cached.imgEl, 0, 0, design.width, design.height);
    const designData = designCtx.getImageData(0, 0, design.width, design.height);
    
    // 5. Aplicar blend: usar la luminosidad del fondo para modificar el diseño
    // Esto hace que el diseño siga las sombras y arrugas de la tela
    const bd = bgData.data;
    const dd = designData.data;
    
    for (let i = 0; i < dd.length; i += 4) {
      // Solo procesar píxeles no transparentes del diseño
      if (dd[i + 3] > 0) {
        // Calcular luminosidad del fondo en esta posición
        const lum = (bd[i] * 0.299 + bd[i + 1] * 0.587 + bd[i + 2] * 0.114) / 255;
        
        // Si el fondo es claro (polera blanca), aplicar el diseño con intensidad normal
        // Si el fondo es oscuro, mantener el color pero ajustar brillo
        const brightnessFactor = 0.7 + (lum * 0.3); // 0.7 a 1.0
        
        dd[i] = Math.min(255, Math.floor(dd[i] * brightnessFactor));
        dd[i + 1] = Math.min(255, Math.floor(dd[i + 1] * brightnessFactor));
        dd[i + 2] = Math.min(255, Math.floor(dd[i + 2] * brightnessFactor));
        
        // Aplicar opacidad del diseño
        dd[i + 3] = Math.floor(dd[i + 3] * (design.opacity || 1));
      }
    }
    
    // 6. Dibujar el diseño modificado sobre el canvas principal
    ctx.putImageData(designData, design.x, design.y);
    ctx.restore();
  };

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
      const imgAspect = bgImage.width / bgImage.height;
      const canvasAspect = 1;

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

    // Dibujar diseños con blend profesional
    for (const design of designs) {
      const cached = designCache.current.get(design.id);
      if (!cached?.imgEl) continue;

      // Usar blend profesional (integra con la textura de la prenda)
      drawDesignWithBlend(ctx, design, ctx, canvas, drawX || 0, drawY || 0, drawW || cs, drawH || cs);
      
      // Borde de selección
      if (design.id === selectedDesignId) {
        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(design.x, design.y, design.width, design.height);

        const hs = cs * 0.025;
        ctx.fillStyle = '#f97316';
        ctx.fillRect(design.x + design.width - hs, design.y + design.height - hs, hs, hs);
        ctx.restore();
      }
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
    const newDesign = {
      id,
      ...imageData,
      x: canvasSize * 0.35,
      y: canvasSize * 0.35,
      width: canvasSize * 0.30,
      height: canvasSize * 0.30,
      rotation: 0,
      opacity: 1,
    };
    setDesigns(prev => {
      const snap = snapshot(prev);
      setHistory(h => {
        const newH = h.slice(0, historyIndex + 1);
        newH.push(snap);
        if (newH.length > HISTORY_LIMIT) newH.shift();
        return newH;
      });
      setHistoryIndex(hi => Math.min(hi + 1, HISTORY_LIMIT - 1));
      return [...prev, newDesign];
    });
    setSelectedDesignId(id);
  };

  const removeDesign = (id) => {
    setDesigns(prev => {
      const snap = snapshot(prev);
      setHistory(h => {
        const newH = h.slice(0, historyIndex + 1);
        newH.push(snap);
        if (newH.length > HISTORY_LIMIT) newH.shift();
        return newH;
      });
      setHistoryIndex(hi => Math.min(hi + 1, HISTORY_LIMIT - 1));
      designCache.current.delete(id);
      return prev.filter(d => d.id !== id);
    });
    if (selectedDesignId === id) setSelectedDesignId(null);
  };

  const duplicateDesign = (id) => {
    const orig = designs.find(d => d.id === id);
    if (!orig) return;
    const newId = crypto.randomUUID();
    const newDesign = { ...orig, id: newId, x: orig.x + 20, y: orig.y + 20 };
    setDesigns(prev => [...prev, newDesign]);
    setSelectedDesignId(newId);
  };

  const updateDesignLive = (id, patch) => {
    setDesigns(prev => prev.map(d =>
      d.id === id ? { ...d, ...patch } : d
    ));
  };

  const undo = () => {
    if (historyIndex < 0) return;
    const prevSnapshot = history[historyIndex];
    setDesigns(restoreImgs(prevSnapshot, designCache.current));
    setHistoryIndex(prev => prev - 1);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextSnapshot = history[historyIndex + 1];
    setDesigns(restoreImgs(nextSnapshot, designCache.current));
    setHistoryIndex(prev => prev + 1);
  };

  const clearDesigns = () => {
    const snap = snapshot(designs);
    setHistory(prev => [...prev.slice(0, historyIndex + 1), snap]);
    setHistoryIndex(prev => prev + 1);
    setDesigns([]);
    setSelectedDesignId(null);
  };

  // Exportar
  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) { toast.error('No hay canvas'); return; }

    const exportCanvas = document.createElement('canvas');
    const scale = 2;
    exportCanvas.width = canvasSize * scale;
    exportCanvas.height = canvasSize * scale;
    const ctx = exportCanvas.getContext('2d');

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
    link.download = `mockup-${template.label.replace(/\s|\(|\)/g, '_')}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    toast.success('Mockup exportado');
  };

  const selectedDesign = designs.find(d => d.id === selectedDesignId);

  const garmentTypes = [
    { group: 'Poleras', items: CATALOG_PRODUCT_TEMPLATES.filter(t => t.category === 'poleras').map(t => t.id) },
    { group: 'Polerones', items: CATALOG_PRODUCT_TEMPLATES.filter(t => t.category === 'polerones').map(t => t.id) },
    { group: 'Gorras', items: CATALOG_PRODUCT_TEMPLATES.filter(t => t.category === 'gorras').map(t => t.id) },
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
            {/* Selector de prendas del catálogo */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Elige tu prenda</h3>
              <div className="space-y-3">
                {garmentTypes.map(group => (
                  <div key={group.group}>
                    <div className="text-xs text-slate-500 font-medium mb-1.5">{group.group}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {group.items.map(id => {
                        const t = TEMPLATE_MAP[id];
                        if (!t) return null;
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
                              relative rounded-lg overflow-hidden border-2 transition-all aspect-square
                              ${active
                                ? 'border-orange-500 shadow-md ring-2 ring-orange-200'
                                : 'border-slate-200 hover:border-orange-300'}
                            `}
                          >
                            <img
                              src={t.bgImage}
                              alt={t.label}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div className={`absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] py-0.5 px-1 truncate`}>
                              {t.label}
                            </div>
                            {active && (
                              <div className="absolute top-1 right-1 bg-orange-500 rounded-full p-0.5">
                                <Check className="h-2.5 w-2.5 text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                <strong>{template?.label}</strong> — Foto real del catálogo.
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
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);

  useEffect(() => {
    const fetchLibrary = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '200' });
        if (search) params.set('search', search);
        if (selectedFolder) params.set('folderId', selectedFolder);
        const r = await fetch(`/api/design-library?${params}`);
        if (r.ok) {
          const data = await r.json();
          setItems(data.items || data.designs || []);
        }
      } catch {
        toast.error('Error cargando biblioteca');
      }
      setLoading(false);
    };
    fetchLibrary();
  }, [search, selectedFolder]);

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" />
        Biblioteca
      </h3>
      <Input
        placeholder="Buscar en la biblioteca..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-2 text-xs"
      />
      <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
        {loading ? (
          <div className="col-span-3 flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="col-span-3 text-xs text-slate-400 text-center py-4">Sin resultados</div>
        ) : (
          items.map((item) => (
            <button
              key={item.id || item._id}
              onClick={() => onSelect({
                imageUrl: item.imageUrl || item.url || item.image,
                name: item.name || item.filename || 'Diseño',
                srcWidthPx: item.widthPx || 512,
                srcHeightPx: item.heightPx || 512,
              })}
              className="relative rounded-lg overflow-hidden border border-slate-200 hover:border-orange-400 aspect-square bg-slate-50 transition-all"
            >
              <img
                src={item.imageUrl || item.url || item.image}
                alt={item.name || 'Diseño'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR: LISTA DE CAPAS
// ============================================================================
function LayersList({ designs, selectedDesignId, onSelect, onRemove }) {
  if (designs.length === 0) {
    return <div className="text-xs text-slate-400">Sin diseños. Sube uno o elige de la biblioteca.</div>;
  }

  return (
    <div className="space-y-1.5">
      {designs.map(d => (
        <div
          key={d.id}
          onClick={() => onSelect(d.id)}
          className={`
            flex items-center gap-2 rounded-lg px-2.5 py-1.5 cursor-pointer transition-all
            ${selectedDesignId === d.id
              ? 'bg-orange-50 border border-orange-300'
              : 'hover:bg-slate-50 border border-transparent'}
          `}
        >
          <div className="w-8 h-8 rounded overflow-hidden bg-slate-100 shrink-0">
            <img src={d.imageUrl} alt={d.name} className="w-full h-full object-cover" />
          </div>
          <span className="text-xs text-slate-700 truncate flex-1">{d.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(d.id); }}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// SIDEBAR: PROPIEDADES DEL DISEÑO
// ============================================================================
function DesignProperties({ design, onUpdate, onDuplicate, onRemove }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-slate-600 block mb-1">Opacidad</label>
        <Slider
          value={[design.opacity || 1]}
          onValueChange={([v]) => onUpdate({ opacity: v })}
          min={0}
          max={1}
          step={0.05}
        />
      </div>
      <div>
        <label className="text-xs text-slate-600 block mb-1">Rotación: {Math.round(design.rotation || 0)}°</label>
        <Slider
          value={[design.rotation || 0]}
          onValueChange={([v]) => onUpdate({ rotation: v })}
          min={-180}
          max={180}
          step={1}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onDuplicate} className="flex-1">
          <Copy className="h-3 w-3 mr-1" /> Duplicar
        </Button>
        <Button variant="outline" size="sm" onClick={onRemove} className="flex-1 text-red-600 hover:text-red-700">
          <Trash2 className="h-3 w-3 mr-1" /> Eliminar
        </Button>
      </div>
    </div>
  );
}

export default function MockupCatalogEditor() {
  return <CatalogCanvas />;
}
