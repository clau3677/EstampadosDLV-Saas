'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Barra de progreso superior estilo YouTube/GitHub para transiciones de ruta.
 * - Cero dependencias externas
 * - Detecta cambios de pathname/searchParams
 * - También muestra progreso en clicks a <Link> antes del cambio de URL
 *   (intercepta el evento pointerdown en el body).
 */
export function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const finishRef = useRef(null);

  const start = () => {
    if (finishRef.current) { clearTimeout(finishRef.current); finishRef.current = null; }
    setVisible(true);
    setProgress(8);
    if (timerRef.current) clearInterval(timerRef.current);
    // Simular avance progresivo hasta 85% mientras carga
    timerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 85) return p;
        // curva logarítmica: crece rápido al principio y se ralentiza
        const remaining = 85 - p;
        return p + Math.max(0.5, remaining * 0.08);
      });
    }, 180);
  };

  const done = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setProgress(100);
    finishRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
  };

  // Interceptar clicks en enlaces internos → start progress
  useEffect(() => {
    const handleClick = (e) => {
      const link = e.target?.closest?.('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href) return;
      // Ignorar externos, hash-only, mailto, tel
      if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) return;
      if (href.startsWith('#')) return;
      if (link.target === '_blank') return;
      // Si el href coincide con la ruta actual, no hacer nada
      const currentUrl = window.location.pathname + window.location.search;
      const nextUrl = href.startsWith('/') ? href : new URL(href, window.location.href).pathname + new URL(href, window.location.href).search;
      if (nextUrl === currentUrl) return;
      start();
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  // Cuando cambia el pathname/searchParams → finalizar la barra
  useEffect(() => {
    if (!visible) return;
    // Pequeño delay para dar sensación de progreso completo
    const t = setTimeout(() => done(), 100);
    return () => clearTimeout(t);
  }, [pathname, searchParams?.toString()]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (finishRef.current) clearTimeout(finishRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div
        className="h-[3px] bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-500 shadow-[0_0_8px_rgba(249,115,22,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default TopProgressBar;
