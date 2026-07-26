'use client';

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { PRICING, quote } from './pricing';

const PADDING_MM = 20;   // padding vertical del canvas alrededor de los diseños
const MIN_LENGTH_MM = 300;

export const useGangSheet = create((set, get) => ({
  // Config del pliego (elegida en el modal de bienvenida)
  mode: null,               // 'dtf_textil_31' | 'dtf_textil_33' | 'dtf_uv'
  canvasWidthMm: 310,
  express: false,

  // Diseños agregados
  designs: [],              // { id, imageUrl, image, name, dpiOriginal, srcWidthPx, srcHeightPx, xMm, yMm, widthMm, heightMm, rotation, quantity }
  selectedId: null,

  // ----- Selección de modo (Modal inicial) -----
  setMode: (mode) => {
    const cfg = PRICING[mode];
    set({ mode, canvasWidthMm: cfg.canvasWidthCm * 10 });
  },
  reset: () => set({ mode: null, designs: [], selectedId: null, express: false }),

  setExpress: (val) => set({ express: !!val }),

  // ----- Manejo de diseños -----
  addDesign: ({ imageUrl, name, srcWidthPx, srcHeightPx, dpiOriginal, image }) => {
    const st = get();
    // Tamaño inicial: ancho máx 150mm o ajustado al canvas
    const maxInitialWidth = Math.min(150, st.canvasWidthMm - 20);
    const aspect = srcHeightPx / srcWidthPx;
    const widthMm = maxInitialWidth;
    const heightMm = Math.round(widthMm * aspect);

    // Posición inicial: apilar debajo del último
    const lastBottom = st.designs.reduce((max, d) => Math.max(max, d.yMm + d.heightMm), 10);
    const xMm = 10;
    const yMm = lastBottom + 10;

    const design = {
      id: uuidv4(),
      imageUrl,
      image,               // HTMLImageElement (solo en memoria)
      name,
      srcWidthPx,
      srcHeightPx,
      dpiOriginal,
      xMm, yMm, widthMm, heightMm,
      rotation: 0,
      quantity: 1,
    };
    set({ designs: [...st.designs, design], selectedId: design.id });
  },

  updateDesign: (id, patch) => set((st) => ({
    designs: st.designs.map(d => d.id === id ? { ...d, ...patch } : d),
  })),

  removeDesign: (id) => set((st) => ({
    designs: st.designs.filter(d => d.id !== id),
    selectedId: st.selectedId === id ? null : st.selectedId,
  })),

  select: (id) => set({ selectedId: id }),

  duplicate: (id) => {
    const st = get();
    const src = st.designs.find(d => d.id === id);
    if (!src) return;
    const copy = { ...src, id: uuidv4(), xMm: src.xMm + 8, yMm: src.yMm + 8 };
    set({ designs: [...st.designs, copy], selectedId: copy.id });
  },

  rotate90: (id) => set((st) => ({
    designs: st.designs.map(d => d.id === id ? { ...d, rotation: (d.rotation + 90) % 360 } : d),
  })),

  // Auto-arrange: ordena de mayor a menor y los apila para minimizar largo
  autoArrange: () => set((st) => {
    const sorted = [...st.designs].sort((a, b) => b.heightMm - a.heightMm);
    // Simple layout: distribuye horizontalmente si caben, sino apila
    const rowGap = 5;
    const colGap = 5;
    let currentY = 10;
    let currentX = 10;
    let rowHeight = 0;
    const arranged = sorted.map(d => {
      if (currentX + d.widthMm > st.canvasWidthMm - 10) {
        currentY += rowHeight + rowGap;
        currentX = 10;
        rowHeight = 0;
      }
      const placed = { ...d, xMm: currentX, yMm: currentY, rotation: 0 };
      currentX += d.widthMm + colGap;
      rowHeight = Math.max(rowHeight, d.heightMm);
      return placed;
    });
    return { designs: arranged };
  }),

  // ----- Cálculos derivados -----
  computedLengthMm: () => {
    const st = get();
    const maxBottom = st.designs.reduce((max, d) => Math.max(max, d.yMm + d.heightMm), 0);
    return Math.max(maxBottom + PADDING_MM, MIN_LENGTH_MM);
  },

  currentQuote: () => {
    const st = get();
    if (!st.mode) return null;
    return quote({ mode: st.mode, lengthMm: get().computedLengthMm(), express: st.express });
  },

  // DPI efectivo de un diseño dado su tamaño actual en mm
  effectiveDpi: (design) => {
    if (!design || !design.widthMm) return 0;
    const widthInches = design.widthMm / 25.4;
    return Math.round(design.srcWidthPx / widthInches);
  },

  // Validaciones
  designWarnings: (design) => {
    const warnings = [];
    const st = get();
    const dpi = get().effectiveDpi(design);
    if (dpi < 300) warnings.push({ type: 'low_dpi', msg: `DPI bajo (${dpi})` });
    if (design.xMm < 0 || design.yMm < 0) warnings.push({ type: 'off_canvas', msg: 'Fuera del lienzo' });
    if (design.xMm + design.widthMm > st.canvasWidthMm) warnings.push({ type: 'off_canvas', msg: 'Excede ancho del lienzo' });
    return warnings;
  },
}));
