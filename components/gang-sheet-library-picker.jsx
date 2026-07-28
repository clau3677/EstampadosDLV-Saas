'use client';

// ============================================================================
// DesignLibraryPicker (v3) — modal de biblioteca con 4,648+ imágenes.
//
// Optimizaciones de rendimiento:
//   1. Thumbnails server-side: /api/thumbnails?src=...&w=300 → WebP ~50KB
//      (imagen original: 30-48MB PNG → thumbnail: ~50KB WebP)
//   2. Paginación server-side: carga solo 48 items por request
//   3. Selector de carpetas de Drive (filtro server-side por driveFolderName)
//   4. Búsqueda server-side por nombre (regex insensible a mayúsculas)
//   5. Caché en cliente (5 min TTL)
//   6. Carga asíncrona no bloqueante al seleccionar
//   7. lazy loading + decoding async en thumbnails
// ============================================================================
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Library, Loader2, Search, X, Sparkles, ChevronDown, Folder } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

// Configuración
const CACHE_TTL_MS = 5 * 60 * 1000;
const THUMB_WIDTH = 300;
const PAGE_SIZE = 48;
const THUMB_FORMAT = 'webp';

function thumbUrl(srcPath, w = THUMB_WIDTH) {
  return `/api/thumbnails?src=${encodeURIComponent(srcPath)}&w=${w}&format=${THUMB_FORMAT}`;
}

export default function DesignLibraryPicker({ onSelect, trigger }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [addingId, setAddingId] = useState(null);
  const [hasCached, setHasCached] = useState(false);
  const gridRef = useRef(null);
  const cacheRef = useRef({ data: [], folders: [], ts: 0, filterKey: '' });

  // Construir key del caché basada en filtros actuales
  const filterKey = useMemo(() => {
    const parts = [];
    if (q) parts.push(`q:${q.toLowerCase()}`);
    if (selectedFolder) parts.push(`f:${selectedFolder}`);
    return parts.join('|') || '__all__';
  }, [q, selectedFolder]);

  const fetchLibrary = useCallback(async (pageNum = 1, append = false) => {
    const params = new URLSearchParams({
      page: String(pageNum),
      size: String(PAGE_SIZE),
    });
    if (q) params.set('search', q);
    if (selectedFolder) params.set('folder', selectedFolder);

    // Verificar caché solo para la primera página sin filtros de búsqueda
    if (!append && !q && !selectedFolder && hasCached &&
        Date.now() - cacheRef.current.ts < CACHE_TTL_MS) {
      setItems(cacheRef.current.data);
      setFolders(cacheRef.current.folders);
      setTotal(cacheRef.current.total || 0);
      setTotalPages(cacheRef.current.totalPages || 1);
      return;
    }

    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const r = await fetch(`/api/design-library?${params}`);
      if (r.ok) {
        const data = await r.json();
        const newItems = Array.isArray(data.items) ? data.items : [];

        if (append) {
          setItems(prev => [...prev, ...newItems]);
        } else {
          setItems(newItems);
        }

        if (Array.isArray(data.folders)) {
          setFolders(data.folders);
        }
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setPage(pageNum);

        // Cachear solo si es primera página y sin búsqueda
        if (!append && !q && !selectedFolder) {
          cacheRef.current = {
            data: newItems,
            folders: data.folders || [],
            total: data.total || 0,
            totalPages: data.totalPages || 1,
            ts: Date.now(),
          };
          setHasCached(true);
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); setLoadingMore(false); }
  }, [q, selectedFolder, hasCached]);

  // Reset al cambiar filtros
  useEffect(() => {
    if (!open) return;
    fetchLibrary(1, false);
  }, [open, q, selectedFolder, fetchLibrary]);

  // Cargar más al scroll
  const handleScroll = useCallback(() => {
    if (!gridRef.current || loadingMore || page >= totalPages) return;
    const el = gridRef.current;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      fetchLibrary(page + 1, true);
    }
  }, [page, totalPages, loadingMore, fetchLibrary]);

  // Cambiar carpeta
  const handleFolderChange = (folderName) => {
    setSelectedFolder(folderName === selectedFolder ? null : folderName);
    setQ(''); // Limpiar búsqueda al cambiar carpeta
  };

  const handleSelect = (item) => {
    setAddingId(item.id);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setAddingId(null);
      onSelect({
        imageUrl: item.imageUrl,
        name: item.name,
        srcWidthPx: item.srcWidthPx || img.naturalWidth,
        srcHeightPx: item.srcHeightPx || img.naturalHeight,
        dpiOriginal: 300,
        image: img,
      });
      fetch(`/api/design-library/${item.id}/use`, { method: 'POST' }).catch(() => {});
      toast.success('Plantilla agregada', { description: item.name });
      setOpen(false);
    };
    img.onerror = () => {
      setAddingId(null);
      onSelect({
        imageUrl: item.imageUrl,
        name: item.name,
        srcWidthPx: item.srcWidthPx || 1000,
        srcHeightPx: item.srcHeightPx || 1000,
        dpiOriginal: 300,
        image: null,
      });
      fetch(`/api/design-library/${item.id}/use`, { method: 'POST' }).catch(() => {});
      toast.success('Plantilla agregada', { description: item.name });
      setOpen(false);
    };
    img.src = item.imageUrl;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" title="Agregar desde biblioteca de plantillas">
            <Library className="h-3.5 w-3.5 mr-1.5" />Biblioteca
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5 text-orange-500" />
            Biblioteca de plantillas
            <span className="text-xs font-normal text-slate-500">
              {total > 0 ? `${total} diseños` : ''}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Selector de carpetas + Búsqueda */}
        <div className="flex flex-col gap-2">
          {/* Carpetas */}
          {folders.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setSelectedFolder(null)}
                className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition ${
                  !selectedFolder
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-orange-400'
                }`}
              >
                Todas ({total})
              </button>
              {folders.slice(0, 12).map(f => (
                <button
                  key={f.name}
                  onClick={() => handleFolderChange(f.name)}
                  className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition whitespace-nowrap ${
                    selectedFolder === f.name
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-orange-400'
                  }`}
                >
                  <Folder className="h-3 w-3 inline mr-1" />
                  {f.name} ({f.count})
                </button>
              ))}
              {folders.length > 12 && (
                <span className="flex-shrink-0 text-[10px] text-slate-400 self-center px-1">
                  +{folders.length - 12} más
                </span>
              )}
            </div>
          )}

          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={selectedFolder ? `Buscar en "${selectedFolder}"...` : "Buscar por nombre..."}
              className="w-full h-9 pl-10 pr-10 rounded-md border border-slate-300 text-sm focus:outline-none focus:border-orange-400"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Info de estado */}
          {(selectedFolder || q) && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {selectedFolder && (
                <button
                  onClick={() => setSelectedFolder(null)}
                  className="flex items-center gap-1 hover:text-orange-600"
                >
                  <X className="h-3 w-3" /> Quitar filtro carpeta
                </button>
              )}
              {total > 0 && totalPages > 1 && (
                <span>Página {page} de {totalPages}</span>
              )}
            </div>
          )}
        </div>

        {/* Grid con scroll infinito */}
        <div
          ref={gridRef}
          className="flex-1 overflow-y-auto -mx-2 px-2"
          onScroll={handleScroll}
        >
          {loading ? (
            <div className="py-20 text-center text-slate-500">
              <Loader2 className="h-6 w-6 mx-auto animate-spin text-orange-500 mb-2" />
              Cargando plantillas…
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center text-sm text-slate-500">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              {q
                ? `No hay resultados para "${q}"`
                : 'No hay plantillas disponibles'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 py-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    disabled={addingId !== null}
                    className="group relative rounded-lg border-2 border-slate-200 hover:border-orange-400 bg-white p-2 text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-wait"
                  >
                    <div className="relative aspect-square rounded bg-slate-50 flex items-center justify-center overflow-hidden mb-2">
                      <img
                        src={thumbUrl(item.imageUrl)}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        width={THUMB_WIDTH}
                        height={THUMB_WIDTH}
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.src = item.imageUrl;
                          e.currentTarget.onerror = () => {
                            e.currentTarget.style.opacity = 0.2;
                          };
                        }}
                      />
                      {addingId === item.id && (
                        <div className="absolute inset-0 bg-orange-500/80 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 text-white animate-spin" />
                        </div>
                      )}
                      {item.uses > 5 && (
                        <div className="absolute top-1 right-1 text-[9px] bg-amber-500 text-white font-bold rounded px-1 py-0.5">
                          POPULAR
                        </div>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-900 truncate group-hover:text-orange-600">
                      {item.name}
                    </div>
                    {item.driveFolderName && (
                      <div className="text-[9px] text-slate-400 truncate mt-0.5">
                        {item.driveFolderName}
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Loading más o botón cargar más */}
              {loadingMore ? (
                <div className="py-4 text-center">
                  <Loader2 className="h-4 w-4 inline animate-spin text-orange-500 mr-1" />
                  <span className="text-xs text-slate-500">Cargando más…</span>
                </div>
              ) : page < totalPages ? (
                <div className="py-4 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchLibrary(page + 1, true)}
                    className="text-xs"
                  >
                    <ChevronDown className="h-3.5 w-3.5 mr-1" />
                    Cargar más ({total - items.length} restantes)
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
