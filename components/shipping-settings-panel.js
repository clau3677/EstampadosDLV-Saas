'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MapPin, Plus, RefreshCw, Save, Trash2, Truck, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DEFAULT_SHIPPING = {
  pickup: {
    enabled: true,
    label: 'Retiro en taller',
    address: 'Galleguillos 1870, Quilpué',
    instructions: 'Te avisaremos cuando tu pedido esté listo para retirar.',
  },
  methods: [{ key: 'standard', label: 'Envío estándar', carrier: 'Por coordinar', enabled: true, baseCost: 3990, etaMinDays: 2, etaMaxDays: 4 }],
  zones: [{ key: 'chile', label: 'Chile', regions: [], comunas: [], surcharge: 0, enabled: true }],
};

function cloneShipping(value) {
  const source = value && typeof value === 'object' ? value : DEFAULT_SHIPPING;
  return {
    pickup: { ...DEFAULT_SHIPPING.pickup, ...(source.pickup || {}) },
    methods: Array.isArray(source.methods) && source.methods.length ? source.methods.map(item => ({ ...item })) : DEFAULT_SHIPPING.methods.map(item => ({ ...item })),
    zones: Array.isArray(source.zones) && source.zones.length ? source.zones.map(item => ({ ...item })) : DEFAULT_SHIPPING.zones.map(item => ({ ...item })),
  };
}

function csv(values) {
  return Array.isArray(values) ? values.join(', ') : '';
}

function list(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

export default function ShippingSettingsPanel() {
  const [shipping, setShipping] = useState(cloneShipping());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings/company', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar');
      setShipping(cloneShipping(data.shipping));
      setDirty(false);
    } catch (error) {
      toast.error(error.message || 'Error al cargar despacho');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const changePickup = (key, value) => {
    setShipping(current => ({ ...current, pickup: { ...current.pickup, [key]: value } }));
    setDirty(true);
  };

  const changeMethod = (index, key, value) => {
    setShipping(current => ({
      ...current,
      methods: current.methods.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
    setDirty(true);
  };

  const changeZone = (index, key, value) => {
    setShipping(current => ({
      ...current,
      zones: current.zones.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
    setDirty(true);
  };

  const addMethod = () => {
    setShipping(current => ({
      ...current,
      methods: [...current.methods, { key: `method_${current.methods.length + 1}`, label: 'Nuevo método', carrier: 'Por coordinar', enabled: true, baseCost: 0, etaMinDays: 2, etaMaxDays: 5 }],
    }));
    setDirty(true);
  };

  const removeMethod = (index) => {
    if (shipping.methods.length <= 1) return toast.error('Debe existir al menos un método de despacho');
    setShipping(current => ({ ...current, methods: current.methods.filter((_, itemIndex) => itemIndex !== index) }));
    setDirty(true);
  };

  const addZone = () => {
    setShipping(current => ({
      ...current,
      zones: [...current.zones, { key: `zone_${current.zones.length + 1}`, label: 'Nueva zona', regions: [], comunas: [], surcharge: 0, enabled: true }],
    }));
    setDirty(true);
  };

  const removeZone = (index) => {
    if (shipping.zones.length <= 1) return toast.error('Debe existir al menos una zona de cobertura');
    setShipping(current => ({ ...current, zones: current.zones.filter((_, itemIndex) => itemIndex !== index) }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ shipping }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
      setShipping(cloneShipping(data.data.shipping));
      setDirty(false);
      toast.success('Configuración de despacho guardada');
    } catch (error) {
      toast.error(error.message || 'Error al guardar despacho');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card><CardContent className="p-8 flex items-center justify-center text-slate-500"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cargando despacho…</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200/70">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center"><MapPin className="h-4 w-4 text-white" /></div>
            <div><h3 className="font-bold text-slate-900 text-sm">Retiro en taller</h3><p className="text-xs text-slate-500">Lugar e instrucciones que verá el cliente.</p></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label className="text-xs font-semibold">Nombre del método</Label><Input className="mt-1.5" value={shipping.pickup.label || ''} onChange={e => changePickup('label', e.target.value)} /></div>
            <div><Label className="text-xs font-semibold">Dirección de retiro</Label><Input className="mt-1.5" value={shipping.pickup.address || ''} onChange={e => changePickup('address', e.target.value)} /></div>
            <div className="sm:col-span-2"><Label className="text-xs font-semibold">Instrucciones</Label><Textarea className="mt-1.5" value={shipping.pickup.instructions || ''} onChange={e => changePickup('instructions', e.target.value)} /></div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Input type="checkbox" className="h-4 w-4" checked={shipping.pickup.enabled !== false} onChange={e => changePickup('enabled', e.target.checked)} />Retiro habilitado</label>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/70">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center"><Truck className="h-4 w-4 text-white" /></div><div><h3 className="font-bold text-slate-900 text-sm">Métodos de despacho</h3><p className="text-xs text-slate-500">El costo final suma tarifa base y recargo de zona.</p></div></div>
            <Button size="sm" variant="outline" onClick={addMethod}><Plus className="h-3.5 w-3.5 mr-1" />Agregar</Button>
          </div>
          <div className="space-y-3">
            {shipping.methods.map((method, index) => (
              <div key={`${method.key}-${index}`} className="rounded-lg border border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div><Label className="text-[11px]">Clave</Label><Input className="mt-1" value={method.key || ''} onChange={e => changeMethod(index, 'key', e.target.value)} /></div>
                <div><Label className="text-[11px]">Nombre</Label><Input className="mt-1" value={method.label || ''} onChange={e => changeMethod(index, 'label', e.target.value)} /></div>
                <div><Label className="text-[11px]">Courier / operador</Label><Input className="mt-1" value={method.carrier || ''} onChange={e => changeMethod(index, 'carrier', e.target.value)} /></div>
                <div><Label className="text-[11px]">Tarifa base</Label><Input type="number" min="0" className="mt-1" value={method.baseCost ?? 0} onChange={e => changeMethod(index, 'baseCost', Number(e.target.value))} /></div>
                <div><Label className="text-[11px]">Mín. días</Label><Input type="number" min="0" className="mt-1" value={method.etaMinDays ?? 0} onChange={e => changeMethod(index, 'etaMinDays', Number(e.target.value))} /></div>
                <div><Label className="text-[11px]">Máx. días</Label><Input type="number" min="0" className="mt-1" value={method.etaMaxDays ?? 0} onChange={e => changeMethod(index, 'etaMaxDays', Number(e.target.value))} /></div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 self-end"><Input type="checkbox" className="h-4 w-4" checked={method.enabled !== false} onChange={e => changeMethod(index, 'enabled', e.target.checked)} />Habilitado</label>
                <Button size="sm" variant="outline" className="self-end text-rose-600 hover:text-rose-700" onClick={() => removeMethod(index)}><Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/70">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center"><MapPin className="h-4 w-4 text-white" /></div><div><h3 className="font-bold text-slate-900 text-sm">Zonas de cobertura</h3><p className="text-xs text-slate-500">Regiones y comunas separadas por coma; una zona vacía funciona como respaldo.</p></div></div>
            <Button size="sm" variant="outline" onClick={addZone}><Plus className="h-3.5 w-3.5 mr-1" />Agregar</Button>
          </div>
          <div className="space-y-3">
            {shipping.zones.map((zone, index) => (
              <div key={`${zone.key}-${index}`} className="rounded-lg border border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div><Label className="text-[11px]">Clave</Label><Input className="mt-1" value={zone.key || ''} onChange={e => changeZone(index, 'key', e.target.value)} /></div>
                <div><Label className="text-[11px]">Nombre</Label><Input className="mt-1" value={zone.label || ''} onChange={e => changeZone(index, 'label', e.target.value)} /></div>
                <div><Label className="text-[11px]">Regiones</Label><Input className="mt-1" value={csv(zone.regions)} onChange={e => changeZone(index, 'regions', list(e.target.value))} placeholder="RM, Valparaíso" /></div>
                <div><Label className="text-[11px]">Comunas</Label><Input className="mt-1" value={csv(zone.comunas)} onChange={e => changeZone(index, 'comunas', list(e.target.value))} placeholder="Quilpué, Viña del Mar" /></div>
                <div><Label className="text-[11px]">Recargo de zona</Label><Input type="number" min="0" className="mt-1" value={zone.surcharge ?? 0} onChange={e => changeZone(index, 'surcharge', Number(e.target.value))} /></div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 self-end"><Input type="checkbox" className="h-4 w-4" checked={zone.enabled !== false} onChange={e => changeZone(index, 'enabled', e.target.checked)} />Habilitada</label>
                <Button size="sm" variant="outline" className="self-end text-rose-600 hover:text-rose-700" onClick={() => removeZone(index)}><Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 p-3 bg-white/90 backdrop-blur border border-slate-200 rounded-lg shadow-sm">
        <div className="text-xs text-slate-500">{dirty ? <span className="text-amber-600 font-semibold">● Cambios sin guardar</span> : <span>Todos los cambios están guardados</span>}</div>
        <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={load} disabled={saving}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Recargar</Button><Button size="sm" onClick={save} disabled={saving || !dirty} className="bg-orange-500 hover:bg-orange-600">{saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />Guardar cambios</>}</Button></div>
      </div>
    </div>
  );
}
