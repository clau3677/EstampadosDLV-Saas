'use client';

// ============================================================================
// DesignLibraryPicker (O) — modal que muestra la biblioteca de plantillas
// del print shop. Click en una plantilla la agrega al Gang Sheet Builder.
// ============================================================================
import { useEffect, useState } from 'react';
import { Library, Loader2, Search, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

export default function DesignLibraryPicker({ onSelect, trigger }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [addingId, setAddingId] = useState(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/design-library');
        if (r.ok) {
          const list = await r.json();
          setItems(Array.isArray(list) ? list : []);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [open]);

  const filtered = q
    ? items.filter(it =>
        it.name?.toLowerCase().includes(q.toLowerCase()) ||
        (it.tags || []).some(t => t.toLowerCase().includes(q.toLowerCase()))
      )
    : items;

  const handleSelect = async (item) => {
    setAddingId(item.id);
    try {
      // Cargar imagen para obtener HTMLImageElement
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = item.imageUrl;
      });

      await onSelect({
        imageUrl: item.imageUrl,
        name: item.name,
        srcWidthPx: item.srcWidthPx || img.naturalWidth,
        srcHeightPx: item.srcHeightPx || img.naturalHeight,
        dpiOriginal: 300,
        image: img,
      });

      // Notificar al backend (contador de uso)
      fetch(`/api/design-library/${item.id}/use`, { method: 'POST' }).catch(() => {});

      toast.success('Plantilla agregada', { description: item.name });
      setOpen(false);
    } catch (e) {
      toast.error('No se pudo agregar la plantilla', { description: e.message });
    } finally {
      setAddingId(null);
    }
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
          </DialogTitle>
        </DialogHeader>

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o etiqueta..."
            className="w-full h-10 pl-10 pr-10 rounded-md border border-slate-300 text-sm focus:outline-none focus:border-orange-400"
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

        {/* Grid de plantillas */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2">
          {loading ? (
            <div className="py-20 text-center text-slate-500">
              <Loader2 className="h-6 w-6 mx-auto animate-spin text-orange-500 mb-2" />
              Cargando plantillas…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-slate-500">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              {q
                ? `No hay resultados para "${q}"`
                : items.length === 0
                  ? 'La biblioteca está vacía por ahora. Los administradores pueden agregar plantillas desde el panel.'
                  : 'No hay plantillas disponibles'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 py-2">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  disabled={addingId !== null}
                  className="group relative rounded-lg border-2 border-slate-200 hover:border-orange-400 bg-white p-2 text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-wait"
                >
                  <div className="relative aspect-square rounded bg-slate-50 flex items-center justify-center overflow-hidden mb-2">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => { e.currentTarget.style.opacity = 0.2; }}
                    />
                    {addingId === item.id && (
                      <div className="absolute inset-0 bg-orange-500/80 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      </div>
                    )}
                    {item.uses > 5 && (
                      <div className="absolute top-1 right-1 text-[9px] bg-amber-500 text-white font-bold rounded px-1 py-0.5">
                        ⭐ POPULAR
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-slate-900 truncate group-hover:text-orange-600">
                    {item.name}
                  </div>
                  {item.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.tags.slice(0, 2).map(t => (
                        <span key={t} className="text-[9px] bg-slate-100 text-slate-600 rounded px-1 py-0.5">{t}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
