'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Sparkles, Loader2, ExternalLink, Zap, Rocket, CheckCircle2, X,
  RefreshCw, Trash2, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

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

  // Estados para regenerar / eliminar
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [extraContext, setExtraContext] = useState('');

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

  const regenerateLanding = async () => {
    setRegenerating(true);
    setShowRegenDialog(false);
    try {
      const r = await fetch('/api/landings/from-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: product.id,
          regenerate: true,
          extraContext: extraContext.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo regenerar');
        return;
      }
      setLanding(data.landing);
      setState('has_landing');
      setExtraContext('');
      toast.success('¡Landing regenerada con IA!', {
        description: `Nuevo contenido en ${(data.tookMs / 1000).toFixed(1)}s. Revisa /servicios/${data.landing.slug}`,
      });
    } catch (e) {
      toast.error('Error de red', { description: e.message });
    } finally {
      setRegenerating(false);
    }
  };

  const deleteLanding = async () => {
    if (!landing?.id) return;
    setDeleting(true);
    try {
      const r = await fetch('/api/landings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: landing.id }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || 'No se pudo eliminar');
        return;
      }
      toast.success('Landing eliminada', {
        description: 'Puedes crear una nueva cuando quieras.',
      });
      setLanding(null);
      setState('no_landing');
      setShowDeleteDialog(false);
    } catch (e) {
      toast.error('Error de red', { description: e.message });
    } finally {
      setDeleting(false);
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRegenDialog(true)}
                  disabled={regenerating || deleting}
                  className="border-violet-300 text-violet-700 hover:bg-violet-50"
                  title="Regenerar contenido con IA"
                >
                  {regenerating
                    ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Regenerar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={regenerating || deleting}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  title="Eliminar la landing (podrás crear una nueva después)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
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

      {/* Diálogo: Regenerar con IA (permite dar hints/tono) */}
      <AlertDialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-violet-600" />
              Regenerar landing con IA
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se reemplazará el contenido actual (H1, intro, body, meta tags, keywords) con una nueva versión generada por IA usando la descripción del producto. La URL (slug) puede cambiar o mantenerse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-2">
            <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Instrucciones adicionales para la IA (opcional)
            </label>
            <Textarea
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="Ej: 'Enfócate más en el bordado frontal y no menciones DTF como si fuera del producto' o 'Tono más juvenil, para tienda urban'"
              className="min-h-[80px] text-sm"
            />
            <div className="text-[10px] text-slate-500 mt-1.5">
              La IA usará estas instrucciones para ajustar el contenido. Déjalo vacío si quieres una versión estándar.
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); regenerateLanding(); }}
              disabled={regenerating}
              className="bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-700 hover:to-pink-600"
            >
              {regenerating
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Regenerando…</>
                : <><Rocket className="h-3.5 w-3.5 mr-1.5" />Regenerar ahora</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: Eliminar landing */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              ¿Eliminar la landing de este producto?
            </AlertDialogTitle>
            <AlertDialogDescription>
              La URL <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">/servicios/{landing?.slug}</code> dejará de estar disponible.
              <br /><br />
              Podrás generar una nueva landing cuando quieras. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteLanding(); }}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Eliminando…</>
                : <><Trash2 className="h-3.5 w-3.5 mr-1.5" />Sí, eliminar</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
