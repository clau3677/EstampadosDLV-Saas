'use client';
import { Zap } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function PrePrensaPage() {
  return (
    <ModuleShell
      title="Pre-Prensa · Zero Clicks"
      subtitle="Al confirmar el pago, el archivo listo para imprimir viaja solo a Digital Factory v11."
      icon={Zap}
      features={[
        'Trigger automático al marcar el pedido como "paid".',
        'Export PNG y TIFF transparente a 300 DPI usando Sharp.',
        'Enrutamiento inteligente: pedidos grandes → Prestige R2 Pro, chicos → Epson R1390, UV → cola UV.',
        'Depósito en Hot Folder correspondiente (montaje NFS/SMB al servidor Digital Factory).',
        'Registro auditable de cada exportación (fecha, archivo, cola destino, operador).',
        'Reintento automático ante fallo de escritura + notificación al admin.',
      ]}
      roadmap={[
        { title: 'Servicio de export', desc: 'Endpoint /api/pre-press/export que consume gang_sheets.' },
        { title: 'Sharp pipeline 300 DPI', desc: 'Render PNG + TIFF con canal alpha y perfiles de color.' },
        { title: 'Config Hot Folders', desc: 'Variables de entorno HOTFOLDER_EPSON, HOTFOLDER_PRESTIGE, HOTFOLDER_UV.' },
        { title: 'Router de impresoras', desc: 'Regla por lengthMm + tipo (>= 500mm → Prestige).' },
        { title: 'Log de auditoría', desc: 'Colección stock_movements + eventos de sistema.' },
      ]}
    />
  );
}
