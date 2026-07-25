'use client';
import { Layers } from 'lucide-react';
import { ModuleShell } from '@/components/module-shell';

export default function GangSheetPage() {
  return (
    <ModuleShell
      title="Gang Sheet Builder"
      subtitle="Editor visual web para armar pliegos DTF Textil y DTF UV con reglas de hardware."
      icon={Layers}
      features={[
        'Selector obligatorio inicial: DTF Textil (31/33 cm) o DTF UV.',
        'Lienzo interactivo drag-and-drop con snap y guías.',
        'Cotizador en tiempo real basado en largo (mm) utilizado.',
        'Detección de DPI real de cada imagen (alerta si < 300 DPI).',
        'Herramientas IA open-source: quitar fondo (@imgly/background-removal) y escalar (Real-ESRGAN).',
        'Validación estricta: no permite exceder ancho máximo de cada impresora.',
      ]}
      roadmap={[
        { title: 'Canvas con Konva o Fabric.js', desc: 'Interacción drag/rotate/scale con snap al lienzo.' },
        { title: 'Upload de imágenes', desc: 'Subida a filesystem local con thumbnails y lectura de DPI.' },
        { title: 'Cotizador live', desc: 'Cálculo por mm impreso según tarifa DTF Textil / DTF UV.' },
        { title: 'Integración IA open-source', desc: 'Remove-bg local + upscaler on-device.' },
        { title: 'Export PNG/TIFF 300 DPI transparente', desc: 'Render con Sharp para la Hot Folder.' },
      ]}
    />
  );
}
