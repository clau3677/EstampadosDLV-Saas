'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, UserPlus, Sparkles, ShieldCheck, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function RegisterForm() {
  const search = useSearchParams();
  const next = search.get('next') || null;

  const [form, setForm] = useState({ fullName: '', email: '', phone: '', rut: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) {
      return toast.error('La contraseña debe tener al menos 6 caracteres');
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, email: form.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear cuenta');

      toast.success(`¡Bienvenido, ${data.user.fullName?.split(' ')[0]}!`, {
        description: 'Tu cuenta está lista.',
      });

      let dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/mi-cuenta';
      window.location.href = dest;
    } catch (err) {
      toast.error('No pudimos crear tu cuenta', { description: err.message });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <Link href="/tienda" className="inline-flex items-center gap-2">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div className="text-left">
              <div className="text-lg font-bold text-slate-900">Estampados DLV</div>
              <div className="text-[11px] text-slate-500 -mt-1">Impresión DTF profesional</div>
            </div>
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-xl p-6 md:p-8">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus className="h-5 w-5 text-orange-500" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Crear cuenta</h1>
          </div>
          <p className="text-sm text-slate-500 mb-6">Último paso para hacer seguimiento de tus pedidos.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="fullName" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Nombre completo</Label>
              <Input id="fullName" required value={form.fullName} onChange={setF('fullName')}
                placeholder="Ej: Camila Silva" className="mt-1.5 h-11" />
            </div>
            <div>
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={setF('email')}
                placeholder="tucorreo@ejemplo.cl" className="mt-1.5 h-11" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Teléfono</Label>
                <Input id="phone" value={form.phone} onChange={setF('phone')}
                  placeholder="+56 9 1234 5678" className="mt-1.5 h-11" />
              </div>
              <div>
                <Label htmlFor="rut" className="text-xs font-semibold uppercase tracking-widest text-slate-600">RUT (opcional)</Label>
                <Input id="rut" value={form.rut} onChange={setF('rut')}
                  placeholder="12.345.678-9" className="mt-1.5 h-11" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Contraseña</Label>
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
                  {showPw ? <><EyeOff className="h-3 w-3" />Ocultar</> : <><Eye className="h-3 w-3" />Mostrar</>}
                </button>
              </div>
              <Input id="password" type={showPw ? 'text' : 'password'} required minLength={6}
                value={form.password} onChange={setF('password')}
                placeholder="Mínimo 6 caracteres" className="mt-1.5 h-11" />
            </div>

            <Button type="submit" disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-semibold shadow-md">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creando cuenta…</> : <><UserPlus className="h-4 w-4 mr-2" />Crear mi cuenta</>}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-sm text-slate-600">
            ¿Ya tienes cuenta?{' '}
            <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="font-semibold text-orange-600 hover:text-orange-700">
              Iniciar sesión <ArrowRight className="h-3 w-3 inline ml-0.5" />
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3 w-3" />
          Nunca compartimos tus datos · sin spam
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}
