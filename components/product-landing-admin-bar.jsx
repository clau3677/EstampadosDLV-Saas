'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Sparkles, Loader2, ExternalLink, Zap, Rocket, CheckCircle2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Barra flotante que se muestra en la parte superior de /producto/[slug]
 * SÓLO cuando el usuario logueado es admin.
 *
 * Estados:
 *   1) checking       → Verificando auth + si el producto ya tiene landing
 *   2) not_admin      → Usuario no admin, no renderiza nada
 *   3) has_landing    → El producto ya tiene una landing → botón "Ver landing"
 *   4) no_landing     → No hay landing aún → botón "Crear Landing SEO con IA"
 *   5) generating     → Está generando (spinner)
 *   6) success        → Landing creada, mostrar CTA a verla + auto-hide en 8s
 */
export default function ProductLandingAdminBar({ product }) {
  const [state, setState] = useState('checking');
  const [landing, setLanding] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!product?.id) return;
    (async () => {
      try {
        // 1. ¿Es admin?
        const me = await fetch('/api/auth/me', { credentials: 'include' });
        if (!me.ok) { setState('not_admin'); return; }
        const meData = await me.json();
        if (meData?.user?.role !== 'admin') { setState('not_admin'); return; }

        // 2. ¿El producto ya tiene landing?
        const r = await fetch(`/api/landings/by-product?productId=${product.id}`, { credentials: 'include' });
        if (r.ok) {
          const data = await r.json();
          if (data.landing) {
            setLanding(data.landing);
            setState('has_landing');
            return;
          }
        }
        setState('no_landing');
      } catch {
        setState('not_admin');
      }
    })();
  }, [product?.id]);

  const generateLanding = async () => {
    setState('generating');
    try {
      const r = await fetch('/api/landings/from-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId: product.id }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo generar la landing');
        setState('no_landing');
        return;
      }
      setLanding(data.landing);
      setState('success');
      toast.success('¡Landing SEO creada!', {
        description: `Generada en ${(data.tookMs / 1000).toFixed(1)}s. Ya está publicada en /servicios/${data.landing.slug}`,
      });
    } catch (e) {
      toast.error('Error de red', { description: e.message });
      setState('no_landing');
    }
  };

  if (state === 'checking' || state === 'not_admin' || dismissed) return null;

  const landingUrl = landing ? `/servicios/${landing.slug}` : null;

  return (
    <div className="sticky top-16 z-30 mb-4">
      <div className={`
        rounded-lg border shadow-sm px-4 py-3
        ${state === 'has_landing' ? 'bg-emerald-50 border-emerald-200' : ''}
        ${state === 'no_landing' ? 'bg-gradient-to-r from-violet-50 via-pink-50 to-orange-50 border-violet-200' : ''}
        ${state === 'generating' ? 'bg-blue-50 border-blue-200' : ''}
        ${state === 'success' ? 'bg-emerald-50 border-emerald-300' : ''}
      `}>
        <div className="flex flex-wrap items-center gap-3">
          {/* Ícono lateral */}
          <div className={`
            h-9 w-9 rounded-lg shrink-0 flex items-center justify-center shadow
            ${state === 'has_landing' ? 'bg-emerald-500' : ''}
            ${state === 'no_landing' ? 'bg-gradient-to-br from-violet-500 to-pink-500' : ''}
            ${state === 'generating' ? 'bg-blue-500' : ''}
            ${state === 'success' ? 'bg-emerald-500' : ''}
          `}>
            {state === 'generating'
              ? <Loader2 className="h-4 w-4 text-white animate-spin" />
              : state === 'has_landing' || state === 'success'
                ? <CheckCircle2 className="h-4 w-4 text-white" />
                : <Sparkles className="h-4 w-4 text-white" />}
          </div>

          {/* Texto principal */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              👤 Panel Admin
            </div>
            {state === 'no_landing' && (
              <div className="text-sm font-semibold text-slate-900">
                Este producto no tiene <span className="text-violet-700">Landing SEO</span> aún.
                <span className="hidden sm:inline font-normal text-slate-600"> Genera una con IA usando los datos del producto.</span>
              </div>
            )}
            {state === 'has_landing' && (
              <div className="text-sm font-semibold text-emerald-900">
                Landing SEO publicada en <span className="font-mono">/servicios/{landing?.slug}</span>
              </div>
            )}
            {state === 'generating' && (
              <div className="text-sm font-semibold text-blue-900">
                Generando landing con IA…<span className="text-blue-600/70 font-normal"> puede tardar 8-20 segundos</span>
              </div>
            )}
            {state === 'success' && (
              <div className="text-sm font-semibold text-emerald-900">
                ¡Landing creada y publicada! Compártela para atraer tráfico SEO 🚀
              </div>
            )}
          </div>

          {/* Botones */}
          <div className="flex items-center gap-2">
            {state === 'no_landing' && (
              <Button
                size="sm"
                onClick={generateLanding}
                className="bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-700 hover:to-pink-600 shadow-md"
              >
                <Rocket className="h-3.5 w-3.5 mr-1.5" />
                Crear Landing SEO con IA
              </Button>
            )}
            {state === 'generating' && (
              <Button size="sm" disabled className="bg-blue-500">
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Generando…
              </Button>
            )}
            {(state === 'has_landing' || state === 'success') && landingUrl && (
              <>
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  <Link href={landingUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Ver landing
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/landings" title="Ir al panel de landings">
                    <Zap className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </>
            )}

            {/* Cerrar */}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-slate-400 hover:text-slate-700 p-1"
              aria-label="Cerrar barra admin"
              title="Ocultar hasta recargar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
