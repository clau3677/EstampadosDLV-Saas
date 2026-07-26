'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, Edit3, Trash2, Printer, Loader2, Save, Palette, Ruler, DollarSign, Gauge,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

// Paleta preset de gradients (tailwind). El usuario puede seleccionar visualmente.
const COLOR_PRESETS = [
  { key: 'from-blue-500 to-indigo-600',     label: 'Azul' },
  { key: 'from-purple-500 to-fuchsia-600',  label: 'Púrpura' },
  { key: 'from-emerald-500 to-teal-600',    label: 'Verde' },
  { key: 'from-orange-500 to-rose-500',     label: 'Naranja' },
  { key: 'from-cyan-500 to-blue-600',       label: 'Cian' },
  { key: 'from-pink-500 to-rose-600',       label: 'Rosa' },
  { key: 'from-yellow-500 to-orange-500',   label: 'Amarillo' },
  { key: 'from-slate-500 to-slate-700',     label: 'Gris' },
];

const EMPTY = {
  code: '',
  label: '',
  shortLabel: '',
  type: 'dtf_textil',
  widthMm: 310,
  dpi: 300,
  supportsWhite: true,
  supportsVarnish: false,
  pricePerMm: 10,
  minLengthMm: 100,
  dailyCapacityM: 30,
  color: 'from-blue-500 to-indigo-600',
  notes: '',
  active: true,
  sortOrder: 99,
};

export default function PrintersManager({ onCountChange }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [isNew, setIsNew] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/printers');
      if (r.ok) {
        const arr = await r.json();
        setRows(arr);
        if (typeof onCountChange === 'function') onCountChange(Array.isArray(arr) ? arr.length : 0);
      }
    } catch (e) {
      toast.error('Error al cargar equipos');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setIsNew(true);
    setForm({ ...EMPTY, sortOrder: (rows.length || 0) + 1 });
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setIsNew(false);
    setForm({ ...EMPTY, ...row });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.label.trim()) {
      return toast.error('Código y nombre son obligatorios');
    }
    if (form.widthMm < 50 || form.widthMm > 2000) {
      return toast.error('Ancho útil fuera de rango (50–2000mm)');
    }
    if (form.pricePerMm < 1) {
      return toast.error('Precio por mm debe ser mayor a 0');
    }
    setSaving(true);
    try {
      const url = '/api/printers';
      const method = isNew ? 'POST' : 'PATCH';
      const body = { ...form };
      // Cast numerics para evitar strings
      body.widthMm = parseInt(body.widthMm, 10);
      body.dpi = parseInt(body.dpi, 10);
      body.pricePerMm = parseInt(body.pricePerMm, 10);
      body.minLengthMm = parseInt(body.minLengthMm, 10);
      body.dailyCapacityM = parseInt(body.dailyCapacityM, 10);
      body.sortOrder = parseInt(body.sortOrder, 10);

      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Error');
      toast.success(isNew ? 'Equipo creado' : 'Equipo actualizado');
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    try {
      const r = await fetch('/api/printers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!r.ok) throw new Error();
      toast.success(!row.active ? 'Equipo activado' : 'Equipo desactivado');
      load();
    } catch { toast.error('Error al actualizar'); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const r = await fetch('/api/printers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: confirmDelete.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Error al eliminar');
      toast.success('Equipo eliminado');
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Printer className="h-5 w-5 text-slate-600" />
            Equipos / Impresoras
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configura tus plotters, impresoras DTF textiles y máquinas UV. Los cambios se reflejan al instante en el Kanban de Producción y en el Gang Sheet Builder.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" />Nuevo equipo
        </Button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando…
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Printer className="h-8 w-8 text-slate-400 mx-auto" />
            <div className="mt-3 text-sm font-medium">Aún no hay equipos configurados</div>
            <div className="text-xs text-slate-500 mt-1">Añade tu primer plotter o impresora DTF.</div>
            <Button onClick={openNew} className="mt-4" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1.5" />Añadir primer equipo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map(row => (
            <Card key={row.id} className={row.active ? '' : 'opacity-60'}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${row.color || 'from-slate-500 to-slate-700'} flex items-center justify-center shrink-0`}>
                    <Printer className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-sm text-slate-900 truncate">{row.label}</div>
                      {row.type === 'dtf_uv' && (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 h-5 text-[10px] font-semibold">UV</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">{row.code}</div>
                  </div>
                  <Switch checked={row.active} onCheckedChange={() => toggleActive(row)} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Ruler className="h-2.5 w-2.5" />Ancho útil
                    </div>
                    <div className="font-mono font-semibold text-slate-900">{row.widthMm}mm ({(row.widthMm/10).toFixed(0)}cm)</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <DollarSign className="h-2.5 w-2.5" />Precio/mm
                    </div>
                    <div className="font-mono font-semibold text-slate-900">${row.pricePerMm} CLP</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Gauge className="h-2.5 w-2.5" />DPI
                    </div>
                    <div className="font-mono font-semibold text-slate-900">{row.dpi}</div>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Capacidad</div>
                    <div className="font-mono font-semibold text-slate-900">{row.dailyCapacityM || '∞'}m/día</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 pt-1">
                  {row.supportsWhite && <Badge variant="outline" className="text-[10px] h-4">Canal blanco</Badge>}
                  {row.supportsVarnish && <Badge variant="outline" className="text-[10px] h-4">Barniz UV</Badge>}
                  <Badge variant="outline" className="text-[10px] h-4">
                    {row.type === 'dtf_uv' ? 'DTF UV Rígidos' : 'DTF Textil'}
                  </Badge>
                </div>

                {row.notes && (
                  <div className="text-[11px] text-slate-500 italic border-t pt-2">{row.notes}</div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" onClick={() => openEdit(row)} className="flex-1">
                    <Edit3 className="h-3 w-3 mr-1" />Editar
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => setConfirmDelete(row)}
                    className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Nuevo/Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              {isNew ? 'Nuevo equipo' : `Editar ${form.label}`}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Código único *</Label>
              <Input
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_') })}
                placeholder="ej: epson_r1390"
                disabled={!isNew}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-slate-500">Solo letras minúsculas, números, guión y guión bajo. No se puede cambiar después.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nombre visible *</Label>
              <Input
                value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="ej: Epson R1390 · 31cm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nombre corto (badges)</Label>
              <Input
                value={form.shortLabel}
                onChange={e => setForm({ ...form, shortLabel: e.target.value })}
                placeholder="ej: Epson"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v, supportsVarnish: v === 'dtf_uv' ? form.supportsVarnish : false })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dtf_textil">DTF Textil (poleras, hoodies)</SelectItem>
                  <SelectItem value="dtf_uv">DTF UV (rígidos: madera, acrílico, metal)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ancho útil (mm) *</Label>
              <Input
                type="number" min={50} max={2000}
                value={form.widthMm}
                onChange={e => setForm({ ...form, widthMm: parseInt(e.target.value || '0', 10) })}
              />
              <p className="text-[10px] text-slate-500">Máximo del lienzo. Ej: 310 = 31cm, 330 = 33cm, 600 = 60cm.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">DPI (resolución)</Label>
              <Input
                type="number" min={72} max={2400}
                value={form.dpi}
                onChange={e => setForm({ ...form, dpi: parseInt(e.target.value || '0', 10) })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Precio por mm (CLP) *</Label>
              <Input
                type="number" min={1}
                value={form.pricePerMm}
                onChange={e => setForm({ ...form, pricePerMm: parseInt(e.target.value || '0', 10) })}
              />
              <p className="text-[10px] text-slate-500">Ej: 10 CLP/mm = $10.000 CLP/metro impreso.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Largo mínimo cobrable (mm)</Label>
              <Input
                type="number" min={10}
                value={form.minLengthMm}
                onChange={e => setForm({ ...form, minLengthMm: parseInt(e.target.value || '0', 10) })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Capacidad diaria (m/día)</Label>
              <Input
                type="number" min={0}
                value={form.dailyCapacityM}
                onChange={e => setForm({ ...form, dailyCapacityM: parseInt(e.target.value || '0', 10) })}
              />
              <p className="text-[10px] text-slate-500">0 = sin límite. Se usará para alertas futuras.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Orden en listados</Label>
              <Input
                type="number" min={1}
                value={form.sortOrder}
                onChange={e => setForm({ ...form, sortOrder: parseInt(e.target.value || '0', 10) })}
              />
            </div>

            <div className="col-span-full grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={form.supportsWhite} onCheckedChange={v => setForm({ ...form, supportsWhite: v })} />
                Canal blanco
              </label>
              {form.type === 'dtf_uv' && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Switch checked={form.supportsVarnish} onCheckedChange={v => setForm({ ...form, supportsVarnish: v })} />
                  Barniz UV
                </label>
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} />
                Activo
              </label>
            </div>

            <div className="col-span-full space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Palette className="h-3 w-3" />Color de tarjeta</Label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setForm({ ...form, color: c.key })}
                    className={`h-10 rounded-md bg-gradient-to-br ${c.key} border-2 transition-all ${form.color === c.key ? 'border-slate-900 ring-2 ring-offset-1 ring-slate-400' : 'border-transparent'}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div className="col-span-full space-y-1.5">
              <Label className="text-xs">Notas internas</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Ej: Máquina de respaldo para pedidos exprés"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {isNew ? 'Crear equipo' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar equipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <b>{confirmDelete?.label}</b> ({confirmDelete?.code}). Si el equipo tiene trabajos en cola no se podrá eliminar.
              Puedes desactivarlo (toggle) para ocultarlo sin borrarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-rose-600 hover:bg-rose-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
