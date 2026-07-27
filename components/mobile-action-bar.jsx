'use client';

import { Phone, MessageCircle } from 'lucide-react';
import { BUSINESS } from '@/lib/constants/business';

/**
 * Barra sticky de acciones para móvil (WhatsApp + Llamar).
 * - Sólo visible en pantallas < md (768px)
 * - Sólo se muestra en páginas públicas (renderizada dentro de LayoutSelector cuando isPublic=true)
 * - Fixed bottom con blur, gradient de fondo
 * - Deja espacio inferior con `pb-16 md:pb-0` cuando esté activa
 */
export function MobileActionBar() {
  return (
    <>
      {/* Spacer para evitar que la barra tape el contenido final */}
      <div className="h-16 md:hidden" aria-hidden="true" />

      <div className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-slate-200 bg-white/95 backdrop-blur-lg shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-2 divide-x divide-slate-200">
          <a
            href={BUSINESS.phone.tel}
            className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-orange-600 active:bg-orange-50 transition-colors"
            aria-label="Llamar al taller"
          >
            <Phone className="h-4 w-4" />
            <span>Llamar</span>
          </a>
          <a
            href={BUSINESS.whatsapp.url()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 active:from-emerald-600 active:to-emerald-700 transition-colors"
            aria-label="Escribir por WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>
    </>
  );
}

export default MobileActionBar;
