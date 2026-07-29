'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Loader2, Sparkles, Trash2, Pencil, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// TaxonomySelect — dropdown con datos dinámicos desde /api/taxonomies
// + botón "+ Nueva" inline para crear un valor sin cerrar el diálogo padre.
// + botón "Editar" por cada opción (renombrar / eliminar / desactivar).
// Se puede usar controlado (value + onChange) o como campo de formulario.
// ============================================================================

const KIND_LABELS = {
  product_category: 'categoría',
  supply_type:      'tipo de insumo',
  unit:             'unidad',
  supplier:         'proveedor',
};

const KIND_TITLES = {
  product_category: 'Nueva categoría',
  supply_type:      'Nuevo tipo de insumo',
  unit:             'Nueva unidad',
  supplier:         'Nuevo proveedor',
};

const KIND_DELETE_TITLES = {
  product_category: 'Eliminar categoría',
  supply_type:      'Eliminar tipo de insumo',
  unit:             'Eliminar unidad',
  supplier:         'Eliminar proveedor',
};

// Cache global de taxonomías (evita cargas repetidas dentro del mismo diálogo)
const taxonomyCache = new Map();
const taxonomyListeners = new Set();

async function loadKind(kind, force = false) {
  if (!force && taxonomyCache.has(kind)) return taxonomyCache.get(kind);
  try {
    const r = await fetch(`/api/taxonomies?kind=${kind}`);
    const data = await r.json();
    const arr = Array.isArray(data) ? data : [];
    taxonomyCache.set(kind, arr);
    taxonomyListeners.forEach(fn => fn(kind, arr));
    return arr;
  } catch (e) {
    return [];
  }
}

export function TaxonomySelect({
  kind,
  value,
  onChange,
  placeholder = 'Selecciona…',
  showAdd = true,
  onOptionsChange,
  className,
  extras,               // optional callback: (opt) => {} para hacer algo con el objeto completo
  showDelete = true,    // mostrar opción de eliminar/editar
}) {
  const [options, setOptions] = useState(taxonomyCache.get(kind) || []);
  const [loading, setLoading] = useState(!taxonomyCache.has(kind));
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(null);  // { id, label, kind } o null

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadKind(kind).then((arr) => {
      if (!mounted) return;
      setOptions(arr);
      setLoading(false);
      onOptionsChange?.(arr);
    });

    const listener = (k, arr) => {
      if (k === kind && mounted) {
        setOptions(arr);
        onOptionsChange?.(arr);
      }
    };
    taxonomyListeners.add(listener);
    return () => { mounted = false; taxonomyListeners.delete(listener); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const handleCreated = (created) => {
    onChange?.(created.code);
    if (extras) extras(created);
  };

  const handleDeleted = () => {
    loadKind(kind, true);
    toast.success('Taxonomía eliminada');
    if (extras) extras({ _deleted: true });
  };

  const handleRenamed = (updated) => {
    loadKind(kind, true);
    toast.success('Taxonomía renombrada');
  };

  // Filtrar opciones activas (extras.active !== false)
  const activeOptions = options.filter(o => o.extras?.active !== false);
  const inactiveOptions = options.filter(o => o.extras?.active === false);

  return (
    <div className={`flex gap-1.5 items-center ${className || ''}`}>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={loading ? 'Cargando…' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {activeOptions.length === 0 && !loading && (
            <div className="px-2 py-3 text-xs text-slate-500 text-center">
              No hay {KIND_LABELS[kind]}s todavía
            </div>
          )}
          {activeOptions.map(o => (
            <div key={o.id} className="flex items-center w-full">
              <SelectItem className="flex-1" value={o.code}>{o.label}</SelectItem>
              {showDelete && (
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center text-slate-400 hover:text-rose-500 rounded mr-1 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditOpen({ id: o.id, label: o.label, kind, code: o.code, extras: o.extras });
                  }}
                  title="Editar / eliminar"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {inactiveOptions.length > 0 && (
            <>
              <div className="px-2 py-1 text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Desactivadas</div>
              {inactiveOptions.map(o => (
                <div key={o.id} className="flex items-center w-full">
                  <SelectItem className="flex-1 opacity-50" value={o.code}>
                    {o.label}
                    <Badge variant="outline" className="text-[9px] ml-1 h-3.5 text-slate-400">Inactiva</Badge>
                  </SelectItem>
                  {showDelete && (
                    <button
                      type="button"
                      className="h-6 w-6 flex items-center justify-center text-slate-400 hover:text-rose-500 rounded mr-1 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditOpen({ id: o.id, label: o.label, kind, code: o.code, extras: o.extras });
                      }}
                      title="Reactivar / eliminar"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
      {showAdd && (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 text-slate-500 hover:text-orange-600 hover:border-orange-300"
            onClick={() => setAddOpen(true)}
            title={`Agregar ${KIND_LABELS[kind]}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <QuickAddTaxonomy
            open={addOpen}
            onOpenChange={setAddOpen}
            kind={kind}
            onCreated={handleCreated}
          />
        </>
      )}
      {showDelete && editOpen && (
        <EditDeleteTaxonomy
          open={!!editOpen}
          onOpenChange={(v) => { if (!v) setEditOpen(null); }}
          item={editOpen}
          onDeleted={handleDeleted}
          onRenamed={handleRenamed}
        />
      )}
    </div>
  );
}

function QuickAddTaxonomy({ open, onOpenChange, kind, onCreated }) {
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setLabel(''); }, [open]);

  const submit = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const r = await fetch('/api/taxonomies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, label: trimmed }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 409 && data.existing) {
          // Ya existía: seleccionarlo
          toast.info('Ya existía, seleccionando existente');
          onCreated(data.existing);
          onOpenChange(false);
          return;
        }
        throw new Error(data.error || 'error');
      }
      // Refrescar cache
      await loadKind(kind, true);
      onCreated(data);
      onOpenChange(false);
      toast.success(`${data.label} agregado`);
    } catch (e) {
      toast.error('Error al crear', { description: e.message });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-500" />
            {KIND_TITLES[kind]}
          </DialogTitle>
        </DialogHeader>
        <div>
          <Label className="text-xs">Nombre</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ingresa el nombre…"
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            autoFocus
          />
          <p className="text-[11px] text-slate-500 mt-2">Aparecerá inmediatamente en el desplegable.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !label.trim()} className="bg-orange-500 hover:bg-orange-600">
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</> : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDeleteTaxonomy({ open, onOpenChange, item, onDeleted, onRenamed }) {
  const [label, setLabel] = useState(item?.label || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && item) {
      setLabel(item.label);
      setConfirmDelete(false);
    }
  }, [open, item]);

  const handleRename = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const r = await fetch('/api/taxonomies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, label: trimmed }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      onRenamed({ ...item, label: trimmed });
      onOpenChange(false);
    } catch (e) {
      toast.error('Error al renombrar', { description: e.message });
    } finally { setSaving(false); }
  };

  const handleToggleActive = async () => {
    const newActive = item.extras?.active !== false; // toggle
    setSaving(true);
    try {
      const r = await fetch('/api/taxonomies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          extras: { ...item.extras, active: !newActive },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      await loadKind(item.kind, true);
      toast.success(newActive ? 'Categoría desactivada' : 'Categoría reactivada');
      onOpenChange(false);
    } catch (e) {
      toast.error('Error', { description: e.message });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const r = await fetch('/api/taxonomies', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      onDeleted();
      onOpenChange(false);
    } catch (e) {
      toast.error('Error al eliminar', { description: e.message });
    } finally { setDeleting(false); }
  };

  const isInactive = item?.extras?.active === false;
  const kindLabel = KIND_LABELS[item?.kind] || 'elemento';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-orange-500" />
            {KIND_DELETE_TITLES[item?.kind] || `Editar ${kindLabel}`}
          </DialogTitle>
        </DialogHeader>

        {!confirmDelete ? (
          <div className="space-y-3">
            {/* Renombrar */}
            <div>
              <Label className="text-xs">Nombre actual</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Nuevo nombre…"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleRename}
                  disabled={saving || !label.trim() || label === item.label}
                  className="bg-orange-500 hover:bg-orange-600 shrink-0"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Renombrar'}
                </Button>
              </div>
            </div>

            <div className="border-t pt-3">
              <Label className="text-xs text-slate-500">Estado</Label>
              <div className="flex items-center gap-2 mt-1">
                <Button
                  size="sm"
                  variant={isInactive ? 'default' : 'outline'}
                  onClick={handleToggleActive}
                  disabled={saving}
                  className={isInactive ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  {isInactive ? (
                    <><Plus className="h-3.5 w-3.5 mr-1" />Reactivar</>
                  ) : (
                    <><X className="h-3.5 w-3.5 mr-1" />Desactivar</>
                  )}
                </Button>
                <span className="text-[11px] text-slate-500">
                  {isInactive
                    ? 'Oculto del desplegable'
                    : 'Visible en el desplegable'}
                </span>
              </div>
            </div>

            <div className="border-t pt-3">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                className="w-full"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Eliminar definitivamente
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200">
              <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-rose-900">
                  Eliminar &quot;{item.label}&quot;?
                </div>
                <div className="text-xs text-rose-700 mt-1">
                  Esta acción es irreversible. Los productos que usaban esta categoría quedarán con la categoría sin asignar.
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1"
              >
                {deleting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Eliminando…</> : 'Sí, eliminar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function invalidateTaxonomyCache(kind) {
  if (kind) taxonomyCache.delete(kind);
  else taxonomyCache.clear();
}

export async function reloadTaxonomies(kind) {
  return loadKind(kind, true);
}

export default TaxonomySelect;
