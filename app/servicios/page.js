// Server component — hub de servicios de impresión DTF
// Consolidación SEO (ago-2026): hub limpio con 4 pilares de servicio (DTF textil,
// DTF por metro, DTF UV, arma tu pliego) + landings locales y tienda de prendas.
import Link from 'next/link';
import { MapPin, ArrowRight, Printer, Package, Sparkles, LayoutGrid, Shirt } from 'lucide-react';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/models';

export const metadata = {
  title: 'Impresión DTF Textil, DTF UV y Gang Sheet · Estampados DLV Quilpué',
  description: 'Servicios de impresión DTF textil, DTF por metro, DTF UV y gang sheet builder. Impresión en 24-48 hrs en Quilpué con envío a todo Chile.',
  alternates: { canonical: 'https://estampadosdlv.com/servicios' },
};

const PILLARS = [
  {
    icon: Printer,
    href: '/servicios/dtf-textil',
    title: 'DTF Textil',
    tag: 'Impresión DTF textil Chile',
    text: 'Estampa tus diseños sobre poleras, polerones y cualquier textil. Ancho de 30 cm, listo para prensar.',
  },
  {
    icon: Package,
    href: '/servicios/dtf-por-metro',
    title: 'DTF por Metro',
    tag: 'DTF por metro',
    text: 'Paño de 30 cm de ancho vendido por los metros que necesites. Ideal para volumen y producción.',
  },
  {
    icon: Sparkles,
    href: '/servicios/impresion-dtf-uv-chile',
    title: 'DTF UV',
    tag: 'Impresión DTF UV Chile',
    text: 'Impresión UV para superficies rígidas: gorras, tazas, termos, llaveros y merchandising.',
  },
  {
    icon: LayoutGrid,
    href: '/gang-sheet-info',
    title: 'Arma tu Pliego',
    tag: 'Gang Sheet Builder',
    text: 'Crea tu paño de impresión online gratis, optimiza el espacio y nosotros lo imprimimos.',
  },
];

async function fetchLandings() {
  try {
    const db = await getDb();
    return await db.collection(COLLECTIONS.LANDING_PAGES).find({ active: true }).sort({ 'location.city': 1 }).toArray();
  } catch (e) { return []; }
}

export default async function ServiciosIndex() {
  const landings = await fetchLandings();
  return (
    <div>
      {/* HERO HUB */}
      <section className="bg-gradient-to-br from-slate-950 via-orange-950 to-slate-900 text-white">
        <div className="container py-14 md:py-16">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Servicios de impresión DTF
          </h1>
          <p className="mt-3 text-slate-300 max-w-2xl text-lg">
            Impresión DTF textil, DTF UV y gang sheets en Quilpué con envío a todo Chile.
            Elige el servicio que necesitas.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-200">
            <span>Impresión en 24-48 hrs</span>
            <span>·</span><span>Envío nacional</span>
            <span>·</span><span>Retiro en Quilpué</span>
          </div>
        </div>
      </section>

      {/* 4 PILARES DE SERVICIO */}
      <section className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PILLARS.map(p => (
            <Link key={p.href} href={p.href} className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 hover:border-orange-400 hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <p.icon className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <span className="text-xs font-semibold text-orange-600">{p.tag}</span>
                <h2 className="mt-0.5 text-xl font-bold text-slate-900 group-hover:text-orange-600 transition-colors">{p.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{p.text}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 self-center ml-auto shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </section>

      {/* PRODUCTOS → TIENDA */}
      <section className="bg-orange-50 border-y border-orange-100">
        <div className="container py-10">
          <Link href="/tienda" className="group flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div className="flex items-center gap-4">
              <Shirt className="w-10 h-10 text-orange-500" />
              <div>
                <h2 className="text-xl font-bold text-slate-900">¿Buscas prendas o estampados terminados?</h2>
                <p className="text-sm text-slate-600">Poleras, polerones, gorras, hoodies y más en nuestra tienda.</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 font-semibold text-orange-600 group-hover:gap-3 transition-all">
              Ver tienda <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      </section>

      {/* LANDINGS LOCALES */}
      {landings.length > 0 && (
        <section className="container py-12">
          <h2 className="text-2xl font-bold text-slate-900">Cobertura por ciudad</h2>
          <p className="mt-2 text-slate-600 max-w-2xl">
            Detalles del servicio según tu ubicación: retiro en Quilpué y despachos a todo Chile.
          </p>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {landings.map(l => (
              <Link key={l.id} href={`/servicios/${l.slug}`} className="group rounded-xl border border-slate-200 bg-white hover:border-orange-400 hover:shadow-lg transition-all p-5">
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" />{l.location?.region}
                </div>
                <h3 className="mt-2 font-bold text-slate-900 group-hover:text-orange-600 transition-colors">{l.h1}</h3>
                <p className="mt-1 text-sm text-slate-500 line-clamp-2">{l.intro}</p>
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-600">
                  Ver detalles <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
