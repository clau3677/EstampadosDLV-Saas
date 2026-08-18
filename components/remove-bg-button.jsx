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
      // fetchOptions.timeout: imgly usa 60s por defecto y aborta el fetch del
      // modelo (44MB) en redes lentas → "IA 0%" perpetuo con reintentos. Se
      // amplía a 5 min para dar tiempo a la descarga; el modelo queda cacheado
      // en el navegador después del primer uso (IndexedDB + storage), así que
      // las siguientes veces es casi instantáneo.
      console.log('[remove-bg] etapa 1: removeBackground iniciado', absoluteImage.slice(0, 80));
      const blob = await removeBackground(absoluteImage, {
        publicPath: `${typeof window !== 'undefined' ? window.location.origin : ''}/api/imgly-assets/`,
        model: 'small',
        proxyToWorker: false,
        // v1.4.5 usa fetchArgs (RequestInit) para los fetches de modelos.
        // Se inyecta un AbortController con timeout de 5 min para que la
        // descarga del modelo (44MB) no se aborte en redes lentas (el
        // default de la librería corta a los 60s → "IA 0%" perpetuo).
        fetchArgs: (() => {
          const ctrl = new AbortController();
          setTimeout(() => ctrl.abort(), 300000);
          return { signal: ctrl.signal };
        })(),
        // NOTA: se omite `progress` de forma explícita — imgly v1.4.5 valida
        // con Zod el valor del tercer argumento del callback (espera `number`)
        // y en algunos reportes internos pasa `undefined` → ZodError que rompía
        // la corrida sin resultado visible ("IA 0%" → idle, sin toast).
      });

      // Subir el resultado transparente al servidor
      // El resultado de imgly es un Blob de Canvas con formato PNG RGBA
      // (el constructor File puede no retener tipo en algunos navegadores):
      console.log('[remove-bg] etapa 2: resultado recibido', blob?.type, blob?.size);
      const file = new File([blob], 'bg-removed.png', { type: blob.type || 'image/png' });
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/uploads/design', { method: 'POST', body: fd });
      console.log('[remove-bg] etapa 3: respuesta upload', r.status);
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`upload falló (${r.status}): ${txt.slice(0, 200)}`);
      }
      const data = await r.json();
      console.log('[remove-bg] etapa 4: upload ok', JSON.stringify(data).slice(0, 200));

      onDone?.(data);
      toast.success('Fondo eliminado ✨', { description: `${data.widthPx}×${data.heightPx}px, transparente` });
    } catch (e) {
      const detail =
        e instanceof Error
          ? `${e.name}: ${e.message}`
          : typeof e === 'object'
            ? JSON.stringify(e).slice(0, 300)
            : String(e);
      console.error('[remove-bg] fallo:', detail);
      toast.error('No se pudo quitar el fondo', { description: detail, duration: 12000 });
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
