// Server component — /concurso — Página festiva de concurso:
//   - Hero festivo con imagen de celebración y confetti CSS animado
//   - Premios con imágenes reales (polerón, polera, gorra estampados)
//   - Formulario de participación (ContestForm)
//   - Sección de personas felices ganando
//   - Countdown grande y llamativo
//   - Se oculta automáticamente (404) cuando no hay sorteo activo
import { ContestForm } from '@/components/contest-form';
import { ContestCountdown } from '@/components/contest-countdown';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, ArrowRight, Gift, CalendarDays } from 'lucide-react';
import { BUSINESS } from '@/lib/constants/business';
import { notFound } from 'next/navigation';

export const metadata = (() => {
  const metaUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '') || 'https://estampadosdlv.com';
  return {
  title: `Concurso: Gana premios con tu diseño · ${BUSINESS.name}`,
  description: `Participa y gana un polerón, polera o gorra personalizada estampada. ¡3 premios increíbles! Registro gratis, envío a todo Chile.`,
  openGraph: {
    title: `Concurso: Gana premios con tu diseño · ${BUSINESS.name}`,
    description: 'Participa gratis y gana un polerón, polera o gorra personalizada. ¡3 premios increíbles!',
    url: `${metaUrl}/concurso`,
    siteName: BUSINESS.name,
    locale: 'es_CL',
    type: 'website',
    images: [
      {
        url: `${metaUrl}/uploads/contest/og-concurso.jpg`,
        width: 1200,
        height: 630,
        alt: 'Concurso Estampados DLV: gana un polerón, polera o gorra personalizada',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Concurso: Gana premios con tu diseño · ${BUSINESS.name}`,
    description: 'Participa gratis y gana un polerón, polera o gorra personalizada. ¡3 premios increíbles!',
    images: [`${metaUrl}/uploads/contest/og-concurso.jpg`],
  },
};
})();

export default async function ConcursoPage() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, '') || 'https://estampadosdlv.com';
    const res = await fetch(`${baseUrl}/api/marketing/contest`, {
      // Revalidate cada 60s: mantiene la página casi en tiempo real pero permite
      // que Next emita las metadata del page en el <head> estático del HTML
      // (los scrapers de WhatsApp/Facebook solo leen HTML estático).
      next: { revalidate: 60 },
    });
    const data = await res.json();
    if (!data.contest || data.contest.status !== 'active') {
      notFound();
    }
  } catch {
    notFound();
  }

  return (
    <>
      {/* ===== CONCURSO: fondo festivo propio (no depende del layout) ===== */}
      <div className="min-h-screen bg-[#1a0533] text-white relative overflow-hidden">
        {/* Confetti CSS animado */}
        <div className="confetti-layer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 28 }).map((_, i) => (
            <span
              key={i}
              className="confetti-piece absolute -top-8"
              style={{
                left: `${(i * 37) % 100}%`,
                animationDelay: `${(i * 0.7) % 6}s`,
                animationDuration: `${6 + ((i * 3) % 6)}s`,
                background: ['#ff6b35', '#ffd700', '#ff2e93', '#38bdf8', '#a855f7', '#22c55e'][i % 6],
                opacity: 0.55,
              }}
            />
          ))}
        </div>
        {/* Brillos de fondo */}
        <div className="pointer-events-none absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-orange-500/25 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -left-40 h-[500px] w-[500px] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-amber-500/15 blur-3xl" />

        {/* ===== HERO FESTIVO ===== */}
        <section className="relative pt-14 md:pt-20 pb-10 px-4">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
            <div className="text-center md:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-amber-400/40 px-4 py-2 mb-6 shadow-lg shadow-orange-500/20">
                <Sparkles className="h-4 w-4 text-amber-300" />
                <span className="text-amber-200 text-sm font-bold">CONCURSO · QUILPUÉ, CHILE</span>
              </div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05]">
                ¡Gana{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 drop-shadow-lg">
                  premios
                </span>
                <br />
                con tu diseño!
              </h1>
              <p className="mt-6 text-lg md:text-xl text-white/80 max-w-xl">
                Participa gratis y gana hasta{' '}
                <span className="text-amber-300 font-bold">3 premios increíbles</span> de Estampados DLV.
                ¡Tú eliges el diseño que queremos estampar para ti!
              </p>

              {/* Countdown grande */}
              <CountdownBlock />

              <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-3">
                <a
                  href="#participar"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-zinc-900 font-extrabold px-8 py-4 text-lg shadow-xl shadow-orange-500/30 transition-all hover:scale-105 animate-pulse-slow"
                >
                  <Gift className="h-6 w-6" /> ¡Quiero participar!
                </a>
                <Link
                  href="/tienda"
                  className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 hover:bg-white/10 text-white font-bold px-6 py-4 transition-colors"
                >
                  Ver la tienda <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>

            {/* Imagen hero ganadora */}
            <div className="relative mx-auto w-full max-w-md md:max-w-none">
              <div className="absolute -inset-4 bg-gradient-to-tr from-orange-500/40 via-fuchsia-500/30 to-amber-400/40 rounded-[2.5rem] blur-2xl" />
              <Image
                src="/uploads/contest/hero-ganador.png"
                alt="Persona feliz ganando el concurso de Estampados DLV con su polerón estampado"
                width={900}
                height={1200}
                priority
                className="relative rounded-[2rem] w-full shadow-2xl border-4 border-white/15 rotate-1 hover:rotate-0 transition-transform duration-500 object-cover"
              />
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white text-zinc-900 font-extrabold px-6 py-2 rounded-full shadow-xl text-sm flex items-center gap-2 rotate-[-2deg]">
                <CalendarDays className="h-4 w-4 text-orange-500" /> Sorteo hasta el 12 de noviembre
              </div>
            </div>
          </div>
        </section>

        {/* ===== PREMIOS CON IMÁGENES ===== */}
        <section className="relative py-14 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-4xl md:text-5xl font-black">
                🎁 <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400">3 premios increíbles</span>
              </h2>
              <p className="mt-3 text-white/70 text-lg">¡Todos participan por los 3 premios!</p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <PrizeCard
                img="/uploads/contest/premio-poleron.png"
                rank="1er Lugar"
                prize="Polerón personalizado"
                desc="Un polerón estampado con tu diseño"
                gradient="from-yellow-400 to-amber-500"
                accent="ring-amber-400/50"
              />
              <PrizeCard
                img="/uploads/contest/premio-polera.png"
                rank="2do Lugar"
                prize="Polera personalizada"
                desc="Una polera estampada con tu diseño"
                gradient="from-fuchsia-400 to-purple-500"
                accent="ring-fuchsia-400/50"
              />
              <PrizeCard
                img="/uploads/contest/premio-gorra.png"
                rank="3er Lugar"
                prize="Gorra personalizada"
                desc="Una gorra estampada con tu diseño"
                gradient="from-orange-400 to-red-500"
                accent="ring-orange-400/50"
              />
            </div>
          </div>
        </section>

        {/* ===== FORMULARIO DE PARTICIPACIÓN ===== */}
        <section id="participar" className="relative py-14 px-4">
          <div className="max-w-3xl mx-auto">
            <ContestForm />
          </div>
        </section>

        {/* ===== PERSONAS FELICES ===== */}
        <section className="relative py-14 px-4">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 items-center">
            <div className="relative mx-auto w-full max-w-lg order-2 md:order-1">
              <div className="absolute -inset-4 bg-gradient-to-bl from-amber-500/40 via-rose-500/30 to-fuchsia-500/40 rounded-[2rem] blur-2xl" />
              <Image
                src="/uploads/contest/celebracion-grupo.png"
                alt="Personas felices celebrando que ganaron el concurso con sus premios estampados"
                width={1200}
                height={800}
                loading="lazy"
                className="relative rounded-[1.5rem] w-full shadow-2xl border-4 border-white/15 -rotate-1 hover:rotate-0 transition-transform duration-500 object-cover"
              />
            </div>
            <div className="text-center md:text-left order-1 md:order-2">
              <h2 className="text-4xl md:text-5xl font-black leading-tight">
                Tu nombre puede estar<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-300">aquí arriba 🏆</span>
              </h2>
              <p className="mt-5 text-white/80 text-lg">
                Cada mes anunciamos a los ganadores en nuestras redes sociales. Los premios se estampan
                con el diseño que tú quieras: un logo, un nombre, tu personaje favorito… ¡lo que imagines!
              </p>
              <a
                href="#participar"
                className="inline-flex items-center gap-2 mt-7 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 font-extrabold px-8 py-4 text-lg transition-all hover:scale-105"
              >
                Participar en el concurso <ArrowRight className="h-5 w-5 text-amber-300" />
              </a>
            </div>
          </div>
        </section>

        {/* ===== CTA FINAL ===== */}
        <section className="relative pb-20 px-4">
          <div className="max-w-3xl mx-auto rounded-[2rem] bg-gradient-to-r from-fuchsia-600/30 via-orange-600/30 to-amber-500/30 border border-white/15 p-8 md:p-10 text-center backdrop-blur-sm">
            <h3 className="text-2xl md:text-3xl font-black text-white mb-2">¿No quieres esperar al sorteo?</h3>
            <p className="text-white/80 mb-6 text-lg">
              Crea tu mockup gratis ahora mismo y compra tu prenda personalizada hoy.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/mockup"
                className="inline-flex items-center gap-2 rounded-full bg-white text-fuchsia-700 hover:bg-white/95 font-extrabold px-8 py-4 shadow-xl transition-all hover:scale-105"
              >
                Crear mockup gratis
              </Link>
              <Link
                href="/tienda"
                className="inline-flex items-center gap-2 rounded-full border-2 border-white/40 hover:bg-white/10 text-white font-bold px-8 py-4 transition-colors"
              >
                Ver tienda <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Estilos de confetti animado */}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.4; }
        }
        .confetti-piece {
          width: 10px; height: 14px; border-radius: 2px;
          animation: confetti-fall linear infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .animate-pulse-slow { animation: pulse-slow 2.2s ease-in-out infinite; }
      `}</style>
    </>
  );
}

/* ---------- Countdown grande ---------- */
function CountdownBlock() {
  return <ContestCountdown />;
}

/* ---------- Card de premio con imagen ---------- */
function PrizeCard({ img, rank, prize, desc, gradient, accent }) {
  return (
    <div className={`group relative rounded-[2rem] bg-white/[0.04] border border-white/10 p-6 pt-8 text-center backdrop-blur-sm hover:border-white/25 transition-all hover:-translate-y-2 duration-300`}>
      <div className={`absolute -top-5 left-1/2 -translate-x-1/2 bg-gradient-to-r ${gradient} text-zinc-900 font-extrabold text-sm px-5 py-1.5 rounded-full shadow-lg`}>
        {rank}
      </div>
      <div className={`mx-auto mb-4 w-48 h-48 md:w-56 md:h-56 rounded-full overflow-hidden ring-4 ${accent} bg-white/5 flex items-center justify-center`}>
        <Image src={img} alt={prize} width={260} height={260} loading="lazy" className="w-full h-full object-contain p-2 group-hover:scale-110 transition-transform duration-500" />
      </div>
      <h3 className="text-xl md:text-2xl font-black text-white">{prize}</h3>
      <p className="text-white/60 text-sm mt-1">{desc}</p>
    </div>
  );
}
