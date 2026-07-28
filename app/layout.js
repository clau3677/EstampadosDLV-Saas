import './globals.css';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Providers } from './providers';
import LayoutSelector from '@/components/layout-selector';
import { Toaster } from '@/components/ui/sonner';
import { TopProgressBar } from '@/components/top-progress-bar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

export const metadata = {
  metadataBase: new URL(BASE),
  title: 'Estampados DLV · Impresión DTF profesional en Chile',
  description: 'Taller DTF y DTF UV en Chile. Compra prendas, DTF por metro o sube tu propio diseño con nuestro editor visual.',
  openGraph: {
    siteName: 'Estampados DLV',
    locale: 'es_CL',
    type: 'website',
  },
};

// JSON-LD LocalBusiness (auditoría jul-2026): habilita el panel de negocio
// local en Google y refuerza las señales NAP (nombre-dirección-teléfono).
const LOCAL_BUSINESS_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${BASE}/#business`,
  name: 'Estampados DLV',
  description: 'Taller de impresión DTF y DTF UV profesional. Poleras, polerones, gorras y merchandising personalizado.',
  url: BASE,
  telephone: '+56954169052',
  email: 'estampadosdlv@gmail.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Galleguillos 1870, Casa 1',
    addressLocality: 'Quilpué',
    addressRegion: 'Valparaíso',
    addressCountry: 'CL',
  },
  priceRange: '$$',
  sameAs: [
    'https://www.facebook.com/estampadosdlv',
    'https://www.instagram.com/estampadosdlv',
    'https://www.tiktok.com/@estampadosdlv',
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-CL" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_JSONLD) }}
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
