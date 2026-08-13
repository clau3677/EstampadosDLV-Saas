'use client';

// ============================================================================
// Gang Sheet Store — v3 (Antigro-parity Sprint 1)
// ----------------------------------------------------------------------------
// Nuevas features respecto a v2:
//   [A] duplicateNTimes(id, count, gapMm) — imposición automática de copias
//   [B] Trim transparent pixels — expuesto mediante applyTrimResult(id, trim)
//   [C] Smart auto-nesting (Shelf-based BLF con rotación) — reemplaza autoArrange
//   [D] detectOverlaps() — retorna Set de designIds solapados
//   [F] Undo/Redo con historial (50 pasos)
// ----------------------------------------------------------------------------
// Convención de coordenadas:
//   • Todas las medidas internas están en MILÍMETROS enteros
//   • xMm/yMm = esquina superior izquierda del bounding box
//   • rotation = grados (0, 90, 180, 270)
//   • widthMm/heightMm son SIEMPRE del bbox rotado (post-rotación)
// ============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { PRICING, quote } from './pricing';

const PADDING_MM        = 20;    // padding vertical alrededor de los diseños
const DEFAULT_LENGTH_MM = 1000;  // 1m default (estándar DTF Chile)
const MIN_LENGTH_MM     = 100;
const MAX_LENGTH_MM     = 5000;
const HISTORY_LIMIT     = 50;
const AUTONEST_GAP_MM   = 0;     // gap entre diseños en auto-nesting (0mm para corte preciso)

const LEGACY_MAP = {
  epson_r1390: 'dtf_textil_31',
  prestige_r2_pro: 'dtf_textil_33',
  dtf_uv: 'dtf_uv',
};

// ----------------------------------------------------------------------------
// Cache global de Image objects (no serializables). Por id de diseño.
// Se limpia solo en reset().
// ----------------------------------------------------------------------------
const imageCache = new Map();

// ----------------------------------------------------------------------------
// Helpers de historial (snapshot omite el objeto image no-serializable)
// ----------------------------------------------------------------------------
function snapshot(designs) {
  return designs.map(d => {
    // eslint-disable-next-line no-unused-vars
    const { image, ...rest } = d;
    return JSON.parse(JSON.stringify(rest));
  });
}
function restoreImages(snapshotArr) {
  return snapshotArr.map(d => ({ ...d, image: imageCache.get(d.id) || null }));
}

// ----------------------------------------------------------------------------
// Algoritmo de auto-nesting: Shelf Best-Fit Decreasing Height con rotación.
// Complejidad O(n²), aceptable hasta ~200 diseños.
//
// Estrategia:
//   1. Ordena diseños por max(w,h) descendente (grandes primero → menos huecos)
//   2. Para cada diseño, prueba ambas orientaciones (0° y 90°)
//   3. Best-fit: elige la shelf existente que deje menos espacio residual
//   4. Si nada calza, crea una nueva shelf abajo
//
// Retorna array de diseños con { xMm, yMm, rotation, widthMm, heightMm } actualizados.
// ----------------------------------------------------------------------------
function smartAutoNest(designs, canvasWidthMm, gap = AUTONEST_GAP_MM, allowRotate = true, maxLengthMm = MAX_LENGTH_MM) {
  if (!designs.length) return [];

  // Ordena por área descendente (mejor que solo por altura para packing)
  const items = [...designs].sort((a, b) => {
    const areaA = a.widthMm * a.heightMm;
    const areaB = b.widthMm * b.heightMm;
    if (areaB !== areaA) return areaB - areaA;
    return Math.max(b.widthMm, b.heightMm) - Math.max(a.widthMm, a.heightMm);
  });

  // Shelves: cada una { y, height, remainingWidth, filledUpToX }
  const shelves = [];
  const placed = [];
  const margin = 5;
  const usableWidth = canvasWidthMm - 2 * margin;

  for (const item of items) {
    // Detectar dimensiones "naturales" (sin rotación). Si el diseño ya fue rotado 90/270,
    // asumimos que widthMm/heightMm ya reflejan el bbox post-rotación.
    const options = [
      { w: item.widthMm, h: item.heightMm, deltaRot: 0 },
    ];
    if (allowRotate && item.widthMm !== item.heightMm) {
      options.push({ w: item.heightMm, h: item.widthMm, deltaRot: 90 });
    }

    let best = null;
    for (const opt of options) {
      if (opt.w > usableWidth) continue;

      // Buscar mejor shelf existente (best-fit por espacio residual)
      for (let i = 0; i < shelves.length; i++) {
        const shelf = shelves[i];
        if (shelf.remainingWidth < opt.w + gap) continue;
        if (opt.h > shelf.height + 0.5) continue;   // no crece la altura de shelves existentes
        const waste = shelf.remainingWidth - opt.w;
        const score = waste + (opt.deltaRot === 0 ? 0 : 0.1); // ligera preferencia por no-rotar
        if (!best || score < best.score) {
          best = {
            score,
            newShelf: false,
            shelfIndex: i,
            x: margin + shelf.filledUpToX,
            y: shelf.y,
            ...opt,
          };
        }
      }

      // También considerar crear una shelf nueva abajo
      const newY = shelves.length === 0
        ? margin
        : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + gap;
      // NO crear shelf nueva si se pasaría del largo máximo del pañol
      if (newY + opt.h > maxLengthMm) continue;
      // Penalización: crear shelf nueva cuesta más que reutilizar
      const newScore = (usableWidth - opt.w) + 1000;
      if (!best || newScore < best.score) {
        best = { score: newScore, newShelf: true, x: margin, y: newY, ...opt };
      }
    }

    if (!best) {
      // Fallback: no cabe ni rotado → dejar posición actual (raro, solo si w > canvas)
      placed.push({ ...item });
      continue;
    }

    // Aplicar rotación si corresponde
    const finalRotation = ((item.rotation || 0) + best.deltaRot) % 360;

    placed.push({
      ...item,
      xMm: Math.round(best.x),
      yMm: Math.round(best.y),
      widthMm: best.w,
      heightMm: best.h,
      rotation: finalRotation,
    });

    if (best.newShelf) {
      shelves.push({
        y: best.y,
        height: best.h,
        remainingWidth: usableWidth - best.w - gap,
        filledUpToX: best.w + gap,
      });
    } else {
      const shelf = shelves[best.shelfIndex];
      shelf.filledUpToX += best.w + gap;
      shelf.remainingWidth -= best.w + gap;
    }
  }

  return placed;
}

// ----------------------------------------------------------------------------
// Resolver solapamientos — mueve SOLO los diseños solapados sin cambiar
// tamaño ni rotación. Usa un grid de búsqueda para encontrar posiciones libres.
// ----------------------------------------------------------------------------
function resolveOverlaps(designs, canvasWidthMm, gap) {
  if (!designs.length) return designs;
  const result = designs.map(d => ({ ...d })); // copia superficial (sin image)
  const margin = 5;
  const usableWidth = canvasWidthMm - 2 * margin;

  // Ordenar por posición original (Y primero, luego X) para procesar de arriba a abajo
  const sorted = result
    .map((d, idx) => ({ ...d, _origIdx: idx }))
    .sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);

  // Grid de búsqueda: intenta posiciones de Y crecientes para cada diseño solapado
  function aabbOverlap(a, b) {
    return a.xMm < b.xMm + b.widthMm &&
           a.xMm + a.widthMm > b.xMm &&
           a.yMm < b.yMm + b.heightMm &&
           a.yMm + a.heightMm > b.yMm;
  }

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    // Verificar si este diseño se solapa con alguno de los ya procesados
    let hasOverlap = false;
    for (let j = 0; j < i; j++) {
      if (aabbOverlap(item, sorted[j])) {
        hasOverlap = true;
        break;
      }
    }
    if (!hasOverlap) continue; // ya está bien posicionado

    // Buscar posición libre: probar Y crecientes desde 0
    let placed = false;
    const maxY = 2000; // límite de búsqueda
    for (let tryY = 0; tryY <= maxY && !placed; tryY += gap || 1) {
      // Intentar cada X posible
      for (let tryX = margin; tryX <= usableWidth - item.widthMm && !placed; tryX += gap || 1) {
        const candidate = { xMm: tryX, yMm: tryY, widthMm: item.widthMm, heightMm: item.heightMm };
        let collides = false;
        for (let j = 0; j < i; j++) {
          if (aabbOverlap(candidate, sorted[j])) {
            collides = true;
            break;
          }
        }
        if (!collides) {
          sorted[i].xMm = tryX;
          sorted[i].yMm = tryY;
          placed = true;
        }
      }
    }

    if (!placed) {
      // Fallback: poner al final del pliego (debajo de todo)
      const maxBottom = Math.max(...sorted.slice(0, i).map(d => d.yMm + d.heightMm), 0);
      sorted[i].xMm = margin;
      sorted[i].yMm = maxBottom + (gap || 1);
    }
  }

  // Restaurar orden original y devolver
  return sorted
    .sort((a, b) => a._origIdx - b._origIdx)
    .map(({ _origIdx, ...d }) => d);
}

// ----------------------------------------------------------------------------
// Detección de solapamiento (D).
// Usa AABB (Axis-Aligned Bounding Box) — ignora rotación real ya que
// widthMm/heightMm son el bbox post-rotación.
// Retorna Set<string> de ids solapados.
// ----------------------------------------------------------------------------
function computeOverlaps(designs) {
  const overlapping = new Set();
  for (let i = 0; i < designs.length; i++) {
    for (let j = i + 1; j < designs.length; j++) {
      const a = designs[i], b = designs[j];
      const overlap =
        a.xMm < b.xMm + b.widthMm &&
        a.xMm + a.widthMm > b.xMm &&
        a.yMm < b.yMm + b.heightMm &&
        a.yMm + a.heightMm > b.yMm;
      if (overlap) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
  return overlapping;
}

// ============================================================================
export const useGangSheet = create((set, get) => ({
  // ------ Config del pliego ------
  mode: null,
  printerCode: null,
  printerData: null,
  canvasWidthMm: 310,
  manualLengthMm: null,
  express: false,

  // ------ Diseños ------
  designs: [],
  selectedId: null,        // primary selection (última seleccionada, para toolbar)
  selectedIds: [],         // (E) multi-select array

  // ------ Historial (F) ------
  history: [[]],
  historyIndex: 0,

  // ------ Auto-nesting toggle ------
  autoNestOnAdd: false,

  // ------ (G) Snap to grid ------
  nestGapMm: AUTONEST_GAP_MM,  // gap dinámico en mm para auto-nesting
  snapEnabled: false,
  snapGridMm: 5,

  // ------ (H) Zoom ------
  zoom: 1,                 // 0.3 – 3.0, default 1

  // ------------------------------------------------------------------
  // Modo (equipo/impresora)
  // ------------------------------------------------------------------
  setMode: (arg) => {
    if (typeof arg === 'string') {
      const cfg = PRICING[arg];
      if (!cfg) return;
      set({
        mode: arg,
        printerCode: cfg.printer,
        printerData: null,
        canvasWidthMm: cfg.canvasWidthCm * 10,
      });
      return;
    }
    const p = arg;
    if (!p || !p.code || !p.widthMm) return;
    const legacyMode = LEGACY_MAP[p.code];
    set({
      mode: legacyMode || `printer_${p.code}`,
      printerCode: p.code,
      printerData: p,
      canvasWidthMm: p.widthMm,
    });
  },
  reset: () => {
    imageCache.clear();
    set({
      mode: null, printerCode: null, printerData: null,
      designs: [], selectedId: null, selectedIds: [], express: false,
      manualLengthMm: null, history: [[]], historyIndex: 0,
      nestGapMm: AUTONEST_GAP_MM, snapEnabled: false, snapGridMm: 5, zoom: 1,
    });
  },

  // ------------------------------------------------------------------
  // Historial (F: Undo/Redo)
  // ------------------------------------------------------------------
  _pushHistory: () => {
    const st = get();
    const snap = snapshot(st.designs);
    // Descartar futuro si estamos en el medio del historial
    const truncated = st.history.slice(0, st.historyIndex + 1);
    truncated.push(snap);
    // Cap al límite
    while (truncated.length > HISTORY_LIMIT) truncated.shift();
    set({ history: truncated, historyIndex: truncated.length - 1 });
  },

  undo: () => {
    const st = get();
    if (st.historyIndex <= 0) return false;
    const prevSnap = st.history[st.historyIndex - 1];
    set({
      designs: restoreImages(prevSnap),
      historyIndex: st.historyIndex - 1,
      selectedId: null,
    });
    return true;
  },
  redo: () => {
    const st = get();
    if (st.historyIndex >= st.history.length - 1) return false;
    const nextSnap = st.history[st.historyIndex + 1];
    set({
      designs: restoreImages(nextSnap),
      historyIndex: st.historyIndex + 1,
      selectedId: null,
    });
    return true;
  },
  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // ------------------------------------------------------------------
  // Configuración de largo
  // ------------------------------------------------------------------
  setManualLengthMm: (mm) => {
    if (mm === null || mm === undefined || mm === '') {
      set({ manualLengthMm: null });
      return;
    }
    const n = Math.max(MIN_LENGTH_MM, Math.min(MAX_LENGTH_MM, Number.parseInt(mm, 10) || 0));
    set({ manualLengthMm: n });
  },
  setExpress: (val) => set({ express: !!val }),
  setAutoNestOnAdd: (val) => set({ autoNestOnAdd: !!val }),

  // ------------------------------------------------------------------
  // Manejo de diseños
  // ------------------------------------------------------------------
  addDesign: ({ imageUrl, name, srcWidthPx, srcHeightPx, dpiOriginal, image }) => {
    const st = get();
    const maxInitialWidth = Math.min(150, st.canvasWidthMm - 20);
    const aspect = srcHeightPx / srcWidthPx;
    const widthMm = maxInitialWidth;
    const heightMm = Math.round(widthMm * aspect);

    const lastBottom = st.designs.reduce((max, d) => Math.max(max, d.yMm + d.heightMm), 10);
    const xMm = 10;
    const yMm = lastBottom + 10;

    const design = {
      id: uuidv4(),
      imageUrl, image, name,
      srcWidthPx, srcHeightPx, dpiOriginal,
      xMm, yMm, widthMm, heightMm,
      rotation: 0, quantity: 1,
    };
    imageCache.set(design.id, image);
    const newDesigns = [...st.designs, design];

    set({ designs: newDesigns, selectedId: design.id });
    get()._pushHistory();

    if (st.autoNestOnAdd) get().autoArrange();
  },

  updateDesign: (id, patch) => {
    set((st) => ({
      designs: st.designs.map(d => d.id === id ? { ...d, ...patch } : d),
    }));
    get()._pushHistory();
  },

  // Update sin snapshot (para drag continuo — solo commit al final con updateDesign)
  updateDesignLive: (id, patch) => set((st) => ({
    designs: st.designs.map(d => d.id === id ? { ...d, ...patch } : d),
  })),

  removeDesign: (id) => {
    imageCache.delete(id);
    set((st) => ({
      designs: st.designs.filter(d => d.id !== id),
      selectedId: st.selectedId === id ? null : st.selectedId,
    }));
    get()._pushHistory();
  },

  removeMany: (ids) => {
    const set_ = new Set(ids);
    ids.forEach(id => imageCache.delete(id));
    set((st) => ({
      designs: st.designs.filter(d => !set_.has(d.id)),
      selectedId: set_.has(st.selectedId) ? null : st.selectedId,
    }));
    get()._pushHistory();
  },

  select: (id, mode = 'replace') => {
    const st = get();
    if (id === null || id === undefined) {
      set({ selectedIds: [], selectedId: null });
      return;
    }
    if (mode === 'toggle') {
      const already = st.selectedIds.includes(id);
      if (already) {
        const next = st.selectedIds.filter(x => x !== id);
        set({ selectedIds: next, selectedId: next[next.length - 1] || null });
      } else {
        set({ selectedIds: [...st.selectedIds, id], selectedId: id });
      }
    } else {
      set({ selectedIds: [id], selectedId: id });
    }
  },

  selectAll: () => {
    const ids = get().designs.map(d => d.id);
    set({ selectedIds: ids, selectedId: ids[ids.length - 1] || null });
  },

  // ------------------------------------------------------------------
  // (G) Snap to grid
  // ------------------------------------------------------------------
  setSnapEnabled: (val) => set({ snapEnabled: !!val }),
  setSnapGridMm: (mm) => {
    const n = Math.max(1, Math.min(50, parseInt(mm, 10) || 5));
    set({ snapGridMm: n });
  },
  snapValue: (mm) => {
    const st = get();
    if (!st.snapEnabled || st.snapGridMm <= 0) return mm;
    return Math.round(mm / st.snapGridMm) * st.snapGridMm;
  },

  // ------------------------------------------------------------------
  // (H) Zoom
  // ------------------------------------------------------------------
  setZoom: (z) => set({ zoom: Math.max(0.3, Math.min(3, z)) }),
  zoomIn:  () => set((st) => ({ zoom: Math.min(3,   Math.round((st.zoom + 0.1) * 10) / 10) })),
  zoomOut: () => set((st) => ({ zoom: Math.max(0.3, Math.round((st.zoom - 0.1) * 10) / 10) })),
  zoomReset: () => set({ zoom: 1 }),

  duplicate: (id) => {
    const st = get();
    const src = st.designs.find(d => d.id === id);
    if (!src) return;
    const copyId = uuidv4();
    const copy = { ...src, id: copyId, xMm: src.xMm + 8, yMm: src.yMm + 8 };
    imageCache.set(copyId, src.image);
    set({ designs: [...st.designs, copy], selectedId: copyId });
    get()._pushHistory();
  },

  // ------------------------------------------------------------------
  // [A] duplicateNTimes — imposición automática
  //     Crea `count` copias del diseño y las coloca con gap configurable.
  //     Estrategia: llena filas hasta el ancho, luego baja.
  // ------------------------------------------------------------------
  duplicateNTimes: (id, count, gapMm = 5) => {
    const st = get();
    const src = st.designs.find(d => d.id === id);
    if (!src || count < 1) return;

    const copies = [];
    // FIX: start placing copies AFTER the original design, not on top of it
    let currentX = src.xMm + src.widthMm + gapMm;
    let currentY = src.yMm;
    let rowHeight = src.heightMm;
    const canvasW = st.canvasWidthMm - 10; // margen derecho

    for (let i = 0; i < count; i++) {
      // Colocar copia
      if (currentX + src.widthMm > canvasW) {
        // Nueva fila
        currentX = src.xMm; // align with original's X position
        currentY += rowHeight + gapMm;
        rowHeight = src.heightMm;
        // Check if new row would overflow vertically (max roll length 5000mm)
        if (currentY + src.heightMm > MAX_LENGTH_MM - 10) {
          // Cannot fit more copies — stop
          break;
        }
      }
      const copyId = uuidv4();
      imageCache.set(copyId, src.image);
      copies.push({
        ...src,
        id: copyId,
        xMm: currentX,
        yMm: currentY,
      });
      currentX += src.widthMm + gapMm;
    }

    set({ designs: [...st.designs, ...copies], selectedId: null });
    get()._pushHistory();
  },

  // ------------------------------------------------------------------
  // rotate90 — swap width/height del bbox (rotación efectiva)
  // ------------------------------------------------------------------
  rotate90: (id) => {
    set((st) => ({
      designs: st.designs.map(d => d.id === id ? {
        ...d,
        rotation: (d.rotation + 90) % 360,
        widthMm: d.heightMm,
        heightMm: d.widthMm,
      } : d),
    }));
    get()._pushHistory();
  },

  // ------------------------------------------------------------------
  // [B] Aplicar resultado de trim-transparency al diseño seleccionado.
  //     Ajusta: srcWidthPx, srcHeightPx, imageUrl, image, y dimensiones
  //     en mm proporcionales al crop realizado.
  // ------------------------------------------------------------------
  applyTrimResult: (id, trim, newImage) => {
    const st = get();
    const d = st.designs.find(x => x.id === id);
    if (!d || !trim || trim.skipped) return;

    // Escala: nuevos mm proporcionales al crop en pixels
    const oldWmm = d.widthMm;
    const oldHmm = d.heightMm;
    const scaleX = oldWmm / d.srcWidthPx;
    const scaleY = oldHmm / d.srcHeightPx;
    const newWmm = Math.max(5, Math.round(trim.widthPx * scaleX));
    const newHmm = Math.max(5, Math.round(trim.heightPx * scaleY));
    // Ajuste de posición: el diseño se corre hacia el centro del bbox original
    const dxMm = Math.round(trim.trimmedFromX * scaleX);
    const dyMm = Math.round(trim.trimmedFromY * scaleY);

    imageCache.set(id, newImage);

    set({
      designs: st.designs.map(x => x.id === id ? {
        ...x,
        imageUrl: trim.dataUrl,
        image: newImage,
        srcWidthPx: trim.widthPx,
        srcHeightPx: trim.heightPx,
        widthMm: newWmm,
        heightMm: newHmm,
        xMm: x.xMm + dxMm,
        yMm: x.yMm + dyMm,
        _trimmed: true,
      } : x),
    });
    get()._pushHistory();
  },

  // ------------------------------------------------------------------
  // [C] Auto-arrange: usa smartAutoNest (Shelf BFDH con rotación)
  //       Ahora usa nestGapMm del estado (gap dinámico configurable)
  // ------------------------------------------------------------------
  // Resolver solapamientos: mueve SOLO los diseños afectados, mantiene tamaño y rotación
  resolveOverlaps: () => {
    set((st) => ({
      designs: resolveOverlaps(st.designs, st.canvasWidthMm, st.nestGapMm || 3),
    }));
    get()._pushHistory();
  },

  // Auto-arrange: reorganiza TODOS los diseños (packing óptimo, puede rotar)
  autoArrange: (opts = {}) => {
    const { allowRotate = true, gap } = opts;
    set((st) => {
      const effectiveGap = gap ?? st.nestGapMm;
      // Largo del lienzo = el default de la impresora (no manual, ya que manual puede ser mayor)
      const printerDefault = st.printerData?.defaultLengthMm || DEFAULT_LENGTH_MM;
      const canvasLen = Math.max(MIN_LENGTH_MM, printerDefault);
      const placed = smartAutoNest(st.designs, st.canvasWidthMm, effectiveGap, allowRotate, canvasLen);
      // Clamp en X e Y para que NINGÚN diseño se salga del pañol
      const usableWidth = st.canvasWidthMm - 10;
      return {
        designs: placed.map(d => ({
          ...d,
          xMm: Math.max(0, Math.min(d.xMm, usableWidth - d.widthMm)),
          yMm: Math.max(0, Math.min(d.yMm, canvasLen - d.heightMm)),
        })),
      };
    });
    get()._pushHistory();
  },

  // (G) Gap dinámico para auto-nesting
  setNestGap: (mm) => {
    set({ nestGapMm: Math.max(0, Math.min(20, Number(mm) || 0)) });
  },

  // ------------------------------------------------------------------
  // [D] Overlaps
  // ------------------------------------------------------------------
  detectOverlaps: () => computeOverlaps(get().designs),
  hasOverlaps: () => computeOverlaps(get().designs).size > 0,

  // ------------------------------------------------------------------
  // (P) Alignment tools — alinear/distribuir diseños seleccionados
  //     mode: 'left' | 'right' | 'center-h' | 'top' | 'bottom' | 'center-v'
  //           | 'distribute-h' | 'distribute-v'
  // ------------------------------------------------------------------
  alignSelected: (mode) => {
    const st = get();
    if (!st.selectedIds || st.selectedIds.length < 2) return;
    const sel = st.designs.filter(d => st.selectedIds.includes(d.id));
    if (sel.length < 2) return;

    let updates;
    if (mode === 'left') {
      const minX = Math.min(...sel.map(d => d.xMm));
      updates = sel.map(d => ({ id: d.id, xMm: minX }));
    } else if (mode === 'right') {
      const maxRight = Math.max(...sel.map(d => d.xMm + d.widthMm));
      updates = sel.map(d => ({ id: d.id, xMm: maxRight - d.widthMm }));
    } else if (mode === 'center-h') {
      const minX = Math.min(...sel.map(d => d.xMm));
      const maxRight = Math.max(...sel.map(d => d.xMm + d.widthMm));
      const centerX = (minX + maxRight) / 2;
      updates = sel.map(d => ({ id: d.id, xMm: Math.round(centerX - d.widthMm / 2) }));
    } else if (mode === 'top') {
      const minY = Math.min(...sel.map(d => d.yMm));
      updates = sel.map(d => ({ id: d.id, yMm: minY }));
    } else if (mode === 'bottom') {
      const maxBottom = Math.max(...sel.map(d => d.yMm + d.heightMm));
      updates = sel.map(d => ({ id: d.id, yMm: maxBottom - d.heightMm }));
    } else if (mode === 'center-v') {
      const minY = Math.min(...sel.map(d => d.yMm));
      const maxBottom = Math.max(...sel.map(d => d.yMm + d.heightMm));
      const centerY = (minY + maxBottom) / 2;
      updates = sel.map(d => ({ id: d.id, yMm: Math.round(centerY - d.heightMm / 2) }));
    } else if (mode === 'distribute-h') {
      // Requiere al menos 3 elementos. Distribuye espaciado horizontal uniforme.
      if (sel.length < 3) return;
      const sorted = [...sel].sort((a, b) => a.xMm - b.xMm);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = (last.xMm + last.widthMm) - first.xMm;
      const totalWidth = sorted.reduce((s, d) => s + d.widthMm, 0);
      const gap = (totalSpan - totalWidth) / (sorted.length - 1);
      let cursor = first.xMm;
      updates = sorted.map((d, i) => {
        if (i === 0) { cursor = d.xMm + d.widthMm + gap; return { id: d.id, xMm: d.xMm }; }
        if (i === sorted.length - 1) return { id: d.id, xMm: d.xMm };
        const x = Math.round(cursor);
        cursor = x + d.widthMm + gap;
        return { id: d.id, xMm: x };
      });
    } else if (mode === 'distribute-v') {
      if (sel.length < 3) return;
      const sorted = [...sel].sort((a, b) => a.yMm - b.yMm);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = (last.yMm + last.heightMm) - first.yMm;
      const totalHeight = sorted.reduce((s, d) => s + d.heightMm, 0);
      const gap = (totalSpan - totalHeight) / (sorted.length - 1);
      let cursor = first.yMm;
      updates = sorted.map((d, i) => {
        if (i === 0) { cursor = d.yMm + d.heightMm + gap; return { id: d.id, yMm: d.yMm }; }
        if (i === sorted.length - 1) return { id: d.id, yMm: d.yMm };
        const y = Math.round(cursor);
        cursor = y + d.heightMm + gap;
        return { id: d.id, yMm: y };
      });
    } else {
      return;
    }

    const patchMap = new Map(updates.map(u => [u.id, u]));
    set({
      designs: st.designs.map(d => {
        const p = patchMap.get(d.id);
        return p ? { ...d, ...p } : d;
      }),
    });
    get()._pushHistory();
  },
  // ------------------------------------------------------------------
  moveSelected: (dxMm, dyMm) => {
    const st = get();
    if (!st.selectedId) return;
    set({
      designs: st.designs.map(d => d.id === st.selectedId ? {
        ...d,
        xMm: Math.max(0, d.xMm + dxMm),
        yMm: Math.max(0, d.yMm + dyMm),
      } : d),
    });
    // No pushHistory por cada tick para no saturar; se hace al soltar la tecla
  },

  // ------ Cálculos derivados ------
  computedLengthMm: () => {
    const st = get();
    const maxBottom = st.designs.reduce((max, d) => Math.max(max, d.yMm + d.heightMm), 0);
    const contentMin = Math.max(maxBottom + PADDING_MM, MIN_LENGTH_MM);
    if (st.manualLengthMm) return Math.max(st.manualLengthMm, contentMin);
    const printerDefault = st.printerData?.defaultLengthMm || DEFAULT_LENGTH_MM;
    return Math.max(contentMin, printerDefault);
  },

  billableLengthMm: () => {
    const st = get();
    const maxBottom = st.designs.reduce((max, d) => Math.max(max, d.yMm + d.heightMm), 0);
    return Math.max(maxBottom + PADDING_MM, MIN_LENGTH_MM);
  },

  currentQuote: () => {
    const st = get();
    if (!st.mode) return null;
    const lengthMm = get().billableLengthMm();
    if (PRICING[st.mode]) {
      return quote({ mode: st.mode, lengthMm, express: st.express });
    }
    const p = st.printerData;
    if (!p) return null;
    const billableMm = Math.max(lengthMm, p.minLengthMm || 100);
    const subtotal = billableMm * p.pricePerMm;
    const surcharge = st.express ? Math.round(subtotal * 0.30) : 0;
    const netAmount = subtotal + surcharge;
    const tax = Math.round(netAmount * 0.19);
    const total = netAmount + tax;
    return {
      mode: st.mode,
      label: `${p.label} · ${(p.widthMm / 10).toFixed(0)} cm`,
      lengthMm, billableMm, pricePerMm: p.pricePerMm,
      subtotal, surcharge, netAmount, tax, total, express: st.express,
    };
  },

  effectiveDpi: (design) => {
    if (!design || !design.widthMm) return 0;
    const widthInches = design.widthMm / 25.4;
    return Math.round(design.srcWidthPx / widthInches);
  },

  designWarnings: (design) => {
    const warnings = [];
    const st = get();
    const dpi = get().effectiveDpi(design);
    if (dpi < 300) warnings.push({ type: 'low_dpi', msg: `DPI bajo (${dpi})` });
    if (design.xMm < 0 || design.yMm < 0) warnings.push({ type: 'off_canvas', msg: 'Fuera del lienzo' });
    if (design.xMm + design.widthMm > st.canvasWidthMm) warnings.push({ type: 'off_canvas', msg: 'Excede ancho del lienzo' });
    return warnings;
  },

  // ------------------------------------------------------------------
  // (Q) QualityScorecard — Score de calidad del pliego en tiempo real
  //   100% = sin solapamientos + todos > 300 DPI
  //   80%  = sin solapamientos pero algunos entre 150-300 DPI
  //   < 50% = solapamientos o diseños < 150 DPI (Hard-Stop)
  // ------------------------------------------------------------------
  qualityScore: () => {
    const st = get();
    if (!st.designs.length) return { score: 0, status: 'empty', details: [] };

    const overlaps = computeOverlaps(st.designs);
    const dpiStats = st.designs.map(d => get().effectiveDpi(d));
    const criticalDpi = dpiStats.filter(d => d < 150).length;  // < 150 = imprime pixelado
    const lowDpi = dpiStats.filter(d => d >= 150 && d < 300).length;
    const okDpi = dpiStats.filter(d => d >= 300).length;
    const total = st.designs.length;

    const details = [];

    if (overlaps.size > 0) {
      details.push({ type: 'error', msg: `${overlaps.size} diseño${overlaps.size === 1 ? '' : 's'} solapado${overlaps.size === 1 ? '' : 's'}` });
    }
    if (criticalDpi > 0) {
      details.push({ type: 'error', msg: `${criticalDpi} diseño${criticalDpi === 1 ? '' : 's'} con DPI < 150 (pixelado)` });
    }
    if (lowDpi > 0) {
      details.push({ type: 'warning', msg: `${lowDpi} diseño${lowDpi === 1 ? '' : 's'} entre 150-300 DPI` });
    }
    if (okDpi === total && overlaps.size === 0) {
      details.push({ type: 'ok', msg: `Todos los diseños ≥ 300 DPI · Sin solapamientos` });
    }

    // Cálculo del score
    let score = 100;
    if (overlaps.size > 0) score -= 40;
    if (criticalDpi > 0) score -= Math.min(40, criticalDpi * 20);
    if (lowDpi > 0) score -= Math.min(20, lowDpi * 5);
    score = Math.max(0, Math.min(100, score));

    const status =
      score >= 100 ? 'perfect' :
      score >= 80  ? 'good' :
      score >= 50  ? 'warning' :
                     'critical';

    return { score, status, details, total, okDpi, lowDpi, criticalDpi, overlapCount: overlaps.size };
  },

  // (Q) Hard-Stop: ¿Se puede confirmar el pedido?
  canSubmit: () => {
    const st = get();
    if (!st.designs.length) return false;
    const overlaps = computeOverlaps(st.designs);
    if (overlaps.size > 0) return false;
    const criticalDpi = st.designs.filter(d => get().effectiveDpi(d) < 150).length;
    if (criticalDpi > 0) return false;
    return true;
  },
}));
