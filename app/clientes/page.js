'use client';
import { Users } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function ClientesPage() {
  return (
    <ModuleShell
      title="Clientes"
      subtitle="Base de datos unificada de clientes (web + POS + WhatsApp)."
      icon={Users}
      features={[
        'Ficha con RUT chileno validado, historial de compras y gang sheets.',
        'Segmentación por LTV, frecuencia y último pedido.',
        'Notas internas y etiquetas (mayorista, express, moroso).',
      ]}
      roadmap={[
        { title: 'CRUD de clientes', desc: 'Endpoints /api/customers con búsqueda por RUT/email/teléfono.' },
        { title: 'Historial 360°', desc: 'Pedidos + gang sheets + boletas por cliente.' },
      ]}
    />
  );
}
