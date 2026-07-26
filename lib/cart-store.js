'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ============================================================================
// Cart store (Zustand + localStorage)
// Items keyed by productId + variantId. Persistente entre recargas.
// ============================================================================

export const useCart = create(persist(
  (set, get) => ({
    items: [],       // { productId, variantId, name, variantName, price, image, quantity }
    isOpen: false,

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set(s => ({ isOpen: !s.isOpen })),

    add: (item, qty = 1) => set((state) => {
      const key = `${item.productId}:${item.variantId}`;
      const idx = state.items.findIndex(i => `${i.productId}:${i.variantId}` === key);
      if (idx >= 0) {
        const items = [...state.items];
        items[idx] = { ...items[idx], quantity: items[idx].quantity + qty };
        return { items, isOpen: true };
      }
      return { items: [...state.items, { ...item, quantity: qty }], isOpen: true };
    }),

    setQty: (productId, variantId, qty) => set((state) => ({
      items: state.items
        .map(i => (i.productId === productId && i.variantId === variantId) ? { ...i, quantity: Math.max(0, Number(qty) || 0) } : i)
        .filter(i => i.quantity > 0),
    })),

    remove: (productId, variantId) => set((state) => ({
      items: state.items.filter(i => !(i.productId === productId && i.variantId === variantId)),
    })),

    clear: () => set({ items: [] }),
  }),
  {
    name: 'dlv-cart-v1',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({ items: state.items }),
  }
));

export const cartSubtotal = (items) => items.reduce((s, i) => s + i.price * i.quantity, 0);
export const cartCount = (items) => items.reduce((s, i) => s + i.quantity, 0);
