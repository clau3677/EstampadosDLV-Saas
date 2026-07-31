'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Box, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Carga dinámica de ambos editores
const Mockup3DEditor = dynamic(() => import('@/components/mockup-3d-editor'), { ssr: false });
const MockupCatalogEditor = dynamic(() => import('@/components/mockup-catalog-editor'), { ssr: false });

// Error boundary para el 3D editor
class Mockup3DErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err) { return { hasError: true, err }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-white px-6 text-center">
          <div className="text-sm font-semibold text-slate-800">
            El editor 3D tuvo un error
          </div>
          <div className="text-xs text-slate-600 mt-1 max-w-md">
            Hubo un problema al cargar el editor 3D. Puedes usar el modo Catálogo mientras tanto.
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MockupSelector() {
  const [mode, setMode] = useState('catalog'); // '3d' | 'catalog'

  return (
    <div className="h-full flex flex-col">
      {/* Header con toggle */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/tienda" className="text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-bold text-slate-900">Editor de Mockups</h1>
          <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">
            {mode === '3d' ? 'Modo 3D' : 'Modo Catálogo'}
          </Badge>
        </div>

        {/* Toggle entre modos */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setMode('catalog')}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
              ${mode === 'catalog'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'}
            `}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Catálogo
          </button>
          <button
            onClick={() => setMode('3d')}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
              ${mode === '3d'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'}
            `}
          >
            <Box className="h-3.5 w-3.5" />
            3D
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-hidden">
        {mode === 'catalog' && <MockupCatalogEditor />}
        {mode === '3d' && (
          <Mockup3DErrorBoundary>
            <Mockup3DEditor />
          </Mockup3DErrorBoundary>
        )}
      </div>
    </div>
  );
}
