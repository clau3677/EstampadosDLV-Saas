'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Trophy, Gift, Shirt, Printer, Clock, Users, CheckCircle2, Loader2, Crown, Medal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';

const PRIZES = [
  { icon: Crown, rank: '1er Lugar', prize: 'Polerón personalizado', desc: 'Un polerón estampado con tu diseño', color: 'from-yellow-500 to-amber-600' },
  { icon: Medal, rank: '2do Lugar', prize: 'Polera personalizada', desc: 'Una polera estampada con tu diseño', color: 'from-gray-400 to-gray-500' },
  { icon: Trophy, rank: '3er Lugar', prize: 'Gorra personalizada', desc: 'Una gorra estampada con tu diseño', color: 'from-orange-600 to-orange-700' },
];

export function ContestForm() {
  const [contest, setContest] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', city: '', designIdea: '',
  });

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    fetch('/api/marketing/contest')
      .then(r => r.json())
      .then(d => {
        setContest(d.contest);
        setParticipantCount(d.participantCount || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!contest?.endDate) return;
    const update = () => {
      const end = new Date(contest.endDate);
      const diff = end.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft({ d, h, m });
    };
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, [contest?.endDate]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.length < 2) return toast.error('Ingresa tu nombre completo');
    if (!form.email.includes('@') || form.email.length < 5) return toast.error('Ingresa un email válido');
    if (form.phone.length < 8) return toast.error('Ingresa un teléfono válido');
    if (!form.city) return toast.error('Ingresa tu ciudad');
    setSending(true);
    try {
      const r = await fetch('/api/marketing/contest/participate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, contestId: contest?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al registrarte');
      setRegistered(true);
      setParticipantCount(c => c + 1);
      toast.success('¡Estás participando! 🎉');
    } catch (err) {
      toast.error(err.message || 'Error al registrarte');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </div>
    );
  }

  const isActive = contest?.status === 'active';

  if (!isActive && contest?.winners) {
    return (
      <div className="text-center py-12">
        <h3 className="text-3xl font-bold text-white mb-8">🏆 ¡Ganadores del concurso!</h3>
        <div className="grid gap-4 max-w-md mx-auto">
          {contest.winners.first && (
            <div className="rounded-xl bg-yellow-500/20 border border-yellow-500/30 p-4 text-center">
              <span className="text-yellow-400 font-bold text-sm">🥇 1er Lugar — Polerón personalizado</span>
              <p className="text-white font-bold text-lg">{contest.winners.first.name}</p>
              <p className="text-white/70 text-sm">{contest.winners.first.city}</p>
            </div>
          )}
          {contest.winners.second && (
            <div className="rounded-xl bg-gray-500/20 border border-gray-500/30 p-4 text-center">
              <span className="text-gray-300 font-bold text-sm">🥈 2do Lugar — Polera personalizada</span>
              <p className="text-white font-bold text-lg">{contest.winners.second.name}</p>
              <p className="text-white/70 text-sm">{contest.winners.second.city}</p>
            </div>
          )}
          {contest.winners.third && (
            <div className="rounded-xl bg-orange-500/20 border border-orange-500/30 p-4 text-center">
              <span className="text-orange-400 font-bold text-sm">🥉 3er Lugar — Gorra personalizada</span>
              <p className="text-white font-bold text-lg">{contest.winners.third.name}</p>
              <p className="text-white/70 text-sm">{contest.winners.third.city}</p>
            </div>
          )}
        </div>
        <p className="mt-6 text-white/70">¡Gracias a todos los participantes! Pronto habrá un nuevo concurso.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/mockup" className="inline-flex items-center gap-2 rounded-lg bg-white text-rose-600 hover:bg-white/95 font-bold px-6 py-3 shadow-xl transition-all hover:scale-105">
            <Shirt className="h-5 w-5" />Crea tu mockup gratis
          </Link>
          <Link href="/tienda" className="inline-flex items-center gap-2 rounded-lg border-2 border-white/40 hover:bg-white/10 text-white font-bold px-6 py-3 transition-colors">
            Ver catálogo
          </Link>
        </div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="text-center py-12">
        <Gift className="h-16 w-16 text-white/30 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">No hay un concurso activo</h3>
        <p className="text-white/70">Estamos preparando el próximo concurso. ¡Vuelve pronto!</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/tienda" className="inline-flex items-center gap-2 rounded-lg bg-white text-rose-600 hover:bg-white/95 font-bold px-6 py-3 shadow-xl transition-all hover:scale-105">
            Ver catálogo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Premio destaque */}
      <div className="text-center">
        <h3 className="text-2xl md:text-3xl font-bold text-white">🎁 3 premios increíbles</h3>
        <p className="mt-2 text-white/70">¡Todos participan por los 3 premios!</p>
      </div>

      {/* Cards de premios */}
      <div className="grid gap-4 md:grid-cols-3">
        {PRIZES.map((p, i) => (
          <div key={i} className={`relative rounded-2xl bg-gradient-to-b ${p.color} p-[1px] shadow-xl`}>
            <div className="rounded-2xl bg-zinc-900/90 p-5 text-center h-full">
              <p.icon className="h-8 w-8 text-white mx-auto mb-2" />
              <span className="text-sm font-bold text-white/60">{p.rank}</span>
              <h4 className="text-lg font-bold text-white mt-1">{p.prize}</h4>
              <p className="text-sm text-white/50 mt-1">{p.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Countdown */}
      {timeLeft && (
        <div className="flex items-center justify-center gap-3 text-center">
          <Clock className="h-5 w-5 text-orange-400" />
          <span className="text-white/80 font-mono text-lg">
            Quedan <span className="text-orange-400 font-bold">{timeLeft.d}d {timeLeft.h}h {timeLeft.m}m</span>
          </span>
        </div>
      )}

      {/* Contador de participantes */}
      <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
        <Users className="h-4 w-4" />
        <span>{participantCount} participantes ya se inscribieron</span>
      </div>

      {/* Formulario */}
      {registered ? (
        <div className="text-center py-8">
          <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-4" />
          <h4 className="text-2xl font-bold text-white">¡Estás participando! 🎉</h4>
          <p className="text-white/70 mt-2">Te contactaremos si resultas ganador/a.</p>
          <p className="text-white/50 text-sm mt-4">Los ganadores serán anunciados al terminar el concurso.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 max-w-lg mx-auto">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contest-name" className="text-white/80">Nombre completo *</Label>
              <Input id="contest-name" placeholder="Tu nombre" value={form.name} onChange={setF('name')} required className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-email" className="text-white/80">Email *</Label>
              <Input id="contest-email" type="email" placeholder="tu@email.com" value={form.email} onChange={setF('email')} required className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-phone" className="text-white/80">Teléfono / WhatsApp *</Label>
              <Input id="contest-phone" placeholder="+56 9 XXXX XXXX" value={form.phone} onChange={setF('phone')} required className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contest-city" className="text-white/80">Ciudad *</Label>
              <Input id="contest-city" placeholder="Quilpué, Viña del Mar..." value={form.city} onChange={setF('city')} required className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contest-design" className="text-white/80">¿Qué diseño te gustaría estampar? (opcional)</Label>
            <Textarea id="contest-design" placeholder="Cuéntanos tu idea: un logo, un nombre, un personaje..." value={form.designIdea} onChange={setF('designIdea')} rows={3} className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
          </div>
          <Button
            type="submit"
            disabled={sending}
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold text-lg py-6 shadow-xl transition-all hover:scale-[1.02]"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Gift className="h-5 w-5" />}
            {sending ? 'Enviando...' : '¡Participar ahora!'}
          </Button>
          <p className="text-xs text-white/40 text-center">
            Al participar aceptas las bases del concurso. Los ganadores serán contactados por email/teléfono.
          </p>
        </form>
      )}

      {/* Reglas */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 max-w-lg mx-auto">
        <h4 className="text-white font-bold mb-3 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-400" />Bases del concurso</h4>
        <ul className="space-y-2 text-sm text-white/70">
          <li>• 1er lugar: Polerón personalizado estampado</li>
          <li>• 2do lugar: Polera personalizada estampada</li>
          <li>• 3er lugar: Gorra personalizada estampada</li>
          <li>• Los ganadores serán seleccionados aleatoriamente</li>
          <li>• El premio incluye estampado con un diseño de tu elección</li>
          <li>• Envío a todo Chile (costo de envío a cargo del ganador)</li>
          <li>• Los ganadores serán contactados por email/teléfono</li>
          <li>• Estampados DLV se reserva el derecho de validar la participación</li>
        </ul>
      </div>
    </div>
  );
}
