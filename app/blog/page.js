// Blog SEO — listado de artículos. Estático (sin DB) para máxima velocidad y crawl de Google.
import Link from 'next/link';
import Script from 'next/script';
import { CalendarDays, ArrowRight, Tag } from 'lucide-react';
import { articles } from '@/lib/blog-data';
export const metadata = {
  title: 'Blog · Guías de estampado DTF, poleras personalizadas y más',
  description:
    'Blog de Estampados DLV: guías de estampado DTF textil y DTF UV, poleras personalizadas, gang sheets, mockups gratis, servicios en Quilpué, Villa Alemana, Valparaíso y Viña del Mar, y el concurso de premios.',
  alternates: { canonical: 'https://estampadosdlv.com/blog' },
};
export default function BlogIndex() {
  return (
    <div>
      <Script
        id="blog-listing-jsonld"
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: articles.map((a, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              item: {
                '@type': 'Article',
                '@id': `https://estampadosdlv.com/blog/${a.slug}`,
                name: a.title,
                description: a.description,
              },
            })),
          }),
        }}
      />
      <section className="bg-gradient-to-br from-slate-950 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-14">
          <h1 className="text-3xl md:text-4xl font-bold">Blog · Guías de estampado en Chile</h1>
          <p className="mt-3 text-slate-300 max-w-2xl">
            Todo lo que necesitas saber sobre impresión DTF textil y DTF UV, poleras personalizadas,
            gang sheets, mockups gratuitos y el servicio de Estampados DLV en Quilpué, Villa Alemana,
            Valparaíso, Viña del Mar y todo Chile.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-400">
            <Tag className="h-4 w-4" />
            Cotiza tus estampados al WhatsApp +56 9 5416 9052
          </p>
        </div>
      </section>
      <section className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {articles.map(a => (
            <Link
              key={a.slug}
              href={`/blog/${a.slug}`}
              className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-orange-400 hover:shadow-lg transition-all"
            >
              <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">
                {a.category}
              </div>
              <h2 className="mt-3 font-bold text-slate-900 group-hover:text-orange-600 transition-colors leading-snug">
                {a.title}
              </h2>
              <p className="mt-2 text-sm text-slate-500 line-clamp-3">{a.description}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {a.date}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-orange-600">
                  Leer <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-12 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 p-8 text-center text-white shadow-xl shadow-orange-500/20">
          <h2 className="text-xl md:text-2xl font-bold">¿Listo para estampar tus ideas?</h2>
          <p className="mt-2 text-white/90 max-w-xl mx-auto">
            Poleras, polerones, gorras y merchandising con tu diseño. Cotización inmediata por WhatsApp.
          </p>
          <a
            href="https://wa.me/56954169052"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-orange-600 hover:bg-orange-50 transition-colors"
          >
            Escribir al +56 9 5416 9052
          </a>
        </div>
      </section>
    </div>
  );
}
