'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, Layers, Sparkles, ArrowRight, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProductCard } from '@/components/product-card';

const DEFAULT_CATS = [
  { code: 'all',       label: 'Todos' },
  { code: 'apparel',   label: 'Prendas' },
  { code: 'dtf_meter', label: 'DTF por metro' },
  { code: 'accessory', label: 'Accesorios' },
];

export default function TiendaPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState(DEFAULT_CATS);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    const paramCat = searchParams.get('cat');
    if (paramCat) setCat(paramCat);
  }, [searchParams]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [pr, tr] = await Promise.all([
          fetch('/api/products').then(r => r.json()),
          fetch('/api/taxonomies?kind=product_category').then(r => r.json()),
        ]);
        const activeProducts = (Array.isArray(pr) ? pr : []).filter(p => p.active !== false);
        setProducts(activeProducts);
        if (Array.isArray(tr) && tr.length > 0) {
          setCats([{ code: 'all', label: 'Todos' }, ...tr.map(t => ({ code: t.code, label: t.label }))]);
        }
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (cat !== 'all' && p.category !== cat) return false;
      if (q && !p.name?.toLowerCase().includes(q.toLowerCase()) &&
         !p.description?.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [products, cat, q]);

  return (
    <div>
      {/* HERO */}
      <section className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.4),transparent_50%)]" />
        <div className="container relative py-16 md:py-20">
          <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/30 mb-4">
            <Sparkles className="h-3 w-3 mr-1" />Taller DTF y DTF UV
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight max-w-3xl">
            Impresión DTF profesional,<br />
            <span className="bg-gradient-to-r from-orange-400 to-rose-400 bg-clip-text text-transparent">entrega en 48hrs.</span>
          </h1>
          <p className="mt-4 text-slate-300 text-lg max-w-2xl">
            Compra poleras, hoodies y DTF por metro. O sube tu diseño y armá tu propio pliego con nuestro editor.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" className="bg-orange-500 hover:bg-orange-600" asChild>
              <Link href="/gang-sheet"><Layers className="h-4 w-4 mr-2" />Sube tu diseño</Link>
            </Button>
            <Button size="lg" variant="outline" className="bg-transparent border-slate-500 text-white hover:bg-slate-800 hover:text-white" asChild>
              <a href="#catalogo">Ver catálogo <ArrowRight className="h-4 w-4 ml-2" /></a>
            </Button>
          </div>
        </div>
      </section>

      {/* CATALOGO */}
      <section id="catalogo" className="container py-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Catálogo</h2>
            <p className="text-sm text-slate-500">Productos listos para personalizar con tu diseño DTF.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Buscar producto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-10"
            />
            {q && (
              <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Chips de categoría */}
        <div className="flex flex-wrap gap-2 mb-6">
          {cats.map((c) => (
            <button
              key={c.code}
              onClick={() => setCat(c.code)}
              className={`
                px-4 py-1.5 rounded-full text-sm font-medium transition-all
                ${cat === c.code
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'}
              `}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />Cargando catálogo…
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200 rounded-xl">
            <div className="text-4xl mb-2">🔍</div>
            <div className="text-lg font-semibold text-slate-700">Sin resultados</div>
            <div className="text-sm text-slate-500 mt-1">Prueba con otro filtro o busca por nombre.</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* CTA final */}
      <section className="container pb-16">
        <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 p-8 md:p-12 text-white flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-widest text-white/80 font-semibold">Editor visual con IA</div>
            <h3 className="text-2xl md:text-3xl font-bold mt-1">¿No encuentras lo que buscas?</h3>
            <p className="text-white/90 mt-1 max-w-lg">
              Sube tus diseños y arma tu propio pliego DTF. Cotiza por mm impreso en tiempo real.
            </p>
          </div>
          <Button size="lg" className="bg-white text-orange-600 hover:bg-white/90 font-semibold" asChild>
            <Link href="/gang-sheet"><Layers className="h-4 w-4 mr-2" />Ir al Gang Sheet Builder</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
