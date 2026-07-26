'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { formatCLP } from '@/lib/format';

// Catálogo de tipos de insumo con etiqueta amigable y unidad sugerida
const SUPPLY_TYPES = [
  { value: 'film_pet',    label: 'Film PET (DTF Textil)', unit: 'meter' },
  { value: 'film_uv',     label: 'Film UV (Adhesivo)',    unit: 'meter' },
  { value: 'ink_cyan',    label: 'Tinta Cyan',            unit: 'ml' },
  { value: 'ink_magenta', label: 'Tinta Magenta',         unit: 'ml' },
  { value: 'ink_yellow',  label: 'Tinta Yellow',          unit: 'ml' },
  { value: 'ink_black',   label: 'Tinta Black',           unit: 'ml' },
  { value: 'ink_white',   label: 'Tinta Blanca',          unit: 'ml' },
  { value: 'ink_varnish', label: 'Tinta Barniz (UV)',     unit: 'ml' },
  { value: 'poliamida',   label: 'Poliamida (adhesivo termofusible)', unit: 'kg' },
];

const UNITS = [
  { value: 'meter', label: 'metros (m)' },
  { value: 'ml',    label: 'mililitros (ml)' },
  { value: 'kg',    label: 'kilogramos (kg)' },
  { value: 'unit',  label: 'unidades (un)' },
];

export function NewSupplyDialog({ onCreated, trigger }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', type: '', unit: '',
    currentQuantity: 0, minAlert: 0, cost: 0, supplier: '',
  });

  useEffect(() => {
    if (open) setForm({ name: '', code: '', type: '', unit: '', currentQuantity: 0, minAlert: 0, cost: 0, supplier: '' });
  }, [open]);

  // Al cambiar el tipo, auto-sugerir unidad
  const handleType = (type) => {
    const suggested = SUPPLY_TYPES.find(t => t.value === type)?.unit || '';
    setForm(f => ({ ...f, type, unit: f.unit || suggested }));
  };

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo insumo de producción</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Nombre *</Label>
              <Input
                placeholder="Ej: Tinta DTF Magenta 1L"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Código (opcional)</Label>
              <Input
                placeholder="INK-CMYK-M"
                value={form.code}
                onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <Input
                placeholder="InkPro Chile"
                value={form.supplier}
                onChange={(e) => setForm(f => ({ ...f, supplier: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.type} onValueChange={handleType}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {SUPPLY_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Unidad *</Label>
              <Select value={form.unit} onValueChange={(unit) => setForm(f => ({ ...f, unit }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cantidad inicial</Label>
              <Input
                type="number"
                min="0"
                value={form.currentQuantity}
                onChange={(e) => setForm(f => ({ ...f, currentQuantity: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Alerta mínima</Label>
              <Input
                type="number"
                min="0"
                value={form.minAlert}
                onChange={(e) => setForm(f => ({ ...f, minAlert: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Costo unitario (CLP)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <Input
                  type="number"
                  min="0"
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
