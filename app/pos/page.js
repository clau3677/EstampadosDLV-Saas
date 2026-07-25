'use client';
import { ShoppingCart } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function PosPage() {
  return (
    <ModuleShell
      title="POS · Punto de Venta"
      subtitle="Interfaz para el local físico con caja, boletas y sincronización omnicanal."
      icon={ShoppingCart}
      features={[
        'Apertura y cierre de caja con arqueo automático (efectivo/tarjeta).',
        'Búsqueda rápida por SKU, nombre o código de barras.',
        'Emisión de boletas electrónicas (integración SII futura).',
        'Descuento inmediato del stock comercial al cerrar la venta.',
        'Sincronización omnicanal: venta presencial reduce stock web en tiempo real.',
        'Métodos de pago: efectivo, tarjeta, transferencia, WebPay, MercadoPago.',
      ]}
      roadmap={[
        { title: 'Modelo de sesión de caja', desc: 'Colección pos_sessions con apertura, cierre y arqueo.' },
        { title: 'Vista de caja registradora', desc: 'Carrito, cliente opcional, totales con IVA 19%.' },
        { title: 'Descuento omnicanal', desc: 'Hook a stock_movements que actualiza commercial_stock.' },
        { title: 'Integración boleta electrónica', desc: 'Conexión con proveedor DTE (OpenFactura / SimpleAPI).' },
      ]}
    />
  );
}
