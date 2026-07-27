'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, LogIn, Sparkles, ShieldCheck, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');

      toast.success(`¡Bienvenido, ${data.user.fullName?.split(' ')[0] || ''}!`);

      // Redirect — respect ?next=... but validate it’s a safe internal path
      let dest = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      if (!dest) {
        dest = data.user.role === 'customer' ? '/mi-cuenta' : '/';
      }
      // Full reload so middleware picks up the new cookie for the target path
      window.location.href = dest;
    } catch (err) {
      toast.error('No pudimos ingresar', { description: err.message });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
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
            <LogIn className="h-5 w-5 text-orange-500" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Iniciar sesión</h1>
          </div>
          <p className="text-sm text-slate-500 mb-6">Ingresa a tu cuenta para gestionar tu tienda o ver tus pedidos.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.cl"
                className="mt-1.5 h-11" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-slate-600">Contraseña</Label>
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
                  {showPw ? <><EyeOff className="h-3 w-3" />Ocultar</> : <><Eye className="h-3 w-3" />Mostrar</>}
                </button>
              </div>
              <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 h-11" />
            </div>
            <Button type="submit" disabled={loading}
              className="w-full h-11 bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-semibold shadow-md">
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ingresando…</> : <><LogIn className="h-4 w-4 mr-2" />Ingresar</>}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-sm text-slate-600">
            ¿Aún no tienes cuenta?{' '}
            <Link href={`/registro${next ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="font-semibold text-orange-600 hover:text-orange-700">
              Crear cuenta
              <ArrowRight className="h-3 w-3 inline ml-0.5" />
            </Link>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3 w-3" />
          Conexión segura · tus datos están protegidos
        </div>

        <div className="mt-3 text-center">
          <Link href="/tienda" className="text-xs text-slate-500 hover:text-slate-700 underline">
            Volver a la tienda
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
