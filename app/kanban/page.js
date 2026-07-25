'use client';
import { KanbanSquare } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function KanbanPage() {
  return (
    <ModuleShell
      title="Kanban de Producción"
      subtitle="3 colas de impresión independientes con estados y prioridades."
      icon={KanbanSquare}
      features={[
        'Columnas por impresora: Epson R1390, Prestige R2 Pro, DTF UV.',
        'Estados: Recibido → En Impresión → Curado → Listo para Retiro.',
        'Pedidos Exprés con recargo (badge naranja intenso y prioridad visual).',
        'Asignación de operador y timestamps automáticos por cambio de estado.',
        'Vista tarjeta con miniatura del gang sheet, cliente y tiempo transcurrido.',
        'Drag-and-drop entre columnas con actualización optimista.',
      ]}
      roadmap={[
        { title: 'Modelo production_queue', desc: 'Ya definido en /lib/models.js.' },
        { title: 'UI Kanban con dnd-kit', desc: 'Tres columnas responsive con scroll independiente.' },
        { title: 'Websockets/SSE', desc: 'Sincronización en tiempo real entre operadores.' },
        { title: 'Métricas por operador', desc: 'Tiempo medio por estado y throughput diario.' },
      ]}
    />
  );
}
