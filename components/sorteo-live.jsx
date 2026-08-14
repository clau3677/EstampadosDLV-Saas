'use client';
import { useState, useEffect, useRef } from 'react';
import { Gift, Loader2, RefreshCw, Trophy, PartyPopper } from 'lucide-react';

const PRIZES = [
  { rank: '1er Lugar', prize: 'Polerón personalizado', emoji: '🥇', gradient: 'from-yellow-500 to-amber-600' },
  { rank: '2do Lugar', prize: 'Polera personalizada', emoji: '🥈', gradient: 'from-gray-400 to-gray-500' },
  { rank: '3er Lugar', prize: 'Gorra personalizada', emoji: '🥉', gradient: 'from-orange-600 to-orange-700' },
];

export function SorteoLive() {
  const [drawnames, setDrawnames] = useState([]);
  const [contestTitle, setContestTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentRank, setCurrentRank] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [rollingName, setRollingName] = useState('');
  const [winner, setWinner] = useState(null);
  const [winners, setWinners] = useState([]);
  const [usedIndices, setUsedIndices] = useState([]);
  const [pickingApi, setPickingApi] = useState(false);
  const rollRef = useRef(null);

  const loadNames = async () => {
    try {
      const r = await fetch('/api/marketing/contest/drawnames');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setDrawnames(d.drawnames || []);
      setContestTitle(d.contestTitle || '');
      setLoading(false);
    } catch {
      setDrawnames([]);
      setLoading(false);
    }
  };

  useEffect(() => { loadNames(); }, []);

  const confettiBurst = () => {
    try {
      if (typeof window !== 'undefined' && window.confetti) {
        window.confetti({ particleCount: 150, spread: 90, origin: { y: 0.55 } });
        setTimeout(() => window.confetti({ particleCount: 80, spread: 70, origin: { x: 0.25, y: 0.6 } }), 300);
        setTimeout(() => window.confetti({ particleCount: 80, spread: 70, origin: { x: 0.75, y: 0.6 } }), 600);
      }
    } catch { /* noop */ }
  };

  const spin = () => {
    const available = drawnames.filter((_, i) => !usedIndices.includes(i));
    if (available.length === 0 || currentRank >= 3) return;
    setSpinning(true);
    setWinner(null);

    let ticks = 0;
    const totalTicks = 55;
    const pickFinal = Math.floor(Math.random() * available.length);
    const finalName = available[pickFinal].label;

    if (rollRef.current) clearInterval(rollRef.current);
    rollRef.current = setInterval(() => {
      ticks += 1;
      const randomName = available[Math.floor(Math.random() * available.length)].label;
      setRollingName(ticks >= totalTicks ? finalName : randomName);
      if (ticks >= totalTicks) {
        clearInterval(rollRef.current);
        rollRef.current = null;
        setWinner(finalName);
        confettiBurst();
        setWinners(ws => [...ws, { rank: PRIZES[currentRank], name: finalName }]);
        const idx = drawnames.findIndex(d => d.label === finalName);
        if (idx >= 0) setUsedIndices(u => [...u, idx]);
        setSpinning(false);
        setCurrentRank(c => c + 1);
      }
    }, 60 + ticks * 3);
  };

  const reset = () => {
    setCurrentRank(0);
    setWinners([]);
    setUsedIndices([]);
    setWinner(null);
    setRollingName('');
    if (rollRef.current) clearInterval(rollRef.current);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white flex flex-col items-center px-4 py-8">
      {/* Encabezado */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-5 py-2 text-sm text-white/70 mb-4">
          <PartyPopper className="h-4 w-4 text-yellow-400" />
          {contestTitle || 'Sorteo Estampados DLV'}
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight">
          <span className="bg-gradient-to-r from-orange-400 via-red-400 to-yellow-400 bg-clip-text text-transparent">
            ¡SORTEO EN VIVO!
          </span>
        </h1>
        <p className="text-white/50 mt-2 text-lg">{drawnames.length} participantes inscritos</p>
      </div>

      {/* Ruleta de nombres */}
      <div className="w-full max-w-2xl mb-6">
        <div className="rounded-3xl bg-white/5 border border-white/10 p-8 md:p-10 text-center min-h-[180px] flex flex-col items-center justify-center relative overflow-hidden">
          {spinning && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/10 to-transparent animate-pulse" />
          )}
          {winner ? (
            <div>
              <p className="text-yellow-400 font-bold text-xl mb-2">{winners[winners.length - 1]?.rank.emoji} {winners[winners.length - 1]?.rank.rank}</p>
              <p className="text-3xl md:text-5xl font-black animate-in zoom-in duration-300">{winner}</p>
            </div>
          ) : (
            <p className={`font-black transition-all ${rollingName ? 'text-3xl md:text-5xl' : 'text-xl text-white/30'}`}>
              {rollingName || (currentRank >= 3 ? 'Sorteo terminado' : 'Presiona "Sortear" para comenzar')}
            </p>
          )}
        </div>
      </div>

      {/* Botones de sorteo */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        {!spinning && currentRank < 3 && (
          <button
            onClick={spin}
            disabled={drawnames.length === 0}
            className="rounded-2xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-xl md:text-2xl px-10 py-5 shadow-2xl shadow-orange-500/30 transition-all hover:scale-105 flex items-center gap-3"
          >
            {pickingApi ? <Loader2 className="h-6 w-6 animate-spin" /> : <RefreshCw className="h-6 w-6" />}
            🎰 Sortear {PRIZES[currentRank].rank}
          </button>
        )}
        {spinning && (
          <div className="rounded-2xl bg-white/10 text-white/70 font-bold text-xl px-10 py-5 flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin" /> Girando...
          </div>
        )}
        {currentRank < 3 && !spinning && drawnames.length > 0 && (
          <button
            onClick={reset}
            className="rounded-2xl border border-white/20 text-white/60 hover:text-white font-bold px-6 py-5 flex items-center gap-2"
          >
            Reiniciar
          </button>
        )}
      </div>

      {/* Prizes */}
      <div className="grid gap-3 w-full max-w-2xl mb-8">
        {PRIZES.map((p, i) => {
          const won = winners.find(w => w.rank.rank === p.rank);
          return (
            <div
              key={p.rank}
              className={`rounded-2xl border p-4 flex items-center gap-4 transition-all duration-500 ${
                won
                  ? 'bg-white/10 border-yellow-500/50 shadow-lg shadow-yellow-500/10'
                  : i === currentRank
                    ? 'bg-white/5 border-orange-500/40'
                    : 'bg-white/[0.03] border-white/10 opacity-50'
              }`}
            >
              <span className="text-3xl">{p.emoji}</span>
              <div className="flex-1">
                <p className="font-bold text-white/60 text-sm">{p.rank}</p>
                <p className="font-black text-lg text-white">{p.prize}</p>
              </div>
              {won ? (
                <div className="text-right">
                  <p className="font-black text-lg text-yellow-300">{won.name}</p>
                </div>
              ) : i === currentRank ? (
                <span className="text-orange-400 font-bold text-sm">SIGUIENTE →</span>
              ) : (
                <span className="text-white/20 font-bold text-sm">—</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Sorteo terminado */}
      {currentRank >= 3 && winners.length === 3 && (
        <div className="w-full max-w-2xl text-center rounded-3xl bg-gradient-to-b from-yellow-500/20 to-transparent border border-yellow-500/30 p-8 mb-8">
          <Trophy className="h-14 w-14 text-yellow-400 mx-auto mb-3" />
          <h2 className="text-3xl font-black text-white mb-2">¡Sorteo completado! 🎉</h2>
          <p className="text-white/60">Los ganadores serán contactados por email para coordinar la entrega de sus premios.</p>
          {!pickingApi && (
            <button
              onClick={async () => {
                setPickingApi(true);
                try {
                  const r = await fetch('/api/marketing/contest/pick-winners-auto', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ winners }),
                  });
                  await r.json();
                  setPickingApi(false);
                  window.location.reload();
                } catch {
                  setPickingApi(false);
                }
              }}
              disabled={pickingApi}
              className="mt-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold text-lg px-8 py-4 flex items-center gap-2 mx-auto"
            >
              {pickingApi ? <Loader2 className="h-5 w-5 animate-spin" /> : <Gift className="h-5 w-5" />}
              Confirmar ganadores en el sistema
            </button>
          )}
        </div>
      )}

      <footer className="mt-auto text-white/30 text-sm py-6 text-center">
        Estampados DLV · Quilpué, Chile · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
