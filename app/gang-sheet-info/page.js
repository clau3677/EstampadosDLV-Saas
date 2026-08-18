// Página pública SEO: explica el servicio Gang Sheet Builder (paño de impresión DTF)
// sin requerir sesión. El editor privado permanece en /gang-sheet (requiere registro).
// Estructura recomendada por auditoría SEO: H1, cómo funciona, medidas y precios,
// requisitos de archivo, errores frecuentes, despacho y retiro, FAQ con JSON-LD.
import Link from 'next/link';
import {
  Layers, Upload, Ruler, Clock, Truck, MapPin, MessageCircle, CheckCircle2,
  ArrowRight, Package, FileImage, Sparkles, ShoppingBag, Scissors, Zap,
} from 'lucide-react';
import { BUSINESS } from '@/lib/constants/business';

export const metadata = {
  title: 'Arma tu pliego DTF online | Gang Sheet Builder · Estampados DLV Quilpué',
  description: 'Crea tu paño de impresión DTF online gratis con el Gang Sheet Builder: sube tus diseños, optimiza el espacio y nosotros imprimimos tu pliego listo para estampar. Ancho de 30 cm, los metros que necesites.',
  alternates: { canonical: 'https://estampadosdlv.com/gang-sheet-info' },
};

const STEPS = [
  { icon: Upload, title: 'Sube tus diseños', text: 'Sube tus archivos PNG con fondo transparente. Puedes agregar varios diseños en un mismo paño.' },
  { icon: Layers, title: 'Organiza en el editor', text: 'Mueve, rota y agrupa tus diseños en el paño virtual. El sistema te avisa si se superponen.' },
  { icon: Scissors, title: 'Optimiza el espacio', text: 'Aprovecha al máximo cada centímetro del paño de 30 cm de ancho para pagar solo lo necesario.' },
  { icon: Zap, title: 'Nosotros imprimimos', text: 'Enviamos tu pliego directo al editor y lo imprimimos en DTF de alta calidad. Tú lo recibes listo para planchar o prensar.' },
];

const MEASURES = [
  { name: 'Pliego mínimo', size: '28 × 40 cm', note: 'Ideal para un diseño grande o 2-3 diseños pequeños' },
  { name: 'Pliego medio', size: '28 × 21 cm', note: 'Perfecto para logos y diseños medianos' },
  { name: 'Pliego chico', size: '28 × 10,5 cm', note: 'Bolsillos, mangas y etiquetas' },
  { name: 'Por metro', size: '30 cm de ancho × los metros que quieras', note: 'Ideal para productores y talleres con volumen' },
];

const FILE_REQS = [
  { icon: FileImage, text: 'Formato PNG con fondo transparente (recomendado)' },
  { icon: Ruler, text: 'Resolución mínima 300 DPI al tamaño real de impresión' },
  { icon: Sparkles, text: 'Evita JPG con fondo blanco: el fondo se imprime' },
  { icon: Package, text: 'Puedes incluir varios diseños en un mismo archivo o subirlos por separado' },
];

const ERRORS = [
  'Enviar JPG sin fondo transparente: el fondo blanco queda impreso en la prenda.',
  'Usar imágenes de baja resolución: el estampado se ve pixelado o borroso.',
  'Diseños superpuestos en el paño: los archivos se mezclan al imprimir. El editor te avisa.',
  'Enviar diseños menores a 3 cm de ancho: pierden detalle en la impresión.',
  'Elegir colores muy similares al tono de la prenda: mejor usar diseños con contraste.',
];

const FAQS = [
  { q: '¿Qué es un gang sheet o pliego DTF?', a: 'Es un paño de impresión donde se acomodan varios diseños juntos para optimizar el espacio y el costo. En un solo metro de paño puedes imprimir desde 1 diseño grande hasta decenas de diseños pequeños.' },
  { q: '¿Cuánto mide el paño?', a: 'El ancho del paño es de 30 cm y se imprime por los metros que necesites (formato típico: 28 × 40 cm, 28 × 21 cm, 28 × 10,5 cm o por metro completo).' },
  { q: '¿Puedo crear el paño sin registrarme?', a: 'Puedes revisar esta página, pero para crear y guardar tu pliego en el editor debes registrarte gratis. El diseño no se descarga: llega automáticamente a Estampados DLV para ser impreso.' },
  { q: '¿Qué diseño me conviene imprimir?', a: 'Mientras más diseños agrupes en un mismo paño, más barato sale el metro cuadrado. Es ideal para marcas, talleres de estampado, tiendas de camisetas y productores.' },
  { q: '¿En cuánto tiempo lo recibo?', a: 'Los pliegos se imprimen en 24 a 48 horas hábiles en Quilpué. Hacemos despachos a todo Chile por Chilexpress y Starken, y también puedes retirar en nuestro taller.' },
  { q: '¿Qué hago con el pliego impreso?', a: 'Viene listo para aplicar: solo tienes que plancharlo o prensarlo sobre la prenda. El DTF textil adhiere sobre algodón, poliéster y mezclas.' },
];

export default function GangSheetInfoPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* HERO */}
      <section className="bg-gradient-to-br from-slate-950 via-orange-950 to-slate-900 text-white">
        <div className="container py-16 md:py-20">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 bg-orange-500/20 border border-orange-400/40 text-orange-200 text-sm font-semibold px-4 py-1.5 rounded-full">
              <Sparkles className="w-4 h-4" /> Servicio de impresión en Quilpué · Despacho a todo Chile
            </span>
            <h1 className="mt-5 text-4xl md:text-5xl font-extrabold tracking-tight">
              Arma tu pliego DTF online
            </h1>
            <p className="mt-4 text-lg text-slate-200 leading-relaxed">
              Con el <strong className="text-white">Gang Sheet Builder</strong> creas tu paño de impresión
              directamente en la web, optimizas el espacio entre diseños y nosotros lo imprimimos en DTF
              de alta calidad. Tú lo recibes listo para planchar sobre tus prendas.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/gang-sheet"
                className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white font-bold px-7 py-3.5 rounded-xl transition-all text-base shadow-lg shadow-orange-500/30"
              >
                Crear mi pliego <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href={`https://wa.me/56954169052`}
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/30 font-semibold px-7 py-3.5 rounded-xl transition-all text-base"
              >
                <MessageCircle className="w-5 h-5" /> WhatsApp +56 9 5416 9052
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2"><Ruler className="w-4 h-4 text-orange-400" /> Paño de 30 cm de ancho</span>
              <span className="inline-flex items-center gap-2"><Clock className="w-4 h-4 text-orange-400" /> Impresión en 24-48 hrs</span>
              <span className="inline-flex items-center gap-2"><Truck className="w-4 h-4 text-orange-400" /> Envío a todo Chile</span>
              <span className="inline-flex items-center gap-2"><MapPin className="w-4 h-4 text-orange-400" /> Retiro en Quilpué</span>
            </div>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="container py-14">
        <h2 className="text-3xl font-bold text-slate-900">Cómo funciona</h2>
        <p className="mt-2 text-slate-600 max-w-2xl">
          Cuatro pasos para tener tu pliego DTF impreso y listo para estampar, sin comprar equipos ni tintas.
        </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((s, i) => (
            <div key={s.title} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all">
              <div className="flex items-center justify-between">
                <s.icon className="w-8 h-8 text-orange-500" />
                <span className="text-4xl font-black text-slate-100">{i + 1}</span>
              </div>
              <h3 className="mt-4 font-bold text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MEDIDAS Y PRECIOS */}
      <section className="bg-white border-y border-slate-200">
        <div className="container py-14">
          <h2 className="text-3xl font-bold text-slate-900">Medidas del paño</h2>
          <p className="mt-2 text-slate-600 max-w-2xl">
            El paño tiene 30 cm de ancho y se imprime por los metros que necesites. Elige el formato que
            mejor aproveche tus diseños: mientras más juntos los acomodes, menos pagas.
          </p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {MEASURES.map(m => (
              <div key={m.name} className="border border-slate-200 rounded-2xl p-6 bg-slate-50">
                <h3 className="font-bold text-slate-900">{m.name}</h3>
                <p className="mt-1 text-2xl font-black text-orange-500">{m.size}</p>
                <p className="mt-2 text-sm text-slate-600">{m.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-slate-500">
            ¿Necesitas un precio exacto para tu volumen? Escríbenos por WhatsApp y te cotizamos en minutos.
          </p>
        </div>
      </section>

      {/* REQUISITOS DE ARCHIVO */}
      <section className="container py-14">
        <h2 className="text-3xl font-bold text-slate-900">Requisitos del archivo</h2>
        <p className="mt-2 text-slate-600 max-w-2xl">
          Con archivos bien preparados tu estampado queda nítido desde la primera impresión.
        </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {FILE_REQS.map(r => (
            <div key={r.text} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-5">
              <r.icon className="w-6 h-6 text-orange-500 shrink-0 mt-0.5" />
              <p className="text-slate-700">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ERRORES FRECUENTES */}
      <section className="bg-slate-950 text-white">
        <div className="container py-14">
          <h2 className="text-3xl font-bold">Errores frecuentes al armar un pliego</h2>
          <p className="mt-2 text-slate-300 max-w-2xl">
            Evita estos errores comunes y tu paño quedará listo para imprimir sin reprocesos.
          </p>
          <ul className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            {ERRORS.map(e => (
              <li key={e} className="flex items-start gap-3 border border-white/10 rounded-xl p-5 bg-white/5">
                <CheckCircle2 className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                <span className="text-slate-200 text-sm leading-relaxed">{e}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* DESPACHO Y RETIRO */}
      <section className="container py-14">
        <h2 className="text-3xl font-bold text-slate-900">Despacho y retiro</h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <Truck className="w-8 h-8 text-orange-500" />
            <h3 className="mt-4 font-bold text-slate-900">Envío a todo Chile</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Despachamos los pliegos por Chilexpress y Starken a cualquier región. La impresión se
              completa en 24 a 48 horas hábiles y el envío llega en 2 a 5 días hábiles.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <MapPin className="w-8 h-8 text-orange-500" />
            <h3 className="mt-4 font-bold text-slate-900">Retiro en Quilpué</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              También puedes retirar tu pliego directamente en nuestro taller en Quilpué, Quinta Región,
              sin costo de envío y sin esperas de despacho.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <ShoppingBag className="w-8 h-8 text-orange-500" />
            <h3 className="mt-4 font-bold text-slate-900">Listo para estampar</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              El DTF textil viene cortado y listo para aplicar con plancha o prensa térmica sobre
              algodón, poliéster y mezclas. Adhiere de inmediato y soporta lavados.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white border-y border-slate-200">
        <div className="container py-14 max-w-3xl">
          <h2 className="text-3xl font-bold text-slate-900">Preguntas frecuentes</h2>
          <div className="mt-8 space-y-4">
            {FAQS.map((f, i) => (
              <details key={i} className="group border border-slate-200 rounded-xl p-5 open:bg-orange-50 transition-colors">
                <summary className="font-semibold text-slate-900 cursor-pointer list-none flex justify-between items-center">
                  {f.q}
                  <ArrowRight className="w-4 h-4 text-orange-500 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-3 text-slate-600 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
        <div className="container py-14 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold">¿Listo para armar tu pliego?</h2>
          <p className="mt-3 text-orange-50 max-w-xl mx-auto">
            Regístrate gratis, crea tu paño en el editor y nosotros lo imprimimos. Despacho a todo Chile y retiro en Quilpué.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-4">
            <Link
              href="/gang-sheet"
              className="inline-flex items-center gap-2 bg-white text-orange-600 font-bold px-8 py-3.5 rounded-xl hover:bg-orange-50 transition-all text-base shadow-lg"
            >
              Crear mi pliego <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href={`https://wa.me/56954169052`}
              className="inline-flex items-center gap-2 bg-orange-700 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-orange-800 transition-all text-base"
            >
              <MessageCircle className="w-5 h-5" /> WhatsApp +56 9 5416 9052
            </a>
          </div>
        </div>
      </section>

      {/* JSON-LD FAQ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map(f => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }),
        }}
      />
    </div>
  );
}
