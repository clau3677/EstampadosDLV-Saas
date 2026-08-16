'use client';

// ============================================================================
// GangSheetCanvas — Editor visual imperativo con Konva.js (sin react-konva)
// Coordenadas internas: milímetros. Pantalla: mm * scale (cálculo dinámico).
// Se sincroniza con el store de Zustand.
// ============================================================================

import { useRef, useEffect, useState } from 'react';
import Konva from 'konva';
import { useGangSheet } from '@/lib/gang-sheet-store';

const RULER_H = 24;
const RULER_W = 28;
const MAX_H = 620;              // altura del contenedor visible (scroll interno si el pliego es mayor)
const MIN_SCALE = 0.4;          // escala mínima aceptable

export default function GangSheetCanvas() {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const bgLayerRef = useRef(null);
  const designLayerRef = useRef(null);
  const nodesRef = useRef(new Map());     // designId -> { group, image, rect, transformer }
  const transformerRef = useRef(null);
  const [containerW, setContainerW] = useState(800);

  const store = useGangSheet();
  const { canvasWidthMm, designs, selectedId, selectedIds, select, updateDesign, computedLengthMm, designWarnings, zoom, snapEnabled, snapGridMm } = store;
  const canvasLengthMm = computedLengthMm();

  // ---- Escala: se ajusta al ancho disponible; el zoom del usuario multiplica ----
  const availW = Math.max(400, containerW - 24);
  const scaleX = (availW - RULER_W - 20) / canvasWidthMm;
  const scaleYFit = (MAX_H - RULER_H - 20) / canvasLengthMm;
  const baseScale = Math.min(Math.max(scaleX, MIN_SCALE), 3);
  const scale = baseScale * (zoom || 1);
  const stageW = RULER_W + canvasWidthMm * scale + 10;
  const stageH = RULER_H + canvasLengthMm * scale + 10;
  const offX = RULER_W;
  const offY = RULER_H;

  // ---- Resize observer ----
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ---- Init Stage (una sola vez) ----
  useEffect(() => {
    if (!containerRef.current || stageRef.current) return;

    const stage = new Konva.Stage({
      container: containerRef.current,
      width: stageW,
      height: stageH,
    });
    stageRef.current = stage;

    const bgLayer = new Konva.Layer({ listening: false });
    const designLayer = new Konva.Layer();
    stage.add(bgLayer);
    stage.add(designLayer);
    bgLayerRef.current = bgLayer;
    designLayerRef.current = designLayer;

    const transformer = new Konva.Transformer({
      keepRatio: true,
      rotateEnabled: true,
      rotationSnaps: [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345],
      rotationSnapTolerance: 5,
      enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      borderStroke: '#f97316',
      anchorStroke: '#f97316',
      anchorFill: '#ffffff',
      anchorSize: 8,
      boundBoxFunc: (oldBox, newBox) => (newBox.width < 15 || newBox.height < 15 ? oldBox : newBox),
    });
    designLayer.add(transformer);
    transformerRef.current = transformer;

    // Click en el fondo deselecciona
    stage.on('mousedown touchstart', (e) => {
      if (e.target === stage || e.target.attrs.__isBg) {
        useGangSheet.getState().select(null);
      }
    });

    // (H) Zoom con Ctrl+wheel
    stage.on('wheel', (e) => {
      if (!e.evt.ctrlKey && !e.evt.metaKey) return;
      e.evt.preventDefault();
      const delta = e.evt.deltaY;
      if (delta < 0) useGangSheet.getState().zoomIn();
      else useGangSheet.getState().zoomOut();
    });

    return () => {
      stage.destroy();
      stageRef.current = null;
      nodesRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Redibujar fondo/regla al cambiar dimensiones ----
  useEffect(() => {
    const stage = stageRef.current;
    const bg = bgLayerRef.current;
    if (!stage || !bg) return;

    stage.width(stageW);
    stage.height(stageH);
    bg.destroyChildren();

    // Fondo del lienzo blanco
    bg.add(new Konva.Rect({
      x: offX, y: offY,
      width: canvasWidthMm * scale,
      height: canvasLengthMm * scale,
      fill: '#ffffff',
      stroke: '#cbd5e1',
      strokeWidth: 1,
      __isBg: true,
    }));

    // Grid cada 10mm
    for (let mm = 10; mm < canvasWidthMm; mm += 10) {
      bg.add(new Konva.Line({
        points: [offX + mm * scale, offY, offX + mm * scale, offY + canvasLengthMm * scale],
        stroke: '#f1f5f9', strokeWidth: 0.5, __isBg: true,
      }));
    }
    for (let mm = 10; mm < canvasLengthMm; mm += 10) {
      bg.add(new Konva.Line({
        points: [offX, offY + mm * scale, offX + canvasWidthMm * scale, offY + mm * scale],
        stroke: '#f1f5f9', strokeWidth: 0.5, __isBg: true,
      }));
    }

    // Regla superior y lateral
    bg.add(new Konva.Rect({ x: 0, y: 0, width: stageW, height: RULER_H, fill: '#f1f5f9', __isBg: true }));
    bg.add(new Konva.Rect({ x: 0, y: 0, width: RULER_W, height: stageH, fill: '#f1f5f9', __isBg: true }));
    bg.add(new Konva.Rect({ x: 0, y: 0, width: RULER_W, height: RULER_H, fill: '#e2e8f0', __isBg: true }));
    bg.add(new Konva.Text({ text: 'cm', x: 6, y: 7, fontSize: 9, fill: '#475569', fontStyle: 'bold', __isBg: true }));

    for (let mm = 0; mm <= canvasWidthMm; mm += 10) {
      const x = offX + mm * scale;
      const big = mm % 50 === 0;
      bg.add(new Konva.Line({ points: [x, RULER_H - (big ? 10 : 5), x, RULER_H], stroke: '#94a3b8', strokeWidth: 0.5, __isBg: true }));
      if (big) bg.add(new Konva.Text({ text: String(mm / 10), x: x - 6, y: 2, fontSize: 9, fill: '#64748b', __isBg: true }));
    }
    for (let mm = 0; mm <= canvasLengthMm; mm += 10) {
      const y = offY + mm * scale;
      const big = mm % 50 === 0;
      bg.add(new Konva.Line({ points: [RULER_W - (big ? 10 : 5), y, RULER_W, y], stroke: '#94a3b8', strokeWidth: 0.5, __isBg: true }));
      if (big) bg.add(new Konva.Text({ text: String(mm / 10), x: 2, y: y - 4, fontSize: 9, fill: '#64748b', __isBg: true }));
    }

    bg.batchDraw();
  }, [canvasWidthMm, canvasLengthMm, scale, stageW, stageH, offX, offY]);

  // ---- Sincronizar diseños ----
  useEffect(() => {
    const layer = designLayerRef.current;
    if (!layer) return;

    const currentIds = new Set(designs.map(d => d.id));

    // Remover nodos eliminados
    for (const [id, entry] of nodesRef.current.entries()) {
      if (!currentIds.has(id)) {
        entry.group.destroy();
        nodesRef.current.delete(id);
      }
    }

    // Detectar solapamientos (D) — se recalculan en cada render de la layer
    const overlapping = useGangSheet.getState().detectOverlaps();

    // Crear o actualizar
    for (const d of designs) {
      let entry = nodesRef.current.get(d.id);
      const warns = designWarnings(d);
      const hasErr = warns.some(w => w.type === 'off_canvas');
      const hasLow = warns.some(w => w.type === 'low_dpi');
      const hasOverlap = overlapping.has(d.id);
      // Prioridad de colores: overlap > off_canvas > low_dpi > normal
      const strokeColor = hasOverlap ? '#dc2626'
                        : hasErr     ? '#ef4444'
                        : hasLow     ? '#f59e0b'
                        : '#f97316';
      const dashPattern = hasOverlap ? [6, 3]
                        : hasErr     ? [4, 4]
                        : hasLow     ? [3, 3]
                        : [];

      if (!entry) {
        // Nuevo grupo
        const group = new Konva.Group({ id: d.id });
        const image = new Konva.Image({
          image: d.image,
          x: offX + d.xMm * scale,
          y: offY + d.yMm * scale,
          width: d.widthMm * scale,
          height: d.heightMm * scale,
          rotation: d.rotation,
          draggable: true,
        });
        const rect = new Konva.Rect({
          x: image.x(), y: image.y(),
          width: image.width(), height: image.height(),
          rotation: d.rotation,
          stroke: strokeColor,
          strokeWidth: 2,
          dash: dashPattern,
          listening: false,
          visible: false,
        });

        image.on('mousedown touchstart', (e) => {
          const additive = e.evt?.ctrlKey || e.evt?.metaKey || e.evt?.shiftKey;
          useGangSheet.getState().select(d.id, additive ? 'toggle' : 'replace');
        });

        image.on('dragmove', () => {
          rect.position({ x: image.x(), y: image.y() });
          rect.rotation(image.rotation());
        });

        image.on('dragend', () => {
          const s = useGangSheet.getState();
          let newX = Math.round((image.x() - offX) / scale);
          let newY = Math.round((image.y() - offY) / scale);
          // Clamp al lienzo: no salir por los bordes
          newX = Math.max(0, Math.min(newX, s.canvasWidthMm - d.widthMm));
          newY = Math.max(0, Math.min(newY, canvasLengthMm - d.heightMm));
          // (G) Snap to grid on drop
          if (s.snapEnabled && s.snapGridMm > 0) {
            newX = Math.round(newX / s.snapGridMm) * s.snapGridMm;
            newY = Math.round(newY / s.snapGridMm) * s.snapGridMm;
            // Reflejar snap visual inmediatamente
            image.x(offX + newX * scale);
            image.y(offY + newY * scale);
            rect.position({ x: image.x(), y: image.y() });
          } else {
            // Reflejar clamp visual
            image.x(offX + newX * scale);
            image.y(offY + newY * scale);
            rect.position({ x: image.x(), y: image.y() });
          }
          useGangSheet.getState().updateDesign(d.id, { xMm: newX, yMm: newY });
        });

        image.on('transformend', () => {
          const sX = image.scaleX();
          const sY = image.scaleY();
          image.scaleX(1);
          image.scaleY(1);
          // Usar el máximo de scaleX/scaleY para mantener aspect ratio (keepRatio: true)
          const maxS = Math.max(sX, sY);
          const newW = Math.max(5, Math.round((image.width() * maxS) / scale));
          const newH = Math.max(5, Math.round((image.height() * maxS) / scale));
          const s = useGangSheet.getState();
          let newX = Math.round((image.x() - offX) / scale);
          let newY = Math.round((image.y() - offY) / scale);
          // Clamp al lienzo: no salir por los bordes
          newX = Math.max(0, Math.min(newX, s.canvasWidthMm - newW));
          newY = Math.max(0, Math.min(newY, canvasLengthMm - newH));
          if (s.snapEnabled && s.snapGridMm > 0) {
            newX = Math.round(newX / s.snapGridMm) * s.snapGridMm;
            newY = Math.round(newY / s.snapGridMm) * s.snapGridMm;
          }
          // Reflejar visual
          image.x(offX + newX * scale);
          image.y(offY + newY * scale);
          image.width(newW * scale);
          image.height(newH * scale);
          rect.position({ x: image.x(), y: image.y() });
          rect.width(image.width());
          rect.height(image.height());
          useGangSheet.getState().updateDesign(d.id, {
            xMm: newX,
            yMm: newY,
            widthMm: newW,
            heightMm: newH,
            rotation: image.rotation(),
          });
        });

        group.add(image);
        group.add(rect);
        layer.add(group);
        entry = { group, image, rect };
        nodesRef.current.set(d.id, entry);
      } else {
        // Actualizar props
        entry.image.image(d.image);
        entry.image.x(offX + d.xMm * scale);
        entry.image.y(offY + d.yMm * scale);
        entry.image.width(d.widthMm * scale);
        entry.image.height(d.heightMm * scale);
        entry.image.rotation(d.rotation);
        entry.rect.x(entry.image.x());
        entry.rect.y(entry.image.y());
        entry.rect.width(entry.image.width());
        entry.rect.height(entry.image.height());
        entry.rect.rotation(d.rotation);
        entry.rect.stroke(strokeColor);
        entry.rect.dash(dashPattern);
      }

      // Mostrar borde si seleccionado (multi), error, low DPI o solapamiento
      const isSelected = selectedIds?.includes(d.id) || selectedId === d.id;
      entry.rect.visible(isSelected || hasErr || hasLow || hasOverlap);
    }

    // Traer el Transformer al frente
    if (transformerRef.current) transformerRef.current.moveToTop();

    // Configurar transformer con TODOS los nodos seleccionados (E: multi-select)
    const tr = transformerRef.current;
    if (tr) {
      const selEntries = (selectedIds && selectedIds.length > 0
        ? selectedIds.map(id => nodesRef.current.get(id)).filter(Boolean)
        : selectedId ? [nodesRef.current.get(selectedId)].filter(Boolean) : []
      );
      tr.nodes(selEntries.map(e => e.image));
    }

    layer.batchDraw();
  }, [designs, selectedId, selectedIds, scale, offX, offY, canvasWidthMm, canvasLengthMm, designWarnings]);

  return (
    <div className="relative w-full bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="absolute top-3 left-3 z-10 bg-slate-900/90 text-white text-[11px] px-2.5 py-1 rounded-md font-mono font-semibold shadow-lg pointer-events-none">
        {(canvasWidthMm/10).toFixed(0)} × {(canvasLengthMm/10).toFixed(1)} cm
      </div>
      <div className="absolute top-3 right-3 z-10 bg-white/95 text-slate-700 text-[11px] px-2.5 py-1 rounded-md font-medium ring-1 ring-slate-200 shadow-sm pointer-events-none">
        {designs.length} diseño{designs.length === 1 ? '' : 's'}
      </div>
      {stageH > MAX_H && (
        <div className="absolute bottom-3 right-3 z-10 bg-orange-500/90 text-white text-[10px] px-2 py-0.5 rounded-md font-semibold shadow-lg pointer-events-none">
          ↕ Scroll vertical
        </div>
      )}
      <div ref={containerRef} className="w-full overflow-y-auto overflow-x-hidden rounded-xl" style={{ maxHeight: MAX_H + 20 }}>
      </div>
    </div>
  );
}
