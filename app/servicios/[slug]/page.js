// Server component — landing page SEO dinámica /servicios/[slug]
// Renderiza HTML estático con meta tags, structured data (JSON-LD) y contenido único.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin, Sparkles, CheckCircle2, ArrowRight, Layers, Award, Truck, Zap,
} from 'lucide-react';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/models';
import { ProductCard } from '@/components/product-card';

async function fetchLanding(slug) {
  try {
    const db = await getDb();
    return await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ slug, active: true });
  } catch (e) { return null; }
}

/**
 * Resuelve la lista de productos a mostrar según el modo de la landing.
 *
 * modos:
 *   - 'manual'     → usa `featuredProductIds` (selección explícita)
 *   - 'featured'   → automáticamente productos con `featured=true` (dinámico)
 *   - 'all_active' → todos los productos activos, limitado a `maxProducts`
 *
 * Fallback: si no hay resultados en el modo elegido, cae a "primeros N activos"
 * para nunca mostrar la sección vacía.
 */
async function resolveProducts(landing) {
  const mode = landing?.productsMode || (landing?.featuredProductIds?.length ? 'manual' : 'all_active');
  const max = Number(landing?.maxProducts) || 8;
  try {
    const db = await getDb();
    const col = db.collection(COLLECTIONS.PRODUCTS);
    let rows = [];

    if (mode === 'manual' && (landing.featuredProductIds || []).length > 0) {
      rows = await col.find({
        id: { $in: landing.featuredProductIds },
        active: { $ne: false },
      }).toArray();
      // Preservar el orden del array de IDs
      const order = new Map(landing.featuredProductIds.map((id, i) => [id, i]));
      rows.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    } else if (mode === 'featured') {
      rows = await col.find({
        featured: true,
        active: { $ne: false },
      }).sort({ createdAt: -1 }).limit(max).toArray();
    } else {
      // 'all_active' o fallback
      rows = await col.find({ active: { $ne: false } }).sort({ createdAt: -1 }).limit(max).toArray();
    }

    // Fallback si el modo no devolvió nada: usar cualquier producto activo
    if (rows.length === 0) {
      rows = await col.find({ active: { $ne: false } }).sort({ createdAt: -1 }).limit(4).toArray();
    }
    return rows;
  } catch (e) {
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const landing = await fetchLanding(slug);
  if (!landing) return { title: 'Servicio no encontrado' };

  const base = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return {
    title: landing.metaTitle || `${landing.h1} · Estampados DLV`,
    description: landing.metaDescription || landing.intro,
    keywords: landing.keywords?.join(', '),
    alternates: {
      canonical: `${base}/servicios/${slug}`,
    },
    openGraph: {
      title: landing.metaTitle || landing.h1,
      description: landing.metaDescription || landing.intro,
      url: `${base}/servicios/${slug}`,
      siteName: 'Estampados DLV',
      locale: 'es_CL',
      type: 'website',
      images: landing.ogImage ? [{ url: landing.ogImage }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: landing.metaTitle || landing.h1,
      description: landing.metaDescription || landing.intro,
    },
  };
}

export default async function LandingPage({ params }) {
  const { slug } = await params;
  const landing = await fetchLanding(slug);
  if (!landing) notFound();

  const featured = await resolveProducts(landing);

  // JSON-LD structured data: LocalBusiness + Service
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${baseUrl}/#business`,
        name: `Estampados DLV${landing.location?.city ? ' · ' + landing.location.city : ''}`,
        description: landing.intro,
        image: landing.ogImage || `${baseUrl}/og-default.jpg`,
        url: `${baseUrl}/servicios/${slug}`,
        telephone: '+56912345678',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          addressLocality: landing.location?.city || 'Santiago',
          addressRegion:   landing.location?.region || 'RM',
          addressCountry:  'CL',
        },
        areaServed: landing.location?.city,
      },
      {
        '@type': 'Service',
        name: landing.h1,
        description: landing.intro,
        provider: { '@id': `${baseUrl}/#business` },
        areaServed: {
          '@type': 'City',
          name: landing.location?.city,
        },
        offers: featured.map(p => ({
          '@type': 'Offer',
          name: p.name,
          priceCurrency: 'CLP',
          price: p.basePrice,
          url: `${baseUrl}/producto/${p.slug}`,
        })),
      },
    ],
  };

  const paragraphs = (landing.body || '').split(/\n{2,}/).filter(Boolean);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HERO */}
      <section className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.4),transparent_50%)]" />
        <div className="container relative py-14 md:py-20">
          {landing.location?.city && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-3 py-1 text-xs font-semibold text-orange-300 border border-orange-400/30 mb-4">
              <MapPin className="h-3 w-3" />{landing.location.city}, {landing.location.region}
            </div>
          )}
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight max-w-3xl">
            {landing.h1}
          </h1>
          <p className="mt-4 text-slate-300 text-lg max-w-2xl">{landing.intro}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/gang-sheet" className="inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5">
              <Layers className="h-4 w-4" />{landing.ctaText || 'Sube tu diseño'}
            </Link>
            <Link href="/tienda" className="inline-flex items-center gap-2 rounded-md border border-slate-600 hover:bg-slate-800 text-white font-semibold px-5 py-2.5">
              Ver catálogo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* BODY */}
      {paragraphs.length > 0 && (
        <section className="container py-12 max-w-3xl">
          <div className="prose prose-slate max-w-none">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-slate-700 leading-relaxed text-lg mb-4">{p}</p>
            ))}
          </div>
        </section>
      )}

      {/* BENEFITS */}
      <section className="bg-slate-50 py-14">
        <div className="container">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">
            ¿Por qué Estampados DLV{landing.location?.city ? ` en ${landing.location.city}` : ''}?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="h-10 w-10 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center mb-4">
                <Award className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900">Calidad premium 300 DPI</h3>
              <p className="text-sm text-slate-600 mt-1">Impresión a máxima resolución con canal blanco + barniz UV.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <Truck className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900">Entrega en 48hrs</h3>
              <p className="text-sm text-slate-600 mt-1">Envíos a todo Chile vía Chilexpress o Starken.</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-slate-900">Cotiza al instante</h3>
              <p className="text-sm text-slate-600 mt-1">Editor visual que calcula tu precio por mm impreso.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      {featured.length > 0 && (
        <section className="container py-14">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Productos destacados</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featured.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* FINAL CTA */}
      <section className="container pb-14">
        <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-rose-500 p-8 md:p-12 text-white text-center">
          <Sparkles className="h-8 w-8 text-white mx-auto" />
          <h3 className="mt-3 text-2xl md:text-3xl font-bold">¿Listo para estampar en {landing.location?.city || 'Chile'}?</h3>
          <p className="text-white/90 mt-2 max-w-xl mx-auto">
            Sube tu diseño al editor y recibe tu cotización al instante.
          </p>
          <Link href="/gang-sheet" className="inline-flex items-center gap-2 mt-5 rounded-md bg-white text-orange-600 hover:bg-white/90 font-semibold px-6 py-3">
            <Layers className="h-4 w-4" />{landing.ctaText || 'Cotiza tu diseño ahora'}
          </Link>
        </div>
      </section>
    </>
  );
}
