'use client';

// ============================================================================
// Gang Sheet — Drafts Manager (K)
// Guarda/carga borradores del builder en localStorage del navegador.
// Formato: array de { id, name, savedAt, mode, printerCode, canvasWidthMm,
//   designs: [{ id, imageUrl, name, srcWidthPx, srcHeightPx, dpiOriginal,
//              xMm, yMm, widthMm, heightMm, rotation }] }
//
// Persiste sin backend: útil para MVP y no requiere auth.
// Cada draft pesa ~10-50 KB (los imageUrls apuntan a /uploads/ del servidor).
// ============================================================================

const DRAFTS_KEY = 'dlv:gsb:drafts';
const MAX_DRAFTS = 20;

function safeParse(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function listDraftsLocal() {
  if (typeof window === 'undefined') return [];
  return safeParse(localStorage.getItem(DRAFTS_KEY))
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export function saveDraftLocal({ name, mode, printerCode, canvasWidthMm, designs }) {
  if (typeof window === 'undefined') return null;
  const list = safeParse(localStorage.getItem(DRAFTS_KEY));

  const draft = {
    id: crypto.randomUUID?.() || `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: (name || 'Borrador sin título').slice(0, 60).trim(),
    savedAt: new Date().toISOString(),
    mode,
    printerCode,
    canvasWidthMm,
    designs: designs.map(d => ({
      id: d.id,
      imageUrl: d.imageUrl,
      name: d.name,
      srcWidthPx: d.srcWidthPx,
      srcHeightPx: d.srcHeightPx,
      dpiOriginal: d.dpiOriginal,
      xMm: d.xMm, yMm: d.yMm, widthMm: d.widthMm, heightMm: d.heightMm,
      rotation: d.rotation || 0,
    })),
  };

  list.push(draft);
  // FIFO — descartar borradores más antiguos si excedemos el máximo
  const trimmed = list
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
    .slice(0, MAX_DRAFTS);

  localStorage.setItem(DRAFTS_KEY, JSON.stringify(trimmed));
  return draft;
}

export function deleteDraftLocal(id) {
  if (typeof window === 'undefined') return;
  const list = safeParse(localStorage.getItem(DRAFTS_KEY));
  const next = list.filter(d => d.id !== id);
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
}

export function getDraftLocal(id) {
  return listDraftsLocal().find(d => d.id === id) || null;
}
