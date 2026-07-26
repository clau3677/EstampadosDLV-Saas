'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { TaxonomySelect } from '@/components/taxonomy-select';
import { formatCLP } from '@/lib/format';

// ============================================================================
// NewSupplyDialog v2 — usa TaxonomySelect dinámico para tipo/unidad/proveedor.
// El usuario puede agregar nuevos valores sin salir del diálogo (botón +).
// ============================================================================

export function NewSupplyDialog({ onCreated, trigger }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', type: '', unit: '', supplier: '',
    currentQuantity: 0, minAlert: 0, cost: 0,
  });

  useEffect(() => {
    if (open) setForm({ name: '', code: '', type: '', unit: '', supplier: '', currentQuantity: 0, minAlert: 0, cost: 0 });
  }, [open]);

  // Auto-sugerir unidad al elegir tipo (usa extras.unit del taxonomy)
  const handleTypeSelected = (typeCode, taxonomyOpts) => {
    setForm(f => ({ ...f, type: typeCode }));
    const opt = taxonomyOpts?.find(o => o.code === typeCode);
    if (opt?.extras?.unit && !form.unit) {
      setForm(f => ({ ...f, unit: opt.extras.unit }));
    }
  };

  const [typeOptions, setTypeOptions] = useState([]);

  const submit = async () => {
    if (!form.name || !form.type || !form.unit) {
      return toast.error('Nombre, tipo y unidad son obligatorios');
    }
    setSaving(true);
    try {
      const r = await fetch('/api/inventory/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');
      toast.success('Insumo creado', {
        description: `${data.name} · ${data.currentQuantity} ${data.unit}`,
      });
      setOpen(false);
      onCreated?.(data);
    } catch (e) {
      toast.error('Error al crear insumo', { description: e.message });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Nuevo Insumo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo insumo de producción</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input
              placeholder="Ej: Tinta DTF Magenta 1L"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Código (opcional)</Label>
              <Input
                placeholder="INK-CMYK-M"
                value={form.code}
                onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <TaxonomySelect
                kind="supplier"
                value={form.supplier}
                onChange={(v) => setForm(f => ({ ...f, supplier: v }))}
                placeholder="Elige o crea…"
              />
            </div>
            <div>
              <Label className="text-xs">Tipo *</Label>
              <TaxonomySelect
                kind="supply_type"
                value={form.type}
                onChange={(v) => handleTypeSelected(v, typeOptions)}
                onOptionsChange={setTypeOptions}
                placeholder="Elige o crea…"
              />
            </div>
            <div>
              <Label className="text-xs">Unidad *</Label>
              <TaxonomySelect
                kind="unit"
                value={form.unit}
                onChange={(v) => setForm(f => ({ ...f, unit: v }))}
                placeholder="Elige o crea…"
              />
            </div>
            <div>
              <Label className="text-xs">Cantidad inicial</Label>
              <Input
                type="number" min="0"
                value={form.currentQuantity}
                onChange={(e) => setForm(f => ({ ...f, currentQuantity: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Alerta mínima</Label>
              <Input
                type="number" min="0"
                value={form.minAlert}
                onChange={(e) => setForm(f => ({ ...f, minAlert: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Costo unitario (CLP)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input
                  type="number" min="0"
                  className="pl-6 font-mono"
                  value={form.cost}
                  onChange={(e) => setForm(f => ({ ...f, cost: e.target.value }))}
                />
              </div>
              {form.cost > 0 && (
                <div className="text-[11px] text-slate-500 mt-1">= {formatCLP(form.cost)} por {form.unit || 'unidad'}</div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</> : 'Crear insumo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewSupplyDialog;
