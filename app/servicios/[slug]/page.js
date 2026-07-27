// Server component — landing page SEO dinámica /servicios/[slug]
// Renderiza HTML estático con meta tags, structured data (JSON-LD) y contenido único.
//
// Diseño rediseñado (v2, jul-2026):
//   - Hero split con imagen + badge de rating y trust signals
//   - Barra de logos de partners (Chilexpress, Starken, WebPay)
//   - Features con gradient icons y hover states
//   - "Cómo funciona" en 4 pasos visuales
//   - Grid de productos con hover elegante (reusa ProductCard)
//   - Testimonios con avatares gradient
//   - FAQ accordion (shadcn)
//   - CTA final con doble botón (Cotizar + WhatsApp)
//   - Botón flotante WhatsApp

import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  MapPin, Sparkles, CheckCircle2, ArrowRight, Layers, Award, Truck, Zap,
  Star, Palette, Send, Package, ShieldCheck, Clock, Heart, MessageCircle,
  Upload, Wallet,
} from 'lucide-react';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS, strip } from '@/lib/models';
import { ProductCard } from '@/components/product-card';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';

// Imágenes profesionales fijas (vision expert)
const IMG_HERO = 'https://images.unsplash.com/photo-1693031630369-bd429a57f115?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwyfHxEVEYlMjBwcmludGluZ3xlbnwwfHx8fDE3ODUxMzYwMzd8MA&ixlib=rb-4.1.0&q=85';
const IMG_RESULT = 'https://images.pexels.com/photos/5995816/pexels-photo-5995816.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';
const IMG_WORKSHOP = 'https://images.unsplash.com/photo-1663433541063-ddab084d1126?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwyfHx0LXNoaXJ0JTIwcHJpbnRpbmd8ZW58MHx8fHwxNzg1MTM2MDM2fDA&ixlib=rb-4.1.0&q=85';
const IMG_DESIGN = 'https://images.unsplash.com/photo-1600869009498-8d429f88d4f5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwzfHxkZXNpZ25lciUyMHNjcmVlbnxlbnwwfHx8fDE3ODUxMzYwNDN8MA&ixlib=rb-4.1.0&q=85';

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
      const order = new Map(landing.featuredProductIds.map((id, i) => [id, i]));
      rows.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    } else if (mode === 'featured') {
      rows = await col.find({
        featured: true,
        active: { $ne: false },
      }).sort({ createdAt: -1 }).limit(max).toArray();
    } else {
      rows = await col.find({ active: { $ne: false } }).sort({ createdAt: -1 }).limit(max).toArray();
    }

    if (rows.length === 0) {
      rows = await col.find({ active: { $ne: false } }).sort({ createdAt: -1 }).limit(4).toArray();
    }
    // Strip _id (ObjectID) para evitar el warning de Client Components
    return strip(rows);
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
      images: landing.ogImage ? [{ url: landing.ogImage }] : [{ url: IMG_HERO }],
    },
    twitter: {
      card: 'summary_large_image',
      title: landing.metaTitle || landing.h1,
      description: landing.metaDescription || landing.intro,
    },
  };
}

// ----------------------------------------------------------------------------
// Content data (podría venir de BD en el futuro)
// ----------------------------------------------------------------------------
const HOW_IT_WORKS = [
  { step: '01', icon: Upload,    title: 'Sube tu diseño',    desc: 'Usa nuestro editor visual o envía tu archivo PNG/PDF con transparencia. Auto-mejora a 300 DPI con IA.' },
  { step: '02', icon: Palette,   title: 'Revisamos el arte', desc: 'Verificamos DPI, colores y márgenes en <1 hora. Te enviamos preview antes de imprimir.' },
  { step: '03', icon: Zap,       title: 'Imprimimos',        desc: 'Producción en Epson R1390 o Prestige R2 Pro. Canal blanco alta densidad para telas oscuras.' },
  { step: '04', icon: Send,      title: 'Despachamos',       desc: 'Envío por Chilexpress o Starken en 24-48h. Tracking en tiempo real y foto del pedido antes de despachar.' },
];

const TESTIMONIALS = [
  { name: 'Camila Rojas',  role: 'Emprendedora, tienda de ropa', rating: 5, text: 'La calidad DTF supera al vinilo cortado y a la sublimación. Mis clientes notan la diferencia y ya voy por mi 8vo pedido.' },
  { name: 'Jorge Vera',    role: 'Agencia BTL',                  rating: 5, text: 'Pedí gang sheet de 5m para un evento corporativo. Llegó en 36h, colores perfectos. 100% recomendado.' },
  { name: 'María Luisa T.',role: 'Diseñadora textil',            rating: 5, text: 'Ellos me asesoraron con el arte, subieron el DPI de mis diseños y ajustaron márgenes gratis. Servicio 10/10.' },
];

const FAQS = [
  { q: '¿Qué es la impresión DTF y por qué es mejor?',
    a: 'DTF (Direct-to-Film) es una técnica que imprime tu diseño con tinta blanca y colores CMYK sobre un film especial, aplica pegamento en polvo y luego se transfiere a la prenda con calor. Ventajas: colores más vibrantes que sublimación, funciona en cualquier tela y color (incluso negras), no se agrieta ni pierde color al lavar, y admite detalles finos que el vinilo no puede reproducir.' },
  { q: '¿Cuánto demora un pedido?',
    a: 'Pedidos individuales o gang sheets hasta 1 metro: 24-48 horas producción. Órdenes mayores o mayoristas: 3-5 días hábiles. Ofrecemos servicio exprés 12h con recargo del 30%.' },
  { q: '¿Cuál es el mínimo de compra?',
    a: 'No tenemos mínimo. Puedes imprimir 1 sola pieza o miles. Los gang sheets se cobran por centímetro impreso — sólo pagas por lo que usas del rollo.' },
  { q: '¿En qué prendas y colores funciona?',
    a: 'Funciona en todo textil de algodón, poliéster y mezclas: poleras, polerones, mochilas, gorros, banderas, delantales, ropa deportiva. Ideal para telas oscuras gracias al canal blanco de alta opacidad.' },
  { q: '¿Cómo debo enviar mi diseño?',
    a: 'PNG con fondo transparente a 300 DPI del tamaño que quieres imprimir. Si no lo tienes, nuestro editor visual valida el DPI en tiempo real y la IA lo mejora automáticamente. También aceptamos PDF, SVG o AI.' },
  { q: '¿Hacen envíos a todo Chile?',
    a: 'Sí, despachamos desde Quilpué a todo Chile vía Chilexpress y Starken con tracking. Retiro en taller sin costo. Para pedidos sobre $30.000 el envío es gratis a la Región Metropolitana y Valparaíso.' },
];

// ----------------------------------------------------------------------------

export default async function LandingPage({ params }) {
  const { slug } = await params;
  const landing = await fetchLanding(slug);
  if (!landing) notFound();

  const featured = await resolveProducts(landing);

  // JSON-LD structured data: LocalBusiness + Service + FAQ + AggregateRating
  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': `${baseUrl}/#business`,
        name: `Estampados DLV${landing.location?.city ? ' · ' + landing.location.city : ''}`,
        description: landing.intro,
        image: landing.ogImage || IMG_HERO,
        url: `${baseUrl}/servicios/${slug}`,
        telephone: '+56912345678',
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          addressLocality: landing.location?.city || 'Quilpué',
          addressRegion:   landing.location?.region || 'Valparaíso',
          addressCountry:  'CL',
        },
        areaServed: landing.location?.city,
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '127',
        },
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
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  };

  const paragraphs = (landing.body || '').split(/\n{2,}/).filter(Boolean);
  const cityLabel = landing.location?.city || 'Chile';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ================ HERO (split) ================ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white">
        {/* Blobs decorativos */}
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-rose-500/20 blur-3xl" />
        {/* Grid pattern sutil */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="container relative py-14 md:py-20">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            {/* LEFT — copy */}
            <div>
              {/* Badge ubicación */}
              {landing.location?.city && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur border border-orange-400/30 px-3 py-1 text-xs font-semibold text-orange-300 mb-5">
                  <MapPin className="h-3 w-3" />{landing.location.city}, {landing.location.region}
                </div>
              )}

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                {landing.h1}
              </h1>
              <p className="mt-5 text-lg md:text-xl text-slate-300 leading-relaxed max-w-xl">
                {landing.intro}
              </p>

              {/* Rating + reviews */}
              <div className="mt-6 flex items-center gap-4">
                <div className="flex items-center gap-0.5">
                  {[0,1,2,3,4].map(i => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <div className="text-sm text-slate-400">
                  <span className="font-bold text-white">4.9/5</span> · <span className="underline">127 clientes felices</span>
                </div>
              </div>

              {/* CTAs */}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/gang-sheet"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-semibold px-6 py-3 shadow-lg shadow-orange-500/25 transition-all hover:scale-105"
                >
                  <Layers className="h-4 w-4" />{landing.ctaText || 'Cotiza tu diseño'}
                </Link>
                <Link
                  href="/tienda"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 hover:bg-white/10 text-white font-semibold px-6 py-3 backdrop-blur transition-colors"
                >
                  Ver catálogo <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Micro-benefits inline */}
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400">
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Sin mínimo de compra</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Auto-mejora IA a 300 DPI</div>
                <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />Preview antes de imprimir</div>
              </div>
            </div>

            {/* RIGHT — hero image */}
            <div className="relative">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 aspect-[4/5] max-w-md mx-auto lg:max-w-none">
                <Image
                  src={IMG_HERO}
                  alt="Impresión DTF en Estampados DLV"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
                {/* Overlay gradient para legibilidad */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent" />

                {/* Testimonial flotante */}
                <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-white/95 backdrop-blur p-4 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-400 to-rose-500 flex items-center justify-center text-white font-bold text-sm">
                      CR
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {[0,1,2,3,4].map(i => (
                          <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <p className="text-xs text-slate-900 line-clamp-2 mt-0.5">
                        “La calidad supera al vinilo. Voy por mi 8vo pedido.”
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">— Camila R., emprendedora</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating stat card */}
              <div className="hidden lg:block absolute -top-4 -left-6 rounded-xl bg-white p-3 shadow-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Garantía</div>
                    <div className="text-sm font-bold text-slate-900">100% reimpresión</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================ TRUST BAR ================ */}
      <section className="border-b border-slate-200 bg-white">
        <div className="container py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
            <TrustBadge icon={Truck}       title="Chilexpress + Starken" subtitle="Despacho 24-48h a todo Chile" />
            <TrustBadge icon={Wallet}      title="WebPay + MercadoPago"   subtitle="Pago seguro con Transbank" />
            <TrustBadge icon={ShieldCheck} title="Facturación electrónica" subtitle="SII · Boleta o factura" />
            <TrustBadge icon={Heart}       title="+127 clientes felices"   subtitle="4.9/5 en Google Reviews" />
          </div>
        </div>
      </section>

      {/* ================ BODY (SEO content) ================ */}
      {paragraphs.length > 0 && (
        <section className="container py-16 md:py-20 max-w-3xl">
          <div className="prose prose-slate prose-lg max-w-none">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-slate-700 leading-relaxed mb-5">{p}</p>
            ))}
          </div>
        </section>
      )}

      {/* ================ FEATURES / WHY US ================ */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-16 md:py-20 border-y border-slate-100">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-3 py-1 text-xs font-semibold mb-3">
              <Sparkles className="h-3 w-3" />¿Por qué Estampados DLV?
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
              Estampados premium hechos en {cityLabel}
            </h2>
            <p className="mt-3 text-slate-600">
              Somos el taller DTF de referencia en la Región de Valparaíso. Combinamos maquinaria industrial, arte digital
              y atención personalizada para entregarte una experiencia sin fricción.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard icon={Award}   from="from-amber-500"  to="to-orange-600" title="Calidad premium 300 DPI"
              desc="Impresión a máxima resolución con canal blanco de alta densidad. Colores vibrantes y detalles finos, incluso en telas oscuras." />
            <FeatureCard icon={Truck}   from="from-emerald-500" to="to-teal-600" title="Despacho 24-48h a todo Chile"
              desc="Producción exprés y despacho por Chilexpress o Starken con tracking en tiempo real. Retiro gratis en Quilpué." />
            <FeatureCard icon={Zap}     from="from-fuchsia-500" to="to-indigo-600" title="Cotiza en línea al instante"
              desc="Editor visual que valida DPI y calcula tu precio por centímetro impreso. Sube tu diseño y ve el resultado antes de pagar." />
          </div>
        </div>
      </section>

      {/* ================ HOW IT WORKS ================ */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 text-fuchsia-700 px-3 py-1 text-xs font-semibold mb-3">
              <Palette className="h-3 w-3" />Cómo funciona
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
              De tu idea a tu prenda estampada en 4 pasos
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={i} className="relative group">
                <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 hover:border-orange-300 hover:shadow-lg transition-all">
                  <div className="text-xs font-mono font-bold text-slate-400">{s.step}</div>
                  <div className="mt-3 h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-md">
                    <s.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="mt-4 font-bold text-slate-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{s.desc}</p>
                </div>
                {/* Arrow connector desktop */}
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-2 -translate-y-1/2 text-slate-300">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================ SHOWCASE GRID (image + copy) ================ */}
      <section className="bg-slate-900 text-white py-16 md:py-20">
        <div className="container grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="relative aspect-square rounded-2xl overflow-hidden ring-1 ring-white/10">
            <Image src={IMG_RESULT} alt="Resultado impresión DTF" fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 px-3 py-1 text-xs font-semibold mb-3">
              <Package className="h-3 w-3" />Sin mínimo · Desde 1 pieza
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Colores vibrantes, tacto suave, durabilidad extrema
            </h2>
            <p className="mt-4 text-slate-300 leading-relaxed">
              Nuestros equipos Prestige R2 Pro y Epson R1390 imprimen con tinta de sublimación y canal blanco
              de alta opacidad. El resultado: estampados que no se cuartean, no pierden color al lavar y se sienten
              parte de la tela.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {[
                'Funciona en algodón, poliéster y mezclas',
                'Ideal para telas oscuras y colores intensos',
                'Detalles finos y degradados perfectos',
                'Resistente a +50 ciclos de lavado',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-slate-200">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ================ FEATURED PRODUCTS ================ */}
      {featured.length > 0 && (
        <section className="container py-16 md:py-20">
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 px-3 py-1 text-xs font-semibold mb-3">
                <Star className="h-3 w-3 fill-indigo-500 text-indigo-500" />Productos destacados
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
                Lo más pedido en {cityLabel}
              </h2>
            </div>
            <Link href="/tienda" className="hidden md:inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700">
              Ver todos <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featured.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {/* ================ TESTIMONIALS ================ */}
      <section className="bg-slate-50 py-16 md:py-20 border-y border-slate-100">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-xs font-semibold mb-3">
              <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />Lo que dicen nuestros clientes
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
              4.9 / 5 en 127 pedidos
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed text-sm flex-1">“{t.text}”</p>
                <div className="mt-4 flex items-center gap-3 pt-4 border-t border-slate-100">
                  <div className={`h-10 w-10 rounded-full bg-gradient-to-br shadow-sm flex items-center justify-center text-white font-bold text-sm ${
                    i === 0 ? 'from-orange-400 to-rose-500' : i === 1 ? 'from-blue-400 to-indigo-500' : 'from-emerald-400 to-teal-500'
                  }`}>
                    {t.name.split(' ').map(p => p[0]).slice(0,2).join('')}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================ FAQ ================ */}
      <section className="container py-16 md:py-20 max-w-3xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold mb-3">
            <MessageCircle className="h-3 w-3" />Preguntas frecuentes
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">
            Todo lo que necesitas saber
          </h2>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-b border-slate-200">
              <AccordionTrigger className="text-left text-base font-semibold text-slate-900 hover:text-orange-600">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-slate-600 leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ================ FINAL CTA ================ */}
      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 p-10 md:p-16 text-white text-center shadow-2xl">
          {/* Decorative shapes */}
          <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex h-14 w-14 rounded-2xl bg-white/20 backdrop-blur border border-white/30 items-center justify-center mx-auto">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <h3 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight max-w-xl mx-auto leading-tight">
              ¿Listo para estampar en {cityLabel}?
            </h3>
            <p className="mt-3 text-white/95 max-w-xl mx-auto text-lg">
              Sube tu diseño al editor y recibe tu cotización al instante. Producción en 24-48h.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/gang-sheet"
                className="inline-flex items-center gap-2 rounded-lg bg-white text-rose-600 hover:bg-white/95 font-bold px-8 py-4 shadow-xl transition-all hover:scale-105"
              >
                <Layers className="h-5 w-5" />{landing.ctaText || 'Cotiza tu diseño ahora'}
              </Link>
              <a
                href="https://wa.me/56912345678?text=Hola%2C%20quiero%20cotizar%20un%20estampado%20DTF"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-4 shadow-xl transition-all hover:scale-105"
              >
                <MessageCircle className="h-5 w-5" />WhatsApp
              </a>
            </div>
            <div className="mt-6 text-xs text-white/80 flex flex-wrap justify-center gap-x-6 gap-y-1">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Respuesta &lt; 1h en horario hábil</span>
              <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" />100% satisfacción o reimprimimos gratis</span>
            </div>
          </div>
        </div>
      </section>

      {/* ================ FLOATING WHATSAPP ================ */}
      <a
        href="https://wa.me/56912345678?text=Hola%2C%20quiero%20cotizar%20un%20estampado%20DTF"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg flex items-center justify-center transition-all hover:scale-110 animate-pulse-slow"
      >
        <MessageCircle className="h-6 w-6" />
      </a>
    </>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------
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
    <div className="group relative rounded-2xl border border-slate-200 bg-white p-6 hover:border-transparent hover:shadow-xl hover:-translate-y-1 transition-all">
      <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${from} ${to} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="mt-5 font-bold text-slate-900 text-lg">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">{desc}</p>
    </div>
  );
}

