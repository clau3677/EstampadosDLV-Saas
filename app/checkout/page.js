'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Package, Truck, MapPin, Loader2, ShoppingBag, CreditCard,
  Wallet, Banknote, ExternalLink,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCart, cartSubtotal } from '@/lib/cart-store';
import { formatCLP, validateRut, formatRut } from '@/lib/format';

const PAYMENT_METHODS = [
  { key: 'transfer',    label: 'Transferencia Bancaria', icon: Wallet,     desc: 'Enviamos los datos al confirmar', enabled: true },
  { key: 'cash',        label: 'Efectivo al retirar',    icon: Banknote,   desc: 'Solo con retiro en local',        enabled: true },
  { key: 'webpay',      label: 'WebPay Plus',            icon: CreditCard, desc: 'Próximamente',                    enabled: false },
  { key: 'mercadopago', label: 'MercadoPago',            icon: CreditCard, desc: 'Próximamente',                    enabled: false },
];

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCart(s => s.items);
  const clear = useCart(s => s.clear);

  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', rut: '' });
  const [deliveryMethod, setDeliveryMethod] = useState('pickup');
  const [shippingAddress, setShippingAddress] = useState({ street: '', comuna: '', city: '', region: 'RM' });
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [notes, setNotes] = useState('');

  const subtotal = cartSubtotal(items);
  const shipping = deliveryMethod === 'shipping' ? 3990 : 0;
  const total = subtotal + shipping;

  const rutValid = !customer.rut || validateRut(customer.rut);

  if (items.length === 0) {
    return (
      <div className="container py-16 text-center">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <ShoppingBag className="h-8 w-8 text-slate-400" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Tu carrito está vacío</h1>
        <p className="text-slate-500 mt-1">Agrega productos para continuar con el checkout.</p>
        <Button asChild className="mt-6 bg-orange-500 hover:bg-orange-600">
          <Link href="/tienda">Ir al catálogo</Link>
        </Button>
      </div>
    );
  }

  const submit = async () => {
    if (!customer.name || !customer.email) return toast.error('Nombre y email son obligatorios');
    if (customer.rut && !rutValid) return toast.error('RUT inválido');
    if (deliveryMethod === 'shipping' && (!shippingAddress.street || !shippingAddress.comuna)) {
      return toast.error('Ingresa dirección de envío');
    }
    if (paymentMethod === 'cash' && deliveryMethod !== 'pickup') {
      return toast.error('Efectivo solo disponible con retiro en local');
    }
    const method = PAYMENT_METHODS.find(m => m.key === paymentMethod);
    if (!method || method.enabled === false) {
      return toast.error('Método de pago no disponible aún');
    }

    setSubmitting(true);
    try {
      const r = await fetch('/api/orders/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer,
          deliveryMethod,
          shippingAddress: deliveryMethod === 'shipping' ? shippingAddress : null,
          paymentMethod,
          items: items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
          notes,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      clear();
      router.push(`/checkout/gracias?order=${data.orderNumber}`);
    } catch (e) {
      toast.error('Error al crear pedido', { description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container py-8 max-w-6xl">
      <Link href="/tienda" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-3 w-3" />Seguir comprando
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Checkout</h1>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8">
        {/* FORMULARIO */}
        <div className="space-y-6">
          {/* Datos de contacto */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-bold text-slate-900 mb-4">Datos de contacto</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Nombre completo *</Label>
                  <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Juan Pérez" />
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="tucorreo@ejemplo.cl" />
                </div>
                <div>
                  <Label className="text-xs">Teléfono</Label>
                  <Input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="+56 9 1234 5678" />
                </div>
                <div>
                  <Label className="text-xs">RUT (opcional para boleta)</Label>
                  <Input
                    value={customer.rut}
                    onChange={(e) => setCustomer({ ...customer, rut: e.target.value })}
                    onBlur={(e) => customer.rut && setCustomer({ ...customer, rut: formatRut(customer.rut) })}
                    placeholder="12.345.678-9"
                    className={!rutValid ? 'border-rose-300' : ''}
                  />
                  {!rutValid && <div className="text-[11px] text-rose-600 mt-1">RUT inválido</div>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Entrega */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-bold text-slate-900 mb-4">Método de entrega</h2>
              <RadioGroup value={deliveryMethod} onValueChange={setDeliveryMethod} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${deliveryMethod === 'pickup' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <RadioGroupItem value="pickup" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-slate-500" />
                      <span className="font-semibold text-sm">Retiro en local</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Ñuñoa, Santiago · Gratis</p>
                    <div className="text-xs font-mono font-semibold text-emerald-600 mt-1">GRATIS</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${deliveryMethod === 'shipping' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <RadioGroupItem value="shipping" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-slate-500" />
                      <span className="font-semibold text-sm">Envío a domicilio</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">2-4 días hábiles</p>
                    <div className="text-xs font-mono font-semibold text-slate-700 mt-1">{formatCLP(3990)}</div>
                  </div>
                </label>
              </RadioGroup>

              {deliveryMethod === 'shipping' && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Dirección *</Label>
                    <Input value={shippingAddress.street}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
                      placeholder="Av. Providencia 999, depto 5A" />
                  </div>
                  <div>
                    <Label className="text-xs">Comuna *</Label>
                    <Input value={shippingAddress.comuna}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, comuna: e.target.value })}
                      placeholder="Providencia" />
                  </div>
                  <div>
                    <Label className="text-xs">Ciudad</Label>
                    <Input value={shippingAddress.city}
                      onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                      placeholder="Santiago" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pago */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-bold text-slate-900 mb-4">Método de pago</h2>
              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PAYMENT_METHODS.map((m) => {
                  const disabled = m.enabled === false;
                  return (
                    <label
                      key={m.key}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all ${
                        disabled
                          ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60'
                          : paymentMethod === m.key
                            ? 'border-orange-500 bg-orange-50 cursor-pointer'
                            : 'border-slate-200 hover:border-slate-300 cursor-pointer'
                      }`}
                    >
                      <RadioGroupItem value={m.key} disabled={disabled} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <m.icon className="h-4 w-4 text-slate-500" />
                          <span className="font-semibold text-sm">{m.label}</span>
                          {disabled && <span className="text-[10px] rounded-full bg-slate-200 text-slate-700 px-1.5 py-0.5 font-semibold uppercase tracking-wider">Próximo release</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
              <div className="mt-3 text-[11px] text-slate-500 italic">
                Actualmente aceptamos <b>transferencia bancaria</b> (te mostraremos los datos al confirmar) y <b>efectivo al retirar</b>. WebPay Plus y MercadoPago se habilitarán próximamente.
              </div>
            </CardContent>
          </Card>

          {/* Notas */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-bold text-slate-900 mb-2">Notas del pedido (opcional)</h2>
              <Textarea rows={2} placeholder="Instrucciones especiales, referencia de entrega, etc."
                value={notes} onChange={(e) => setNotes(e.target.value)} />
            </CardContent>
          </Card>
        </div>

        {/* RESUMEN STICKY */}
        <div>
          <Card className="lg:sticky lg:top-20">
            <CardContent className="p-5">
              <h2 className="font-bold text-slate-900 mb-3">Resumen del pedido</h2>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {items.map(it => (
                  <div key={`${it.productId}:${it.variantId}`} className="flex gap-3 text-sm">
                    <div className="h-12 w-12 rounded bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                      {it.image ? <img src={it.image} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Package className="h-4 w-4 text-slate-400" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900 truncate">{it.name}</div>
                      <div className="text-[11px] text-slate-500">{it.variantName} · x{it.quantity}</div>
                    </div>
                    <div className="font-mono font-semibold text-slate-900 text-sm shrink-0">{formatCLP(it.price * it.quantity)}</div>
                  </div>
                ))}
              </div>

              <div className="my-4 h-px bg-slate-200" />

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatCLP(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Envío</span>
                  <span className="font-mono">{shipping ? formatCLP(shipping) : 'Gratis'}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span className="font-mono text-slate-900">{formatCLP(total)}</span>
                </div>
                <div className="text-[10px] text-slate-500">IVA 19% incluido</div>
              </div>

              <Button onClick={submit} disabled={submitting}
                className="w-full mt-4 h-12 bg-orange-500 hover:bg-orange-600 text-base font-semibold">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando…</> : 'Confirmar pedido'}
              </Button>
              <div className="mt-2 text-[10px] text-center text-slate-500">
                Al confirmar aceptas los términos y condiciones.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
