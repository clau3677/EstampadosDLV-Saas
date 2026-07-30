'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Three.js usa APIs de browser (WebGL, window), por eso lo cargamos solo en cliente
const Mockup3DEditor = dynamic(() => import('@/components/mockup-3d-editor'), {
  ssr: false,
  loading: () => <Mockup3DLoader />,
});

function Mockup3DLoader() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (stuck) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] rounded-xl border border-amber-200 bg-amber-50/60 px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
        <div className="text-sm font-semibold text-slate-800">El editor 3D está tardando más de lo normal</div>
        <div className="text-xs text-slate-600 mt-1 max-w-md">
          Puede ser un problema de WebGL o caché del navegador.
          Recarga con{' '}
          <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
          {' '}+{' '}
          <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Shift</kbd>
          {' '}+{' '}
          <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">R</kbd>
        </div>
        <Button onClick={() => window.location.reload()} size="sm" className="mt-4">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Recargar la página
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[600px] rounded-xl border border-slate-200 bg-white">
      <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
      <div className="text-sm text-slate-500 mt-3">Cargando editor 3D...</div>
      <div className="text-xs text-slate-400 mt-1">Motor de renderizado Three.js</div>
    </div>
  );
}

class Mockup3DErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err) { return { hasError: true, err }; }
  render() {
    if (this.state.hasError) {
      const isChunkErr = /ChunkLoadError|Loading chunk|Failed to fetch/i.test(String(this.state.err || ''));
      return (
        <div className="flex flex-col items-center justify-center h-[600px] rounded-xl border border-rose-200 bg-rose-50/60 px-6 text-center">
          <AlertTriangle className="h-10 w-10 text-rose-500 mb-3" />
          <div className="text-sm font-semibold text-slate-800">
            {isChunkErr ? 'No se pudo cargar el editor 3D' : 'El editor 3D tuvo un error'}
          </div>
          <div className="text-xs text-slate-600 mt-1 max-w-md">
            {isChunkErr
              ? 'Problema de caché del navegador. Recarga con Ctrl+Shift+R.'
              : 'Tu navegador podría no soportar WebGL. Intenta con Chrome o Firefox actualizado.'}
          </div>
          <Button onClick={() => window.location.reload()} size="sm" className="mt-4">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Recargar la página
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Mockup3DWrapper() {
  return (
    <Mockup3DErrorBoundary>
      <Mockup3DEditor />
    </Mockup3DErrorBoundary>
  );
}
