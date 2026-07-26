'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// ============================================================================
// TaxonomySelect — dropdown con datos dinámicos desde /api/taxonomies
// + botón "+ Nueva" inline para crear un valor sin cerrar el diálogo padre.
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
}) {
  const [options, setOptions] = useState(taxonomyCache.get(kind) || []);
  const [loading, setLoading] = useState(!taxonomyCache.has(kind));
  const [addOpen, setAddOpen] = useState(false);

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

  return (
    <div className={`flex gap-1.5 items-center ${className || ''}`}>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={loading ? 'Cargando…' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 && !loading && (
            <div className="px-2 py-3 text-xs text-slate-500 text-center">
              No hay {KIND_LABELS[kind]}s todavía
            </div>
          )}
          {options.map(o => (
            <SelectItem key={o.id} value={o.code}>{o.label}</SelectItem>
          ))}
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

export function invalidateTaxonomyCache(kind) {
  if (kind) taxonomyCache.delete(kind);
  else taxonomyCache.clear();
}

export async function reloadTaxonomies(kind) {
  return loadKind(kind, true);
}

export default TaxonomySelect;
