'use client';

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Mockup Store — Editor de mockups para prendas
// ----------------------------------------------------------------------------
// Permite:
//   - Seleccionar una prenda del catálogo (polera, polerón, gorra, etc.)
//   - Subir un diseño propio o elegir de la biblioteca
//   - Posicionar, escalar y rotar el diseño sobre la prenda
//   - Exportar el mockup como imagen
// ============================================================================

// Plantillas de prendas con zonas de impresión predefinidas
export const GARMENT_TEMPLATES = {
  polera_frontal: {
    id: 'polera_frontal',
    label: 'Polera (Frontal)',
    category: 'poleras',
    printArea: { x: 0.28, y: 0.28, w: 0.44, h: 0.48 }, // % del canvas
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
  gorra_lateral: {
    id: 'gorra_lateral',
    label: 'Gorra (Lateral)',
    category: 'gorras',
    printArea: { x: 0.50, y: 0.35, w: 0.25, h: 0.18 },
    bgImage: '/mockups/gorra-blanca-side.png',
  },
};

// Colores de prenda disponibles
export const GARMENT_COLORS = {
  white: { label: 'Blanco', hex: '#FFFFFF' },
  black: { label: 'Negro', hex: '#1a1a1a' },
  gray: { label: 'Gris', hex: '#808080' },
  navy: { label: 'Azul Marino', hex: '#1B2A4A' },
  red: { label: 'Rojo', hex: '#CC0000' },
  forest: { label: 'Verde Bosque', hex: '#228B22' },
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

export const useMockupStore = create((set, get) => ({
  // Estado principal
  selectedTemplate: 'polera_frontal',
  garmentColor: 'white',
  designs: [],        // array de diseños sobre la prenda
  selectedDesignId: null,
  isDragging: false,
  dragStartPos: null,
  zoom: 1,
  canvasSize: 600,    // px (lado cuadrado del canvas)

  // Historial
  history: [],
  historyIndex: -1,

  // Acciones
  setTemplate: (templateId) => set({
    selectedTemplate: templateId,
    designs: [],
    selectedDesignId: null,
    history: [],
    historyIndex: -1,
  }),

  setColor: (color) => set({ garmentColor: color }),

  // Agregar diseño (propio o biblioteca)
  addDesign: (imageData) => {
    const state = get();
    const id = uuidv4();
    const template = GARMENT_TEMPLATES[state.selectedTemplate];
    const pa = template?.printArea || { x: 0.25, y: 0.25, w: 0.50, h: 0.50 };
    const cs = state.canvasSize;

    // Crear elemento Image para el canvas
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const aspect = img.width / img.height;
      // Tamaño inicial: 40% del área de impresión
      const initialW = pa.w * cs * 0.4;
      const initialH = aspect >= 1 ? initialW : initialW / aspect;
      // Centrar en el área de impresión
      const centerX = (pa.x + pa.w / 2) * cs;
      const centerY = (pa.y + pa.h / 2) * cs;

      const newDesign = {
        id,
        imageUrl: imageData.url,
        name: imageData.name || 'Diseño',
        srcWidthPx: imageData.srcWidthPx || img.width,
        srcHeightPx: imageData.srcHeightPx || img.height,
        x: centerX - initialW / 2,
        y: centerY - initialH / 2,
        width: initialW,
        height: initialH,
        rotation: 0,
        opacity: 1,
        imgEl: img,
      };

      const newDesigns = [...get().designs, newDesign];
      get().pushHistory(newDesigns);
      set({ designs: newDesigns, selectedDesignId: id });
    };
    img.src = imageData.url;
  },

  // Actualizar diseño en tiempo real (drag)
  updateDesignLive: (id, patch) => {
    set((state) => ({
      designs: state.designs.map(d =>
        d.id === id ? { ...d, ...patch } : d
      ),
    }));
  },

  // Confirmar cambio (empuja historial)
  commitDesignChange: () => {
    const state = get();
    get().pushHistory(state.designs);
  },

  // Seleccionar diseño
  selectDesign: (id) => set({ selectedDesignId: id }),

  // Deseleccionar
  deselectDesign: () => set({ selectedDesignId: null }),

  // Eliminar diseño
  removeDesign: (id) => {
    const state = get();
    const newDesigns = state.designs.filter(d => d.id !== id);
    get().pushHistory(newDesigns);
    set({ designs: newDesigns, selectedDesignId: newDesigns[0]?.id || null });
  },

  // Duplicar diseño
  duplicateDesign: (id) => {
    const state = get();
    const src = state.designs.find(d => d.id === id);
    if (!src) return;
    const newId = uuidv4();
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const clone = {
        ...src,
        id: newId,
        x: src.x + 20,
        y: src.y + 20,
        imgEl: img,
      };
      const newDesigns = [...get().designs, clone];
      get().pushHistory(newDesigns);
      set({ designs: newDesigns, selectedDesignId: newId });
    };
    img.src = src.imageUrl;
  },

  // Limpiar todos los diseños
  clearDesigns: () => {
    get().pushHistory([]);
    set({ designs: [], selectedDesignId: null });
  },

  // Undo
  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) return;
    const newIndex = state.historyIndex - 1;
    const snap = state.history[newIndex];
    const cache = new Map();
    state.designs.forEach(d => { if (d.imgEl) cache.set(d.id, d.imgEl); });
    set({
      historyIndex: newIndex,
      designs: restoreImgs(snap, cache),
      selectedDesignId: null,
    });
  },

  // Redo
  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return;
    const newIndex = state.historyIndex + 1;
    const snap = state.history[newIndex];
    const cache = new Map();
    state.designs.forEach(d => { if (d.imgEl) cache.set(d.id, d.imgEl); });
    set({
      historyIndex: newIndex,
      designs: restoreImgs(snap, cache),
      selectedDesignId: null,
    });
  },

  // Push al historial
  pushHistory: (designs) => {
    const state = get();
    const snap = snapshot(designs);
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snap);
    if (newHistory.length > HISTORY_LIMIT) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  // Reset
  reset: () => set({
    selectedTemplate: 'polera_frontal',
    garmentColor: 'white',
    designs: [],
    selectedDesignId: null,
    history: [],
    historyIndex: -1,
  }),
}));
