'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ============================================================================
// ProductImagesUpload — uploader multi-imagen con previews y borrado
// Reutiliza /api/uploads/design (endpoint genérico de subida).
// ============================================================================

export function ProductImagesUpload({ value = [], onChange, maxImages = 8 }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);

  const handleFiles = async (files) => {
    const remaining = maxImages - value.length;
    if (remaining <= 0) return toast.error(`Máximo ${maxImages} imágenes`);
    const toUpload = Array.from(files).slice(0, remaining).filter(f => f.type.startsWith('image/'));

    for (const file of toUpload) {
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch('/api/uploads/design', { method: 'POST', body: fd });
        if (!r.ok) throw new Error('upload falló');
        const data = await r.json();
        onChange([...(value || []), data.url]);
      } catch (e) {
        toast.error(`No se pudo subir ${file.name}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {value.map((url, i) => (
          <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Eliminar"
            >
              <X className="h-3 w-3" />
            </button>
            {i === 0 && (
              <span className="absolute bottom-1 left-1 bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                PRINCIPAL
              </span>
            )}
          </div>
        ))}

        {value.length < maxImages && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`
              aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center
              cursor-pointer transition-all
              ${drag ? 'border-orange-500 bg-orange-50' : 'border-slate-300 hover:border-orange-400 hover:bg-slate-50'}
            `}
          >
            {uploading > 0 ? (
              <Loader2 className="h-5 w-5 text-orange-500 animate-spin" />
            ) : (
              <>
                <Upload className="h-4 w-4 text-slate-400" />
                <span className="text-[10px] text-slate-500 mt-1">Agregar</span>
              </>
            )}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files || [])}
      />

      <div className="mt-2 text-[11px] text-slate-500">
        La primera imagen es la <span className="font-semibold">principal</span>. Arrastra o haz clic para agregar.
      </div>
    </div>
  );
}

export default ProductImagesUpload;
