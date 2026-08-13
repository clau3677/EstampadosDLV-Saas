// Página raíz — Server Component con SEO propio
// Ya no redirige a /tienda. Ahora es una landing page con contenido SEO-rich
// que captura tráfico de búsquedas generales como "DTF Chile", "estampados DTF"

import { Suspense } from 'react';
import { getPublicProducts } from '@/lib/server/store-data';
import { BUSINESS } from '@/lib/constants/business';
import Image from 'next/image';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

export const metadata = {
  title: 'Estampados DLV · Impresión DTF y DTF UV en Quilpué, Valparaíso, Chile',
  description:
    'Estampados DLV es un taller profesional de impresión DTF y DTF UV en Quilpué, Valparaíso. ' +
    'Impresión textil a 300 DPI, poleras, polerones, gorras y merchandising personalizado. ' +
    'Despacho 24-48h a todo Chile. Tres líneas de producción activas.',
  alternates: { canonical: BASE },
  openGraph: {
    title: 'Estampados DLV · Impresión DTF y DTF UV en Chile',
    description:
      'Taller profesional de impresión DTF y DTF UV en Quilpué, Valparaíso. ' +
      'Poleras, polerones, gorras y merchandising personalizado con despacho a todo Chile.',
    url: BASE,
    siteName: BUSINESS.name,
    locale: 'es_CL',
    type: 'website',
    images: [
      {
        url: `${BASE}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Estampados DLV - Impresión DTF profesional en Chile',
      },
    ],
  },
};

// JSON-LD completo con WebSite, Organization y LocalBusiness
function buildPageJsonLd(products) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BUSINESS.name,
      url: BASE,
      description: 'Estampados DLV — Impresión DTF y DTF UV profesional en Chile.',
      inLanguage: 'es-CL',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${BASE}/tienda?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: BUSINESS.name,
      url: BASE,
      logo: `${BASE}/logo.png`,
      telephone: BUSINESS.phone.intl,
      email: BUSINESS.email.primary,
      address: {
        '@type': 'PostalAddress',
        streetAddress: `${BUSINESS.address.street}, ${BUSINESS.address.unit}`,
        addressLocality: BUSINESS.address.city,
        addressRegion: BUSINESS.address.region,
        postalCode: '2430000',
        addressCountry: BUSINESS.address.countryCode,
      },
      sameAs: [
        'https://www.facebook.com/estampadosdlv',
        'https://www.instagram.com/estampadosdlv',
        'https://www.tiktok.com/@estampadosdlv',
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `${BASE}/#business`,
      name: BUSINESS.name,
      description:
        'Taller de impresión DTF y DTF UV profesional en Quilpué, Valparaíso, Chile. ' +
        'Impresión textil a 300 DPI, poleras, polerones, gorras y merchandising personalizado.',
      url: BASE,
      telephone: BUSINESS.phone.intl,
      email: BUSINESS.email.primary,
      address: {
        '@type': 'PostalAddress',
        streetAddress: `${BUSINESS.address.street}, ${BUSINESS.address.unit}`,
        addressLocality: BUSINESS.address.city,
        addressRegion: BUSINESS.address.region,
        postalCode: '2430000',
        addressCountry: BUSINESS.address.countryCode,
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: '-33.0472',
        longitude: '-71.4426',
      },
      priceRange: '$$',
      openingHours: 'Mo-Fr 09:00-18:00, Sa 09:00-14:00',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Servicios de impresión DTF',
        itemListElement: [
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Impresión DTF Textiles' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Impresión DTF UV' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Prendas personalizadas' } },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Gang Sheet (Arma tu pliego)' } },
        ],
      },
      sameAs: [
        'https://www.facebook.com/estampadosdlv',
        'https://www.instagram.com/estampadosdlv',
        'https://www.tiktok.com/@estampadosdlv',
      ],
    },
  ];
}

export default async function HomePage() {
  const products = await getPublicProducts().catch(() => []);
  const featuredProducts = (products || []).slice(0, 6);
  const jsonLd = buildPageJsonLd(products);

  return (
    <>
      {jsonLd.map((obj, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }}
        />
      ))}

      <main className="min-h-screen">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 text-white">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-yellow-300 rounded-full blur-3xl" />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium">Tres líneas de producción activas</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
                Impresión <span className="text-yellow-300">DTF</span> y <span className="text-yellow-300">DTF UV</span> profesional en Chile
              </h1>
              <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl">
                Estampados DLV es tu taller de impresión DTF en Quilpué, Valparaíso. 
                Impresión textil a 300 DPI con colores vibrantes, máxima durabilidad y 
                despacho 24-48h a todo Chile. Poleras, polerones, gorras y merchandising personalizado.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link href="/tienda" className="inline-flex items-center gap-2 bg-white text-orange-600 font-bold px-8 py-4 rounded-xl hover:bg-yellow-50 transition-all shadow-lg hover:shadow-xl text-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
                  Ver catálogo
                </Link>
                <Link href="/gang-sheet" className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm border-2 border-white/40 text-white font-bold px-8 py-4 rounded-xl hover:bg-white/30 transition-all text-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  Sube tu diseño
                </Link>
                <Link href="/mockup" className="inline-flex items-center gap-2 bg-yellow-400 text-gray-900 font-bold px-8 py-4 rounded-xl hover:bg-yellow-300 transition-all shadow-lg hover:shadow-xl text-lg">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                  Crea tu mockup gratis
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* SERVICIOS PRINCIPALES */}
        <section className="py-16 md:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Nuestros servicios de impresión DTF</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Tres tecnologías de impresión profesional para llevar tus diseños a la máxima calidad.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {/* DTF Textiles */}
              <div className="group bg-gradient-to-br from-orange-50 to-white border-2 border-orange-100 rounded-2xl p-8 hover:shadow-xl transition-all">
                <div className="w-14 h-14 bg-orange-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Impresión DTF Textiles</h3>
                <p className="text-gray-600 mb-4">
                  Impresión directa a film con colores vibrantes full color. Ideal para poleras, polerones, gorras y cualquier textil. 
                  Apto para algodón, poliéster, mezclilla y más.
                </p>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />300 DPI de resolución</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />Colores full CMYK + blanco</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />Alta resistencia al lavado</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />Tacto suave y flexible</li>
                </ul>
              </div>

              {/* DTF UV */}
              <div className="group bg-gradient-to-br from-purple-50 to-white border-2 border-purple-100 rounded-2xl p-8 hover:shadow-xl transition-all">
                <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Impresión DTF UV</h3>
                <p className="text-gray-600 mb-4">
                  Impresión UV de alta definición sobre superficies rígidas. Ideal para llaveros, vasos, 
                  teléfonos, botellas y todo tipo de materiales no textiles.
                </p>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-purple-600 rounded-full" />Alta resolución 1440 DPI</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-purple-600 rounded-full" />Efecto 3D con relieve</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-purple-600 rounded-full" />Acabado brillante o mate</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-purple-600 rounded-full" />Resistente a rayaduras</li>
                </ul>
              </div>

              {/* Gang Sheet */}
              <div className="group bg-gradient-to-br from-blue-50 to-white border-2 border-blue-100 rounded-2xl p-8 hover:shadow-xl transition-all">
                <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Arma tu Pliego (Gang Sheet)</h3>
                <p className="text-gray-600 mb-4">
                  Sube tus diseños y arma tu pliego de impresión DTF por metro lineal. 
                  Optimiza el espacio y ahorra en costos de producción.
                </p>
                <ul className="space-y-2 text-sm text-gray-500">
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />Editor visual online</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />Precarga automática</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />Por metro lineal (30cm)</li>
                  <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />Precios desde $6.000/m</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* POR QUÉ ELEGIRNOS */}
        <section className="py-16 md:py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">¿Por qué elegir Estampados DLV?</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Más que un taller de impresión, somos tu socio de producción textil en Quilpué.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { icon: '⚡', title: 'Entrega express', desc: 'Despacho 24-48h a todo Chile. Producción en 1-2 días hábiles.' },
                { icon: '🎨', title: 'Colores vibrantes', desc: 'Impresión a 300 DPI con colores full CMYK + tinta blanca de alta opacidad.' },
                { icon: '🏭', title: '3 líneas de producción', desc: 'Dos impresoras DTF textiles y una DTF UV trabajando en paralelo.' },
                { icon: '💰', title: 'Precios mayoristas', desc: 'Descuentos por volumen. Ideal para marcas de ropa, gimnasios y empresas.' },
              ].map((item, i) => (
                <div key={i} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="text-3xl mb-3">{item.icon}</div>
                  <h3 className="font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRODUCTOS DESTACADOS */}
        {featuredProducts.length > 0 && (
          <section className="py-16 md:py-20 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Productos más vendidos</h2>
                  <p className="text-gray-600">Prendas y servicios listos para estampar.</p>
                </div>
                <Link href="/tienda" className="text-orange-600 font-semibold hover:text-orange-700 flex items-center gap-1">
                  Ver todos
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </Link>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {featuredProducts.map((product) => {
                  const imageUrl = product.images?.[0]
                    ? (product.images[0].startsWith('http') ? product.images[0] : `${BASE}${product.images[0]}`)
                    : null;
                  const price = product.basePrice || product.variants?.[0]?.price || 0;
                  return (
                    <Link key={product._id || product.id} href={`/producto/${product.slug}`} className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-all">
                      <div className="aspect-square bg-gray-100 overflow-hidden">
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={product.name}
                            width={400}
                            height={400}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 33vw"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-orange-600 transition-colors">{product.name}</h3>
                        <p className="text-orange-600 font-bold">${price.toLocaleString('es-CL')}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* NICHOS */}
        <section className="py-16 md:py-20 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Estampados para cada industria</h2>
              <p className="text-lg text-gray-300 max-w-2xl mx-auto">
                Trabajamos con marcas de ropa, gimnasios, empresas y profesionales que necesitan calidad profesional.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { title: 'Marcas de ropa', desc: 'Colecciones completas con tu diseño. Desde 1 unidad hasta producción masiva.', keywords: 'impresión dtf marcas de ropa chile' },
                { title: 'Gimnasios y deporte', desc: 'Uniformes deportivos personalizados con colores vibrantes que no se despintan.', keywords: 'estampados deportivos gimnasio' },
                { title: 'Uniformes corporativos', desc: 'Polos, polerones y buzos para empresas con logo y diseño personalizado.', keywords: 'uniformes corporativos estampados' },
                { title: 'Merchandising y regalos', desc: 'Llaveros, vasos, botellas y más con impresión DTF UV de alta definición.', keywords: 'merchandising personalizado dtf uv' },
              ].map((item, i) => (
                <Link key={i} href="/tienda" className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
                  <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-400">{item.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CONTACTO / CTA */}
        <section className="py-16 md:py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">¿Listo para estampar?</h2>
            <p className="text-lg text-gray-600 mb-8">
              Contáctanos por WhatsApp o ven a nuestro taller en Quilpué. 
              Cotización gratuita en minutos.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a href="https://wa.me/56954169052" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-green-500 text-white font-bold px-8 py-4 rounded-xl hover:bg-green-600 transition-all shadow-lg text-lg">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp
              </a>
              <Link href="/tienda" className="inline-flex items-center gap-2 bg-orange-500 text-white font-bold px-8 py-4 rounded-xl hover:bg-orange-600 transition-all shadow-lg text-lg">
                Ver catálogo completo
              </Link>
            </div>
            <div className="mt-8 text-sm text-gray-500">
              <p>Galleguillos 1870, Casa 1 — Quilpué, Valparaíso, Chile</p>
              <p>Tel: +56 9 5416 9052 · estampadosdlv@gmail.com</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
