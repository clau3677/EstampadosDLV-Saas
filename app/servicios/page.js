// Server component — índice público de servicios/landings
import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';
import { getDb } from '@/lib/mongo';
import { COLLECTIONS } from '@/lib/models';

export const metadata = {
  title: 'Servicios de impresión DTF en Chile · Estampados DLV',
  description: 'Cobertura nacional en Chile. Encuentra el servicio de estampado DTF y DTF UV en tu ciudad.',
};

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
      <section className="bg-gradient-to-br from-slate-950 to-slate-900 text-white">
        <div className="container py-14">
          <h1 className="text-3xl md:text-4xl font-bold">Servicios en Chile</h1>
          <p className="mt-3 text-slate-300 max-w-2xl">
            Cobertura nacional para estampado DTF y DTF UV. Elige tu ciudad para conocer detalles.
          </p>
        </div>
      </section>

      <section className="container py-10">
        {landings.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p>Pronto habilitaremos nuevas coberturas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        )}
      </section>
    </div>
  );
}
