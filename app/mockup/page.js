// =============================================================================
// /mockup — Editor de mockups 3D para prendas
// -----------------------------------------------------------------------------
// Los clientes pueden visualizar sus diseños sobre poleras, polerones y gorras
// con renderizado 3D realista usando Three.js.
// =============================================================================
import Mockup3DWrapper from '@/components/mockup-3d-wrapper';
import { BUSINESS } from '@/lib/constants/business';

export const dynamic = 'force-dynamic';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

export const metadata = {
  title: 'Editor 3D de Mockups — Estampados DLV',
  description:
    'Visualiza tus diseños sobre poleras, polerones y gorras en 3D realista. Elige de nuestra biblioteca o sube tu propio diseño. Vista previa con rotación 360°.',
  alternates: { canonical: `${BASE}/mockup` },
  openGraph: {
    title: 'Editor 3D de Mockups — Estampados DLV',
    description: 'Crea mockups 3D de tus diseños sobre prendas. Vista previa realista con rotación interactiva.',
    url: `${BASE}/mockup`,
    siteName: BUSINESS.name,
    locale: 'es_CL',
    type: 'website',
  },
};

export default function MockupPage() {
  return (
    <div className="h-screen bg-slate-50">
      <Mockup3DWrapper />
    </div>
  );
}
