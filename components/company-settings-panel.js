'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2, Landmark, Mail, Phone, MapPin, Loader2, Save, RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const FIELDS = [
  // Sección: Datos generales
  { section: 'Datos de la empresa', icon: Building2 },
  { key: 'companyName',   label: 'Razón social (nombre legal)', placeholder: 'Safebuildlv SpA' },
  { key: 'rut',           label: 'RUT de la empresa',            placeholder: '77.852.607-7' },
  { key: 'contactEmail',  label: 'Email de contacto',            placeholder: 'estampadosdlv@gmail.com', type: 'email' },
  { key: 'contactPhone',  label: 'Teléfono',                     placeholder: '+56 9 1234 5678' },
  { key: 'address',       label: 'Dirección',                    placeholder: 'Av. Ejemplo 123, Quilpué' },

  // Sección: Datos bancarios
  { section: 'Datos bancarios (aparecen al confirmar un pedido con transferencia)', icon: Landmark },
  { key: 'bankName',       label: 'Banco',                                     placeholder: 'Banco Estado' },
  { key: 'accountType',    label: 'Tipo de cuenta',                            placeholder: 'Chequera Electrónica' },
  { key: 'accountNumber',  label: 'N° de cuenta',                              placeholder: '22870140049', mono: true },
  { key: 'accountHolder',  label: 'Titular de la cuenta (normalmente igual a la razón social)', placeholder: 'Safebuildlv SpA' },
  { key: 'paymentEmail',   label: 'Email para enviar comprobantes',            placeholder: 'estampadosdlv@gmail.com', type: 'email' },
  { key: 'instructions',   label: 'Instrucciones adicionales (opcional)',      placeholder: 'Ej. Enviar el comprobante por WhatsApp al +56...', textarea: true },
];

export default function CompanySettingsPanel() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/settings/company', { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        setForm(data);
        setDirty(false);
      } else {
        toast.error('No se pudo cargar la configuración');
      }
    } catch {
      toast.error('Error de red al cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleChange = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo guardar');
        return;
      }
      toast.success('Configuración guardada');
      setForm(data.data);
      setDirty(false);
    } catch (e) {
      toast.error('Error de red al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-slate-500">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />Cargando configuración…
        </CardContent>
      </Card>
    );
  }

  // Agrupar campos por sección
  const sections = [];
  let current = null;
  FIELDS.forEach(f => {
    if (f.section) {
      current = { title: f.section, icon: f.icon, items: [] };
      sections.push(current);
    } else if (current) {
      current.items.push(f);
    }
  });

  return (
    <div className="space-y-4">
      {sections.map((section, si) => {
        const Icon = section.icon;
        return (
          <Card key={si} className="border-slate-200/70">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm">{section.title}</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.items.map(f => (
                  <div key={f.key} className={f.textarea ? 'sm:col-span-2' : ''}>
                    <Label className="text-xs font-semibold text-slate-700">
                      {f.label}
                    </Label>
                    {f.textarea ? (
                      <Textarea
                        value={form[f.key] || ''}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className="mt-1.5 min-h-[70px]"
                      />
                    ) : (
                      <Input
                        type={f.type || 'text'}
                        value={form[f.key] || ''}
                        onChange={(e) => handleChange(f.key, e.target.value)}
                        placeholder={f.placeholder}
                        className={`mt-1.5 ${f.mono ? 'font-mono' : ''}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Barra de acciones */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 p-3 bg-white/80 backdrop-blur border border-slate-200 rounded-lg shadow-sm">
        <div className="text-xs text-slate-500">
          {dirty
            ? <span className="text-amber-600 font-semibold">● Cambios sin guardar</span>
            : <span>Todos los cambios están guardados</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={saving}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Recargar
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || !dirty}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</>
              : <><Save className="h-3.5 w-3.5 mr-1.5" />Guardar cambios</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
