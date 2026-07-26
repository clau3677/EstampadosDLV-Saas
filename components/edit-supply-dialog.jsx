'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { TaxonomySelect } from '@/components/taxonomy-select';
import { formatCLP } from '@/lib/format';

export function EditSupplyDialog({ supply, open, onOpenChange, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  useEffect(() => {
    if (open && supply) {
      setForm({
        name: supply.name || '',
        code: supply.code || '',
        type: supply.type || '',
        unit: supply.unit || '',
        supplier: supply.supplier || '',
        minAlert: supply.minAlert || 0,
        cost: supply.cost || 0,
      });
    }
  }, [open, supply]);

  if (!supply) return null;

  const submit = async () => {
    if (!form.name || !form.type || !form.unit) return toast.error('Nombre, tipo y unidad requeridos');
    setSaving(true);
    try {
      const r = await fetch('/api/inventory/supplies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: supply.id, ...form, minAlert: Number(form.minAlert), cost: Number(form.cost) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success('Insumo actualizado');
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e.message || 'Error al guardar');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar insumo</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-slate-50 p-3 text-xs">
          <span className="text-slate-500">Cantidad actual:</span>{' '}
          <span className="font-mono font-semibold">{supply.currentQuantity} {supply.unit}</span>{' '}
          <span className="text-slate-500">(usar botón “Ajustar” para modificar)</span>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre *</Label>
            <Input value={form.name || ''} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Código</Label>
              <Input value={form.code || ''} onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <TaxonomySelect kind="supplier" value={form.supplier} onChange={(v) => setForm(f => ({ ...f, supplier: v }))} />
            </div>
            <div>
              <Label className="text-xs">Tipo *</Label>
              <TaxonomySelect kind="supply_type" value={form.type} onChange={(v) => setForm(f => ({ ...f, type: v }))} />
            </div>
            <div>
              <Label className="text-xs">Unidad *</Label>
              <TaxonomySelect kind="unit" value={form.unit} onChange={(v) => setForm(f => ({ ...f, unit: v }))} />
            </div>
            <div>
              <Label className="text-xs">Alerta mínima</Label>
              <Input type="number" min="0" value={form.minAlert || 0}
                onChange={(e) => setForm(f => ({ ...f, minAlert: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Costo unitario (CLP)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input type="number" min="0" className="pl-6 font-mono" value={form.cost || 0}
                  onChange={(e) => setForm(f => ({ ...f, cost: e.target.value }))} />
              </div>
              {form.cost > 0 && (
                <div className="text-[11px] text-slate-500 mt-1">= {formatCLP(form.cost)}</div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Guardar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditSupplyDialog;
