import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { SidebarNav } from '@/components/sidebar-nav';
import { Topbar } from '@/components/topbar';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata = {
  title: 'Estampados DLV · Sistema Operativo',
  description: 'Plataforma integral para taller DTF y DTF UV — E-commerce, POS, Gang Sheet Builder, Pre-Prensa, Kanban e Inventario Dual.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-CL" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <Providers>
          <div className="min-h-screen">
            <SidebarNav />
            <div className="lg:pl-64">
              <Topbar />
              <main className="px-6 py-8">
                {children}
              </main>
            </div>
          </div>
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
