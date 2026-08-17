// Blog SEO — página de artículo estática (generateStaticParams) con metadata por artículo,
// contenido optimizado y FAQ con datos estructurados FAQPage para Google.
import Link from 'next/link';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import { ArrowLeft, MessageCircle, Tag, CalendarDays } from 'lucide-react';
import { articles, getArticle, getArticleJsonLd, WHATSAPP_LINK } from '@/lib/blog-data';

export function generateStaticParams() {
  return articles.map(a => ({ slug: a.slug }));
}

export function generateMetadata({ params }) {
  const article = getArticle(params.slug);
  if (!article) return { title: 'Artículo no encontrado' };
  return {
    title: article.title,
    description: article.description,
    keywords: article.keywords.join(', '),
    alternates: { canonical: `https://estampadosdlv.com/blog/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.description,
      type: 'article',
      url: `https://estampadosdlv.com/blog/${article.slug}`,
      siteName: 'Estampados DLV',
    },
  };
}

export default function ArticlePage({ params }) {
  const article = getArticle(params.slug);
  if (!article) notFound();
  const index = articles.findIndex(a => a.slug === article.slug);
  const others = articles.filter(a => a.slug !== article.slug).slice(0, 3);
  return (
    <div>
      <Script
        id={`jsonld-${article.slug}`}
        type="application/ld+json"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getArticleJsonLd(article)) }}
      />
      <section className="bg-gradient-to-br from-slate-950 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-10">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300">
            <ArrowLeft className="h-4 w-4" /> Volver al blog
          </Link>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-semibold text-orange-300">
            <Tag className="h-3 w-3" /> {article.category}
          </div>
          <h1 className="mt-3 text-2xl md:text-4xl font-bold leading-tight max-w-3xl">{article.title}</h1>
          <p className="mt-3 text-slate-300 max-w-2xl">{article.description}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400">
            <CalendarDays className="h-3 w-3" /> {article.date} · Estampados DLV · Quilpué, Chile
          </p>
        </div>
      </section>
      <article className="container mx-auto px-4 py-10 max-w-3xl">
        {article.sections.map((s, i) => (
          <div key={i} className="mb-8">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">{s.h}</h2>
            <p className="mt-3 text-slate-600 leading-relaxed">{s.p}</p>
          </div>
        ))}
        <div className="my-8 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 p-6 text-center text-white">
          <p className="font-bold text-lg">¿Quieres estampar este producto?</p>
          <p className="mt-1 text-white/90 text-sm">Cotiza ahora y recibe tu pedido en 2 a 5 días hábiles en todo Chile.</p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-orange-600 hover:bg-orange-50 transition-colors"
          >
            <MessageCircle className="h-4 w-4" /> Escribir al +56 9 5416 9052
          </a>
        </div>
        <div className="mt-10">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900">Preguntas frecuentes</h2>
          <div className="mt-4 space-y-3">
            {article.faq.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold text-slate-900 flex gap-2">
                  <span className="text-orange-500 shrink-0">Q.</span> {f.q}
                </h3>
                <p className="mt-2 text-sm text-slate-600 pl-6">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </article>
      <section className="container mx-auto px-4 pb-14 max-w-3xl">
        <h2 className="text-lg font-bold text-slate-900 mb-4">También te puede interesar</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {others.map(o => (
            <Link key={o.slug} href={`/blog/${o.slug}`} className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-orange-400 hover:shadow-md transition-all">
              <div className="text-xs font-semibold text-orange-600">{o.category}</div>
              <div className="mt-1 text-sm font-bold text-slate-900 group-hover:text-orange-600 transition-colors leading-snug">{o.title}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
