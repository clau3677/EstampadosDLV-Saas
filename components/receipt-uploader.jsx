'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import {
  Upload, Camera, ImageIcon, X, Loader2, CheckCircle2,
  AlertTriangle, RefreshCw, Clock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';

const MAX_SIZE_MB = 5;
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * Bloque UI para que el cliente suba su comprobante de transferencia.
 * Se renderiza en /checkout/gracias cuando paymentMethod === 'transfer'.
 *
 * Props:
 *  - order: { id, orderNumber, status, receiptUrl, receiptUploadedAt, paymentRejectionReason, ... }
 *  - customerEmail: email del pedido (para verificación anti-abuso en backend)
 *  - onUploaded: callback (updatedFields) → se llama con { status, receiptUrl } después del upload exitoso
 */
export default function ReceiptUploader({ order, customerEmail, onUploaded }) {
  const [file, setFile] = useState(null);       // File local seleccionado (aún no subido)
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef(null);

  const alreadyUploaded = !!order?.receiptUrl && order?.status === 'awaiting_payment';
  const wasRejected = !!order?.paymentRejectionReason;

  // Limpiar URLs de preview al desmontar
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleSelect = (f) => {
    if (!f) return;
    if (!ALLOWED_MIME.includes(f.type)) {
      toast.error('Formato no permitido', {
        description: 'Solo aceptamos imágenes JPG, PNG o WebP.',
      });
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`El archivo excede ${MAX_SIZE_MB} MB`, {
        description: `Tu foto pesa ${(f.size / 1024 / 1024).toFixed(1)} MB. Compresa antes de subirla.`,
      });
      return;
    }
    // Revocar url anterior si había
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleClear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async () => {
    if (!file || !order?.orderNumber || !customerEmail) return;
    setUploading(true);
    setProgress(0);

    // Usamos XMLHttpRequest para obtener eventos de progress
    const form = new FormData();
    form.append('orderNumber', order.orderNumber);
    form.append('email', customerEmail);
    form.append('file', file);

    try {
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/orders/upload-receipt');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data.error || `HTTP ${xhr.status}`));
          } catch (e) {
            reject(new Error('Respuesta inválida del servidor'));
          }
        };
        xhr.onerror = () => reject(new Error('Error de red'));
        xhr.send(form);
      });

      toast.success('¡Comprobante enviado!', {
        description: 'Te avisaremos por WhatsApp y correo cuando lo confirmemos.',
      });
      handleClear();
      onUploaded?.({
        status: 'awaiting_payment',
        receiptUrl: result.receiptUrl,
        receiptUploadedAt: new Date().toISOString(),
        paymentRejectionReason: null,
      });
    } catch (e) {
      toast.error('No se pudo subir el comprobante', { description: e.message });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  // ---------- Vistas por estado ----------

  // Estado A: Ya se subió comprobante y está esperando revisión
  if (alreadyUploaded && !wasRejected) {
    return (
      <Card className="mt-4 border-blue-200 bg-blue-50/40">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-blue-900">Comprobante recibido — revisando</div>
              <p className="text-xs text-blue-800/80 mt-1">
                Subimos tu comprobante el {formatDateTime(order.receiptUploadedAt)}. En cuanto lo revisemos, te avisaremos por WhatsApp y correo. Tu pedido queda reservado 24 h.
              </p>
              {order.receiptUrl && (
                <a
                  href={order.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Ver el comprobante que subí
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Estado B: Rechazado — el cliente puede subir otro
  // O estado C: Nunca subió comprobante — invitarlo a subir uno

  return (
    <Card className={`mt-4 ${wasRejected ? 'border-rose-300 bg-rose-50/40' : 'border-emerald-300 bg-emerald-50/30'}`}>
      <CardContent className="p-6">
        {wasRejected && (
          <div className="flex items-start gap-2 mb-4 p-3 rounded-lg bg-rose-100/60 border border-rose-200">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-900">
              <div className="font-bold">Tu comprobante anterior fue rechazado</div>
              <div className="mt-0.5">Motivo: <span className="font-medium">{order.paymentRejectionReason}</span></div>
              <div className="mt-1 opacity-80">Sube uno nuevo para continuar con tu pedido.</div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <Upload className={`h-5 w-5 shrink-0 mt-0.5 ${wasRejected ? 'text-rose-600' : 'text-emerald-600'}`} />
          <div className="flex-1">
            <div className={`font-bold ${wasRejected ? 'text-rose-900' : 'text-emerald-900'}`}>
              {wasRejected ? 'Sube un nuevo comprobante' : 'Sube tu comprobante de transferencia'}
            </div>
            <p className="text-xs text-slate-700/80 mt-1">
              Envíanos la captura o foto del pago. Formatos: JPG, PNG o WebP · máximo {MAX_SIZE_MB} MB.
            </p>

            {/* Preview del archivo seleccionado */}
            {file && previewUrl && (
              <div className="mt-3 relative inline-block rounded-lg overflow-hidden border-2 border-emerald-300 shadow-sm">
                <Image
                  src={previewUrl}
                  alt="Preview del comprobante"
                  width={200}
                  height={280}
                  className="object-contain max-h-72 w-auto"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={uploading}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-white/95 shadow flex items-center justify-center text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  aria-label="Quitar imagen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-mono px-2 py-1 truncate">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </div>
              </div>
            )}

            {/* Botones de selección/upload */}
            {!file ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Tomar foto: en móvil abre cámara; en desktop abre selector */}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => handleSelect(e.target.files?.[0])}
                  className="hidden"
                />
                <Button
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Camera className="h-3.5 w-3.5 mr-1.5" />
                  Tomar foto / Seleccionar
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={upload}
                  disabled={uploading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {uploading
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Subiendo {progress}%</>
                    : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Enviar comprobante</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleClear} disabled={uploading}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Cambiar
                </Button>
              </div>
            )}

            {/* Progress bar visual */}
            {uploading && (
              <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
