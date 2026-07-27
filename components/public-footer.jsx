import Link from 'next/link';
import { Printer, Mail, MapPin, Phone } from 'lucide-react';
import { BUSINESS } from '@/lib/constants/business';

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 mt-12">
      <div className="container py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center">
              <Printer className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-900">{BUSINESS.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-orange-500">{BUSINESS.tagline}</div>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600 max-w-md">
            Impresión DTF profesional en Chile. Tres líneas de producción activas,
            entrega express disponible.
          </p>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Catálogo</div>
          <ul className="space-y-1.5 text-sm text-slate-700">
            <li><Link href="/tienda" className="hover:text-orange-600">Todos los productos</Link></li>
            <li><Link href="/tienda?cat=apparel" className="hover:text-orange-600">Prendas</Link></li>
            <li><Link href="/tienda?cat=dtf_meter" className="hover:text-orange-600">DTF por metro</Link></li>
            <li><Link href="/gang-sheet" className="hover:text-orange-600">Arma tu pliego</Link></li>
            <li><Link href="/contacto" className="hover:text-orange-600">Contacto</Link></li>
          </ul>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Contacto</div>
          <ul className="space-y-1.5 text-sm text-slate-700">
            <li className="flex items-start gap-2">
              <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
              <a
                href={BUSINESS.address.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-orange-600"
              >
                {BUSINESS.address.street}, {BUSINESS.address.unit}<br />
                {BUSINESS.address.city}, {BUSINESS.address.region}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <a href={BUSINESS.phone.tel} className="hover:text-orange-600">{BUSINESS.phone.display}</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <a href={BUSINESS.email.mailto} className="hover:text-orange-600">{BUSINESS.email.primary}</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {BUSINESS.name} · Todos los derechos reservados
      </div>
    </footer>
  );
}

export default PublicFooter;
