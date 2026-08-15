// Metadata estática del concurso: estas tags van al <head> estático del HTML
// para que los scrapers de WhatsApp/Facebook/Instagram lean título, descripción e imagen.
// IMPORTANTE: las imágenes OG deben ser URL absolutas (https://...) porque los
// scrapers no resuelven rutas relativas.

export const metadata = {
  title: 'Concurso: Gana premios con tu diseño · Estampados DLV',
  description:
    'Participa y gana un polerón, polera o gorra personalizada estampada. ¡3 premios increíbles! Registro gratis, envío a todo Chile.',
  openGraph: {
    title: 'Concurso: Gana premios con tu diseño · Estampados DLV',
    description:
      'Participa gratis y gana un polerón, polera o gorra personalizada. ¡3 premios increíbles!',
    url: 'https://estampadosdlv.com/concurso',
    siteName: 'Estampados DLV',
    locale: 'es_CL',
    type: 'website',
    images: [
      {
        url: 'https://estampadosdlv.com/uploads/contest/og-concurso.jpg',
        width: 1200,
        height: 630,
        alt: 'Concurso Estampados DLV: gana un polerón, polera o gorra personalizada',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Concurso: Gana premios con tu diseño · Estampados DLV',
    description:
      'Participa gratis y gana un polerón, polera o gorra personalizada. ¡3 premios increíbles!',
    images: ['https://estampadosdlv.com/uploads/contest/og-concurso.jpg'],
  },
};

export default function ConcursoLayout({ children }) {
  return children;
}
