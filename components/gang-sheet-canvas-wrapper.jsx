'use client';

import dynamic from 'next/dynamic';

// Konva usa APIs de browser (window, canvas), por eso lo cargamos solo en cliente
const GangSheetCanvas = dynamic(() => import('@/components/gang-sheet-canvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[620px] rounded-xl border border-slate-200 bg-white">
      <div className="text-sm text-slate-500">Cargando editor…</div>
    </div>
  ),
});

export default GangSheetCanvas;
