'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Konva usa APIs de browser (window, canvas), por eso lo cargamos solo en cliente
const GangSheetCanvas = dynamic(() => import('@/components/gang-sheet-canvas'), {
  ssr: false,
  loading: () => <CanvasLoader />,
});

// ============================================================================
// CanvasLoader — spinner inicial + fallback amigable si el chunk falla o tarda
// ============================================================================
function CanvasLoader() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(t);
  }, []);

  if (stuck) {
    return (
      <div className="flex flex-col items-center justify-center h-[620px] rounded-xl border border-amber-200 bg-amber-50/60 px-6 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
        <div className="text-sm font-semibold text-slate-800">El editor está tardando más de lo normal</div>
        <div className="text-xs text-slate-600 mt-1 max-w-md">
          Puede ser un archivo del navegador viejo en caché. Refresca con
          {' '}<kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
          {' '}+{' '}<kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Shift</kbd>
          {' '}+{' '}<kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">R</kbd>
          {' '}(en Mac usa <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">⌘</kbd>+<kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">Shift</kbd>+<kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 font-mono text-[10px]">R</kbd>).
        </div>
        <Button
          onClick={() => window.location.reload()}
          size="sm"
          className="mt-4"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Recargar la página
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[620px] rounded-xl border border-slate-200 bg-white">
      <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
      <div className="text-sm text-slate-500 mt-2">Cargando editor…</div>
    </div>
  );
}

// ============================================================================
// Error Boundary — captura errores de chunk fail o crash de Konva y ofrece reload
// ============================================================================
class CanvasErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, err };
  }
  componentDidCatch(err, info) {
    // eslint-disable-next-line no-console
    console.error('[GangSheetCanvas] Error boundary catched:', err, info);
  }
  render() {
    if (this.state.hasError) {
      const isChunkErr = /ChunkLoadError|Loading chunk|Failed to fetch/i.test(String(this.state.err || ''));
      return (
        <div className="flex flex-col items-center justify-center h-[620px] rounded-xl border border-rose-200 bg-rose-50/60 px-6 text-center">
          <AlertTriangle className="h-10 w-10 text-rose-500 mb-3" />
          <div className="text-sm font-semibold text-slate-800">
            {isChunkErr ? 'No se pudo cargar el editor' : 'El editor tuvo un error'}
          </div>
          <div className="text-xs text-slate-600 mt-1 max-w-md">
            {isChunkErr
              ? 'Es un problema de caché del navegador tras una actualización. Recarga con Ctrl+Shift+R.'
              : String(this.state.err?.message || this.state.err || 'Error desconocido').slice(0, 200)}
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

export default function GangSheetCanvasWrapper() {
  return (
    <CanvasErrorBoundary>
      <GangSheetCanvas />
    </CanvasErrorBoundary>
  );
}
