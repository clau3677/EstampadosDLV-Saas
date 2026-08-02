import './globals.css';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Providers } from './providers';
import LayoutSelector from '@/components/layout-selector';
import { Toaster } from '@/components/ui/sonner';
import { TopProgressBar } from '@/components/top-progress-bar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap', preload: false });

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

export const metadata = {
  metadataBase: new URL(BASE),
  title: {
    default: 'Estampados DLV · Impresión DTF y DTF UV en Quilpué, Chile',
    template: '%s · Estampados DLV',
  },
  description:
    'Taller profesional de impresión DTF y DTF UV en Quilpué, Valparaíso, Chile. ' +
    'Impresión textil a 300 DPI, poleras, polerones, gorras y merchandising personalizado. ' +
    'Despacho 24-48h a todo Chile. Tres líneas de producción activas.',
  keywords: [
    'impresión dtf',
    'dtf chile',
    'estampados dtf',
    'impresión dtf uv',
    'dtf quilpué',
    'estampados valparaíso',
    'impresión textil chile',
    'poleras personalizadas',
    'dtf por metro',
    'gang sheet dtf',
    'impresión dtf uv chile',
    'taller dtf valparaíso',
  ],
  authors: [{ name: 'Estampados DLV' }],
  creator: 'Estampados DLV',
  publisher: 'Estampados DLV',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'es_CL',
    siteName: 'Estampados DLV',
    url: BASE,
    title: 'Estampados DLV · Impresión DTF y DTF UV profesional en Chile',
    description:
      'Taller profesional de impresión DTF y DTF UV en Quilpué, Valparaíso. ' +
      'Poleras, polerones, gorras y merchandising personalizado con despacho a todo Chile.',
    images: [
      {
        url: `${BASE}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Estampados DLV - Impresión DTF profesional en Chile',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Estampados DLV · Impresión DTF y DTF UV en Chile',
    description: 'Impresión DTF y DTF UV profesional en Quilpué, Valparaíso. Poleras, polerones, gorras y merchandising.',
    images: [`${BASE}/og-image.png`],
  },
  verification: {
    google: '', // Agregar Google Search Console verification token aquí
  },
};

// JSON-LD Organization (global, para todas las páginas)
const ORGANIZATION_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Estampados DLV',
  url: BASE,
  logo: `${BASE}/logo.png`,
  description: 'Taller profesional de impresión DTF y DTF UV en Quilpué, Valparaíso, Chile.',
  telephone: '+56954169052',
  email: 'estampadosdlv@gmail.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Galleguillos 1870, Casa 1',
    addressLocality: 'Quilpué',
    addressRegion: 'Valparaíso',
    postalCode: '2430000',
    addressCountry: 'CL',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: '-33.0472',
    longitude: '-71.4426',
  },
  sameAs: [
    'https://www.facebook.com/estampadosdlv',
    'https://www.instagram.com/estampadosdlv',
    'https://www.tiktok.com/@estampadosdlv',
  ],
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '18:00',
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Saturday',
      opens: '09:00',
      closes: '14:00',
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-CL" className={inter.variable}>
      <head>
        {/* Preconnect para origen propio (las fuentes de Google se cargan localmente) */}
        <link rel="dns-prefetch" href={BASE} />
        
        {/* Critical CSS inline — minimal above-fold styles for instant paint */}
        <style dangerouslySetInnerHTML={{__html: `html{background-color:#f8fafc}body{margin:0;font-family:var(--font-inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif)}`}} />
        
        {/* CSS no crítico: cargar después del paint para mejorar FCP */}
        <script dangerouslySetInnerHTML={{__html:`!function(){var s=document.createElement('link');s.rel='stylesheet';s.href='/_next/static/css/2dd2d18f512933ec.css';document.head.appendChild(s)}();`}} />
        <noscript>
          <link rel="stylesheet" href="/_next/static/css/2dd2d18f512933ec.css" />
        </noscript>
        
        {/* Error handler para performance */}
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
        
        {/* Organization JSON-LD global */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSONLD) }}
        />
        
        {/* BreadcrumbList global para navegación estructurada */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Inicio', item: BASE },
            ],
          }) }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <Suspense fallback={null}>
          <TopProgressBar />
        </Suspense>
        <Providers>
          <LayoutSelector>{children}</LayoutSelector>
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
