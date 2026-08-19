'use client';
// Cotizador de productos y servicios — módulo Ventas (build124)
// Búsqueda de productos, precios editables, PDF profesional, envío por correo/WhatsApp.
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search, Plus, Trash2, FileText, Download, Mail, MessageCircle, X, Loader2, ShoppingBag, Pencil, Check, ArrowLeft } from 'lucide-react';
import { formatCLP } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { generateQuotePDF, generateQuotePDFBase64 } from '@/components/quote-pdf';

const CATEGORY_LABELS = {
  dtf_meter: 'DTF Textil por metro',
  dtf_uv_meter: 'DTF UV por metro',
  blank_apparel: 'Ropa lisa',
  printed_apparel: 'Ropa personalizada',
  printed_cap: 'Gorras estampadas',
  caps_hats: 'Gorras y sombreros',
  gorra_parche_animal: 'Gorras parche animal',
  merchandising: 'Merchandising',
  workwear: 'Ropa de trabajo',
  servicios: 'Servicios',
  sin_categoria: 'Sin categoría',
};

function newItem(p, variant = null) {
  const price = variant?.price ?? p.basePrice ?? 0;
  return {
    uid: crypto.randomUUID(),
    productId: p.id,
    variantId: variant?.id || null,
    name: p.name,
    variantName: variant?.name || (Array.isArray(p.variants) && p.variants.length > 1 ? p.variants[0]?.name : ''),
    category: p.category,
    quantity: 1,
    unitPrice: Number(price) || 0,
    // originalPrice guarda el precio de catálogo para restaurarlo
    originalPrice: Number(price) || 0,
  };
}

export default function CotizadorPage() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('todos');
  const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [clientName, setClientName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [waLink, setWaLink] = useState(null);
  const [waText, setWaText] = useState('');
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewQuote, setViewQuote] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/products?lite=true&includeVariants=true').then(r => r.json()),
      fetch('/api/quotes').then(r => r.json()).catch(() => []),
    ]).then(([prods, hist]) => {
      setProducts(Array.isArray(prods) ? prods : []);
      setHistory(Array.isArray(hist) ? hist : []);
      setLoadingProducts(false);
    }).catch(() => setLoadingProducts(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.category).filter(Boolean));
    return ['todos', ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (catFilter !== 'todos' && p.category !== catFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.category || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, catFilter]);

  const subtotal = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
  const discountAmt = Math.round(subtotal * (Number(discount) || 0) / 100);
  const total = subtotal - discountAmt;

  function recalc(itemsIn) {
    return itemsIn.map(it => ({ ...it, subtotal: Number(it.quantity) * Number(it.unitPrice) }));
  }

  function addProduct(p) {
    const variant = Array.isArray(p.variants) && p.variants.length > 1 ? p.variants[0] : null;
    setItems(prev => recalc([...prev, newItem(p, variant)]));
    toast.success(`Agregado: ${p.name}`);
  }

  function addVariantProduct(p, v) {
    setItems(prev => recalc([...prev, { ...newItem(p, v), quantity: 1 }]));
    toast.success(`Agregado: ${p.name} — ${v.name}`);
  }

  function updateItem(uid, patch) {
    setItems(prev => recalc(prev.map(it => (it.uid === uid ? { ...it, ...patch } : it))));
  }

  function removeItem(uid) {
    setItems(prev => prev.filter(it => it.uid !== uid));
  }

  function resetPrice(uid) {
    setItems(prev => {
      const restored = prev.map(it => (it.uid === uid ? { ...it, unitPrice: it.originalPrice } : it));
      return recalc(restored);
    });
  }

  function buildQuoteDoc() {
    return {
      clientName, clientCompany, clientEmail, clientPhone, notes,
      discount: Number(discount) || 0,
      subtotal,
      total,
      items: items.map(({ uid, originalPrice, ...rest }) => rest),
      validUntil: new Date(Date.now() + 15 * 24 * 3600 * 1000),
    };
  }

  async function saveQuote() {
    if (!clientName.trim()) return toast.error('Ingresa el nombre del cliente');
    if (!items.length) return toast.error('Agrega al menos 1 producto');
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildQuoteDoc()),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || 'No se pudo guardar');
      setHistory(prev => [data, ...prev]);
      toast.success(`Cotización ${data.code} guardada`);
      return data;
    } catch (e) {
      toast.error('Error de conexión');
      return null;
    }
  }

  async function downloadPDF() {
    if (!items.length) return toast.error('Agrega al menos 1 producto');
    const blob = generateQuotePDF(buildQuoteDoc());
    const code = `COT-${String(Date.now()).slice(-6)}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cotizacion_${code}_EstampadosDLV.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('PDF descargado');
  }

  async function sendEmail() {
    if (!clientName.trim()) return toast.error('Ingresa el nombre del cliente');
    if (!items.length) return toast.error('Agrega al menos 1 producto');
    if (!clientEmail.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clientEmail)) {
      return toast.error('Ingresa un correo válido del cliente');
    }
    setSending(true);
    try {
      // Guardar primero para tener code
      const saved = await saveQuote();
      if (!saved) { setSending(false); return; }
      const pdfBase64 = await generateQuotePDFBase64({ ...buildQuoteDoc(), id: saved.id, code: saved.code });
      const res = await fetch('/api/quotes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: saved.id, clientEmail: clientEmail.trim(), pdfBase64 }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'No se pudo enviar'); setSending(false); return; }
      toast.success(`Cotización enviada a ${clientEmail} ✓`);
    } finally {
      setSending(false);
    }
  }

  async function sendWhatsapp() {
    if (!clientName.trim()) return toast.error('Ingresa el nombre del cliente');
    if (!items.length) return toast.error('Agrega al menos 1 producto');
    if (!clientPhone.trim() || clientPhone.replace(/\D/g, '').length < 9) {
      return toast.error('Ingresa un teléfono válido (ej: +56912345678)');
    }
    setSending(true);
    try {
      const saved = await saveQuote();
      if (!saved) { setSending(false); return; }
      const res = await fetch('/api/quotes/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: saved.id }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'No se pudo enviar'); setSending(false); return; }
      if (data.method === 'whatsapp_link' && data.waLink) {
        setWaText(data.text);
        setWaLink(data.waLink);
        toast.success('Abre el enlace para enviar el mensaje por WhatsApp');
      } else {
        toast.success('Mensaje enviado por WhatsApp ✓');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cotizador de productos y servicios</h1>
          <p className="text-sm text-slate-500">Crea cotizaciones profesionales con precios editables y envíalas por correo o WhatsApp</p>
        </div>
        <Dialog open={!!selectedProduct} onOpenChange={open => { if (!open) setSelectedProduct(null); }}>
          <DialogContent className="max-h-[70vh] overflow-y-auto" onPointerDownOutside={e => { if (e.target.closest('[data-trigger-variants]')) e.preventDefault(); }}>
            <DialogHeader><DialogTitle>Variantes de {selectedProduct?.name || ''}</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {selectedProduct?.variants?.map(v => (
                <button
                  key={v.id}
                  onClick={() => { addVariantProduct(selectedProduct, v); setSelectedProduct(null); }}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:border-orange-300 hover:bg-orange-50"
                >
                  <span className="text-sm font-medium">{v.name}</span>
                  <span className="text-sm font-bold text-orange-600">{formatCLP(v.price)}</span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={historyOpen} onOpenChange={open => { setHistoryOpen(open); if (!open) setViewQuote(null); }>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2"><FileText className="h-4 w-4" />Historial ({history.length})</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Historial de cotizaciones</DialogTitle></DialogHeader>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Aún no hay cotizaciones creadas.</p>
            ) : viewQuote ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setViewQuote(null)}
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" /> Volver al listado
                </button>
                <div className="rounded-lg border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-slate-900">{viewQuote.code}</div>
                      <Badge variant="secondary" className="mt-1">{viewQuote.status || 'borrador'}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm">
                    <div><span className="text-slate-500">Cliente: </span><b>{viewQuote.clientName}</b></div>
                    {viewQuote.clientCompany ? <div><span className="text-slate-500">Empresa: </span>{viewQuote.clientCompany}</div> : null}
                    {viewQuote.clientEmail ? <div><span className="text-slate-500">Correo: </span>{viewQuote.clientEmail}</div> : null}
                    {viewQuote.clientPhone ? <div><span className="text-slate-500">Teléfono: </span>{viewQuote.clientPhone}</div> : null}
                    <div><span className="text-slate-500">Válida hasta: </span>{new Date(viewQuote.validUntil).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  </div>
                  <div className="mt-3 rounded-lg border bg-slate-50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-white text-left text-xs text-slate-500">
                          <th className="px-3 py-2">Producto</th>
                          <th className="px-2 py-2 text-center">Cant.</th>
                          <th className="px-2 py-2 text-right">Unitario</th>
                          <th className="px-3 py-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewQuote.items.map((it, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              {it.name}
                              {it.variantName ? <div className="text-xs text-slate-500">{it.variantName}</div> : null}
                            </td>
                            <td className="px-2 py-2 text-center">{it.quantity}</td>
                            <td className="px-2 py-2 text-right">{formatCLP(it.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCLP(it.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex flex-col gap-1 text-sm">
                    <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{formatCLP(viewQuote.subtotal)}</span></div>
                    {viewQuote.discount ? <div className="flex justify-between text-orange-600"><span>Descuento ({viewQuote.discount}%)</span><span>-{formatCLP(Math.round(viewQuote.subtotal * viewQuote.discount / 100))}</span></div> : null}
                    <div className="flex justify-between text-slate-600"><span>IVA estimado (19%)</span><span>{formatCLP(Math.round(viewQuote.subtotal * 0.19))}</span></div>
                    <div className="flex justify-between border-t pt-1 text-lg font-bold text-slate-900"><span>TOTAL</span><span>{formatCLP(viewQuote.total)}</span></div>
                  </div>
                  {viewQuote.notes ? <p className="mt-2 text-sm text-slate-500">Notas: {viewQuote.notes}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={downloadingPdf}
                      onClick={async () => {
                        setDownloadingPdf(true);
                        try {
                          const pdf = await generateQuotePDFBase64(viewQuote);
                          const bin = atob(pdf);
                          const bytes = new Uint8Array(bin.length);
                          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                          const blob = new Blob([bytes], { type: 'application/pdf' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `Cotizacion_${viewQuote.code}_EstampadosDLV.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } finally {
                          setDownloadingPdf(false);
                        }
                      }}
                    >
                      {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Ver / Descargar PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (!viewQuote.clientEmail) {
                          alert('Esta cotización no tiene correo de cliente.');
                          return;
                        }
                        const pdf = await generateQuotePDFBase64(viewQuote);
                        const res = await fetch('/api/quotes/send', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ quoteId: viewQuote.id, clientEmail: viewQuote.clientEmail, pdfBase64: pdf }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok) {
                          alert('Correo reenviado correctamente.');
                          setHistory(prev => prev.map(h => (h.id === viewQuote.id ? { ...h, status: 'enviada' } : h)));
                        } else {
                          alert(data.error || 'No se pudo enviar el correo.');
                        }
                      }}
                    >
                      <Mail className="h-4 w-4" /> Reenviar correo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const res = await fetch('/api/quotes/send-whatsapp', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ quoteId: viewQuote.id }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok && data?.result) {
                          alert('Mensaje de WhatsApp enviado.');
                        } else if (res.ok && data?.waLink) {
                          window.open(data.waLink, '_blank');
                        } else {
                          alert(data.error || 'No se pudo enviar el WhatsApp.');
                        }
                      }}
                    >
                      <MessageCircle className="h-4 w-4" /> Reenviar WhatsApp
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map(q => (
                  <button
                    key={q.id || q.code}
                    type="button"
                    onClick={() => setViewQuote(q)}
                    className="flex w-full items-center justify-between rounded-lg border bg-white p-3 text-left text-sm transition hover:border-slate-400"
                  >
                    <div>
                      <div className="font-semibold">{q.code}</div>
                      <div className="text-slate-500">{q.clientName} · {formatCLP(q.total)}</div>
                    </div>
                    <Badge variant="secondary">{q.status}</Badge>
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------- Columna izquierda: productos ---------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1 · Buscar productos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o categoría..."
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(c => (
                  <button
                    key={c}
                    onClick={() => setCatFilter(c)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      catFilter === c
                        ? 'bg-gradient-to-r from-orange-500 to-rose-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {c === 'todos' ? 'Todos' : (CATEGORY_LABELS[c] || c)}
                  </button>
                ))}
              </div>
              <div className="max-h-[480px] overflow-y-auto rounded-lg border divide-y">
                {loadingProducts && (
                  <div className="flex items-center justify-center p-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
                )}
                {!loadingProducts && filtered.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-400">Sin resultados para esta búsqueda</div>
                )}
                {!loadingProducts && filtered.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 bg-white p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        {CATEGORY_LABELS[p.category] || p.category} · {formatCLP(p.basePrice)}
                        {Array.isArray(p.variants) && p.variants.length > 1 ? ` · ${p.variants.length} variantes` : ''}
                      </div>
                    </div>
                    {Array.isArray(p.variants) && p.variants.length > 1 ? (
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setSelectedProduct(p)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => addProduct(p)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2 · Datos del cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 min-h-[200px]" style={{ overflow: 'visible' }}>
              <div className="sm:col-span-2">
                <div className="mb-1 text-sm font-medium text-slate-700">Nombre del cliente *</div>
                <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ej: Juan Pérez / Restaurante El Rincón" />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Empresa (opcional)</div>
                <Input value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="Empresa" />
              </div>
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Teléfono</div>
                <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+56912345678" />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 text-sm font-medium text-slate-700">Correo electrónico</div>
                <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="cliente@empresa.cl" type="email" />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 text-sm font-medium text-slate-700">Notas (opcional)</div>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalles adicionales para el cliente..." rows={2} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---------- Columna derecha: cotización ---------- */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4 text-orange-500" /> Cotización ({items.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-400">
                    Busca y agrega productos desde la lista
                  </div>
                )}
                {items.map(it => (
                  <div key={it.uid} className="rounded-lg border bg-white p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{it.name}</div>
                        {it.variantName && <div className="truncate text-xs text-slate-500">{it.variantName}</div>}
                      </div>
                      <button onClick={() => removeItem(it.uid)} className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="mb-1 block text-[11px] text-slate-500">Cantidad</Label>
                        <Input
                          type="number"
                          min={1}
                          value={it.quantity}
                          onChange={e => updateItem(it.uid, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        />
                      </div>
                      <div className="relative">
                        <Label className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                          Precio unitario (editable)
                          {it.unitPrice !== it.originalPrice && (
                            <button onClick={() => resetPrice(it.uid)} className="inline-flex items-center gap-1 text-orange-600 hover:underline">
                              <Pencil className="h-3 w-3" /> restaurar
                            </button>
                          )}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={it.unitPrice}
                          onChange={e => updateItem(it.uid, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="font-bold text-slate-900">{formatCLP(it.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Subtotal</span>
                  <span className="font-medium">{formatCLP(subtotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Descuento %</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="h-7 w-20"
                    value={discount}
                    onChange={e => setDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  />
                  {discount > 0 && <span className="text-xs font-medium text-orange-600">−{formatCLP(discountAmt)}</span>}
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-sm font-bold text-slate-900">TOTAL</span>
                  <span className="text-lg font-bold text-orange-600">{formatCLP(total)}</span>
                </div>
                <div className="text-[11px] text-slate-400">Válida por 15 días desde hoy</div>
              </div>

              {/* Acciones */}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={downloadPDF} variant="outline" className="gap-2" disabled={items.length === 0}>
                  <Download className="h-4 w-4" /> Descargar PDF
                </Button>
                <Button onClick={saveQuote} variant="outline" className="gap-2" disabled={items.length === 0}>
                  <Check className="h-4 w-4" /> Guardar
                </Button>
                <Button onClick={sendEmail} className="gap-2 bg-gradient-to-r from-orange-500 to-rose-500 hover:opacity-90" disabled={sending || items.length === 0}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar correo
                </Button>
                <Button onClick={sendWhatsapp} variant="secondary" className="gap-2" disabled={sending || items.length === 0}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} WhatsApp
                </Button>
              </div>

              {waLink && (
                <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="text-xs font-medium text-green-800">Mensaje personalizado listo — ábrelo para enviarlo:</div>
                  <Button asChild size="sm" className="w-full bg-green-600 hover:bg-green-700">
                    <a href={waLink} target="_blank" rel="noopener noreferrer">Abrir conversación de WhatsApp</a>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
