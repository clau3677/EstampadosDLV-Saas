'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Sparkles, Wand2, Image as ImageIcon, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const SERVICES = [
  { value: 'dtf_textil', label: 'DTF Textil' },
  { value: 'dtf_uv',     label: 'DTF UV' },
  { value: 'general',    label: 'General (mixto)' },
];

const REGIONS_CL = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana', 'O’Higgins', 'Maule', 'Ñuble',
  'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
];

const slugify = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
   .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const emptyForm = {
  slug: '', service: 'dtf_textil',
  location: { city: '', comuna: '', region: 'Valparaíso' },
  h1: '', intro: '', body: '', ctaText: '',
  metaTitle: '', metaDescription: '', ogImage: '',
  heroImage: '',                            // imagen destacada del hero
  keywords: '',                             // string → array al enviar
  productsMode: 'featured',                 // 'manual' | 'featured' | 'all_active'
  featuredProductIds: [],
  maxProducts: 8,
  active: true,
};

export function LandingEditDialog({ landing, open, onOpenChange, onSaved }) {
  const isEdit = !!landing?.id;
  const [form, setForm] = useState(emptyForm);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTone, setAiTone] = useState('');
  const [aiExtra, setAiExtra] = useState('');
  const [uploadingHero, setUploadingHero] = useState(false);

  const uploadHeroImage = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) return toast.error('Solo imágenes (JPG, PNG, WEBP)');
    if (file.size > 8 * 1024 * 1024) return toast.error('Imagen máxima 8MB');
    setUploadingHero(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'landings');
      const r = await fetch('/api/uploads/image', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'error');
      setField({ heroImage: d.url });
      toast.success('Imagen subida', {
        description: `${d.widthPx}×${d.heightPx}px · ${Math.round(d.sizeBytes / 1024)} KB`,
      });
    } catch (e) {
      toast.error('No se pudo subir', { description: e.message });
    } finally {
      setUploadingHero(false);
    }
  };

  useEffect(() => {
    if (open) {
      // Cargar productos disponibles para "destacados"
      fetch('/api/products').then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []));

      if (landing?.id) {
        setForm({
          ...emptyForm,
          ...landing,
          location: landing.location || emptyForm.location,
          keywords: Array.isArray(landing.keywords) ? landing.keywords.join(', ') : (landing.keywords || ''),
          // Landings antiguas: si no tienen productsMode, decidimos según featuredProductIds
          productsMode: landing.productsMode || (landing.featuredProductIds?.length ? 'manual' : 'featured'),
          featuredProductIds: landing.featuredProductIds || [],
          maxProducts: landing.maxProducts || 8,
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, landing]);

  const setField = (patch) => setForm(f => ({ ...f, ...patch }));
  const setLocation = (patch) => setForm(f => ({ ...f, location: { ...f.location, ...patch } }));

  // -------- Generación con IA --------
  const runAI = async () => {
    // Auto-slug si no hay ciudad ni h1
    if (!form.location?.city && !form.service) {
      toast.error('Ingresa al menos la ciudad o el servicio antes de generar');
      return;
    }
    setGenerating(true);
    setAiOpen(false);
    try {
      const r = await fetch('/api/landings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: form.service || 'general',
          city: form.location?.city || '',
          region: form.location?.region || '',
          tone: aiTone || undefined,
          extraContext: aiExtra || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'error');

      // Aplicar los campos generados. Preservar location/service/productsMode.
      setField({
        slug: data.fields.slug || form.slug,
        h1: data.fields.h1,
        intro: data.fields.intro,
        body: data.fields.body,
        ctaText: data.fields.ctaText,
        metaTitle: data.fields.metaTitle,
        metaDescription: data.fields.metaDescription,
        keywords: (data.fields.keywords || []).join(', '),
      });

      toast.success('Contenido generado con IA ✨', {
        description: `${(data.tookMs / 1000).toFixed(1)}s · ${data.usage?.total_tokens || 0} tokens`,
      });
    } catch (e) {
      toast.error('Error al generar con IA', { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const autoSlug = () => {
    if (!form.h1 && !form.location?.city) return toast.error('Completa H1 o Ciudad para generar el slug');
    const parts = [form.service?.replace('_', '-'), form.location?.city];
    const s = slugify(parts.filter(Boolean).join(' '));
    setField({ slug: s });
  };

  const suggestMeta = () => {
    if (!form.h1) return toast.error('Completa el H1 primero');
    const city = form.location?.city || '';
    const service = SERVICES.find(s => s.value === form.service)?.label || '';
    setField({
      metaTitle: `${form.h1} | ${service} - Estampados DLV`.slice(0, 60),
      metaDescription: (form.intro || `Servicio de ${service} en ${city}. Impresión 300 DPI, entrega express, mejores precios.`).slice(0, 155),
    });
  };

  const submit = async () => {
    if (!form.h1 || !form.slug) return toast.error('H1 y slug son obligatorios');
    setSaving(true);
    try {
      const payload = {
        ...form,
        keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
      };
      const method = isEdit ? 'PATCH' : 'POST';
      const r = await fetch('/api/landings', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { id: landing.id, ...payload } : payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast.success(isEdit ? 'Landing actualizada' : 'Landing creada', {
        description: `/servicios/${payload.slug}`,
      });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error('Error al guardar', { description: e.message });
    } finally { setSaving(false); }
  };

  const toggleProduct = (pid) => setField({
    featuredProductIds: form.featuredProductIds?.includes(pid)
      ? form.featuredProductIds.filter(x => x !== pid)
      : [...(form.featuredProductIds || []), pid],
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>{isEdit ? 'Editar landing' : 'Nueva landing SEO'}</DialogTitle>
              <p className="text-xs text-slate-500 mt-1">Crea landing pages optimizadas para SEO local o usa la IA para autogenerarlas.</p>
            </div>
            <Button
              type="button"
              onClick={() => setAiOpen(true)}
              disabled={generating}
              className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 hover:from-fuchsia-600 hover:via-violet-600 hover:to-indigo-600 text-white shadow-md"
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generando…</>
              ) : (
                <><Wand2 className="h-4 w-4 mr-1.5" /> Generar con IA</>
              )}
            </Button>
          </div>
        </DialogHeader>

        {/* Modal secundaria: parámetros IA */}
        {aiOpen && (
          <div className="rounded-lg border border-violet-300 bg-gradient-to-br from-fuchsia-50 to-indigo-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-violet-600" />
              <div className="text-sm font-semibold text-violet-900">Generar contenido con IA (MiniMax)</div>
            </div>
            <p className="text-xs text-violet-800">
              Toma en cuenta la <b>ciudad, región y servicio</b> ya seleccionados arriba, más los siguientes hints opcionales:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tono adicional (opcional)</Label>
                <Input
                  placeholder="Ej: urgente, técnico, familiar…"
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Contexto extra (opcional)</Label>
                <Input
                  placeholder="Ej: ofertas mayoristas, entrega 24hs…"
                  value={aiExtra}
                  onChange={(e) => setAiExtra(e.target.value)}
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-600 bg-white/60 rounded p-2 border border-violet-200">
              💡 La IA generará <b>slug, H1, intro, body (2-4 párrafos), CTA, meta title, meta description y keywords</b> optimizados para SEO local chileno. Tarda 10-20 segundos.
              {form.h1 && <><br /><span className="text-rose-700">⚠ Los campos actuales serán sobreescritos.</span></>}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAiOpen(false)}>Cancelar</Button>
              <Button
                size="sm"
                onClick={runAI}
                className="bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-600 hover:to-indigo-600 text-white"
              >
                <Sparkles className="h-4 w-4 mr-1.5" /> Generar
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Location + Service */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Ubicación y servicio</div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Ciudad</Label>
                <Input placeholder="Quilpué" value={form.location?.city || ''}
                  onChange={(e) => setLocation({ city: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Comuna</Label>
                <Input placeholder="Quilpué" value={form.location?.comuna || ''}
                  onChange={(e) => setLocation({ comuna: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Región</Label>
                <Select value={form.location?.region} onValueChange={(v) => setLocation({ region: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REGIONS_CL.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Servicio</Label>
                <Select value={form.service} onValueChange={(v) => setField({ service: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* URL */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">URL final</div>
              <Button variant="outline" size="sm" onClick={autoSlug} className="h-7 text-xs">
                <Sparkles className="h-3 w-3 mr-1" />Auto-generar
              </Button>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 h-10">
              <span className="text-xs text-slate-500 font-mono">/servicios/</span>
              <Input value={form.slug} onChange={(e) => setField({ slug: slugify(e.target.value) })}
                className="border-0 bg-transparent shadow-none px-0 h-8 font-mono text-sm focus-visible:ring-0"
                placeholder="estampados-dtf-quilpue" />
            </div>
          </div>

          {/* Content */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Contenido</div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">H1 (encabezado principal)</Label>
                <Input placeholder="Estampados DTF en Quilpué" value={form.h1}
                  onChange={(e) => setField({ h1: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Intro (2-3 frases, aparece bajo el H1)</Label>
                <Textarea rows={2} placeholder="Servicio profesional de impresión DTF en Quilpué..."
                  value={form.intro} onChange={(e) => setField({ intro: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Cuerpo (párrafos separados por doble Enter)</Label>
                <Textarea rows={6} value={form.body} onChange={(e) => setField({ body: e.target.value })}
                  placeholder="Escribe 2-4 párrafos con palabras clave locales. Ejemplo:

En Quilpué y toda la V Región imprimimos DTF con máquinas Epson y Prestige...

Realizamos despachos a comunas cercanas: Villa Alemana, Viña del Mar, Valparaíso..." />
              </div>
              <div>
                <Label className="text-xs">Texto del botón CTA</Label>
                <Input placeholder="Cotiza tu diseño en Quilpué" value={form.ctaText}
                  onChange={(e) => setField({ ctaText: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Hero Image */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
              <ImageIcon className="h-3 w-3" />
              Imagen destacada del Hero
              <span className="text-[10px] font-normal normal-case tracking-normal text-slate-400">(opcional)</span>
            </div>
            <div className="flex items-start gap-3">
              {/* Preview */}
              <div className="w-32 h-32 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center relative overflow-hidden shrink-0">
                {form.heroImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.heroImage} alt="Hero" className="absolute inset-0 h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setField({ heroImage: '' })}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md"
                      title="Quitar imagen"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <ImageIcon className="h-8 w-8 text-slate-300" />
                )}
              </div>

              {/* Controls */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadHeroImage(e.target.files[0])}
                    />
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-3 h-9 text-xs font-semibold transition-colors ${
                      uploadingHero
                        ? 'bg-slate-100 text-slate-400 cursor-wait'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}>
                      {uploadingHero ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Subiendo…</> : <><Upload className="h-3.5 w-3.5" />Subir imagen</>}
                    </span>
                  </label>
                  <span className="text-[11px] text-slate-500">Máx 8MB · JPG, PNG, WEBP</span>
                </div>
                <Input
                  value={form.heroImage}
                  onChange={(e) => setField({ heroImage: e.target.value })}
                  placeholder="/uploads/landings/… o URL externa"
                  className="text-xs font-mono h-9"
                />
                <p className="text-[11px] text-slate-500">
                  Se mostrará junto al H1 en el hero de <span className="font-mono">/servicios/{form.slug || 'slug'}</span>.
                  Si no subes ninguna, se usa un gradiente de marca.
                </p>
              </div>
            </div>
          </div>

          {/* SEO Meta */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Meta tags SEO</div>
              <Button variant="outline" size="sm" onClick={suggestMeta} className="h-7 text-xs">
                <Sparkles className="h-3 w-3 mr-1" />Sugerir
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Meta title ({form.metaTitle.length}/60)</Label>
                <Input maxLength={70} value={form.metaTitle} onChange={(e) => setField({ metaTitle: e.target.value })}
                  placeholder="Estampados DTF Quilpué | Impresión Textil Premium" />
              </div>
              <div>
                <Label className="text-xs">Meta description ({form.metaDescription.length}/155)</Label>
                <Textarea rows={2} maxLength={170} value={form.metaDescription}
                  onChange={(e) => setField({ metaDescription: e.target.value })}
                  placeholder="Especialistas en estampado DTF en Quilpué. Impresión 300 DPI, entrega express." />
              </div>
              <div>
                <Label className="text-xs">Keywords (separadas por coma)</Label>
                <Input value={form.keywords} onChange={(e) => setField({ keywords: e.target.value })}
                  placeholder="estampados dtf quilpue, impresion textil quilpue, dtf quilpue" />
              </div>
              <div>
                <Label className="text-xs">OG Image URL (opcional)</Label>
                <Input value={form.ogImage} onChange={(e) => setField({ ogImage: e.target.value })}
                  placeholder="/uploads/og/quilpue.jpg" />
              </div>
            </div>
          </div>

          {/* Featured products */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
              <span>Productos destacados</span>
              {form.productsMode === 'featured' && (
                <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal">Automático</span>
              )}
              {form.productsMode === 'all_active' && (
                <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal">Todos activos</span>
              )}
            </div>

            {/* Selector de modo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              {[
                { value: 'featured',   label: '⭐ Solo destacados',   desc: 'Usa products.featured=true' },
                { value: 'all_active', label: '📦 Todos los activos', desc: 'Incluye nuevos productos automáticamente' },
                { value: 'manual',     label: '🎯 Selección manual',  desc: 'Elige productos uno a uno' },
              ].map((opt) => {
                const active = form.productsMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setField({ productsMode: opt.value })}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      active ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${active ? 'text-indigo-900' : 'text-slate-800'}`}>{opt.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* Configuración por modo */}
            {form.productsMode === 'manual' && products.length > 0 && (
              <div>
                <div className="text-[11px] text-slate-500 mb-2">Selecciona los productos que aparecerán en esta landing (en el orden clickeado):</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {products.filter(p => p.active !== false).map(p => {
                    const selected = form.featuredProductIds?.includes(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => toggleProduct(p.id)}
                        className={`text-left p-2 rounded-lg border transition-all relative ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        {p.featured && (
                          <span className="absolute top-1 right-1 text-amber-500" title="Producto destacado">⭐</span>
                        )}
                        <div className="text-xs font-semibold text-slate-800 truncate pr-4">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{p.category}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {form.productsMode === 'featured' && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">Modo automático:</span> se mostrarán los productos que tienen la marca ⭐ activada en Inventario.
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <span>Productos destacados actualmente:</span>
                  <span className="rounded-full bg-white border border-amber-300 px-2 py-0.5 font-semibold text-amber-800">
                    {products.filter(p => p.featured && p.active !== false).length}
                  </span>
                </div>
                {products.filter(p => p.featured && p.active !== false).length === 0 && (
                  <p className="mt-2 text-xs text-rose-700">
                    ⚠ No hay productos destacados aún. Ve a <a href="/inventario" className="underline font-semibold">Inventario</a> y marca al menos uno con ⭐ para que aparezcan aquí, o se usará un fallback automático de los primeros 4 activos.
                  </p>
                )}
              </div>
            )}

            {form.productsMode === 'all_active' && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <p className="text-sm text-emerald-900">
                  <span className="font-semibold">Modo dinámico:</span> se mostrarán todos los productos activos, ordenados por más recientes. Cada producto nuevo que crees aparecerá aquí automáticamente.
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <span>Productos activos actualmente:</span>
                  <span className="rounded-full bg-white border border-emerald-300 px-2 py-0.5 font-semibold text-emerald-800">
                    {products.filter(p => p.active !== false).length}
                  </span>
                </div>
              </div>
            )}

            {/* Límite máximo (solo para modos automáticos) */}
            {form.productsMode !== 'manual' && (
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor="maxProducts" className="text-xs font-medium text-slate-600">Máx. productos a mostrar:</label>
                <input
                  id="maxProducts"
                  type="number"
                  min="1"
                  max="24"
                  value={form.maxProducts}
                  onChange={(e) => setField({ maxProducts: Math.max(1, Math.min(24, Number(e.target.value) || 8)) })}
                  className="w-20 h-8 rounded-md border border-slate-200 px-2 text-sm font-mono"
                />
              </div>
            )}
          </div>

          {/* Active */}
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Landing activa</div>
              <div className="text-xs text-slate-500">Se incluye en sitemap y aparece en Google.</div>
            </div>
            <Switch checked={!!form.active} onCheckedChange={(v) => setField({ active: v })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</> : <><Save className="h-3.5 w-3.5 mr-1.5" />{isEdit ? 'Actualizar' : 'Crear'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LandingEditDialog;
