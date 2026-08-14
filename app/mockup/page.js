// =============================================================================
// /mockup — Editor de Mockups (Catálogo 2D con imágenes reales de productos)
// =============================================================================
'use client';
import React, { useState } from 'react';
import MockupCatalogEditor from '@/components/mockup-catalog-editor';
import { BUSINESS } from '@/lib/constants/business';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

// Metadata con canonical para Google
export const metadata = {
  title: 'Editor de Mockups Gratis · Estampados DLV',
  description: 'Visualiza tu diseño en poleras, gorras, tazones y más con nuestro editor de mockups gratis.',
  alternates: { canonical: `${BASE}/mockup` },
};

// Error boundary para capturar errores client-side
class MockupErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err) { return { hasError: true, err }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg text-center">
            <h2 className="text-lg font-bold text-red-600 mb-2">Error al cargar el editor</h2>
            <p className="text-sm text-slate-600 mb-3">{this.state.err?.message || 'Error desconocido'}</p>
            <pre className="text-xs bg-slate-100 p-3 rounded text-left overflow-auto max-h-48">{this.state.err?.stack || ''}</pre>
            <button onClick={() => window.location.reload()} className="mt-3 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm">Reintentar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MockupPage() {
  return (
    <div className="h-screen bg-slate-50 flex flex-col">
      <div className="flex-1">
        <MockupErrorBoundary>
          <MockupCatalogEditor />
        </MockupErrorBoundary>
      </div>
      {/* Footer con enlaces internos para SEO (sitelinks) */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 py-2 px-4">
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-slate-500">
          <a href="/" className="hover:text-orange-500 transition-colors">Inicio</a>
          <a href="/tienda" className="hover:text-orange-500 transition-colors">Tienda</a>
          <a href="/gang-sheet" className="hover:text-orange-500 transition-colors">Gang Sheet Builder</a>
          <a href="/servicios" className="hover:text-orange-500 transition-colors">Servicios</a>
          <a href="/contacto" className="hover:text-orange-500 transition-colors">Contacto</a>
        </nav>
      </div>
    </div>
  );
}
