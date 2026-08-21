'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  PackageCheck,
  Truck,
  AlertTriangle,
  XCircle,
  Star,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { formatCLP } from '@/lib/format';
import { cn } from '@/lib/utils';
import { BUSINESS } from '@/lib/constants/business';

const STATUS_META = {
  pending: { label: 'Pendiente de preparar', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock3 },
  packed: { label: 'Empaquetado', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: PackageCheck },
  ready_for_pickup: { label: 'Listo para retiro', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: MapPin },
  handed_to_courier: { label: 'Entregado a courier', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Truck },
  in_transit: { label: 'En tránsito', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: Truck },
  delivered: { label: 'Entregado', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: CheckCircle2 },
  picked_up: { label: 'Retirado en taller', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: CheckCircle2 },
  failed: { label: 'Incidencia de despacho', color: 'bg-rose-100 text-rose-800 border-rose-200', icon: AlertTriangle },
  returned: { label: 'Devuelto', color: 'bg-rose-100 text-rose-800 border-rose-200', icon: XCircle },
  cancelled: { label: 'Cancelado', color: 'bg-rose-100 text-rose-800 border-rose-200', icon: XCircle },
};

function metaFor(status) {
  return STATUS_META[status] || { label: status || 'Sin estado', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Package };
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const meta = metaFor(status);
  const Icon = meta.icon;
  return <Badge className={cn('border gap-1', meta.color)}><Icon className="h-3 w-3" />{meta.label}</Badge>;
}

export default function PedidoSeguimientoPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const orderId = params?.id;

  useEffect(() => {
    if (authLoading || !user?.email || !orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/fulfillment/customer?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store', credentials: 'include' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'No se pudo cargar el seguimiento');
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.email, orderId]);

  const events = useMemo(() => data?.events || [], [data]);
  const fulfillment = data?.fulfillment;
  const reviewRequest = data?.reviewRequest;
  const order = data?.order;
  const isCompleted = ['delivered', 'picked_up'].includes(fulfillment?.status);

  if (authLoading || loading) {
    return <div className="container py-20 flex items-center justify-center text-sm text-slate-500"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cargando seguimiento…</div>;
  }

  if (!user) {
    return <div className="container py-20 max-w-lg text-center"><h1 className="text-2xl font-bold text-slate-900">Inicia sesión para ver tu pedido</h1><p className="mt-2 text-sm text-slate-500">El seguimiento está protegido y solo puede verlo el cliente asociado.</p><Button className="mt-5 bg-orange-500 hover:bg-orange-600" onClick={() => router.push(`/login?next=${encodeURIComponent(`/mi-cuenta/pedidos/${orderId}`)}`)}>Iniciar sesión</Button></div>;
  }

  if (error || !data) {
    return <div className="container py-20 max-w-lg text-center"><h1 className="text-2xl font-bold text-slate-900">No se pudo cargar el pedido</h1><p className="mt-2 text-sm text-rose-600">{error || 'Pedido no encontrado'}</p><Button variant="outline" className="mt-5" asChild><Link href="/mi-cuenta/pedidos">Volver a mis pedidos</Link></Button></div>;
  }

  return (
    <div className="container py-8 max-w-5xl">
      <Link href="/mi-cuenta/pedidos" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="h-3 w-3" />Volver a mis pedidos</Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-orange-600 font-semibold">Seguimiento logístico</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Pedido {order.orderNumber}</h1>
          <p className="mt-1 text-sm text-slate-500">Creado el {dateLabel(order.createdAt)}</p>
        </div>
        <StatusBadge status={fulfillment.status} />
      </div>

      <div className="mt-7 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr),320px] gap-5 items-start">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-orange-500" />Estado del pedido</CardTitle></CardHeader>
          <CardContent>
            <div className="relative ml-2">
              {events.map((event, index) => {
                const meta = metaFor(event.toStatus);
                const Icon = meta.icon;
                const last = index === events.length - 1;
                return (
                  <div key={event.id} className="relative flex gap-4 pb-7 last:pb-0">
                    {!last && <div className="absolute left-[13px] top-7 bottom-0 w-px bg-slate-200" />}
                    <div className={cn('relative z-10 h-7 w-7 shrink-0 rounded-full flex items-center justify-center border-2 bg-white', last ? 'border-orange-500 text-orange-600' : 'border-slate-300 text-slate-500')}><Icon className="h-3.5 w-3.5" /></div>
                    <div className="min-w-0 pt-0.5">
                      <div className="font-semibold text-sm text-slate-900">{meta.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{dateLabel(event.createdAt)}</div>
                      {event.notes && <div className="text-sm text-slate-600 mt-2">{event.notes}</div>}
                    </div>
                  </div>
                );
              })}
              {events.length === 0 && <div className="text-sm text-slate-500">Aún no hay movimientos registrados.</div>}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2">{order.deliveryMethod === 'shipping' ? <Truck className="h-4 w-4 text-indigo-500" /> : <MapPin className="h-4 w-4 text-emerald-500" />}Entrega</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><div className="text-xs text-slate-500">Método</div><div className="font-medium text-slate-800">{order.shippingDetails?.label || (order.deliveryMethod === 'shipping' ? 'Envío a domicilio' : 'Retiro en taller')}</div></div>
              {order.deliveryMethod === 'shipping' && order.shippingAddress && <div><div className="text-xs text-slate-500">Dirección</div><div className="text-slate-700">{order.shippingAddress.street}</div><div className="text-slate-700">{order.shippingAddress.comuna} · {order.shippingAddress.city || '—'} · {order.shippingAddress.region || '—'}</div></div>}
              {order.deliveryMethod === 'shipping' && order.shippingDetails && <div><div className="text-xs text-slate-500">Entrega estimada</div><div className="text-slate-700">{order.shippingDetails.etaMinDays}-{order.shippingDetails.etaMaxDays} días hábiles{order.shippingDetails.zoneLabel ? ` · ${order.shippingDetails.zoneLabel}` : ''}</div></div>}
              {order.deliveryMethod === 'pickup' && <div><div className="text-xs text-slate-500">Lugar de retiro</div><div className="text-slate-700">{order.shippingDetails?.pickup?.address || 'Galleguillos 1870, Quilpué'}</div></div>}
              {order.total != null && <div className="pt-3 border-t border-slate-100"><div className="text-xs text-slate-500">Total</div><div className="font-mono font-bold text-slate-900">{formatCLP(order.total)}</div></div>}
            </CardContent>
          </Card>

          {(fulfillment.carrier || fulfillment.trackingCode || fulfillment.trackingUrl || fulfillment.proofUrl) && <Card>
            <CardHeader><CardTitle className="text-base">Datos de seguimiento</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {fulfillment.carrier && <div><div className="text-xs text-slate-500">Courier</div><div className="font-medium text-slate-800">{fulfillment.carrier}</div></div>}
              {fulfillment.trackingCode && <div><div className="text-xs text-slate-500">Código</div><div className="font-mono font-semibold text-slate-800">{fulfillment.trackingCode}</div></div>}
              {fulfillment.trackingUrl && <a href={fulfillment.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800">Abrir tracking <ExternalLink className="h-3 w-3" /></a>}
              {fulfillment.proofUrl && <a href={fulfillment.proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">Ver comprobante <ExternalLink className="h-3 w-3" /></a>}
            </CardContent>
          </Card>}

          {isCompleted && <Card className="border-amber-200 bg-amber-50/70">
            <CardHeader><CardTitle className="text-base flex items-center gap-2 text-amber-900"><Star className="h-4 w-4 fill-amber-400 text-amber-500" />¿Cómo fue tu experiencia?</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-amber-900/80">Gracias por confiar en Estampados DLV. Tu opinión ayuda a otros clientes a elegirnos.</p>
              {reviewRequest?.status === 'pending' && <p className="text-xs text-amber-800">Te enviaremos una solicitud de reseña por correo después de la ventana de entrega.</p>}
              {BUSINESS.reviews?.google && <Button asChild size="sm" className="bg-amber-500 hover:bg-amber-600 text-white"><a href={BUSINESS.reviews.google} target="_blank" rel="noreferrer"><Star className="h-3.5 w-3.5 mr-1.5 fill-current" />Dejar reseña en Google</a></Button>}
            </CardContent>
          </Card>}
        </div>
      </div>
    </div>
  );
}
