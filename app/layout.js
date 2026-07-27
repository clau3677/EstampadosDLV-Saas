import './globals.css';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Providers } from './providers';
import LayoutSelector from '@/components/layout-selector';
import { Toaster } from '@/components/ui/sonner';
import { TopProgressBar } from '@/components/top-progress-bar';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata = {
  title: 'Estampados DLV · Impresión DTF profesional en Chile',
  description: 'Taller DTF y DTF UV en Chile. Compra prendas, DTF por metro o sube tu propio diseño con nuestro editor visual.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-CL" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
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
