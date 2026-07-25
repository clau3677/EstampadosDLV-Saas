'use client';
import { LineChart } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function ReportesPage() {
  return (
    <ModuleShell
      title="Reportes"
      subtitle="Analítica operacional y financiera del taller."
      icon={LineChart}
      features={[
        'Ventas por canal (web / POS / WhatsApp) y por método de pago.',
        'Metros impresos por impresora + costo por metro.',
        'Consumo de tintas y film por período.',
        'Top productos y top clientes.',
      ]}
      roadmap={[
        { title: 'Agregaciones Mongo', desc: 'Pipelines para ventas/producción por rango de fechas.' },
        { title: 'Gráficos con Recharts', desc: 'Ya instalado — barras, líneas y áreas.' },
      ]}
    />
  );
}
