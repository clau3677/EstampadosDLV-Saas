'use client';

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { PRICING, quote } from './pricing';

const PADDING_MM = 20;              // padding vertical del canvas alrededor de los diseños
const DEFAULT_LENGTH_MM = 1000;     // 1 metro por defecto (estándar industria DTF Chile)
const MIN_LENGTH_MM = 100;          // 10cm mínimo absoluto
const MAX_LENGTH_MM = 5000;         // 5m máximo absoluto (soft cap)

// Códigos canónicos legacy → mode del PRICING
const LEGACY_MAP = {
  epson_r1390: 'dtf_textil_31',
  prestige_r2_pro: 'dtf_textil_33',
  dtf_uv: 'dtf_uv',
};

export const useGangSheet = create((set, get) => ({
  // Config del pliego (elegida en el modal de bienvenida)
  mode: null,               // 'dtf_textil_31' | 'dtf_textil_33' | 'dtf_uv' | `printer_<code>`
  printerCode: null,        // code del printer dinámico (útil para backend)
  printerData: null,        // snapshot del printer seleccionado (label, widthMm, pricePerMm, etc.)
  canvasWidthMm: 310,
  manualLengthMm: null,     // Si el usuario fija el largo manualmente, se respeta (null = auto)
  express: false,

  // Diseños agregados
  designs: [],              // { id, imageUrl, image, name, dpiOriginal, srcWidthPx, srcHeightPx, xMm, yMm, widthMm, heightMm, rotation, quantity }
  selectedId: null,

  // ----- Selección de modo -----
  // Acepta:
  //   setMode('dtf_textil_31')  → legacy, para retrocompatibilidad
  //   setMode(printerObj)       → nuevo, con datos completos del equipo
  setMode: (arg) => {
    // Caso 1: string legacy (uno de los 3 canónicos de PRICING)
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
    // Caso 2: objeto printer dinámico
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
  reset: () => set({ mode: null, printerCode: null, printerData: null, designs: [], selectedId: null, express: false, manualLengthMm: null }),

  // ----- Largo del pliego -----
  // El usuario puede fijar un largo manual (ej. estirar a 1.5m). null = auto.
  setManualLengthMm: (mm) => {
    if (mm === null || mm === undefined || mm === '') {
      set({ manualLengthMm: null });
      return;
    }
    const n = Math.max(MIN_LENGTH_MM, Math.min(MAX_LENGTH_MM, Number.parseInt(mm, 10) || 0));
    set({ manualLengthMm: n });
  },

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
    // 1. Si el usuario fijó manualmente un largo, se respeta (siempre y cuando quepan los diseños)
    const maxBottom = st.designs.reduce((max, d) => Math.max(max, d.yMm + d.heightMm), 0);
    const contentMin = Math.max(maxBottom + PADDING_MM, MIN_LENGTH_MM);
    if (st.manualLengthMm) {
      return Math.max(st.manualLengthMm, contentMin);
    }
    // 2. Si el printer dinámico define un largo por defecto, se usa
    const printerDefault = st.printerData?.defaultLengthMm || DEFAULT_LENGTH_MM;
    return Math.max(contentMin, printerDefault);
  },

  // Largo cobrable (para facturación): siempre usa el máximo del contenido, no del canvas visual
  billableLengthMm: () => {
    const st = get();
    const maxBottom = st.designs.reduce((max, d) => Math.max(max, d.yMm + d.heightMm), 0);
    return Math.max(maxBottom + PADDING_MM, MIN_LENGTH_MM);
  },

  currentQuote: () => {
    const st = get();
    if (!st.mode) return null;
    // El largo cobrable es el del contenido (no el visual del lienzo)
    const lengthMm = get().billableLengthMm();
    // Si es un modo canónico legacy usar PRICING (retrocompatibilidad)
    if (PRICING[st.mode]) {
      return quote({ mode: st.mode, lengthMm, express: st.express });
    }
    // Cálculo dinámico usando printerData
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
      lengthMm,
      billableMm,
      pricePerMm: p.pricePerMm,
      subtotal,
      surcharge,
      netAmount,
      tax,
      total,
      express: st.express,
    };
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
