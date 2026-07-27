import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading UI global: se muestra automáticamente durante:
 *  - Compilación de la ruta en dev (Next.js)
 *  - Hydration inicial
 *  - Data fetching en server components
 *
 * Con esto el usuario NUNCA ve una pantalla en blanco al navegar.
 * Muestra un layout esqueleto que imita la estructura general de las páginas admin.
 */
export default function Loading() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header con ícono + título */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      {/* KPIs (4 tarjetas) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Contenido principal skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="p-4 space-y-3">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
