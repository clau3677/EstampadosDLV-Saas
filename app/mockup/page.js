// =============================================================================
// /mockup — Editor de mockups para prendas
// -----------------------------------------------------------------------------
// Los clientes pueden visualizar cómo quedaría su diseño impreso sobre
// poleras, polerones y gorras. Usan la biblioteca de diseños o suben
// sus propios archivos.
// =============================================================================
import MockupEditor from '@/components/mockup-editor';
import { BUSINESS } from '@/lib/constants/business';

export const dynamic = 'force-dynamic';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

export const metadata = {
  title: 'Editor de Mockups — Estampados DLV',
  description:
    'Visualiza tus diseños sobre poleras, polerones y gorras. Elige de nuestra biblioteca o sube tu propio diseño. Preview instantáneo antes de imprimir.',
  alternates: { canonical: `${BASE}/mockup` },
  openGraph: {
    title: 'Editor de Mockups — Estampados DLV',
    description: 'Crea mockups de tus diseños sobre prendas. Preview instantáneo antes de imprimir.',
    url: `${BASE}/mockup`,
    siteName: BUSINESS.name,
    locale: 'es_CL',
    type: 'website',
  },
};

export default function MockupPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white py-6">
      <MockupEditor />
    </div>
  );
}
