'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Upload, Trash2, Copy, Undo2, Redo2,
  ZoomIn, ZoomOut, Download, Shirt, Loader2, Image as ImageIcon,
  Sparkles, Check, Layers, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

// ============================================================================
// CARGA DINÁMICA DE PRODUCTOS DEL CATÁLOGO
// ============================================================================
// El editor carga TODOS los productos activos del catálogo desde /api/products
// y los muestra en el sidebar como plantillas de mockup.

const CANVAS_SIZE = 800;
const HISTORY_LIMIT = 30;
const LIBRARY_PAGE_SIZE = 48;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Categorías del catálogo y sus labels
const CATEGORY_LABELS = {
  blank_apparel: 'Ropa Lisa',
  caps_hats: 'Gorras',
  workwear: 'Ropa de Trabajo',
  printed_apparel: 'Ropa Estampada',
  merch: 'Merchandising',
  dtf_meter: 'DTF por metro',
};

// Print areas por categoría (zona donde se coloca el diseño)
function getPrintArea(category, subcategory, name) {
  const n = (name || '').toLowerCase();
  // Gorras
  if (category === 'caps_hats' || n.includes('gorra') || n.includes('gorro')) {
    return { x: 0.35, y: 0.30, w: 0.30, h: 0.25 };
  }
  // Polerones
  if (category === 'blank_apparel' && subcategory === 'polerones') {
    return { x: 0.25, y: 0.28, w: 0.50, h: 0.45 };
  }
  // Poleras
  if (category === 'blank_apparel' && subcategory === 'poleras') {
    return { x: 0.28, y: 0.28, w: 0.44, h: 0.48 };
  }
  // Pantalones / shorts / otros
  if (category === 'blank_apparel' && (subcategory === 'pantalones' || subcategory === 'shorts')) {
    return { x: 0.30, y: 0.25, w: 0.40, h: 0.45 };
  }
  // Ropa de trabajo
  if (category === 'workwear') {
    return { x: 0.28, y: 0.25, w: 0.44, h: 0.50 };
  }
  // Ropa estampada
  if (category === 'printed_apparel') {
    return { x: 0.28, y: 0.28, w: 0.44, h: 0.48 };
  }
  // Merch
  if (category === 'merch') {
    return { x: 0.30, y: 0.30, w: 0.40, h: 0.40 };
  }
  // DTF meter
  if (category === 'dtf_meter') {
    return { x: 0.25, y: 0.30, w: 0.50, h: 0.40 };
  }
  // Default
  return { x: 0.28, y: 0.28, w: 0.44, h: 0.45 };
}

// Detectar si la prenda es clara u oscura (luminosidad promedio)
function isGarmentDark(imgData) {
  if (!imgData) return false;
  const data = imgData.data;
  let lumSum = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(data.length / 4 / 100)); // Sample ~100 pixels
  for (let i = 0; i < data.length; i += 4 * step) {
    lumSum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    count++;
  }
  return (lumSum / count) < 100; // < 100 = oscura
}

// Historial
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
// APLICAR BLEND PROFESIONAL (estilo Placeit.net - compositeOperation nativo)
// ============================================================================
// Placeit usa blend modes nativos del canvas (multiply/screen) que son:
// - Multiplicación: oscurece, perfecto para diseños sobre fondos claros
// - Screen: aclara, perfecto para diseños sobre fondos oscuros
// Esto es más simple, más rápido y produce resultados más naturales
// porque no distorsiona la imagen como el displacement mapping.
// ============================================================================
function applyBlendNative(designCanvas, bgRegionCanvas, opacity, garmentDark) {
  const w = designCanvas.width;
  const h = designCanvas.height;

  // Crear canvas temporal para aplicar el blend
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = w;
  resultCanvas.height = h;
  const rCtx = resultCanvas.getContext('2d');

  // Primero dibujar el diseño con opacidad
  rCtx.globalAlpha = opacity;
  rCtx.drawImage(designCanvas, 0, 0, w, h);

  // Aplicar blend mode nativo
  // Multiply: el blanco se vuelve transparente (los colores del diseño se mezclan con la tela)
  // Screen: el negro se vuelve transparente (los colores claros del diseño brillan)
  rCtx.globalCompositeOperation = garmentDark ? 'screen' : 'multiply';
  rCtx.drawImage(designCanvas, 0, 0, w, h);

  // Volver al blend normal para cualquier otra operación
  rCtx.globalCompositeOperation = 'source-over';

  return resultCanvas;
}

// ============================================================================
// COMPONENTE PRINCIPAL: Editor de Mockups
// ============================================================================
export default function CatalogCanvas() {
  const canvasRef = useRef(null);
  const [bgImage, setBgImage] = useState(null);
  const [bgImgData, setBgImgData] = useState(null); // Para detección de oscuridad
  const [designs, setDesigns] = useState([]);
  const [selectedDesignId, setSelectedDesignId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null); // Producto del catálogo
  const [showPrintArea, setShowPrintArea] = useState(false);
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Productos del catálogo
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);

  const designCache = useRef(new Map());

  // Cargar productos del catálogo
  useEffect(() => {
    const loadProducts = async () => {
      setLoadingProducts(true);
      try {
        const r = await fetch('/api/products');
        if (r.ok) {
          const all = await r.json();
          // Filtrar productos activos con imágenes
          // Excluir máquinas DTF (no son prendas para mockup)
          const active = all.filter(p =>
            p.active && p.images && p.images.length > 0 &&
            p.category !== 'dtf_uv' &&
            p.category !== 'dtf_textil' &&
            !['dtf_uv', 'dtf_textil'].includes(p.subcategory || '')
          );
          setCatalogProducts(active);
          // Seleccionar el primer producto por defecto
          if (active.length > 0) {
            setSelectedProduct(active[0]);
          }
        }
      } catch (err) {
        console.error('Error loading products:', err);
        toast.error('Error al cargar el catálogo');
      }
      setLoadingProducts(false);
    };
    loadProducts();
  }, []);

  // Obtener print area del producto seleccionado
  const printArea = useMemo(() => {
    if (!selectedProduct) return getPrintArea('blank_apparel', 'poleras', '');
    return getPrintArea(selectedProduct.category, selectedProduct.subcategory, selectedProduct.name);
  }, [selectedProduct]);

  // Productos filtrados
  const filteredProducts = useMemo(() => {
    let result = catalogProducts;
    if (categoryFilter) {
      result = result.filter(p => p.category === categoryFilter);
    }
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.subcategory || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [catalogProducts, categoryFilter, productSearch]);

  // Categorías disponibles
  const availableCategories = useMemo(() => {
    const cats = new Map();
    catalogProducts.forEach(p => {
      const c = p.category || 'other';
      const label = CATEGORY_LABELS[c] || c;
      if (!cats.has(c)) {
        cats.set(c, { code: c, label, count: 0 });
      }
      cats.get(c).count++;
    });
    return Array.from(cats.values()).sort((a, b) => b.count - a.count);
  }, [catalogProducts]);

  // Cargar imagen de fondo cuando cambia el producto
  useEffect(() => {
    if (!selectedProduct) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBgImage(img);
      // Detectar si la prenda es clara u oscura
      const tmpCanvas = document.createElement('canvas');
      const w = Math.min(img.width, 200);
      const h = Math.min(img.height, 200);
      tmpCanvas.width = w;
      tmpCanvas.height = h;
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(img, 0, 0, w, h);
      setBgImgData(tmpCtx.getImageData(0, 0, w, h));
    };
    img.onerror = () => {
      toast.error('Error al cargar imagen del producto');
    };
    img.src = selectedProduct.images[0];
  }, [selectedProduct]);

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

  // Dibujar canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cs = CANVAS_SIZE * zoom;
    canvas.width = cs;
    canvas.height = cs;

    ctx.clearRect(0, 0, cs, cs);

    // Dibujar imagen de fondo (producto real)
    let drawW, drawH, drawX, drawY;
    if (bgImage) {
      const imgAspect = bgImage.width / bgImage.height;
      const canvasAspect = 1;

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
      const px = printArea.x * cs;
      const py = printArea.y * cs;
      const pw = printArea.w * cs;
      const ph = printArea.h * cs;
      ctx.strokeRect(px, py, pw, ph);
      ctx.fillStyle = 'rgba(255,100,0,0.7)';
      ctx.font = `${Math.max(10, cs * 0.018)}px system-ui`;
      ctx.fillText('Zona de impresión', px + 4, py + cs * 0.025);
      ctx.restore();
    }

    // Dibujar diseños con blend profesional estilo Placeit.net
    for (const design of designs) {
      const cached = designCache.current.get(design.id);
      if (!cached?.imgEl) continue;

      // Paso 1: Canvas temporal del diseño
      const designCanvas = document.createElement('canvas');
      const dw2 = Math.round(design.width);
      const dh2 = Math.round(design.height);
      designCanvas.width = dw2;
      designCanvas.height = dh2;
      const designCtx = designCanvas.getContext('2d');

      // Aplicar rotación
      designCtx.save();
      const cx = dw2 / 2;
      const cy = dh2 / 2;
      designCtx.translate(cx, cy);
      designCtx.rotate((design.rotation || 0) * Math.PI / 180);
      designCtx.translate(-cx, -cy);
      designCtx.drawImage(cached.imgEl, 0, 0, dw2, dh2);
      designCtx.restore();

      // Paso 2: Aplicar blend nativo (multiply para claras, screen para oscuras)
      const isDark = isGarmentDark(bgImgData);
      const finalCanvas = applyBlendNative(
        designCanvas, null, design.opacity || 1, isDark
      );

      // Paso 3: Dibujar resultado sobre el canvas principal
      ctx.save();
      ctx.drawImage(finalCanvas, design.x, design.y, dw2, dh2);
      ctx.restore();

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
  }, [bgImage, bgImgData, designs, selectedDesignId, zoom, printArea, showPrintArea]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // Eventos de mouse
  const getMousePos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS_SIZE * zoom / rect.width;
    const scaleY = CANVAS_SIZE * zoom / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e) => {
    const pos = getMousePos(e);
    const cs = CANVAS_SIZE * zoom;

    // Resize handle
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

    // Hit test
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
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const pa = printArea;
    const newDesign = {
      id,
      ...imageData,
      x: pa.x * CANVAS_SIZE,
      y: pa.y * CANVAS_SIZE,
      width: pa.w * CANVAS_SIZE,
      height: pa.h * CANVAS_SIZE,
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
    const newId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    exportCanvas.width = CANVAS_SIZE * scale;
    exportCanvas.height = CANVAS_SIZE * scale;
    const ctx = exportCanvas.getContext('2d');

    let drawW, drawH, drawX, drawY;
    if (bgImage) {
      const imgAspect = bgImage.width / bgImage.height;
      const canvasAspect = 1;
      if (imgAspect > canvasAspect) {
        drawW = CANVAS_SIZE * scale * 0.95;
        drawH = drawW / imgAspect;
        drawX = (CANVAS_SIZE * scale - drawW) / 2;
        drawY = (CANVAS_SIZE * scale - drawH) / 2;
      } else {
        drawH = CANVAS_SIZE * scale * 0.95;
        drawW = drawH * imgAspect;
        drawX = (CANVAS_SIZE * scale - drawW) / 2;
        drawY = (CANVAS_SIZE * scale - drawH) / 2;
      }
      ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
    }

    for (const design of designs) {
      const cached = designCache.current.get(design.id);
      if (!cached?.imgEl) continue;
      ctx.save();
      ctx.globalAlpha = design.opacity || 1;
      const sx = scale;
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
    const productName = selectedProduct?.name?.replace(/\s+/g, '_') || 'mockup';
    link.download = `mockup-${productName}-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    toast.success('Mockup exportado');
  };

  const selectedDesign = designs.find(d => d.id === selectedDesignId);

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
            {selectedProduct && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">
                {selectedProduct.name}
              </Badge>
            )}
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
          style={{ width: CANVAS_SIZE * zoom, height: CANVAS_SIZE * zoom }}
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
          {loadingProducts && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          )}
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
          Selecciona un producto del catálogo para cambiar la prenda base.
        </div>
      </div>

      {/* ============ SIDEBAR ============ */}
      <div className="w-full lg:w-96 xl:w-[420px] shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden sticky top-4">
          <div className="p-4 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">

            {/* Selector de productos del catálogo */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                <Shirt className="h-3.5 w-3.5" />
                Elige tu producto ({catalogProducts.length})
              </h3>

              {/* Buscador */}
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Buscar producto..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-8 text-xs h-8"
                />
              </div>

              {/* Filtro por categoría */}
              <div className="flex flex-wrap gap-1 mb-2">
                <button
                  onClick={() => setCategoryFilter(null)}
                  className={`px-2 py-1 text-[10px] rounded-full border transition-all ${
                    !categoryFilter
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-orange-300'
                  }`}
                >
                  Todos ({catalogProducts.length})
                </button>
                {availableCategories.map(cat => (
                  <button
                    key={cat.code}
                    onClick={() => setCategoryFilter(cat.code === categoryFilter ? null : cat.code)}
                    className={`px-2 py-1 text-[10px] rounded-full border transition-all ${
                      categoryFilter === cat.code
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-orange-300'
                    }`}
                  >
                    {cat.label} ({cat.count})
                  </button>
                ))}
              </div>

              {/* Grid de productos */}
              <div className="grid grid-cols-3 gap-1.5 max-h-[300px] overflow-y-auto">
                {filteredProducts.map(product => {
                  const isActive = selectedProduct?.id === product.id;
                  return (
                    <button
                      key={product.id}
                      onClick={() => {
                        setSelectedProduct(product);
                        setDesigns([]);
                        setSelectedDesignId(null);
                        setHistory([]);
                        setHistoryIndex(-1);
                        designCache.current.clear();
                      }}
                      className={`
                        relative rounded-lg overflow-hidden border-2 transition-all aspect-square
                        ${isActive
                          ? 'border-orange-500 shadow-md ring-2 ring-orange-200'
                          : 'border-slate-200 hover:border-orange-300'}
                      `}
                      title={product.name}
                    >
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] py-0.5 px-1 truncate">
                        {product.name}
                      </div>
                      {isActive && (
                        <div className="absolute top-1 right-1 bg-orange-500 rounded-full p-0.5">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {filteredProducts.length === 0 && !loadingProducts && (
                <p className="text-xs text-slate-500 text-center py-4">No se encontraron productos</p>
              )}
              {loadingProducts && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                </div>
              )}
              <div className="mt-2 text-[10px] text-slate-400">
                {selectedProduct && (
                  <span>
                    <strong>{selectedProduct.name}</strong> — {CATEGORY_LABELS[selectedProduct.category] || selectedProduct.category}
                    {selectedProduct.subcategory && ` / ${selectedProduct.subcategory}`}
                  </span>
                )}
              </div>
            </div>

            {/* Subir diseño */}
            <div className="border-t border-slate-100 pt-4">
              <DesignUploader addDesign={addDesign} />
            </div>

            {/* Biblioteca de plantillas */}
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
// SIDEBAR: BIBLIOTECA DE PLANTILLAS (versión mejorada con paginación)
// ============================================================================
function LibraryPicker({ onSelect }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [page, setPage] = useState(1);
  const [folders, setFolders] = useState([]);
  const [totalPages, setTotalPages] = useState(1);

  const cacheRef = useRef({ data: [], folders: [], ts: 0, filterKey: '' });

  const filterKey = `${q.toLowerCase()}|${selectedFolder || ''}`;

  const fetchLibrary = useCallback(async (pageNum = 1, append = false) => {
    const params = new URLSearchParams({
      page: String(pageNum),
      size: String(LIBRARY_PAGE_SIZE),
    });
    if (q) params.set('search', q);
    if (selectedFolder) params.set('folder', selectedFolder);

    if (!append && !q && !selectedFolder &&
        cacheRef.current.data.length > 0 &&
        Date.now() - cacheRef.current.ts < CACHE_TTL_MS) {
      setItems(cacheRef.current.data);
      setFolders(cacheRef.current.folders);
      return;
    }

    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const r = await fetch(`/api/design-library?${params}`);
      if (r.ok) {
        const data = await r.json();
        const newItems = Array.isArray(data.items) ? data.items : [];

        if (append) {
          setItems(prev => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }

        if (Array.isArray(data.folders)) {
          setFolders(data.folders);
        }
        setTotalPages(data.totalPages || 1);
        setPage(pageNum);

        if (!append && !q && !selectedFolder) {
          cacheRef.current = {
            data: newItems,
            folders: data.folders || [],
            ts: Date.now(),
            filterKey: '',
          };
        }
      }
    } catch {
      toast.error('Error cargando biblioteca');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [q, selectedFolder]);

  useEffect(() => {
    fetchLibrary(1, false);
  }, [q, selectedFolder, fetchLibrary]);

  const handleSelect = (item) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      onSelect({
        imageUrl: item.imageUrl,
        name: item.name,
        srcWidthPx: item.srcWidthPx || img.naturalWidth,
        srcHeightPx: item.srcHeightPx || img.naturalHeight,
      });
      fetch(`/api/design-library/${item.id}/use`, { method: 'POST' }).catch(() => {});
      toast.success('Plantilla agregada', { description: item.name });
    };
    img.onerror = () => {
      onSelect({
        imageUrl: item.imageUrl,
        name: item.name,
        srcWidthPx: item.srcWidthPx || 1000,
        srcHeightPx: item.srcHeightPx || 1000,
      });
      fetch(`/api/design-library/${item.id}/use`, { method: 'POST' }).catch(() => {});
      toast.success('Plantilla agregada', { description: item.name });
    };
    img.src = item.imageUrl;
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" />
        Biblioteca de Plantillas
      </h3>

      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input
          placeholder="Buscar plantillas..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8 text-xs h-8"
        />
      </div>

      {/* Filtro por carpeta - Dropdown */}
      {folders.length > 1 && (
        <div className="mb-2">
          <select
            value={selectedFolder || ''}
            onChange={(e) => setSelectedFolder(e.target.value || null)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 cursor-pointer"
          >
            <option value="">Todas las carpetas</option>
            {folders.map(f => {
              const fName = typeof f === 'string' ? f : f?.name || 'Sin carpeta';
              const fCount = typeof f === 'object' ? f?.count || 0 : 0;
              return (
                <option key={fName} value={fName}>
                  {fName} ({fCount})
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Grid de plantillas */}
      <div className="grid grid-cols-3 gap-1.5 max-h-[200px] overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="col-span-3 flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="col-span-3 text-center py-4 text-xs text-slate-500">
            Sin resultados
          </div>
        ) : (
          items.map(item => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className="relative rounded-lg overflow-hidden border border-slate-200 hover:border-orange-400 transition-all aspect-square group"
              title={item.name}
            >
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            </button>
          ))
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loadingMore}
            onClick={() => fetchLibrary(page - 1, false)}
            className="h-6 px-2 text-[10px]"
          >
            ← Ant
          </Button>
          <span className="text-[10px] text-slate-500">{page}/{totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loadingMore}
            onClick={() => {
              fetchLibrary(page + 1, true);
              setPage(page + 1);
            }}
            className="h-6 px-2 text-[10px]"
          >
            Sig →
          </Button>
        </div>
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
      <div className="text-xs text-slate-400 text-center py-3">
        No hay capas. Sube un diseño o elige una plantilla.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {designs.map((d, i) => (
        <div
          key={d.id}
          onClick={() => onSelect(d.id)}
          className={`
            flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all
            ${selectedDesignId === d.id
              ? 'bg-orange-50 border border-orange-300'
              : 'bg-slate-50 border border-slate-200 hover:border-slate-300'}
          `}
        >
          <div className="w-8 h-8 rounded overflow-hidden bg-white border border-slate-200 shrink-0">
            <img src={d.imageUrl} alt={d.name} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-700 truncate">{d.name || `Capa ${i + 1}`}</div>
            <div className="text-[10px] text-slate-400">{d.srcWidthPx}×{d.srcHeightPx}px</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(d.id); }}
            className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
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
      <div>
        <label className="text-xs text-slate-500 block mb-1">Opacidad: {Math.round((design.opacity || 1) * 100)}%</label>
        <Slider
          value={[(design.opacity || 1) * 100]}
          onValueChange={(v) => onUpdate({ opacity: v[0] / 100 })}
          min={10}
          max={100}
          step={1}
          className="h-4"
        />
      </div>
      <div>
        <label className="text-xs text-slate-500 block mb-1">Rotación: {Math.round(design.rotation || 0)}°</label>
        <Slider
          value={[design.rotation || 0]}
          onValueChange={(v) => onUpdate({ rotation: v[0] })}
          min={-180}
          max={180}
          step={1}
          className="h-4"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onDuplicate}>
          <Copy className="h-3 w-3 mr-1" /> Duplicar
        </Button>
        <Button variant="outline" size="sm" className="flex-1 text-red-500 hover:text-red-600" onClick={onRemove}>
          <Trash2 className="h-3 w-3 mr-1" /> Eliminar
        </Button>
      </div>
    </div>
  );
}
