'use client';

// ============================================================================
// /checkout/webpay-return
// Página a la que Transbank redirige al cliente tras el pago WebPay Plus.
// Recibe query params:
//   - token_ws     → transacción exitosa/rechazada, hay que hacer commit
//   - TBK_TOKEN    → transacción abortada por el usuario en el formulario
//   - TBK_ID_SESION + TBK_ORDEN_COMPRA → timeout de la sesión de pago
// ============================================================================
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle, Loader2, ArrowLeft, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCLP } from '@/lib/format';

function WebpayReturnInner() {
  const search = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState({ loading: true, ok: false, data: null, error: null });

  useEffect(() => {
    const tokenWs   = search.get('token_ws');
    const tbkToken  = search.get('TBK_TOKEN');
    const tbkOrden  = search.get('TBK_ORDEN_COMPRA');

    // Caso 1: usuario abortó (clicó "volver al comercio" antes de pagar)
    if (!tokenWs && tbkToken) {
      setState({ loading: false, ok: false, aborted: true, orderNumber: tbkOrden, data: null });
      return;
    }
    // Caso 2: timeout de sesión (sin token_ws ni TBK_TOKEN)
    if (!tokenWs) {
      setState({ loading: false, ok: false, timeout: true, orderNumber: tbkOrden, data: null });
      return;
    }

    // Caso 3: token_ws presente → hacer commit
    (async () => {
      try {
        const r = await fetch('/api/payments/webpay/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_ws: tokenWs }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Error confirmando el pago');

        setState({ loading: false, ok: !!data.approved, data, error: null });

        // Si aprobó, redirigir a gracias tras 2s (con orderNumber en query)
        if (data.approved && data.orderNumber) {
          setTimeout(() => router.push(`/checkout/gracias?order=${data.orderNumber}&paid=1`), 2500);
        }
      } catch (e) {
        setState({ loading: false, ok: false, error: e.message, data: null });
      }
    })();
  }, [search, router]);

  // ------ Render ------
  if (state.loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-orange-200">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-12 w-12 text-orange-500 animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900">Confirmando tu pago…</h1>
            <p className="text-sm text-slate-500 mt-1">Un momento, estamos validando la transacción con Transbank.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.aborted) {
    return (
      <StatusCard
        title="Pago cancelado"
        subtitle="Cancelaste el pago desde el formulario de Transbank. Tu pedido sigue creado y puedes reintentar cuando quieras."
        icon={XCircle}
        color="amber"
        orderNumber={state.orderNumber}
      />
    );
  }
  if (state.timeout) {
    return (
      <StatusCard
        title="Sesión de pago expirada"
        subtitle="La sesión con WebPay expiró antes de finalizar el pago. Puedes reintentar."
        icon={RefreshCw}
        color="amber"
        orderNumber={state.orderNumber}
      />
    );
  }
  if (state.error) {
    return (
      <StatusCard
        title="Error confirmando el pago"
        subtitle={state.error}
        icon={XCircle}
        color="rose"
      />
    );
  }
  if (state.data && !state.ok) {
    return (
      <StatusCard
        title="Pago rechazado"
        subtitle={`Transbank rechazó la transacción (código ${state.data.responseCode}). No se te cobró.`}
        icon={XCircle}
        color="rose"
        orderNumber={state.data.orderNumber}
      />
    );
  }

  // Aprobado
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-emerald-300 bg-emerald-50">
        <CardContent className="p-8 text-center">
          <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-9 w-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-emerald-900">¡Pago aprobado!</h1>
          <p className="text-sm text-emerald-700 mt-1">Redirigiendo a tu pedido…</p>

          <div className="mt-6 text-left bg-white rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">N° pedido</span><b>{state.data.orderNumber}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Monto</span><b>{formatCLP(state.data.amount)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Autorización</span><span className="font-mono">{state.data.authorizationCode}</span></div>
            {state.data.cardLast4 && (
              <div className="flex justify-between"><span className="text-slate-500">Tarjeta</span><span className="font-mono">•••• {state.data.cardLast4}</span></div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ title, subtitle, icon: Icon, color, orderNumber }) {
  const palette = {
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-300',   ring: 'bg-amber-500',   text: 'text-amber-900',   subtext: 'text-amber-700' },
    rose:    { bg: 'bg-rose-50',    border: 'border-rose-300',    ring: 'bg-rose-500',    text: 'text-rose-900',    subtext: 'text-rose-700' },
  }[color] || {};
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className={`max-w-md w-full ${palette.border} ${palette.bg}`}>
        <CardContent className="p-8 text-center">
          <div className={`h-16 w-16 rounded-full ${palette.ring} flex items-center justify-center mx-auto mb-4`}>
            <Icon className="h-9 w-9 text-white" />
          </div>
          <h1 className={`text-2xl font-bold ${palette.text}`}>{title}</h1>
          <p className={`text-sm ${palette.subtext} mt-1`}>{subtitle}</p>

          <div className="mt-6 space-y-2">
            {orderNumber && (
              <Button asChild className="w-full bg-orange-500 hover:bg-orange-600">
                <Link href={`/checkout/gracias?order=${orderNumber}`}>Ver mi pedido</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link href="/tienda"><ArrowLeft className="h-4 w-4 mr-1" /> Volver al catálogo</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WebpayReturnPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    }>
      <WebpayReturnInner />
    </Suspense>
  );
}
