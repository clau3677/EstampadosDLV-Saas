'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ShoppingCart, Search, Plus, Minus, X, LogIn, LogOut, User, Loader2,
  Wallet, CreditCard, Banknote, Landmark, Receipt, Printer, ChevronDown, Package,
  History, ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { formatCLP } from '@/lib/format';

const PAYMENT_ICONS = { cash: Banknote, card: CreditCard, transfer: Landmark };
const PAYMENT_LABELS = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };

// ============================================================================
// MODAL: Abrir Caja
// ============================================================================
function OpenSessionModal({ open, onOpen, operators }) {
  const [operatorId, setOperatorId] = useState('');
  const [openingCash, setOpeningCash] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (operators.length && !operatorId) setOperatorId(operators[0].id);
  }, [operators, operatorId]);

  const submit = async () => {
    if (!operatorId) return toast.error('Selecciona un cajero');
    setSaving(true);
    try {
      const r = await fetch('/api/pos/sessions/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorId,
          openingCash: parseInt(openingCash || '0', 10),
          notes,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success('Caja abierta', { description: `Cajero: ${data.operatorName}` });
      onOpen(data);
    } catch (e) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogIn className="h-5 w-5 text-emerald-600" />
            Abrir Caja
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">Cajero</Label>
            <select
              className="mt-1 w-full h-10 rounded-md border border-slate-300 px-3 text-sm bg-white"
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
            >
              {operators.map(o => (
                <option key={o.id} value={o.id}>{o.fullName || o.email} · {o.role}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Monto inicial en caja (CLP)</Label>
            <Input
              type="number" min={0}
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="mt-1 h-10 font-mono text-lg"
            />
            <p className="text-[11px] text-slate-500 mt-1">Efectivo con el que abres el turno (para dar vueltos).</p>
          </div>
          <div>
            <Label className="text-xs">Notas (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Turno mañana, sin novedad..." />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} className="w-full h-11 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogIn className="h-4 w-4 mr-2" />}
            Abrir Caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MODAL: Cerrar Caja
// ============================================================================
function CloseSessionModal({ open, onClose, session, onClosed }) {
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const expected = (session?.openingCash || 0) + (session?.totalCash || 0);
  const diff = parseInt(closingCash || '0', 10) - expected;

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/pos/sessions/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          closingCash: parseInt(closingCash || '0', 10),
          notes,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success('Caja cerrada', {
        description: `Diferencia: ${data.difference >= 0 ? '+' : ''}${formatCLP(data.difference)}`,
      });
      onClosed(data);
    } catch (e) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  if (!session) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-rose-600" />
            Cerrar Caja · Arqueo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-3 border">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Ventas</div>
              <div className="font-mono font-bold text-lg">{session.salesCount}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Total facturado</div>
              <div className="font-mono font-bold text-lg">{formatCLP(session.totalSales || 0)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Efectivo neto</div>
              <div className="font-mono font-bold text-lg text-emerald-700">{formatCLP(session.totalCash || 0)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Tarjeta + Transf.</div>
              <div className="font-mono font-bold text-lg text-slate-700">{formatCLP((session.totalCard || 0) + (session.totalTransfer || 0))}</div>
            </div>
          </div>

          <div className="rounded-lg border-2 border-orange-200 bg-orange-50/50 p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-700">Apertura:</span>
              <span className="font-mono">{formatCLP(session.openingCash || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-700">+ Efectivo neto vendido:</span>
              <span className="font-mono">{formatCLP(session.totalCash || 0)}</span>
            </div>
            <div className="border-t border-orange-300 pt-2 flex justify-between items-center">
              <span className="font-semibold text-slate-900">Esperado en caja:</span>
              <span className="font-mono font-bold text-lg">{formatCLP(expected)}</span>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Monto real contado en caja (CLP) *</Label>
            <Input
              type="number" min={0}
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              className="mt-1 h-12 text-2xl font-mono"
              placeholder={String(expected)}
            />
            {closingCash && (
              <div className={`mt-2 text-sm font-semibold ${diff === 0 ? 'text-emerald-700' : diff > 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                Diferencia: {diff >= 0 ? '+' : ''}{formatCLP(diff)}
                {diff === 0 && ' ✓ Cuadra perfecto'}
                {diff > 0 && ' (sobrante)'}
                {diff < 0 && ' (faltante)'}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Notas de cierre (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivos de diferencia, incidencias..." />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !closingCash} className="bg-rose-600 hover:bg-rose-700">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
            Cerrar Caja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MODAL: Cobrar
// ============================================================================
function CheckoutModal({ open, onClose, cart, total, onSuccess, sessionId }) {
  const [cash, setCash] = useState('');
  const [card, setCard] = useState('');
  const [cardBrand, setCardBrand] = useState('visa');
  const [last4, setLast4] = useState('');
  const [transfer, setTransfer] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [customer, setCustomer] = useState({ name: '', rut: '', phone: '' });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCash(''); setCard(''); setTransfer(''); setCustomer({ name: '', rut: '', phone: '' }); setNotes('');
    }
  }, [open]);

  const paid = (parseInt(cash || '0', 10) || 0) + (parseInt(card || '0', 10) || 0) + (parseInt(transfer || '0', 10) || 0);
  const change = paid - total;
  const canConfirm = paid >= total;

  const quickCash = (amount) => setCash(String((parseInt(cash || '0', 10) || 0) + amount));
  const exactCash = () => setCash(String(total));

  const submit = async () => {
    setSaving(true);
    try {
      const payments = [];
      const cashN = parseInt(cash || '0', 10) || 0;
      const cardN = parseInt(card || '0', 10) || 0;
      const transferN = parseInt(transfer || '0', 10) || 0;
      if (cashN > 0) payments.push({ method: 'cash', amount: cashN });
      if (cardN > 0) payments.push({ method: 'card', amount: cardN, cardBrand, last4 });
      if (transferN > 0) payments.push({ method: 'transfer', amount: transferN, reference: transferRef });

      const r = await fetch('/api/pos/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          items: cart.map(c => ({ productId: c.productId, variantId: c.variantId, quantity: c.quantity })),
          payments,
          customer: customer.name ? customer : null,
          notes,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success('¡Venta cobrada!', { description: `${data.order.orderNumber} · Vuelto: ${formatCLP(data.change)}` });
      onSuccess(data.order);
    } catch (e) {
      toast.error(e.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-orange-600" />
            Cobrar {formatCLP(total)}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* CASH */}
          <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="h-5 w-5 text-emerald-700" />
              <span className="font-bold text-emerald-900">Efectivo</span>
            </div>
            <Input
              type="number" min={0}
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder="0"
              className="h-11 text-lg font-mono"
            />
            <div className="grid grid-cols-2 gap-1 mt-2">
              {[5000, 10000, 20000, 50000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => quickCash(amt)}
                  className="text-xs bg-white border border-emerald-300 hover:bg-emerald-100 py-1 rounded font-mono"
                >
                  +{formatCLP(amt)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exactCash}
              className="w-full mt-1 text-xs bg-emerald-100 border border-emerald-400 hover:bg-emerald-200 py-1 rounded font-semibold"
            >
              Monto exacto
            </button>
          </div>

          {/* CARD */}
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-5 w-5 text-blue-700" />
              <span className="font-bold text-blue-900">Tarjeta</span>
            </div>
            <Input
              type="number" min={0}
              value={card}
              onChange={(e) => setCard(e.target.value)}
              placeholder="0"
              className="h-11 text-lg font-mono"
            />
            <div className="flex gap-1 mt-2">
              <select value={cardBrand} onChange={(e) => setCardBrand(e.target.value)} className="flex-1 h-8 text-xs rounded border border-blue-300 px-2">
                <option value="visa">Visa</option>
                <option value="mastercard">Mastercard</option>
                <option value="amex">Amex</option>
                <option value="debito">Débito</option>
              </select>
              <Input
                value={last4} onChange={(e) => setLast4(e.target.value.slice(0, 4))}
                placeholder="Últ.4" maxLength={4}
                className="w-16 h-8 text-xs font-mono text-center"
              />
            </div>
          </div>

          {/* TRANSFER */}
          <div className="rounded-xl border-2 border-purple-200 bg-purple-50/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Landmark className="h-5 w-5 text-purple-700" />
              <span className="font-bold text-purple-900">Transferencia</span>
            </div>
            <Input
              type="number" min={0}
              value={transfer}
              onChange={(e) => setTransfer(e.target.value)}
              placeholder="0"
              className="h-11 text-lg font-mono"
            />
            <Input
              value={transferRef} onChange={(e) => setTransferRef(e.target.value)}
              placeholder="Ref / comprobante"
              className="h-8 text-xs mt-2"
            />
          </div>
        </div>

        {/* Cliente opcional */}
        <div className="border-t pt-3 mt-2">
          <div className="text-xs font-semibold text-slate-600 mb-2">CLIENTE (opcional, para nombre en boleta)</div>
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Nombre" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="h-9 text-sm" />
            <Input placeholder="RUT" value={customer.rut} onChange={(e) => setCustomer({ ...customer, rut: e.target.value })} className="h-9 text-sm" />
            <Input placeholder="Teléfono" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="h-9 text-sm" />
          </div>
        </div>

        {/* Resumen + vuelto */}
        <div className="border-t pt-3 space-y-1.5">
          <div className="flex justify-between text-sm text-slate-600">
            <span>A pagar:</span>
            <span className="font-mono font-semibold">{formatCLP(total)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>Recibido:</span>
            <span className="font-mono font-semibold">{formatCLP(paid)}</span>
          </div>
          <div className={`flex justify-between items-center pt-2 border-t ${change < 0 ? 'text-rose-700' : change === 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
            <span className="font-bold text-lg">{change < 0 ? 'Faltante:' : change === 0 ? '✓ Cuadra' : 'VUELTO:'}</span>
            <span className="font-mono font-bold text-3xl">{formatCLP(Math.abs(change))}</span>
          </div>
          {change > 0 && (
            <p className="text-[11px] text-slate-500 italic">El vuelto se entrega en efectivo.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={submit}
            disabled={saving || !canConfirm}
            className={`h-12 min-w-40 ${canConfirm ? 'bg-orange-500 hover:bg-orange-600' : 'bg-slate-300'} text-white font-bold`}
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
            Confirmar Venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MODAL: Post-venta (ticket)
// ============================================================================
function PostSaleModal({ order, onClose }) {
  if (!order) return null;
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <Receipt className="h-5 w-5" />
            ¡Venta {order.orderNumber} confirmada!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
            <div className="text-xs text-emerald-700 uppercase font-semibold">Total cobrado</div>
            <div className="font-mono font-bold text-3xl text-emerald-900">{formatCLP(order.total)}</div>
            {order.change > 0 && (
              <div className="text-xs text-orange-700 mt-1">Vuelto entregado: <b>{formatCLP(order.change)}</b></div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`/api/tickets/${order.id}?format=thermal`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
            >
              <Printer className="h-4 w-4" />Ticket 80mm
            </a>
            <a
              href={`/api/tickets/${order.id}?format=a4`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-semibold border"
            >
              <Printer className="h-4 w-4" />Boleta A4
            </a>
          </div>
          <Button onClick={onClose} className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold">
            Nueva venta →
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// PÁGINA POS (main)
// ============================================================================
export default function PosPage() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [postSale, setPostSale] = useState(null);

  const [operators, setOperators] = useState([]);
  const [products, setProducts] = useState([]);
  const [stockMap, setStockMap] = useState({}); // key: `${productId}-${variantId}` → available qty
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);

  // -------- Fetching --------
  const loadOperators = async () => {
    try {
      const r = await fetch('/api/users');
      if (r.ok) {
        const list = await r.json();
        const eligible = list.filter(u => u.role === 'admin' || u.role === 'operator');
        setOperators(eligible);
      }
    } catch (e) {
      // ignore — el modal permite reintentar
    }
  };

  const loadProducts = async () => {
    try {
      const [pRes, stRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/inventory/commercial'),
      ]);
      const p = await pRes.json();
      const st = await stRes.json();
      setProducts(Array.isArray(p) ? p.filter(x => x.active !== false) : []);
      const map = {};
      st.forEach(s => { map[`${s.productId}-${s.variantId}`] = (s.quantity || 0) - (s.reservedQuantity || 0); });
      setStockMap(map);
    } catch (e) {
      // ignore
    }
  };

  const loadSession = async () => {
    setLoadingSession(true);
    try {
      // Buscar sesión abierta (sin operator fijo, buscamos la primera abierta)
      const r = await fetch('/api/pos/sessions');
      if (r.ok) {
        const list = await r.json();
        const active = list.find(s => s.status === 'open');
        setSession(active || null);
      }
    } finally { setLoadingSession(false); }
  };

  useEffect(() => {
    loadOperators();
    loadProducts();
    loadSession();
  }, []);

  useEffect(() => {
    if (!loadingSession && !session) setShowOpenModal(true);
  }, [loadingSession, session]);

  // -------- Cart --------
  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const addToCart = (product, variant) => {
    const key = `${product.id}-${variant.id}`;
    const avail = stockMap[key] || 0;
    if (avail === 0) return toast.error(`Sin stock: ${product.name} · ${variant.name}`);

    setCart((c) => {
      const found = c.find(x => x.productId === product.id && x.variantId === variant.id);
      if (found) {
        if (found.quantity + 1 > avail) {
          toast.error(`Stock máximo: ${avail} un.`);
          return c;
        }
        return c.map(x => x === found ? { ...x, quantity: x.quantity + 1 } : x);
      }
      return [...c, {
        productId: product.id, variantId: variant.id,
        name: `${product.name} · ${variant.name}`,
        image: product.images?.[0] || '',
        unitPrice: variant.price,
        quantity: 1,
      }];
    });
  };
  const updateQty = (idx, delta) => {
    setCart((c) => {
      const item = c[idx];
      const key = `${item.productId}-${item.variantId}`;
      const avail = stockMap[key] || 0;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return c.filter((_, i) => i !== idx);
      if (newQty > avail) { toast.error(`Stock máximo: ${avail}`); return c; }
      return c.map((x, i) => i === idx ? { ...x, quantity: newQty } : x);
    });
  };
  const removeItem = (idx) => setCart(c => c.filter((_, i) => i !== idx));
  const clearCart = () => setCart([]);

  // -------- Search filter --------
  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.variants.some(v => v.sku?.toLowerCase().includes(q))
    );
  }, [products, search]);

  // -------- Session lifecycle --------
  const onSessionOpen = (newSession) => {
    setSession(newSession);
    setShowOpenModal(false);
    // Agregar al operadores en el dropdown
    setOperators(ops => {
      if (ops.find(o => o.id === newSession.operatorId)) return ops;
      return [...ops, { id: newSession.operatorId, fullName: newSession.operatorName, role: 'operator' }];
    });
  };
  const onSessionClosed = () => {
    setSession(null);
    setShowCloseModal(false);
    setCart([]);
    toast.info('Sesión cerrada. Abre una nueva cuando quieras vender.');
    setTimeout(() => setShowOpenModal(true), 400);
  };
  const onSaleSuccess = (order) => {
    setShowCheckoutModal(false);
    setPostSale(order);
    setCart([]);
    // Refrescar productos + stock + session
    loadProducts();
    fetch('/api/pos/sessions').then(r => r.json()).then(list => {
      const active = list.find(s => s.status === 'open');
      if (active) setSession(active);
    });
  };

  // -------- Render --------
  if (loadingSession) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-slate-600 text-sm inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />Dashboard
          </Link>
          <div className="text-slate-300">/</div>
          <div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">POS · Punto de Venta</h1>
                <div className="text-xs text-slate-500">Tienda física · IVA 19% incluido</div>
              </div>
            </div>
          </div>
        </div>

        {session && (
          <div className="flex items-center gap-3">
            <Link
              href={`/pos/historial`}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-md"
            >
              <History className="h-3.5 w-3.5" />Historial
            </Link>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Caja abierta</div>
              <div className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                <User className="h-3 w-3" />{session.operatorName} · {session.salesCount} ventas
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowCloseModal(true)} className="text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700">
              <LogOut className="h-4 w-4 mr-1.5" />Cerrar caja
            </Button>
          </div>
        )}
      </div>

      {session && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* LEFT — Products grid */}
          <div className="lg:col-span-2 space-y-3">
            <Card>
              <CardContent className="p-3">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar SKU, nombre o código..."
                    className="h-10 pl-10 text-sm"
                    autoFocus
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredProducts.length === 0 && (
                <div className="col-span-full text-center py-12 text-slate-400 text-sm">Sin resultados</div>
              )}
              {filteredProducts.map(p => p.variants.map(v => {
                const key = `${p.id}-${v.id}`;
                const stock = stockMap[key] || 0;
                const disabled = stock === 0;
                return (
                  <button
                    key={key}
                    disabled={disabled}
                    onClick={() => addToCart(p, v)}
                    className={`
                      rounded-xl border p-2 text-left transition-all
                      ${disabled ? 'opacity-40 cursor-not-allowed border-slate-200' : 'border-slate-200 hover:border-orange-400 hover:shadow-md cursor-pointer bg-white'}
                    `}
                  >
                    <div className="aspect-square rounded-lg bg-slate-100 overflow-hidden mb-2">
                      {p.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300"><Package className="h-8 w-8" /></div>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">{v.sku}</div>
                    <div className="text-xs font-semibold text-slate-800 line-clamp-1">{p.name}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">{v.name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono font-bold text-sm text-slate-900">{formatCLP(v.price)}</span>
                      <Badge variant="outline" className={`text-[9px] h-4 ${stock < 5 ? 'border-amber-300 text-amber-700' : ''}`}>{stock} un.</Badge>
                    </div>
                  </button>
                );
              }))}
            </div>
          </div>

          {/* RIGHT — Cart */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-slate-600" />
                    <span className="font-bold text-sm">Carrito ({cartCount})</span>
                  </div>
                  {cart.length > 0 && (
                    <button onClick={clearCart} className="text-xs text-slate-500 hover:text-rose-600">Vaciar</button>
                  )}
                </div>

                <div className="max-h-[380px] overflow-y-auto space-y-1.5">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs italic">Agrega productos con click</div>
                  ) : cart.map((item, i) => (
                    <div key={`${item.productId}-${item.variantId}`} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">{item.name}</div>
                        <div className="text-[10px] font-mono text-slate-500">{formatCLP(item.unitPrice)} c/u</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => updateQty(i, -1)} className="h-6 w-6 rounded bg-white border hover:bg-slate-100 flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                        <span className="w-6 text-center text-sm font-mono font-bold">{item.quantity}</span>
                        <button onClick={() => updateQty(i, 1)} className="h-6 w-6 rounded bg-white border hover:bg-slate-100 flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                        <button onClick={() => removeItem(i)} className="h-6 w-6 rounded hover:bg-rose-50 text-rose-500 flex items-center justify-center ml-1"><X className="h-3 w-3" /></button>
                      </div>
                      <div className="text-xs font-mono font-bold w-16 text-right shrink-0">{formatCLP(item.unitPrice * item.quantity)}</div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Neto</span>
                    <span className="font-mono">{formatCLP(Math.round(cartTotal / 1.19))}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>IVA 19%</span>
                    <span className="font-mono">{formatCLP(cartTotal - Math.round(cartTotal / 1.19))}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>TOTAL</span>
                    <span className="font-mono text-orange-600">{formatCLP(cartTotal)}</span>
                  </div>
                </div>

                <Button
                  onClick={() => setShowCheckoutModal(true)}
                  disabled={cart.length === 0}
                  className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold text-base"
                >
                  <Wallet className="h-5 w-5 mr-2" />COBRAR
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* MODALES */}
      <OpenSessionModal open={showOpenModal} onOpen={onSessionOpen} operators={operators} />
      <CloseSessionModal open={showCloseModal} onClose={() => setShowCloseModal(false)} session={session} onClosed={onSessionClosed} />
      <CheckoutModal
        open={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        cart={cart}
        total={cartTotal}
        sessionId={session?.id}
        onSuccess={onSaleSuccess}
      />
      <PostSaleModal order={postSale} onClose={() => setPostSale(null)} />
    </div>
  );
}
