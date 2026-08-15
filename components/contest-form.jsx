'use client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Trophy, Gift, Shirt, Printer, Clock, Users, CheckCircle2, Loader2,
  Crown, Medal, Share2, Facebook, Camera, Instagram, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';

const SITE_URL = 'https://estampadosdlv.com';
const SHARE_MESSAGE = encodeURIComponent('¡Mira esta tienda de estampados personalizados en Quilpué! 👕 Poleras, polerones y gorras con tus diseños. Participa en el concurso y gana premios 🎁 ');

const PRIZES = [
  { icon: Crown, rank: '1er Lugar', prize: 'Polerón personalizado', desc: 'Un polerón estampado con tu diseño', color: 'from-yellow-500 to-amber-600' },
  { icon: Medal, rank: '2do Lugar', prize: 'Polera personalizada', desc: 'Una polera estampada con tu diseño', color: 'from-gray-400 to-gray-500' },
  { icon: Trophy, rank: '3er Lugar', prize: 'Gorra personalizada', desc: 'Una gorra estampada con tu diseño', color: 'from-orange-600 to-orange-700' },
];

const FOLLOW_LINKS = [
  { id: 'facebook', label: 'Síguenos en Facebook', icon: Facebook, color: 'from-blue-600 to-blue-700', url: 'https://www.facebook.com/Estampadosdlv/' },
  { id: 'instagram', label: 'Síguenos en Instagram', icon: Instagram, color: 'from-pink-600 to-purple-600', url: 'https://www.instagram.com/estampadosdlv/' },
];

function shareUrl(network) {
  const url = encodeURIComponent(SITE_URL);
  const msg = SHARE_MESSAGE + encodeURIComponent(SITE_URL);
  switch (network) {
    case 'facebook': return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    case 'whatsapp': return `https://wa.me/?text=${msg}`;
    case 'x': return `https://twitter.com/intent/tweet?text=${SHARE_MESSAGE}&url=${url}`;
    default: return null;
  }
}

function openShare(network) {
  const u = shareUrl(network);
  if (!u) return false;
  // En móvil abrir en la misma ventana (apps nativas capturan el enlace), en escritorio en nueva pestaña
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = u;
  } else {
    window.open(u, '_blank');
  }
  return true;
}

function festiveConfettiBurst() {
  try {
    if (typeof window !== 'undefined' && window.confetti) {
      window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      setTimeout(() => window.confetti({ particleCount: 60, spread: 60, origin: { x: 0.3, y: 0.7 } }), 250);
      setTimeout(() => window.confetti({ particleCount: 60, spread: 60, origin: { x: 0.7, y: 0.7 } }), 450);
    }
  } catch { /* noop */ }
}

// File picker helper (reusable per step)
function pickProofFile(uploadHandler) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.onchange = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    await uploadHandler(file);
  };
  input.click();
}

export function ContestForm() {
  const [contest, setContest] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  // Flujo secuencial: 0=intro(email), 1=facebook+captura, 2=whatsapp+captura, 3=email+teléfono
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [uploading, setUploading] = useState(false);
  const [done1, setDone1] = useState(false); // captura facebook subida
  const [done2, setDone2] = useState(false); // captura whatsapp subida

  useEffect(() => {
    fetch('/api/marketing/contest')
      .then(r => r.json())
      .then(d => {
        setContest(d.contest);
        setParticipantCount(d.participantCount || 0);
        setLoading(false);
        festiveConfettiBurst();
      })
      .catch(() => setLoading(false));
  }, []);

  // Si ya estaba registrado con este email, saltar todo el flujo
  const checkProgress = async (em) => {
    if (!em || !em.includes('@')) return;
    try {
      const r = await fetch(`/api/marketing/contest/progress?email=${encodeURIComponent(em)}`);
      const d = await r.json();
      if (d?.registered) {
        setRegistered(true);
      } else if (d?.hasShare1 && d?.hasShare2) {
        setDone1(true);
        setDone2(true);
        setStep(3);
      } else if (d?.hasShare1) {
        setDone1(true);
        setStep(2);
      }
    } catch { /* noop */ }
  };

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

  // Subir captura de pantalla como comprobante
  const uploadProof = async (proofType, em) => {
    pickProofFile(async (file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La captura es muy grande (máx 5 MB)');
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('email', em.toLowerCase().trim());
        formData.append('proofType', proofType);
        formData.append('file', file);
        if (proofType === 'share1') formData.append('sharedNetworks', JSON.stringify(['facebook']));
        else if (proofType === 'share2') formData.append('sharedNetworks', JSON.stringify(['whatsapp']));
        const r = await fetch('/api/marketing/contest/upload-proof', {
          method: 'POST',
          body: formData,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Error al subir la captura');
        if (proofType === 'share1') {
          setDone1(true);
          toast.success('✅ Captura de Facebook recibida');
          setStep(2);
        } else if (proofType === 'share2') {
          setDone2(true);
          toast.success('✅ Captura de WhatsApp recibida');
          setStep(3);
        }
      } catch (e) {
        toast.error(e.message || 'Error al subir la captura');
      } finally {
        setUploading(false);
      }
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !email.includes('@')) return toast.error('Ingresa tu email');
    if (phone.replace(/\D/g, '').length < 8) return toast.error('Ingresa un teléfono válido');
    if (!done1 || !done2) return toast.error('Completa las capturas antes de registrarte');
    setSending(true);
    try {
      const r = await fetch('/api/marketing/contest/participate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          email: email.toLowerCase().trim(),
          phone,
          city: '',
          designIdea: '',
          contestId: contest?.id,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al registrarte');
      if (d.duplicate) {
        toast.info(d.message || 'Ya estás registrado');
        setRegistered(true);
        return;
      }
      setRegistered(true);
      setParticipantCount(c => c + 1);
      festiveConfettiBurst();
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
        <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
      </div>
    );
  }

  const isActive = contest?.status === 'active';

  if (!isActive && contest?.winners) {
    return (
      <div className="text-center py-12">
        <h3 className="text-4xl font-black text-white mb-8">🏆 ¡Ganadores del concurso!</h3>
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
        <h3 className="text-3xl font-black text-white mb-2">No hay un concurso activo</h3>
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
      {/* Título del formulario */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-amber-400/40 px-5 py-2 mb-4 shadow-lg shadow-orange-500/20">
          <Gift className="h-4 w-4 text-amber-300" />
          <span className="text-amber-200 text-sm font-bold">REGISTRO GRATIS · 3 PREMIOS</span>
        </div>
        <h3 className="text-3xl md:text-4xl font-black text-white">
          ¡Participa en <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400">3 pasos</span>! 🎉
        </h3>
        <p className="mt-2 text-white/70">Comparte en 2 redes y registra tu email para participar</p>
      </div>

      {/* Countdown */}
      {timeLeft && (
        <div className="flex items-center justify-center gap-2 text-center">
          <Clock className="h-5 w-5 text-amber-300" />
          <span className="text-white/80 font-mono text-lg">
            Termina en <span className="text-amber-300 font-bold">{timeLeft.d}d {timeLeft.h}h {timeLeft.m}m</span>
          </span>
        </div>
      )}

      {/* Contador de participantes */}
      <div className="flex items-center justify-center gap-2 text-white/70 text-sm font-semibold">
        <Users className="h-4 w-4 text-orange-400" />
        <span className="rounded-full bg-white/10 px-4 py-1 border border-white/15">{participantCount} participantes ya se inscribieron</span>
      </div>

      {/* Flujo secuencial paso a paso */}
      {registered ? (
        <div className="text-center py-8">
          <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-4" />
          <h4 className="text-2xl font-bold text-white">¡Estás participando! 🎉</h4>
          <p className="text-white/70 mt-2">Tus comprobantes quedaron registrados. Te contactaremos por email si resultas ganador/a.</p>
          <p className="text-white/50 text-sm mt-4">Los ganadores serán anunciados al terminar el concurso.</p>
        </div>
      ) : (
        <div className="max-w-lg mx-auto space-y-6">
          {/* Indicador de pasos */}
          <div className="flex items-center justify-center gap-2 mb-2">
            {[
              { label: 'Compartir en Facebook', done: done1, active: step === 1 },
              { label: 'Compartir en WhatsApp', done: done2, active: step === 2 },
              { label: 'Registrar email', done: !!registered, active: step === 3 },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex flex-col items-center gap-1 ${i > 0 ? 'ml-2' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    s.done ? 'bg-green-500 text-white' : s.active ? 'bg-orange-500 text-white ring-2 ring-orange-300' : 'bg-white/10 text-white/40'
                  }`}>
                    {s.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className="text-[10px] text-white/50 hidden sm:block">{s.label}</span>
                </div>
                {i < 2 && <div className={`w-6 h-px ${s.done ? 'bg-green-500' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>

          {/* Paso 0: Ingresar email para comenzar */}
          {step === 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-center mb-5">
                <Share2 className="h-10 w-10 text-orange-400 mx-auto mb-3" />
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-900 font-black text-xl shadow-lg mb-3">1</div>
                <h4 className="text-2xl font-black text-white">Paso 1: Tu email</h4>
                <p className="text-white/60 text-sm mt-1">Ingresa tu email para comenzar el concurso</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contest-email" className="text-white/80">Tu email *</Label>
                <Input
                  id="contest-email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-12 text-base"
                />
              </div>
              <button
                type="button"
                disabled={!email || !email.includes('@')}
                onClick={() => {
                  checkProgress(email);
                  if (!email.includes('@')) return toast.error('Ingresa un email válido');
                  setStep(1);
                }}
                className={`w-full mt-5 rounded-xl py-4 font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                  !email || !email.includes('@')
                    ? 'bg-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-xl hover:scale-[1.02]'
                }`}
              >
                Comenzar el concurso <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Paso 1: Compartir en Facebook + captura */}
          {step === 1 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-center mb-5">
                <Share2 className="h-10 w-10 text-orange-400 mx-auto mb-3" />
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-900 font-black text-xl shadow-lg mb-3">1</div>
                <h4 className="text-2xl font-black text-white">Paso 1: Comparte en Facebook</h4>
                <p className="text-white/60 text-sm mt-1">Publica el enlace de nuestra web y sube la captura</p>
              </div>

              {/* Botón compartir en Facebook: selecciona y abre el diálogo de inmediato */}
              <div className="rounded-xl border-2 border-blue-500/40 bg-blue-500/10 p-4 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    const ok = openShare('facebook');
                    if (ok) toast.info('Se abrió Facebook. Publica el enlace y vuelve aquí para subir tu captura 📸');
                    else toast.info('Abre Facebook y comparte el enlace manualmente');
                  }}
                  className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-4 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] text-lg"
                >
                  <Facebook className="h-6 w-6" />
                  Compartir en Facebook
                </button>
                <p className="text-xs text-white/50 text-center mt-2">
                  Al tocar se abre Facebook para publicar el enlace de la web
                </p>
              </div>

              {/* Botón subir captura AL LADO (en columna) */}
              <button
                type="button"
                disabled={uploading}
                onClick={() => uploadProof('share1', email)}
                className={`w-full rounded-xl py-4 font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                  uploading
                    ? 'bg-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-xl hover:scale-[1.02]'
                }`}
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {uploading ? 'Subiendo captura...' : '📸 Subir captura de pantalla'}
              </button>
              <p className="text-xs text-white/40 text-center mt-2">
                Después de publicar, saca una captura y súbela aquí
              </p>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="rounded-xl border border-white/20 text-white/60 hover:text-white py-3 px-4 flex items-center gap-1 text-sm"
                >
                  <ArrowLeft className="h-4 w-4" />Volver
                </button>
              </div>
            </div>
          )}

          {/* Paso 2: Compartir en WhatsApp + captura */}
          {step === 2 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                  <Share2 className="h-10 w-10 text-orange-400 mx-auto" />
                </div>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-900 font-black text-xl shadow-lg mb-3">2</div>
                <h4 className="text-2xl font-black text-white">Paso 2: Comparte en WhatsApp</h4>
                <p className="text-white/60 text-sm mt-1">Envía el enlace por WhatsApp y sube la captura</p>
              </div>

              <div className="rounded-xl border-2 border-green-500/40 bg-green-500/10 p-4 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    const ok = openShare('whatsapp');
                    if (ok) toast.info('Se abrió WhatsApp. Envía el mensaje y vuelve aquí para subir tu captura 📸');
                    else toast.info('Abre WhatsApp y comparte el enlace manualmente');
                  }}
                  className="w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold py-4 px-4 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] text-lg"
                >
                  <span className="font-black text-xl">W</span>
                  Compartir en WhatsApp
                </button>
                <p className="text-xs text-white/50 text-center mt-2">
                  Al tocar se abre WhatsApp con el mensaje y enlace listos
                </p>
              </div>

              <button
                type="button"
                disabled={uploading}
                onClick={() => uploadProof('share2', email)}
                className={`w-full rounded-xl py-4 font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                  uploading
                    ? 'bg-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-xl hover:scale-[1.02]'
                }`}
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {uploading ? 'Subiendo captura...' : '📸 Subir captura de pantalla'}
              </button>
              <p className="text-xs text-white/40 text-center mt-2">
                Después de enviar, saca una captura del mensaje enviado y súbela aquí
              </p>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-white/20 text-white/60 hover:text-white py-3 px-4 flex items-center gap-1 text-sm"
                >
                  <ArrowLeft className="h-4 w-4" />Volver
                </button>
              </div>
            </div>
          )}

          {/* Paso 3: Email + teléfono y registrar */}
          {step === 3 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                </div>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-900 font-black text-xl shadow-lg mb-3">3</div>
                <h4 className="text-2xl font-black text-white">¡Casi listo! Regístrate</h4>
                <p className="text-white/60 text-sm mt-1">Tus comprobantes fueron recibidos ✅</p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contest-email-final" className="text-white/80">Email *</Label>
                  <Input
                    id="contest-email-final"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-12 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contest-phone" className="text-white/80">Teléfono / WhatsApp *</Label>
                  <Input
                    id="contest-phone"
                    placeholder="+56 9 XXXX XXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40 h-12 text-base"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="rounded-xl border border-white/20 text-white/60 hover:text-white py-3 px-4 flex items-center gap-1 text-sm"
                  >
                    <ArrowLeft className="h-4 w-4" />Volver
                  </button>
                  <Button
                    type="submit"
                    disabled={sending}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold text-lg py-6 shadow-xl transition-all hover:scale-[1.02]"
                  >
                    {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Gift className="h-5 w-5" />}
                    {sending ? 'Enviando...' : '¡Participar ahora!'}
                  </Button>
                </div>
                <p className="text-xs text-white/40 text-center">
                  Al participar aceptas las bases del concurso. Los ganadores serán contactados por email.
                </p>
              </form>
            </div>
          )}
        </div>
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
          <li className="text-orange-300">• Para participar: comparte la web en Facebook + WhatsApp (con captura de pantalla) y registra tu email</li>
          <li>• Estampados DLV se reserva el derecho de validar la participación</li>
        </ul>
      </div>
    </div>
  );
}
