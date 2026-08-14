'use client';
import { useEffect, useState } from 'react';

const BOX =
  'flex flex-col items-center justify-center min-w-[72px] md:min-w-[88px] rounded-2xl bg-gradient-to-b from-white/10 to-white/[0.03] border border-amber-400/30 shadow-lg shadow-orange-500/10 backdrop-blur-sm px-2 py-3';
const NUM = 'text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-orange-400 tabular-nums';
const LABEL = 'text-[10px] md:text-xs font-bold text-white/60 uppercase tracking-wider mt-1';

export function ContestCountdown() {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    const fetchEnd = async () => {
      try {
        const r = await fetch('/api/marketing/contest');
        const d = await r.json();
        return d?.contest?.endDate || null;
      } catch {
        return null;
      }
    };
    let endDate = null;
    const update = async () => {
      if (!endDate) endDate = await fetchEnd();
      if (!endDate) {
        setTimeLeft(null);
        return;
      }
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }
      setTimeLeft({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);

  if (!timeLeft) return null;

  return (
    <div className="mt-8" aria-label="Tiempo restante del concurso">
      <p className="text-sm font-bold text-amber-300 mb-3 flex items-center justify-center md:justify-start gap-2">
        ⏰ El sorteo termina en:
      </p>
      <div className="flex items-center justify-center md:justify-start gap-2 md:gap-3">
        <div className={BOX}><span className={NUM}>{timeLeft.d}</span><span className={LABEL}>Días</span></div>
        <span className="text-2xl font-black text-amber-300/70">:</span>
        <div className={BOX}><span className={NUM}>{timeLeft.h}</span><span className={LABEL}>Horas</span></div>
        <span className="text-2xl font-black text-amber-300/70">:</span>
        <div className={BOX}><span className={NUM}>{timeLeft.m}</span><span className={LABEL}>Min</span></div>
        <span className="text-2xl font-black text-amber-300/70">:</span>
        <div className={BOX}><span className={NUM}>{timeLeft.s}</span><span className={LABEL}>Seg</span></div>
      </div>
    </div>
  );
}
