// Server component — /concurso — Página de concurso público con:
//   - Hero con los 3 premios (Polerón, Polera, Gorra)
//   - Formulario de participación
//   - Countdown hasta el cierre del concurso
//   - Bases del concurso
import { ContestForm } from '@/components/contest-form';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { BUSINESS } from '@/lib/constants/business';

export const metadata = {
  title: `Concurso: Gana premios con tu diseño · ${BUSINESS.name}`,
  description: `Participa y gana un polerón, polera o gorra personalizada estampada. ¡3 premios increíbles! Registro gratis, envío a todo Chile.`,
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/concurso`.replace(/\/+/g, '/').replace(':/', '://'),
  },
  openGraph: {
    title: `Concurso: Gana premios con tu diseño · ${BUSINESS.name}`,
    description: 'Participa gratis y gana un polerón, polera o gorra personalizada. ¡3 premios increíbles!',
    locale: 'es_CL',
    type: 'website',
  },
};

export default function ConcursoPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-red-500/20 blur-3xl" />
        <div className="relative text-center max-w-3xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 border border-orange-500/30 px-4 py-2 mb-6">
            <Sparkles className="h-4 w-4 text-orange-400" />
            <span className="text-orange-300 text-sm font-semibold">Concurso · Quilpué, Chile</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-tight">
            ¡Gana premios con<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500">tu diseño!</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
            Participa gratis y gana hasta <span className="text-orange-400 font-bold">3 premios increíbles</span> de Estampados DLV. ¡Tú eliges el diseño que queremos estampar para ti!
          </p>
        </div>
      </section>

      {/* Formulario y premios */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          <ContestForm />
        </div>
      </section>

      {/* CTA final */}
      <section className="pb-16 px-4">
        <div className="max-w-3xl mx-auto rounded-2xl bg-gradient-to-r from-rose-900/40 to-orange-900/40 border border-white/10 p-8 text-center">
          <h3 className="text-2xl font-bold text-white mb-2">¿No quieres esperar al sorteo?</h3>
          <p className="text-white/70 mb-6">Puedes crear tu mockup gratis ahora mismo y comprar tu prenda personalizada hoy.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/mockup"
              className="inline-flex items-center gap-2 rounded-lg bg-white text-rose-600 hover:bg-white/95 font-bold px-6 py-3 shadow-xl transition-all hover:scale-105"
            >
              Crear mockup gratis
            </Link>
            <Link
              href="/tienda"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-white/40 hover:bg-white/10 text-white font-bold px-6 py-3 transition-colors"
            >
              Ver tienda <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer SEO links */}
      <footer className="border-t border-white/10 py-4 text-center">
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-white/40">
          <Link href="/" className="hover:text-white/70 transition-colors">Inicio</Link>
          <Link href="/tienda" className="hover:text-white/70 transition-colors">Tienda</Link>
          <Link href="/mockup" className="hover:text-white/70 transition-colors">Editor de Mockups</Link>
          <Link href="/gang-sheet" className="hover:text-white/70 transition-colors">Gang Sheet Builder</Link>
          <Link href="/servicios" className="hover:text-white/70 transition-colors">Servicios DTF</Link>
          <Link href="/contacto" className="hover:text-white/70 transition-colors">Contacto</Link>
        </nav>
      </footer>
    </>
  );
}
