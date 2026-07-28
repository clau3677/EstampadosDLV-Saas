'use client';

// ============================================================================
// DraftsButton (K) — botón + popover para guardar/cargar borradores del builder.
// Los borradores se persisten en localStorage (ver /lib/gang-sheet/drafts-local.js).
// ============================================================================
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Save, FolderOpen, Trash2, X, FileText, Loader2, Clock, Layers as LayersIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  listDraftsLocal, saveDraftLocal, deleteDraftLocal,
} from '@/lib/gang-sheet/drafts-local';

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  const days = Math.floor(diff / 86400);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export default function DraftsButton({ store, onLoad }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState([]);

  const refresh = () => setDrafts(listDraftsLocal());
  useEffect(() => { refresh(); }, [loadOpen]);

  const { mode, printerCode, canvasWidthMm, designs } = store;

  const handleSave = () => {
    if (!designs.length) {
      toast.error('No hay diseños para guardar');
      return;
    }
    const draft = saveDraftLocal({
      name: name || `Borrador ${new Date().toLocaleString('es-CL')}`,
      mode, printerCode, canvasWidthMm, designs,
    });
    toast.success('Borrador guardado', { description: draft.name });
    setName('');
    setSaveOpen(false);
    refresh();
  };

  const handleLoad = async (draft) => {
    setLoadOpen(false);
    try {
      await onLoad(draft);
      toast.success(`"${draft.name}" cargado`, { description: `${draft.designs.length} diseños` });
    } catch (e) {
      toast.error('No se pudo cargar', { description: e.message });
    }
  };

  const handleDelete = (id, ev) => {
    ev?.stopPropagation();
    deleteDraftLocal(id);
    refresh();
    toast.success('Borrador eliminado');
  };

  return (
    <div className="inline-flex rounded-md border border-slate-200 overflow-hidden shadow-sm">
      {/* Guardar */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            title="Guardar borrador"
            disabled={!designs.length}
            className="px-2.5 h-8 text-slate-700 hover:bg-slate-50 disabled:text-slate-300 border-r border-slate-200 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-4 w-4 text-orange-500" />Guardar borrador
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <label className="text-xs font-semibold text-slate-700">Nombre del borrador</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Camisetas Diciembre"
              className="w-full h-10 px-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:border-orange-400"
              autoFocus
              maxLength={60}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <p className="text-[11px] text-slate-500">
              Se guarda en este navegador. {designs.length} diseño{designs.length === 1 ? '' : 's'} · {(canvasWidthMm/10).toFixed(0)} cm ancho
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600">
              <Save className="h-4 w-4 mr-1" />Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cargar */}
      <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            title="Abrir borrador guardado"
            className="px-2.5 h-8 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-orange-500" />Abrir borrador
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 max-h-[400px] overflow-y-auto space-y-1.5">
            {drafts.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-500">
                <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                No tienes borradores guardados aún
              </div>
            ) : (
              drafts.map((draft) => (
                <button
                  key={draft.id}
                  onClick={() => handleLoad(draft)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-orange-400 hover:bg-orange-50/50 text-left transition-colors group"
                >
                  <FileText className="h-4 w-4 text-slate-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-slate-900 truncate">{draft.name}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-0.5"><LayersIcon className="h-2.5 w-2.5" />{draft.designs.length}</span>
                      <span>·</span>
                      <span>{(draft.canvasWidthMm/10).toFixed(0)}cm</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{timeAgo(draft.savedAt)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(draft.id, e)}
                    title="Eliminar borrador"
                    className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
