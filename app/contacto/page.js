// Server component — /contacto — Página de contacto pública con:
//   - Hero con datos de contacto centralizados (BUSINESS constants)
//   - Cards clickeables para Llamar / WhatsApp / Email
//   - Iframe de Google Maps con la ubicación real
//   - Horarios de atención
//   - Sección "por qué contactarnos" con casos comunes

import Link from 'next/link';
import {
  MapPin, Phone, Mail, Clock, MessageCircle, ArrowRight, Sparkles,
  CheckCircle2, Layers, Package, Palette, Truck,
} from 'lucide-react';
import { BUSINESS } from '@/lib/constants/business';
import ContactForm from '@/components/contact-form';

export const metadata = {
  title: `Contacto · ${BUSINESS.name} · Quilpué, Valparaíso`,
  description: `Contáctanos para cotizar tu impresión DTF o DTF UV. Estamos en ${BUSINESS.address.full}. Teléfono: ${BUSINESS.phone.display}. Email: ${BUSINESS.email.primary}.`,
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_BASE_URL || ''}/contacto`.replace(/\/+/g, '/').replace(':/', '://'),
  },
  openGraph: {
    title: `Contacto · ${BUSINESS.name}`,
    description: `Estamos en ${BUSINESS.address.short}. Contáctanos por WhatsApp, teléfono o email.`,
    locale: 'es_CL',
    type: 'website',
  },
};

// Google Maps embed URL (usa lat/lng aproximada de Quilpué; la dirección exacta
// se muestra en el marker del iframe automáticamente por Google)
const MAPS_EMBED_URL = 'https://www.google.com/maps?q=Galleguillos+1870+Quilpue+Valparaiso+Chile&output=embed';

const REASONS = [
  { icon: Palette,  title: 'Diseño personalizado', desc: 'Envíanos tu arte y te asesoramos con DPI, colores y márgenes.' },
  { icon: Layers,   title: 'Cotización sin costo', desc: 'Te enviamos precio y tiempos en menos de 1 hora hábil.' },
  { icon: Package,  title: 'Pedidos mayoristas',   desc: 'Descuentos por volumen desde 20 poleras o 5m de gang sheet.' },
  { icon: Truck,    title: 'Retiro en taller',     desc: 'Ven personalmente o coordina despacho a domicilio en 24-48h.' },
];

const SCHEDULE = [
  { day: 'Lunes a Viernes', hours: '10:00 – 19:00' },
  { day: 'Sábado',          hours: '10:00 – 14:00' },
  { day: 'Domingo',         hours: 'Cerrado (consultas por WhatsApp)' },
];

export default function ContactoPage() {
  // JSON-LD para SEO local
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: BUSINESS.name,
    description: `Taller de impresión DTF y DTF UV en ${BUSINESS.address.city}`,
    telephone: BUSINESS.phone.intl,
    email: BUSINESS.email.primary,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${BUSINESS.address.street}, ${BUSINESS.address.unit}`,
      addressLocality: BUSINESS.address.city,
      addressRegion:   BUSINESS.address.region,
      addressCountry:  BUSINESS.address.countryCode,
    },
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday'], opens: '10:00', closes: '19:00' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '10:00', closes: '14:00' },
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '127',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 text-white">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="container relative py-14 md:py-20 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur border border-orange-400/30 px-3 py-1 text-xs font-semibold text-orange-300 mb-5">
            <MessageCircle className="h-3 w-3" />Hablemos
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-tight">
            Estamos en Quilpué, listos para estampar tu idea
          </h1>
          <p className="mt-4 text-lg text-slate-300 max-w-xl mx-auto">
            Cotización sin costo, asesoría con tu arte y despachos a todo Chile.
          </p>
        </div>
      </section>

      {/* CONTACT CARDS */}
      <section className="container -mt-10 relative z-10 mb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* WhatsApp */}
          <a
            href={BUSINESS.whatsapp.url('Hola! Quiero cotizar un estampado DTF')}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative rounded-2xl bg-white border border-slate-200 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all p-6 overflow-hidden"
          >
            <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors" />
            <div className="relative">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <div className="mt-4 text-xs uppercase tracking-widest text-emerald-600 font-bold">Preferido · Respuesta en minutos</div>
              <div className="mt-1 text-lg font-bold text-slate-900">WhatsApp</div>
              <div className="mt-1 text-slate-600 font-mono text-sm">{BUSINESS.phone.display}</div>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 group-hover:gap-2 transition-all">
                Escribir ahora <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </a>

          {/* Llamar */}
          <a
            href={BUSINESS.phone.tel}
            className="group relative rounded-2xl bg-white border border-slate-200 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all p-6 overflow-hidden"
          >
            <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors" />
            <div className="relative">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-md">
                <Phone className="h-6 w-6 text-white" />
              </div>
              <div className="mt-4 text-xs uppercase tracking-widest text-orange-600 font-bold">Directo · Horario hábil</div>
              <div className="mt-1 text-lg font-bold text-slate-900">Llamar</div>
              <div className="mt-1 text-slate-600 font-mono text-sm">{BUSINESS.phone.display}</div>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-orange-600 group-hover:gap-2 transition-all">
                Marcar ahora <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </a>

          {/* Email */}
          <a
            href={BUSINESS.email.mailto}
            className="group relative rounded-2xl bg-white border border-slate-200 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all p-6 overflow-hidden"
          >
            <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors" />
            <div className="relative">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                <Mail className="h-6 w-6 text-white" />
              </div>
              <div className="mt-4 text-xs uppercase tracking-widest text-blue-600 font-bold">Formal · Pedidos mayoristas</div>
              <div className="mt-1 text-lg font-bold text-slate-900">Email</div>
              <div className="mt-1 text-slate-600 text-sm break-all">{BUSINESS.email.primary}</div>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                Enviar correo <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* MAPA + INFO */}
      <section className="container mb-16">
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Mapa */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md h-full min-h-[380px]">
              <iframe
                src={MAPS_EMBED_URL}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '380px' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Ubicación de Estampados DLV en Quilpué"
              />
            </div>
          </div>

          {/* Info lateral */}
          <div className="lg:col-span-2 space-y-4">
            {/* Dirección */}
            <a
              href={BUSINESS.address.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-orange-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shrink-0 shadow-sm">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Dirección</div>
                  <div className="mt-1 font-semibold text-slate-900">{BUSINESS.address.street}, {BUSINESS.address.unit}</div>
                  <div className="text-sm text-slate-600">{BUSINESS.address.city}, {BUSINESS.address.region}</div>
                  <div className="mt-2 text-xs font-semibold text-orange-600">Abrir en Google Maps →</div>
                </div>
              </div>
            </a>

            {/* Horario */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Clock className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Horario de atención</div>
                  <div className="mt-0.5 font-semibold text-slate-900">Zona horaria de Chile</div>
                </div>
              </div>
              <ul className="space-y-1.5 text-sm">
                {SCHEDULE.map(s => (
                  <li key={s.day} className="flex justify-between border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
                    <span className="text-slate-600">{s.day}</span>
                    <span className="font-mono font-medium text-slate-900">{s.hours}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT FORM */}
      <section className="container mb-16">
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <ContactForm />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-rose-50 border border-orange-200 p-6">
              <div className="text-xs uppercase tracking-widest font-bold text-orange-700 mb-2">¿Urgente?</div>
              <h4 className="text-lg font-bold text-slate-900">Escríbenos por WhatsApp</h4>
              <p className="mt-2 text-sm text-slate-600">La forma más rápida de resolver dudas. Respondemos en minutos durante horario hábil.</p>
              <a
                href={BUSINESS.whatsapp.url('Hola! Quiero cotizar un estampado')}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg shadow-md transition-all hover:scale-105"
              >
                <MessageCircle className="h-4 w-4" />Abrir WhatsApp
              </a>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-3">Otros medios</div>
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-center gap-2 text-slate-700">
                  <Phone className="h-4 w-4 text-orange-500 shrink-0" />
                  <a href={BUSINESS.phone.tel} className="hover:text-orange-600 font-medium">{BUSINESS.phone.display}</a>
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <Mail className="h-4 w-4 text-orange-500 shrink-0" />
                  <a href={BUSINESS.email.mailto} className="hover:text-orange-600 font-medium break-all">{BUSINESS.email.primary}</a>
                </li>
                <li className="flex items-center gap-2 text-slate-700">
                  <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                  <span>Lun-Vie 10:00 – 19:00</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* WHY CONTACT US */}
      <section className="bg-gradient-to-b from-slate-50 to-white py-16 border-y border-slate-100">
        <div className="container">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <div className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-700 px-3 py-1 text-xs font-semibold mb-3">
              <Sparkles className="h-3 w-3" />¿Por qué contactarnos?
            </div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Asesoría real, no bots
            </h2>
            <p className="mt-3 text-slate-600">
              Cada consulta la responde nuestro equipo. Sin cotizadores automáticos que devuelven precios irreales — te damos números y tiempos concretos.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {REASONS.map((r) => (
              <div key={r.title} className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-orange-300 hover:shadow-md transition-all">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-sm">
                  <r.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="mt-4 font-bold text-slate-900">{r.title}</h3>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="container py-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 p-8 md:p-12 text-white text-center shadow-2xl">
          <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <h3 className="text-2xl md:text-3xl font-bold tracking-tight">¿Prefieres cotizar tú mismo?</h3>
            <p className="mt-2 text-white/90">Nuestro editor visual calcula el precio en tiempo real y valida el DPI de tu diseño.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/gang-sheet"
                className="inline-flex items-center gap-2 rounded-lg bg-white text-rose-600 hover:bg-white/95 font-bold px-6 py-3 shadow-xl transition-all hover:scale-105"
              >
                <Layers className="h-5 w-5" />Cotizar en el editor
              </Link>
              <Link
                href="/tienda"
                className="inline-flex items-center gap-2 rounded-lg border-2 border-white/40 hover:bg-white/10 text-white font-bold px-6 py-3 transition-colors"
              >
                Ver catálogo <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-white/80">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Cotización instantánea</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Sin registrarse</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Preview visual antes de pagar</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
