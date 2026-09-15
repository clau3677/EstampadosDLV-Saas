'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle2, Eye, ImagePlus, Instagram, Loader2, Palette, Save, Send, Sparkles } from 'lucide-react';

const SUPPLIER_LABELS = { cottonext: 'Cottonext', textilryu: 'Textil Ryu', treck: 'Treck' };
const TEMPLATES = {
  navy: { label: 'Navy DLV', accent: '#FF9E2C', badge: 'ESTAMPADOSDLV.COM' },
  coral: { label: 'Coral comercial', accent: '#FF566B', badge: 'COTIZA CON DLV' },
  orange: { label: 'Naranja energía', accent: '#FFB347', badge: 'CALIDAD DLV' },
};

function mediaUrl(value) {
  if (!value) return '';
  return value.startsWith('http') ? value : value.startsWith('/') ? value : `/${value}`;
}

function defaultHeadline(product) {
  const words = String(product?.name || 'Tu producto').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(' ').toUpperCase();
}

export function CreativeEditor({ onCreated }) {
  const [products, setProducts] = useState([]);
  const [supplier, setSupplier] = useState('all');
  const [productId, setProductId] = useState('');
  const [template, setTemplate] = useState('navy');
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('PERSONALIZA TU IDEA');
  const [benefit, setBenefit] = useState('CALIDAD Y DISEÑO A TU MEDIDA');
  const [cta, setCta] = useState('COTIZA POR WHATSAPP');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('#EstampadosDLV #DTF #Quilpué');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/products').then((r) => r.json()).then((data) => setProducts(Array.isArray(data) ? data : [])).catch(() => toast.error('No se pudo cargar el catálogo'));
  }, []);

  const visibleProducts = useMemo(() => products.filter((p) => supplier === 'all' || p.supplier === supplier), [products, supplier]);
  const product = products.find((p) => p.id === productId) || null;
  const design = TEMPLATES[template] || TEMPLATES.navy;
  const previewImage = mediaUrl(product?.images?.[0]);
  const destination = product?.slug ? `https://estampadosdlv.com/producto/${product.slug}` : 'https://estampadosdlv.com/tienda';

  useEffect(() => {
    if (!product) return;
    setHeadline(defaultHeadline(product));
    setBenefit(String(product.marketingBenefit || product.shortDescription || 'CALIDAD Y DISEÑO A TU MEDIDA').toUpperCase().slice(0, 72));
    setCaption(`Conoce ${product.name}. Personaliza tu idea con Estampados DLV y recibe atención desde Quilpué.\n\nCotiza según cantidad y personalización aquí: ${destination}`);
  }, [productId]);

  const saveDraft = async () => {
    if (!productId) return toast.error('Selecciona un producto');
    setSaving(true);
    try {
      const generated = await fetch('/api/marketing/posts/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, tone: 'profesional', occasion: `${design.label}: ${headline}`, platforms: ['facebook', 'instagram'], scheduledAt: undefined }),
      });
      const generatedData = await generated.json();
      if (!generated.ok) throw new Error(generatedData.error || 'No se pudo generar el creativo');
      const post = generatedData.post;
      const hashtagsArray = hashtags.split(/\s+/).filter(Boolean).slice(0, 12);
      const updated = await fetch('/api/marketing/posts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: post.id, caption, hashtags: hashtagsArray, platforms: ['facebook', 'instagram'], scheduledAt: scheduledAt || null }),
      });
      const updatedData = await updated.json();
      if (!updated.ok) throw new Error(updatedData.error || 'El creativo se generó, pero no se pudo guardar');
      toast.success(scheduledAt ? 'Creativo programado correctamente' : 'Creativo guardado como borrador');
      setCaption(''); setScheduledAt('');
      onCreated?.(updatedData.post || post);
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar el creativo');
    } finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
      <Card className="border-orange-100 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-orange-500" /> Editor creativo</CardTitle>
          <CardDescription>Diseña una pieza con productos reales y guárdala como borrador o prográmala en Facebook e Instagram.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="text-xs font-medium text-muted-foreground">Proveedor</label><Select value={supplier} onValueChange={(value) => { setSupplier(value); setProductId(''); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los proveedores</SelectItem>{Object.entries(SUPPLIER_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div><label className="text-xs font-medium text-muted-foreground">Producto real</label><Select value={productId} onValueChange={setProductId}><SelectTrigger><SelectValue placeholder="Selecciona un producto" /></SelectTrigger><SelectContent>{visibleProducts.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3"><div className="md:col-span-1"><label className="text-xs font-medium text-muted-foreground">Plantilla</label><Select value={template} onValueChange={setTemplate}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TEMPLATES).map(([key, item]) => <SelectItem key={key} value={key}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="md:col-span-2"><label className="text-xs font-medium text-muted-foreground">Titular principal</label><Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Ej.: POLERA PERSONALIZADA" /></div></div>
          <div className="grid gap-4 md:grid-cols-2"><div><label className="text-xs font-medium text-muted-foreground">Segunda línea</label><Input value={subheadline} onChange={(e) => setSubheadline(e.target.value)} /></div><div><label className="text-xs font-medium text-muted-foreground">Beneficio destacado</label><Input value={benefit} onChange={(e) => setBenefit(e.target.value)} /></div></div>
          <div><label className="text-xs font-medium text-muted-foreground">Texto del botón</label><Input value={cta} onChange={(e) => setCta(e.target.value)} /></div>
          <div><label className="text-xs font-medium text-muted-foreground">Texto principal de la publicación</label><Textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Escribe el mensaje que acompañará la imagen..." /></div>
          <div className="grid gap-4 md:grid-cols-2"><div><label className="text-xs font-medium text-muted-foreground">Hashtags</label><Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} /></div><div><label className="text-xs font-medium text-muted-foreground">Programar para (opcional)</label><Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Palette className="h-4 w-4" style={{ color: design.accent }} /> Paleta DLV · sin precio por defecto</div><Button onClick={saveDraft} disabled={saving || !productId}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...</> : <><Save className="mr-2 h-4 w-4" /> {scheduledAt ? 'Guardar y programar' : 'Guardar borrador'}</>}</Button></div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-200 shadow-sm xl:sticky xl:top-6 xl:self-start">
        <CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4" /> Vista previa</CardTitle><CardDescription>Referencia de cómo se verá en el feed.</CardDescription></div><Badge variant="outline">En vivo</Badge></div></CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center gap-3 p-4"><div className="grid h-9 w-9 place-items-center rounded-full bg-[#0C1630] text-xs font-bold text-orange-400">DLV</div><div><div className="text-sm font-semibold">Estampados DLV</div><div className="text-xs text-muted-foreground">Patrocinado</div></div><div className="ml-auto text-muted-foreground">•••</div></div>
            {caption && <p className="px-4 pb-3 text-xs leading-relaxed text-slate-700">{caption}</p>}
            <div className="relative aspect-square overflow-hidden bg-[#060B18]" style={{ background: `linear-gradient(145deg, ${design.accent}33, #060B18 58%)` }}>
              {previewImage ? <img src={previewImage} alt={product?.name || 'Producto'} className="absolute inset-0 h-full w-full object-contain opacity-65" /> : <div className="absolute inset-0 grid place-items-center text-slate-400"><ImagePlus className="h-10 w-10" /></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-[#060B18] via-transparent to-[#060B18]/20" />
              <div className="relative flex h-full flex-col justify-between p-5 text-white"><div className="flex justify-end"><span className="rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-widest" style={{ borderColor: design.accent, color: design.accent }}>{design.badge}</span></div><div><div className="max-w-[80%] text-3xl font-black leading-[.92] tracking-tight">{headline || 'TU PRODUCTO'}<br /><span style={{ color: design.accent }}>{subheadline || 'PERSONALIZA TU IDEA'}</span></div><div className="mt-4 inline-block border-2 px-2 py-1 text-xs font-bold uppercase" style={{ borderColor: design.accent, color: design.accent }}>{benefit || 'CALIDAD DLV'}</div><div className="mt-4 inline-flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-[#060B18]" style={{ backgroundColor: design.accent }}>{cta || 'COTIZA AHORA'} <Send className="h-3 w-3" /></div></div><div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-white/60"><span>Estampados DLV · Quilpué</span><span>Vista previa</span></div></div>
            </div>
            <div className="flex items-center justify-between bg-slate-50 p-3"><div className="min-w-0"><div className="truncate text-[10px] uppercase text-muted-foreground">estampadosdlv.com</div><div className="truncate text-xs font-semibold">{product?.name || 'Producto seleccionado'}</div><div className="truncate text-[10px] text-muted-foreground">Cotiza y revisa disponibilidad</div></div><Button size="sm" variant="outline" className="ml-3 shrink-0">Ver producto</Button></div>
            <div className="flex items-center gap-4 border-t px-4 py-3 text-xs text-muted-foreground"><span>♡</span><span>◯</span><span className="ml-auto"><Instagram className="h-3.5 w-3.5" /></span></div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" /> La imagen final se genera y valida en el backend antes de guardarse.</div>
        </CardContent>
      </Card>
    </div>
  );
}
