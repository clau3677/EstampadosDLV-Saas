'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Package, ExternalLink, Calendar, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCLP } from '@/lib/format';
import { useAuth } from '@/hooks/use-auth';

const STATUS_LABEL = {
  pending: { label: 'Pendiente de pago', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  paid: { label: 'Pagado', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  in_production: { label: 'En producción', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  ready: { label: 'Listo para retiro', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  delivered: { label: 'Entregado', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  cancelled: { label: 'Cancelado', color: 'bg-rose-100 text-rose-800 border-rose-200' },
};

export default function MisPedidosPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetch(`/api/orders?customerEmail=${encodeURIComponent(user.email)}`, {
          credentials: 'include',
        }).then(r => r.json());
        setOrders(Array.isArray(rows) ? rows : []);
      } catch { setOrders([]); }
      finally { setLoading(false); }
    })();
  }, [user?.email]);

  if (authLoading || loading) {
    return <div className="text-slate-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Cargando pedidos…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Mis pedidos</h1>
        <p className="text-sm text-slate-500 mt-1">Historial de pedidos asociados a <b>{user?.email}</b>.</p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <Package className="h-10 w-10 mx-auto text-slate-400" />
          <div className="mt-3 font-semibold text-slate-800">Aún no tienes pedidos</div>
          <p className="text-sm text-slate-500 mt-1">Cuando compres, aparecerán aquí con seguimiento en tiempo real.</p>
          <Button asChild className="mt-4 bg-orange-500 hover:bg-orange-600">
            <Link href="/tienda"><ShoppingBag className="h-4 w-4 mr-2" />Ir a la tienda</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const st = STATUS_LABEL[o.status] || { label: o.status, color: 'bg-slate-100 text-slate-700 border-slate-200' };
            return (
              <div key={o.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{o.orderNumber}</span>
                      <Badge className={`${st.color} border`}>{st.label}</Badge>
                      {o.priority === 'express' && (
                        <Badge className="bg-orange-100 text-orange-800 border border-orange-200">Express</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      {new Date(o.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-mono text-slate-900">{formatCLP(o.total)}</div>
                    <div className="text-[11px] text-slate-500 uppercase">{o.deliveryMethod === 'shipping' ? 'Envío a domicilio' : 'Retiro en taller'}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">Producción:</span> {o.productionStatus || 'no iniciado'}
                  </div>
                  <Link href={`/mi-cuenta/pedidos/${encodeURIComponent(o.id)}`}
                    className="ml-auto text-xs font-semibold text-orange-600 hover:text-orange-700 inline-flex items-center gap-1">
                    Ver seguimiento <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
