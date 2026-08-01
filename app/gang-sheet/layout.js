// Layout server component para /gang-sheet con metadata SEO
// Next.js permite metadata en layout.js incluso si page.js es 'use client'

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

export const metadata = {
  title: 'Arma tu Pliego DTF Online · Estampados DLV — Gang Sheet Editor',
  description:
    'Editor visual online para armar tu pliego de impresión DTF por metro lineal. ' +
    'Sube tus diseños, optimiza el espacio y ahorra en costos. Precios desde $6.000/m en Quilpué, Valparaíso.',
  alternates: { canonical: `${BASE}/gang-sheet` },
  openGraph: {
    title: 'Arma tu Pliego DTF Online · Estampados DLV',
    description:
      'Editor visual online para armar tu pliego de impresión DTF por metro lineal. ' +
      'Optimiza el espacio y ahorra en costos de producción.',
    url: `${BASE}/gang-sheet`,
    siteName: 'Estampados DLV',
    locale: 'es_CL',
    type: 'website',
  },
};

export default function GangSheetLayout({ children }) {
  return children;
}
