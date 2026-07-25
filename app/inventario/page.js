'use client';
import { PackageSearch } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function InventarioPage() {
  return (
    <ModuleShell
      title="Inventario Dual"
      subtitle="Stock comercial (prendas, DTF por metro) + insumos de producción."
      icon={PackageSearch}
      features={[
        'INVENTARIO 1 · Comercial: poleras, hoodies, DTF por metro, accesorios — descuento por venta.',
        'INVENTARIO 2 · Insumos: Film PET, Film UV, Tintas CMYK, Blanco, Barniz, Poliamida — descuento por metro impreso.',
        'Alertas de stock mínimo por producto e insumo.',
        'Registro de mermas (waste) con motivo y operador.',
        'Historial completo de movimientos (auditoría stock_movements).',
        'Mantenimientos de cabezales con costos y frecuencia por impresora.',
      ]}
      roadmap={[
        { title: 'Vista comercial', desc: 'Tabla con variantes, stock, reservado y alertas.' },
        { title: 'Vista insumos', desc: 'Cards por tipo con barra de progreso hacia mínimo.' },
        { title: 'Consumo automático', desc: 'Al imprimir X mm, se descuenta film + tintas estimadas.' },
        { title: 'Reportes de consumo', desc: 'Costo por metro impreso y por pedido.' },
      ]}
    />
  );
}
