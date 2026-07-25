'use client';
import { Store } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function TiendaPage() {
  return (
    <ModuleShell
      title="Tienda Web Pública"
      subtitle="Catálogo SEO-friendly de prendas y DTF por metro con checkout omnicanal."
      icon={Store}
      features={[
        'Catálogo público con URLs seo-friendly (/producto/[slug]).',
        'Filtros por categoría, talla, color y precio.',
        'Carrito persistente y checkout con pagos WebPay/MercadoPago.',
        'Sincronización de stock omnicanal (web ↔ POS local en tiempo real).',
        'Sección "Sube tu diseño" que abre el Gang Sheet Builder.',
        'Meta tags, Open Graph y sitemap automáticos.',
      ]}
      roadmap={[
        { title: 'Rutas públicas', desc: '/tienda, /tienda/[categoria], /producto/[slug].' },
        { title: 'Catálogo desde Mongo', desc: 'Query a products con filtros y paginación.' },
        { title: 'Checkout', desc: 'Integración WebPay Plus (Transbank) o MercadoPago CL.' },
      ]}
    />
  );
}
