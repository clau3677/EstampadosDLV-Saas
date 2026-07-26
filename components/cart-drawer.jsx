'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, Package } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useCart, cartSubtotal, cartCount } from '@/lib/cart-store';
import { formatCLP } from '@/lib/format';

export function CartDrawer() {
  const router = useRouter();
  const items = useCart(s => s.items);
  const isOpen = useCart(s => s.isOpen);
  const close = useCart(s => s.close);
  const setQty = useCart(s => s.setQty);
  const remove = useCart(s => s.remove);

  const subtotal = cartSubtotal(items);
  const count = cartCount(items);
  const shippingEstimate = 3990;
  const totalWithShipping = subtotal + (subtotal > 0 ? shippingEstimate : 0);

  const goCheckout = () => {
    close();
    router.push('/checkout');
  };

  return (
    <Sheet open={isOpen} onOpenChange={(v) => !v && close()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-5 border-b border-slate-200">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-orange-500" />
            Tu carrito ({count})
          </SheetTitle>
          <SheetDescription className="sr-only">Items agregados a tu compra</SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Package className="h-7 w-7 text-slate-400" />
            </div>
            <h3 className="font-semibold text-slate-900">Tu carrito está vacío</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">Agrega productos desde el catálogo para verlos aquí.</p>
            <Button onClick={close} className="mt-4 bg-orange-500 hover:bg-orange-600" asChild>
              <Link href="/tienda">Ir al catálogo</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {items.map((it) => (
                <div key={`${it.productId}:${it.variantId}`} className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                  <div className="h-16 w-16 rounded-md bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                    {it.image ? (
                      <img src={it.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-400">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{it.name}</div>
                    <div className="text-[11px] text-slate-500">{it.variantName}</div>
                    <div className="text-sm font-mono font-semibold text-slate-900 mt-1">{formatCLP(it.price)}</div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-6 w-6"
                        onClick={() => setQty(it.productId, it.variantId, it.quantity - 1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-mono font-semibold">{it.quantity}</span>
                      <Button size="icon" variant="outline" className="h-6 w-6"
                        onClick={() => setQty(it.productId, it.variantId, it.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                        onClick={() => remove(it.productId, it.variantId)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <SheetFooter className="p-5 border-t border-slate-200 flex-col gap-0 sm:flex-col">
              <div className="w-full space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Subtotal (IVA incl.)</span>
                  <span className="font-mono font-semibold text-slate-900">{formatCLP(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Envío estimado</span>
                  <span className="font-mono">{formatCLP(shippingEstimate)}</span>
                </div>
                <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-slate-200">
                  <span>Total</span>
                  <span className="font-mono text-slate-900">{formatCLP(totalWithShipping)}</span>
                </div>
              </div>
              <Button onClick={goCheckout} className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-base font-semibold">
                Ir al checkout <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default CartDrawer;
