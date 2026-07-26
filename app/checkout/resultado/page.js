'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2, XCircle, Clock, Loader2, ArrowRight, ShoppingBag,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCLP } from '@/lib/format';

export default function ResultadoPage() {
  const params = useSearchParams();
  const orderNumber = params.get('order');
  const provider = params.get('provider');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderNumber) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      try {
        const r = await fetch(`/api/orders/lookup?number=${orderNumber}`);
        if (r.ok) {
          const data = await r.json();
          if (!cancelled) setOrder(data.order);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    // Polling en caso de que el webhook llegue con retraso (MP a veces demora unos segundos)
    const iv = setInterval(async () => {
      const r = await fetch(`/api/orders/lookup?number=${orderNumber}`);
      if (r.ok) {
        const data = await r.json();
        if (!cancelled) setOrder(data.order);
        if (data.order?.paymentStatus === 'paid' || data.order?.status === 'cancelled') clearInterval(iv);
      }
    }, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [orderNumber]);

  if (loading) return (
    <div className="container py-16 flex items-center justify-center text-slate-500">
      <Loader2 className="h-5 w-5 mr-2 animate-spin" />Verificando pago…
    </div>
  );

  const status = order?.paymentStatus;
  const orderStatus = order?.status;

  let icon = <Clock className="h-10 w-10 text-white" />;
  let title = 'Procesando pago…';
  let subtitle = 'Estamos confirmando tu transacción.';
  let gradient = 'from-amber-400 to-orange-500';

  if (status === 'paid') {
    icon = <CheckCircle2 className="h-10 w-10 text-white" />;
    title = '¡Pago aprobado!';
    subtitle = 'Recibimos tu pago. Comenzamos con tu pedido.';
    gradient = 'from-emerald-400 to-teal-500';
  } else if (orderStatus === 'cancelled' || status === 'refunded') {
    icon = <XCircle className="h-10 w-10 text-white" />;
    title = 'Pago rechazado';
    subtitle = 'La transacción no fue completada. Intenta con otro método.';
    gradient = 'from-rose-400 to-rose-600';
  }

  return (
    <div className="container py-10 max-w-2xl">
      <div className="text-center py-8">
        <div className={`h-20 w-20 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center mx-auto shadow-lg`}>
          {icon}
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="text-slate-500 mt-2">{subtitle}</p>

        {orderNumber && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-5 py-2.5">
            <span className="text-xs uppercase tracking-widest text-slate-400">Número</span>
            <span className="font-mono font-bold text-lg">{orderNumber}</span>
          </div>
        )}
      </div>

      {order && (
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Total</div>
                <div className="font-mono font-bold text-slate-900 mt-0.5 text-lg">{formatCLP(order.total)}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Estado</div>
                <div className="mt-0.5">
                  {status === 'paid' && <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">Pagado</Badge>}
                  {status === 'pending' && <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Pendiente</Badge>}
                  {status !== 'paid' && status !== 'pending' && <Badge className="bg-rose-100 text-rose-700 border border-rose-200">{status}</Badge>}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Cliente</div>
                <div className="mt-0.5">{order.customerSnapshot?.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Pago via</div>
                <div className="mt-0.5 capitalize">{provider || order.paymentMethod}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/tienda"><ShoppingBag className="h-4 w-4 mr-2" />Seguir comprando</Link>
        </Button>
        <Button asChild className="bg-orange-500 hover:bg-orange-600">
          <Link href={`/checkout/gracias?order=${orderNumber}`}>Ver detalle del pedido<ArrowRight className="h-4 w-4 ml-2" /></Link>
        </Button>
      </div>
    </div>
  );
}
