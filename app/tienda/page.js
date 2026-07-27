'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  Search, Layers, Sparkles, ArrowRight, Loader2, X, Star, Truck, ShieldCheck,
  Heart, Wallet, Palette, CheckCircle2, Package,
  Shirt, Gift, HardHat, CircleUser,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductCard } from '@/components/product-card';
import { BUSINESS } from '@/lib/constants/business';

// Categorías principales con estilo (color + icono).
const CATEGORY_STYLE = {
  all: {
    icon: Layers,
    gradient: 'from-slate-900 to-slate-700',
    ring: 'ring-slate-300',
    dot: 'bg-slate-900',
  },
  dtf_meter: {
    icon: Sparkles,
    gradient: 'from-fuchsia-500 to-indigo-600',
    ring: 'ring-fuchsia-300',
    dot: 'bg-fuchsia-500',
  },
  blank_apparel: {
    icon: Shirt,
    gradient: 'from-slate-500 to-slate-700',
    ring: 'ring-slate-300',
    dot: 'bg-slate-500',
  },
  printed_apparel: {
    icon: Palette,
    gradient: 'from-orange-500 to-rose-500',
    ring: 'ring-orange-300',
    dot: 'bg-orange-500',
  },
  caps_hats: {
    icon: CircleUser,
    gradient: 'from-amber-500 to-orange-500',
    ring: 'ring-amber-300',
    dot: 'bg-amber-500',
  },
  merch: {
    icon: Gift,
    gradient: 'from-teal-500 to-emerald-600',
    ring: 'ring-teal-300',
    dot: 'bg-teal-500',
  },
  workwear: {
    icon: HardHat,
    gradient: 'from-indigo-500 to-blue-700',
    ring: 'ring-indigo-300',
    dot: 'bg-indigo-500',
  },
};

// Subcategorías por categoría (labels legibles)
const SUBCAT_MAP = {
  dtf_meter: [
    { code: 'dtf_textil', label: 'DTF Textil' },
    { code: 'dtf_uv',     label: 'DTF UV' },
  ],
  blank_apparel: [
    { code: 'poleras',    label: 'Poleras' },
    { code: 'polerones',  label: 'Polerones' },
    { code: 'pantalones', label: 'Pantalones' },
    { code: 'shorts',     label: 'Shorts' },
    { code: 'camisas',    label: 'Camisas' },
    { code: 'otros',      label: 'Otros' },
  ],
  printed_apparel: [
    { code: 'poleras',   label: 'Poleras' },
    { code: 'polerones', label: 'Polerones' },
    { code: 'otros',     label: 'Otros' },
  ],
  caps_hats: [
    { code: 'dtf',     label: 'DTF' },
    { code: 'vinilo',  label: 'Vinilo' },
    { code: 'bordado', label: 'Bordado' },
  ],
  merch: [
    { code: 'tazones',   label: 'Tazones' },
    { code: 'botellas',  label: 'Botellas' },
    { code: 'llaveros',  label: 'Llaveros' },
    { code: 'mousepads', label: 'Mouse pads' },
    { code: 'otros',     label: 'Otros' },
  ],
  workwear: [
    { code: 'lisa',      label: 'Sin estampar' },
    { code: 'estampada', label: 'Con estampado' },
  ],
};

const DEFAULT_CATS = [
  { code: 'all',             label: 'Todo el catálogo' },
  { code: 'dtf_meter',       label: 'DTF por metro' },
  { code: 'blank_apparel',   label: 'Ropa Lisa' },
  { code: 'printed_apparel', label: 'Ropa Estampada' },
  { code: 'caps_hats',       label: 'Gorras' },
  { code: 'merch',           label: 'Merchandising' },
  { code: 'workwear',        label: 'Ropa de Trabajo' },
];

const fetcher = (url) => fetch(url).then(r => r.json());

// ---------------------------------------------------------------------------

function TrustBadge({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-slate-700" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 truncate">{title}</div>
        <div className="text-xs text-slate-500 truncate">{subtitle}</div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, from, to, title, desc }) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-6 hover:border-transparent hover:shadow-xl hover:-translate-y-1 transition-all">
      <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${from} ${to} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="mt-4 font-bold text-slate-900 text-lg">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{desc}</p>
    </div>
  );
}

// ============================================================================

export default function TiendaPage() {
  const searchParams = useSearchParams();
  const [cats, setCats] = useState(DEFAULT_CATS);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [subcat, setSubcat] = useState('all');

  const { data: prData, isLoading } = useSWR('/api/products', fetcher, { keepPreviousData: true });
  const { data: taxData } = useSWR('/api/taxonomies?kind=product_category', fetcher);

  const products = useMemo(() =>
    Array.isArray(prData) ? prData.filter(p => p.active !== false) : []
  , [prData]);

  useEffect(() => {
    if (Array.isArray(taxData) && taxData.length > 0) {
      setCats([{ code: 'all', label: 'Todos' }, ...taxData.map(t => ({ code: t.code, label: t.label }))]);
    }
  }, [taxData]);

  useEffect(() => {
    const paramCat = searchParams.get('cat');
    if (paramCat) setCat(paramCat);
    const paramSub = searchParams.get('sub');
    if (paramSub) setSubcat(paramSub);
  }, [searchParams]);

  // Subcategorías disponibles según la categoría actual (contextuales).
  const subcatDefs = useMemo(() => {
    if (cat === 'all' || !SUBCAT_MAP[cat]) return [];
    const list = SUBCAT_MAP[cat];
    // Solo mostrar subcategorías que tengan al menos 1 producto
    const withCounts = list.map(s => ({
      ...s,
      count: products.filter(p => p.category === cat && p.subcategory === s.code).length,
    })).filter(s => s.count > 0);
    return withCounts;
  }, [products, cat]);

  // Reset subcategory cuando cambia la categoría principal
  useEffect(() => { setSubcat('all'); }, [cat]);

  const filtered = useMemo(() => {
    const qLow = q.trim().toLowerCase();
    return products.filter(p => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (subcat !== 'all' && p.subcategory !== subcat) return false;
      if (qLow &&
          !p.name?.toLowerCase().includes(qLow) &&
          !p.description?.toLowerCase().includes(qLow)) return false;
      return true;
    });
  }, [products, cat, subcat, q]);

  const featured = useMemo(() =>
    products.filter(p => p.featured).slice(0, 4)
  , [products]);

  const showFeaturedSection = featured.length >= 2 && cat === 'all' && subcat === 'all' && !q;

  return (
    <div>
      {/* ================ HERO ================ */}
      <section className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-rose-500/20 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="container relative py-16 md:py-24">
          <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30 mb-4">
            <Sparkles className="h-3 w-3 mr-1" />Taller DTF y DTF UV
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] max-w-3xl">
            Impresión DTF profesional,<br />
            <span className="bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">entrega en 48hrs.</span>
          </h1>
          <p className="mt-5 text-slate-300 text-lg max-w-2xl">
            Compra poleras, polerones y DTF por metro. O sube tu diseño y arma tu propio pliego con nuestro editor visual con IA.
          </p>

          {/* Rating + count */}
          <div className="mt-6 flex items-center gap-4">
            <div className="flex items-center gap-0.5">
              {[0,1,2,3,4].map(i => (
                <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <div className="text-sm text-slate-400">
              <span className="font-bold text-white">4.9/5</span> · <span>127 clientes felices</span>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 shadow-lg shadow-orange-500/25"
              asChild
            >
              <Link href="/gang-sheet"><Layers className="h-4 w-4 mr-2" />Sube tu diseño</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-transparent border-slate-500 text-white hover:bg-slate-800 hover:text-white"
              asChild
            >
              <a href="#catalogo">Ver catálogo <ArrowRight className="h-4 w-4 ml-2" /></a>
            </Button>
          </div>

          {/* Micro-benefits */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
            <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Sin mínimo de compra</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Auto-mejora IA a 300 DPI</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Preview antes de imprimir</div>
          </div>
        </div>
      </section>

      {/* ================ TRUST BAR ================ */}
      <section className="border-b border-slate-200 bg-white">
        <div className="container py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
            <TrustBadge icon={Truck}       title="Chilexpress + Starken" subtitle="Despacho 24-48h a todo Chile" />
            <TrustBadge icon={Wallet}      title="WebPay + MercadoPago"  subtitle="Pago seguro con Transbank" />
            <TrustBadge icon={ShieldCheck} title="Factura electrónica"   subtitle="SII · Boleta o factura" />
            <TrustBadge icon={Heart}       title="+127 clientes felices" subtitle="4.9/5 en Google Reviews" />
          </div>
        </div>
      </section>

      {/* ================ FEATURED PRODUCTS ================ */}
      {showFeaturedSection && (
        <section className="container py-16">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-semibold mb-2">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />Destacados
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                Los favoritos del taller
              </h2>
              <p className="text-sm text-slate-500 mt-1">Los productos que más piden nuestros clientes.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featured.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* ================ WHY US ================ */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-16 border-y border-slate-100">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-3 py-1 text-xs font-semibold mb-3">
              <Sparkles className="h-3 w-3" />¿Por qué Estampados DLV?
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
              Estampados premium, envío a todo Chile
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard icon={Palette} from="from-amber-500"  to="to-orange-600"
              title="Calidad premium 300 DPI"
              desc="Impresión a máxima resolución con canal blanco de alta densidad. Colores vibrantes y detalles finos, incluso en telas oscuras." />
            <FeatureCard icon={Truck}   from="from-emerald-500" to="to-teal-600"
              title="Despacho 24-48h a todo Chile"
              desc="Producción exprés y despacho por Chilexpress o Starken con tracking en tiempo real. Retiro gratis en Quilpué." />
            <FeatureCard icon={Sparkles} from="from-fuchsia-500" to="to-indigo-600"
              title="Editor visual con IA"
              desc="Sube tu diseño y ve el resultado antes de pagar. La IA auto-mejora tus imágenes a 300 DPI." />
          </div>
        </div>
      </section>

      {/* ================ CATÁLOGO ================ */}
      <section id="catalogo" className="container py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 px-3 py-1 text-xs font-semibold mb-2">
              <Package className="h-3 w-3" />Catálogo
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">Todo el catálogo</h2>
            <p className="text-sm text-slate-500 mt-1">DTF por metro, ropa lisa y estampada, gorras, merchandising y ropa de trabajo.</p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscar producto, categoría…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-11 shadow-sm border-slate-200 focus-visible:ring-orange-500"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ============ FILTROS UNIFICADOS ============ */}
        <div className="mb-8">
          {/* Row de service cards (categorías principales) */}
          <div className="flex flex-wrap gap-2 -mx-1 px-1 py-1 md:overflow-visible overflow-x-auto scrollbar-hide">
            {cats.map((c) => {
              const active = cat === c.code;
              const count = c.code === 'all' ? products.length : products.filter(p => p.category === c.code).length;
              const style = CATEGORY_STYLE[c.code] || CATEGORY_STYLE.all;
              const Icon = style.icon;
              return (
                <button
                  key={c.code}
                  onClick={() => setCat(c.code)}
                  disabled={count === 0 && c.code !== 'all'}
                  className={`
                    group shrink-0 inline-flex items-center gap-2 pl-2.5 pr-4 py-2 rounded-xl transition-all duration-200
                    ${active
                      ? `bg-gradient-to-br ${style.gradient} text-white shadow-lg shadow-slate-900/10 scale-[1.02]`
                      : count === 0 && c.code !== 'all'
                        ? 'bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                        : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5'}
                  `}
                >
                  <div className={`
                    h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors
                    ${active
                      ? 'bg-white/20'
                      : `bg-gradient-to-br ${style.gradient} bg-opacity-10 text-white`}
                  `}>
                    <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-white'}`} />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold leading-tight">{c.label}</div>
                    <div className={`text-[10px] font-medium leading-tight ${active ? 'text-white/80' : 'text-slate-500'}`}>
                      {count} {count === 1 ? 'producto' : 'productos'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sub-filtros INLINE (aparecen dentro del mismo bloque, con transición suave) */}
          {subcatDefs.length > 0 && (
            <div className="mt-3 pl-2 flex items-center flex-wrap gap-x-1 gap-y-2">
              <span className="text-xs text-slate-500 font-medium mr-1">Filtrar:</span>
              <button
                onClick={() => setSubcat('all')}
                className={`
                  px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                  ${subcat === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                `}
              >
                Todos
              </button>
              {subcatDefs.map((s, i) => {
                const active = subcat === s.code;
                return (
                  <button
                    key={s.code}
                    onClick={() => setSubcat(s.code)}
                    className={`
                      px-2.5 py-1 rounded-md text-xs font-medium transition-colors
                      ${active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                    `}
                  >
                    {s.label}
                    <span className={`ml-1 text-[10px] ${active ? 'text-white/70' : 'text-slate-400'}`}>
                      {s.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[0,1,2,3,4,5,6,7].map(i => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
              <Search className="h-7 w-7 text-slate-400" />
            </div>
            <div className="text-lg font-semibold text-slate-800">Sin resultados</div>
            <div className="text-sm text-slate-500 mt-1 max-w-sm">
              No encontramos productos con esos filtros. Prueba con otra categoría o busca por nombre.
            </div>
            <Button variant="outline" className="mt-4" onClick={() => { setCat('all'); setQ(''); }}>
              Ver todo el catálogo
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
            <div className="mt-6 text-center text-xs text-slate-500">
              Mostrando {filtered.length} de {products.length} productos
            </div>
          </>
        )}
      </section>

      {/* ================ CTA FINAL ================ */}
      <section className="container pb-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 p-10 md:p-16 text-white shadow-2xl">
          <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-widest text-white/80 font-semibold">Editor visual con IA</div>
              <h3 className="text-2xl md:text-3xl font-bold mt-2 tracking-tight">¿No encuentras lo que buscas?</h3>
              <p className="text-white/95 mt-2 max-w-lg">
                Sube tus diseños y arma tu propio pliego DTF. Cotiza por centímetro impreso en tiempo real.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/80">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />DPI validado en tiempo real</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Precio final antes de pagar</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                size="lg"
                className="bg-white text-rose-600 hover:bg-white/95 font-bold shadow-xl"
                asChild
              >
                <Link href="/gang-sheet"><Layers className="h-4 w-4 mr-2" />Ir al editor</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/40 text-white hover:bg-white/10 font-bold"
                asChild
              >
                <a href={BUSINESS.whatsapp.url('Hola! Quiero cotizar')} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
