'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2, Package, Truck, Copy, ShoppingBag, Loader2, Sparkles,
  Mail, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCLP, formatDateTime } from '@/lib/format';

const PAYMENT_LABELS = {
  transfer: 'Transferencia Bancaria',
  webpay: 'WebPay Plus',
  mercadopago: 'MercadoPago',
  cash: 'Efectivo al retirar',
  card: 'Tarjeta',
};

export default function ThankYouPage() {
  const params = useSearchParams();
  const orderNumber = params.get('order');
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);

  useEffect(() => {
    if (!orderNumber) { setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`/api/orders/lookup?number=${orderNumber}`);
        const data = await r.json();
        if (r.ok) { setOrder(data.order); setItems(data.items || []); }
      } finally { setLoading(false); }
    })();
  }, [orderNumber]);

  // Cargar datos de empresa/banco desde configuración (para instrucciones de transferencia)
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/settings/company');
        if (r.ok) setCompany(await r.json());
      } catch { /* fallback a defaults del backend */ }
    })();
  }, []);

  const copyNumber = () => {
    if (!orderNumber) return;
    navigator.clipboard.writeText(orderNumber);
    toast.success('Número copiado');
  };

  if (loading) return (
    <div className="container py-16 flex items-center justify-center text-slate-500">
      <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando confirmación…
    </div>
  );

  return (
    <div className="container py-10 max-w-3xl">
      {/* Hero de confirmación */}
      <div className="text-center py-8">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
          <CheckCircle2 className="h-10 w-10 text-white" />
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">¡Pedido confirmado!</h1>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">
          Guarda tu número de pedido. Encontrarás los datos de pago y el estado más abajo.
        </p>

        {orderNumber && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-5 py-2.5">
            <span className="text-xs uppercase tracking-widest text-slate-400">Número</span>
            <span className="font-mono font-bold text-lg">{orderNumber}</span>
            <button onClick={copyNumber} className="ml-1 text-slate-400 hover:text-white transition-colors" title="Copiar">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {order && (
        <>
          {/* Detalles */}
          <Card className="mt-4">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Cliente</div>
                  <div className="font-medium text-slate-900 mt-0.5">{order.customerSnapshot?.name}</div>
                  <div className="text-xs text-slate-500">{order.customerSnapshot?.email}</div>
                  {order.customerSnapshot?.phone && <div className="text-xs text-slate-500">{order.customerSnapshot.phone}</div>}
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Entrega</div>
                  <div className="font-medium text-slate-900 mt-0.5 flex items-center gap-1.5">
                    {order.deliveryMethod === 'pickup' ? <><Package className="h-3.5 w-3.5" />Retiro en local</> : <><Truck className="h-3.5 w-3.5" />Envío a domicilio</>}
                  </div>
                  {order.shippingAddress && (
                    <div className="text-xs text-slate-500">{order.shippingAddress.street}, {order.shippingAddress.comuna}</div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Pago</div>
                  <div className="font-medium text-slate-900 mt-0.5">{PAYMENT_LABELS[order.paymentMethod] || order.paymentMethod}</div>
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 border border-amber-200 mt-1">
                    Pago pendiente
                  </Badge>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Fecha</div>
                  <div className="font-medium text-slate-900 mt-0.5" suppressHydrationWarning>{formatDateTime(order.createdAt)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="mt-4">
            <CardContent className="p-6">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-3">Productos</div>
              <div className="space-y-3">
                {items.map(it => (
                  <div key={it.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-slate-900">{it.name}</div>
                      <div className="text-xs text-slate-500">Cantidad: {it.quantity}</div>
                    </div>
                    <div className="font-mono font-semibold text-slate-900">{formatCLP(it.totalPrice)}</div>
                  </div>
                ))}
              </div>
              <div className="my-4 h-px bg-slate-200" />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Envío</span>
                  <span className="font-mono">{order.shipping ? formatCLP(order.shipping) : 'Gratis'}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200">
                  <span>Total pagado</span>
                  <span className="font-mono text-slate-900">{formatCLP(order.total)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Instrucciones de pago */}
          {order.paymentMethod === 'transfer' && (
            <Card className="mt-4 border-orange-200 bg-orange-50/40">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-slate-800 w-full">
                    <div className="font-bold">Datos para transferencia</div>
                    <div className="mt-2 space-y-0.5 font-mono text-xs">
                      <div>Banco: <b>{company?.bankName || '—'}</b></div>
                      <div>Titular: <b>{company?.accountHolder || company?.companyName || '—'}</b></div>
                      <div>RUT: <b>{company?.rut || '—'}</b></div>
                      <div>{company?.accountType || 'Cuenta'}: <b>{company?.accountNumber || '—'}</b></div>
                      <div>Email: <b>{company?.paymentEmail || company?.contactEmail || '—'}</b></div>
                    </div>
                    {company?.instructions && (
                      <p className="mt-3 text-xs text-slate-700 whitespace-pre-line">{company.instructions}</p>
                    )}
                    <p className="mt-2 text-xs text-slate-600">
                      Envía el comprobante indicando el número <b>{orderNumber}</b>. Confirmaremos tu pedido en menos de 2 horas hábiles.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Acciones */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/tienda"><ShoppingBag className="h-4 w-4 mr-2" />Seguir comprando</Link>
        </Button>
        <Button asChild className="bg-orange-500 hover:bg-orange-600">
          <Link href="/gang-sheet"><Sparkles className="h-4 w-4 mr-2" />Arma tu próximo diseño</Link>
        </Button>
      </div>
    </div>
  );
}
