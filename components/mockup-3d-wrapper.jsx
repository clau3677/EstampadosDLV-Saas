'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Three.js uses browser APIs (WebGL, window), so we load only on client
const Mockup3DEditor = dynamic(() => import('@/components/mockup-3d-editor'), {
  ssr: false,
});

class Mockup3DErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, err: null }; }
  static getDerivedStateFromError(err) { return { hasError: true, err }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-white px-6 text-center">
          <div className="text-sm font-semibold text-slate-800">
            El editor 3D tuvo un error
          </div>
          <div className="text-xs text-slate-600 mt-1 max-w-md">
            Hubo un problema al cargar el editor. Por favor, recarga la página.
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
          >
            Recargar
          </button>
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
