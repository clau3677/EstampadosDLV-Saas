'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// Botón de "Quitar fondo con IA" — usa @imgly/background-removal (100% cliente,
// modelo ONNX corriendo en el navegador, MIT license, sin API pagas).
// ============================================================================

export function RemoveBgButton({ imageUrl, onDone, disabled }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const run = async () => {
    setRunning(true);
    setProgress(0);
    try {
      // Dynamic import: el paquete pesa ~40MB (modelo ONNX) por lo que se
      // carga sólo cuando el usuario decide usarlo. El navegador cachea el
      // modelo después de la primera ejecución.
      // webpackChunkName evita que el chunk se llame con "node_modules" en el path
      // (algunos ingresses/proxies bloquean URLs con esa palabra o cortan por longitud).
      const { removeBackground } = await import(
        /* webpackChunkName: "imgly-bg-removal" */
        '@imgly/background-removal'
      );
      // Modelos auto-alojados en el propio dominio.
      // El CDN oficial (staticimgly.com) dejaba de servir los modelos → la
      // librería recibía HTML y fallaba con "invalid format: text/html".
      // La opción correcta es publicPath (camelCase). Modelo "small" (~44MB).
      // IMPORTANTE: si imageUrl es una ruta relativa ("/uploads/designs/...")
      // y publicPath no llega, la librería hace new URL(url, undefined) que
      // tira "Failed to construct 'URL': Invalid base URL". Por eso se
      // convierte a URL absoluta de antemano y se pasa publicPath absoluto.
      // NOTA: los archivos se sirven por la ruta dinámica /api/imgly-assets
      // porque Next standalone solo sirve estáticos presentes en el build;
      // resources.json y el resto viven en public/ y no se registran.
      const absoluteImage = imageUrl.startsWith('http')
        ? imageUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${imageUrl}`;
      const blob = await removeBackground(absoluteImage, {
        publicPath: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/imgly-assets/`,
        model: 'small',
        proxyToWorker: false,
        progress: (key, current, total) => {
          const p = Math.round((current / total) * 100);
          setProgress(p);
        },
      });

      // Subir el resultado transparente al servidor
      // El resultado de imgly es un Blob de Canvas con formato PNG RGBA
      // (el constructor File puede no retener tipo en algunos navegadores):
      const file = new File([blob], 'bg-removed.png', { type: blob.type || 'image/png' });
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/uploads/design', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('upload falló');
      const data = await r.json();

      onDone?.(data);
      toast.success('Fondo eliminado ✨', { description: `${data.widthPx}×${data.heightPx}px, transparente` });
    } catch (e) {
      console.error(e);
      toast.error('No se pudo quitar el fondo', { description: e.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={run}
      disabled={disabled || running}
      className="text-fuchsia-600 hover:text-fuchsia-700 hover:bg-fuchsia-50 border-fuchsia-200"
    >
      {running ? (
        <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />IA {progress}%</>
      ) : (
        <><Wand2 className="h-3.5 w-3.5 mr-1" />Quitar fondo IA</>
      )}
    </Button>
  );
}

export default RemoveBgButton;
