'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Save, User, Phone, MapPin, Lock, CheckCircle2, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';

export default function MiCuentaPage() {
  const { user, loading, refresh } = useAuth();
  const [form, setForm] = useState({
    fullName: '', phone: '', rut: '',
    address: { street: '', comuna: '', city: '', region: '' },
  });
  const [saving, setSaving] = useState(false);

  // Password change
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        fullName: user.fullName || '',
        phone: user.phone || '',
        rut: user.rut || '',
        address: user.address || { street: '', comuna: '', city: '', region: '' },
      });
    }
  }, [user]);

  if (loading) return <div className="text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Cargando datos…</div>;

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setAddr = (k) => (e) => setForm(f => ({ ...f, address: { ...f.address, [k]: e.target.value } }));

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      toast.success('Perfil actualizado');
      refresh();
    } catch (err) {
      toast.error('No se pudo guardar', { description: err.message });
    } finally { setSaving(false); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (pw.newPassword.length < 6) return toast.error('La nueva contraseña debe tener al menos 6 caracteres');
    if (pw.newPassword !== pw.confirm) return toast.error('Las contraseñas no coinciden');
    setChangingPw(true);
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      toast.success('Contraseña actualizada');
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error('No se pudo cambiar', { description: err.message });
    } finally { setChangingPw(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Mi cuenta</h1>
        <p className="text-sm text-slate-500 mt-1">Gestiona tu información personal y contraseña.</p>
      </div>

      {/* Datos personales */}
      <form onSubmit={saveProfile} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-orange-500" />
          <h2 className="font-bold text-slate-900">Datos personales</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Nombre completo</Label>
            <Input value={form.fullName} onChange={setF('fullName')} required className="mt-1.5" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={user?.email || ''} disabled className="mt-1.5 bg-slate-50" />
            <p className="text-[11px] text-slate-500 mt-1">Contacta soporte para cambiar tu email.</p>
          </div>
          <div>
            <Label className="text-xs">Teléfono</Label>
            <Input value={form.phone} onChange={setF('phone')} className="mt-1.5" placeholder="+56 9 1234 5678" />
          </div>
          <div>
            <Label className="text-xs">RUT</Label>
            <Input value={form.rut} onChange={setF('rut')} className="mt-1.5" placeholder="12.345.678-9" />
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-orange-500" />
            <h3 className="font-semibold text-slate-800 text-sm">Dirección de envío (opcional)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs">Calle y número</Label>
              <Input value={form.address.street} onChange={setAddr('street')} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs">Comuna</Label>
              <Input value={form.address.comuna} onChange={setAddr('comuna')} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs">Ciudad</Label>
              <Input value={form.address.city} onChange={setAddr('city')} className="mt-1.5" />
            </div>
            <div>
              <Label className="text-xs">Región</Label>
              <Input value={form.address.region} onChange={setAddr('region')} className="mt-1.5" />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando…</> : <><Save className="h-4 w-4 mr-2" />Guardar cambios</>}
          </Button>
        </div>
      </form>

      {/* Cambio de contraseña */}
      <form onSubmit={changePw} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-4 w-4 text-orange-500" />
          <h2 className="font-bold text-slate-900">Seguridad</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">Contraseña actual</Label>
            <Input type="password" value={pw.currentPassword}
              onChange={(e) => setPw(p => ({ ...p, currentPassword: e.target.value }))}
              required className="mt-1.5" />
          </div>
          <div>
            <Label className="text-xs">Nueva contraseña</Label>
            <Input type="password" value={pw.newPassword}
              onChange={(e) => setPw(p => ({ ...p, newPassword: e.target.value }))}
              required minLength={6} className="mt-1.5" placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <Label className="text-xs">Confirmar nueva</Label>
            <Input type="password" value={pw.confirm}
              onChange={(e) => setPw(p => ({ ...p, confirm: e.target.value }))}
              required className="mt-1.5" />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={changingPw} variant="outline">
            {changingPw ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cambiando…</> : <><KeyRound className="h-4 w-4 mr-2" />Cambiar contraseña</>}
          </Button>
        </div>
      </form>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/mi-cuenta/pedidos" className="rounded-2xl border border-slate-200 bg-white hover:border-orange-300 hover:shadow-md transition-all p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center text-white shadow-sm">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Mis pedidos</div>
              <div className="text-xs text-slate-500">Historial y estado de producción</div>
            </div>
          </div>
        </Link>
        <Link href="/tienda" className="rounded-2xl border border-slate-200 bg-white hover:border-orange-300 hover:shadow-md transition-all p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Volver a la tienda</div>
              <div className="text-xs text-slate-500">Ver catálogo y hacer un nuevo pedido</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
