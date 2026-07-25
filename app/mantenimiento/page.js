'use client';
import { Wrench } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function MantenimientoPage() {
  return (
    <ModuleShell
      title="Mantenimiento de Equipos"
      subtitle="Registro de mantenciones, limpiezas y reemplazos por impresora."
      icon={Wrench}
      features={[
        'Historial por impresora (Epson R1390, Prestige R2 Pro, DTF UV).',
        'Tipos: limpieza de cabezal, nozzle check, cambio de tinta, cambio de cabezal.',
        'Costo y operador responsable por cada intervención.',
        'Recordatorios preventivos por horas de uso.',
      ]}
      roadmap={[
        { title: 'Colección maintenance_logs', desc: 'Ya definida en /lib/models.js.' },
        { title: 'Timeline por impresora', desc: 'Vista cronológica con filtros por tipo.' },
      ]}
    />
  );
}
