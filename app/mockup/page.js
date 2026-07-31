// =============================================================================
// /mockup — Editor de mockups (3D y Catálogo 2D)
// -----------------------------------------------------------------------------
// Los clientes pueden elegir entre:
//   1. Modo 3D: Visualización 3D con Three.js
//   2. Modo Catálogo: Editor 2D sobre imagen real del producto del catálogo
// =============================================================================
import MockupSelector from '@/components/mockup-selector';
import { BUSINESS } from '@/lib/constants/business';

export const dynamic = 'force-dynamic';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

export const metadata = {
  title: 'Editor de Mockups — Estampados DLV',
  description:
    'Crea mockups profesionales de tus diseños sobre prendas reales. Modo 3D con rotación interactiva o modo Catálogo con imágenes reales de nuestros productos.',
  alternates: { canonical: `${BASE}/mockup` },
  openGraph: {
    title: 'Editor de Mockups — Estampados DLV',
    description: 'Crea mockups de tus diseños sobre prendas reales. Modo 3D o sobre imagen real del catálogo.',
    url: `${BASE}/mockup`,
    siteName: BUSINESS.name,
    locale: 'es_CL',
    type: 'website',
  },
};

export default function MockupPage() {
  return (
    <div className="h-screen bg-slate-50">
      <MockupSelector />
    </div>
  );
}
