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

// Redes para compartir (red #1)
const SHARE_NETWORKS_1 = [
  { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'from-blue-600 to-blue-700', hoverColor: 'hover:from-blue-700 hover:to-blue-800' },
  { id: 'whatsapp', label: 'WhatsApp', icon: ({ className }) => <span className={`font-black ${className}`}>W</span>, color: 'from-green-600 to-green-700', hoverColor: 'hover:from-green-700 hover:to-green-800' },
];

// Redes para compartir (red #2)
const SHARE_NETWORKS_2 = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'from-pink-600 to-purple-600', hoverColor: 'hover:from-pink-700 hover:to-purple-700' },
  { id: 'tiktok', label: 'TikTok', icon: ({ className }) => <span className={`font-black ${className}`}>T</span>, color: 'from-zinc-800 to-black', hoverColor: 'hover:from-zinc-900 hover:to-black' },
  { id: 'x', label: 'X / Twitter', icon: ({ className }) => <span className={`font-black ${className}`}>𝕏</span>, color: 'from-zinc-700 to-zinc-900', hoverColor: 'hover:from-zinc-800 hover:to-black' },
  { id: 'whatsapp', label: 'WhatsApp', icon: ({ className }) => <span className={`font-black ${className}`}>W</span>, color: 'from-green-600 to-green-700', hoverColor: 'hover:from-green-700 hover:to-green-800' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'from-blue-600 to-blue-700', hoverColor: 'hover:from-blue-700 hover:to-blue-800' },
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

export function ContestForm() {
  const [contest, setContest] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  // Flujo viral paso a paso
  const [step, setStep] = useState(0); // 0=share1, 1=share2, 2=follow, 3=registro
  const [email, setEmail] = useState('');
  const [selectedNetwork1, setSelectedNetwork1] = useState(null);
  const [selectedNetwork2, setSelectedNetwork2] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ hasShare1: false, hasShare2: false, hasFollow: false, viralComplete: false, registered: false });

  const [form, setForm] = useState({
    name: '', phone: '', city: '', designIdea: '',
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

  // Cuando se ingrese el email, verificar progreso existente
  const checkProgress = async (em) => {
    if (!em || !em.includes('@')) return;
    try {
      const r = await fetch(`/api/marketing/contest/progress?email=${encodeURIComponent(em)}`);
      const d = await r.json();
      setProgress(d);
      // Saltar pasos ya completados
      if (d.hasShare1 && d.hasShare2 && d.hasFollow && d.registered) setStep(3);
      else if (d.hasShare1 && d.hasShare2 && d.hasFollow) setStep(3);
      else if (d.hasShare1 && d.hasShare2) setStep(2);
      else if (d.hasShare1) setStep(1);
    } catch { /* noop */ }
  };

  useEffect(() => {
    if (step === 3) checkProgress(email);
  }, [step]);

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
  const uploadProof = async (proofType, networkId) => {
    if (!email || !email.includes('@')) {
      toast.error('Ingresa tu email primero');
      return;
    }
    // Mostrar selector de archivo
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        toast.error('La captura es muy grande (máx 5 MB)');
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('email', email.toLowerCase().trim());
        formData.append('proofType', proofType);
        formData.append('file', file);
        if (proofType === 'share1' && selectedNetwork1) {
          formData.append('sharedNetworks', JSON.stringify([selectedNetwork1]));
        } else if (proofType === 'share2' && selectedNetwork2) {
          formData.append('sharedNetworks', JSON.stringify([selectedNetwork2]));
        }
        const r = await fetch('/api/marketing/contest/upload-proof', {
          method: 'POST',
          body: formData,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Error al subir la captura');
        setProgress(d);
        toast.success('✅ Captura recibida');
        // Avanzar al siguiente paso
        if (proofType === 'share1') setStep(1);
        else if (proofType === 'share2') setStep(2);
        else if (proofType === 'follow') setStep(3);
      } catch (e) {
        toast.error(e.message || 'Error al subir la captura');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.length < 2) return toast.error('Ingresa tu nombre completo');
    if (form.phone.length < 8) return toast.error('Ingresa un teléfono válido');
    if (!form.city) return toast.error('Ingresa tu ciudad');
    if (!progress.viralComplete && !progress.hasFollow) {
      return toast.error('Completa todos los pasos antes de registrarte');
    }
    setSending(true);
    try {
      const r = await fetch('/api/marketing/contest/participate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: email.toLowerCase().trim(),
          phone: form.phone,
          city: form.city,
          designIdea: form.designIdea,
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

      {/* Flujo viral paso a paso */}
      {registered ? (
        <div className="text-center py-8">
          <CheckCircle2 className="h-16 w-16 text-green-400 mx-auto mb-4" />
          <h4 className="text-2xl font-bold text-white">¡Estás participando! 🎉</h4>
          <p className="text-white/70 mt-2">Tus comprobantes quedaron registrados. Te contactaremos si resultas ganador/a.</p>
          <p className="text-white/50 text-sm mt-4">Los ganadores serán anunciados al terminar el concurso.</p>
        </div>
      ) : (
        <div className="max-w-lg mx-auto space-y-6">
          {/* Indicador de pasos */}
          <div className="flex items-center justify-center gap-2 mb-2">
            {[
              { label: 'Compartir 1', done: !!progress.hasShare1, active: step === 0 },
              { label: 'Compartir 2', done: !!progress.hasShare2, active: step === 1 },
              { label: 'Seguir redes', done: !!progress.hasFollow, active: step === 2 },
              { label: 'Registrarse', done: !!progress.registered, active: step === 3 },
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
                {i < 3 && <div className={`w-6 h-px ${s.done ? 'bg-green-500' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>

          {/* Paso 0: Compartir en red #1 */}
          {step === 0 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-center mb-5">
                <Share2 className="h-10 w-10 text-orange-400 mx-auto mb-3" />
                <h4 className="text-xl font-bold text-white">Paso 1: Comparte nuestra web</h4>
                <p className="text-white/60 text-sm mt-1">Elige una red social y comparte la web de Estampados DLV</p>
              </div>

              {/* Email primero */}
              <div className="space-y-2 mb-5">
                <Label htmlFor="contest-email" className="text-white/80">Tu email (para guardarte como participante) *</Label>
                <Input
                  id="contest-email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
              </div>

              <p className="text-white/50 text-xs mb-3">1) Toca una red para abrir el diálogo de compartir → 2) Publica → 3) Saca captura y súbela aquí</p>

              <div className="grid gap-3 sm:grid-cols-2 mb-4">
                {SHARE_NETWORKS_1.map((net) => (
                  <div key={net.id} className={`rounded-xl border-2 transition-all p-4 ${
                    selectedNetwork1 === net.id ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-white/5 hover:border-white/30'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setSelectedNetwork1(net.id)}
                      className={`w-full rounded-lg bg-gradient-to-r ${net.color} ${net.hoverColor} text-white font-bold py-3 px-4 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]`}
                    >
                      <net.icon className="h-5 w-5" />
                      Compartir en {net.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNetwork1(net.id);
                        const u = shareUrl(net.id);
                        if (u) window.open(u, '_blank');
                        else toast.info(`Abre ${net.label} y comparte el enlace manualmente`);
                      }}
                      className="w-full mt-2 text-xs text-white/50 hover:text-white/80 underline"
                    >
                      Abrir diálogo de compartir
                    </button>
                  </div>
                ))}
              </div>

              {/* Subir captura */}
              <button
                type="button"
                disabled={uploading || !selectedNetwork1 || !email || !email.includes('@')}
                onClick={() => uploadProof('share1', selectedNetwork1)}
                className={`w-full rounded-xl py-4 font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                  uploading || !selectedNetwork1 || !email || !email.includes('@')
                    ? 'bg-white/10 text-white/30 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-xl hover:scale-[1.02]'
                }`}
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {uploading ? 'Subiendo captura...' : 'Subir captura de pantalla 📸'}
              </button>
              {selectedNetwork1 && (
                <p className="text-xs text-white/40 text-center mt-2">
                  Seleccionaste: {SHARE_NETWORKS_1.find(n => n.id === selectedNetwork1)?.label}
                </p>
              )}
            </div>
          )}

          {/* Paso 1: Compartir en red #2 */}
          {step === 1 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                  <Share2 className="h-10 w-10 text-orange-400 mx-auto" />
                </div>
                <h4 className="text-xl font-bold text-white">Paso 2: Comparte en otra red</h4>
                <p className="text-white/60 text-sm mt-1">Ahora elige una red DIFERENTE para compartir</p>
              </div>

              <p className="text-white/50 text-xs mb-3">1) Toca una red diferente → 2) Publica → 3) Saca captura y súbela</p>

              <div className="grid gap-3 sm:grid-cols-2 mb-4">
                {SHARE_NETWORKS_2.map((net) => (
                  <div key={net.id} className={`rounded-xl border-2 transition-all p-4 ${
                    selectedNetwork2 === net.id ? 'border-orange-500 bg-orange-500/10' : 'border-white/10 bg-white/5 hover:border-white/30'
                  }`}>
                    <button
                      type="button"
                      onClick={() => setSelectedNetwork2(net.id)}
                      className={`w-full rounded-lg bg-gradient-to-r ${net.color} ${net.hoverColor} text-white font-bold py-3 px-4 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]`}
                    >
                      <net.icon className="h-5 w-5" />
                      Compartir en {net.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNetwork2(net.id);
                        const u = shareUrl(net.id);
                        if (u) window.open(u, '_blank');
                        else toast.info(`Abre ${net.label} y comparte el enlace manualmente`);
                      }}
                      className="w-full mt-2 text-xs text-white/50 hover:text-white/80 underline"
                    >
                      Abrir diálogo de compartir
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="rounded-xl border border-white/20 text-white/60 hover:text-white py-3 px-4 flex items-center gap-1 text-sm"
                >
                  <ArrowLeft className="h-4 w-4" />Volver
                </button>
                <button
                  type="button"
                  disabled={uploading || !selectedNetwork2}
                  onClick={() => uploadProof('share2', selectedNetwork2)}
                  className={`flex-1 rounded-xl py-3 font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                    uploading || !selectedNetwork2
                      ? 'bg-white/10 text-white/30 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-xl hover:scale-[1.02]'
                  }`}
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  {uploading ? 'Subiendo...' : 'Subir captura 📸'}
                </button>
              </div>
            </div>
          )}

          {/* Paso 2: Seguir redes */}
          {step === 2 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                  <Share2 className="h-10 w-10 text-orange-400 mx-auto" />
                </div>
                <h4 className="text-xl font-bold text-white">Paso 3: Síguenos en redes sociales</h4>
                <p className="text-white/60 text-sm mt-1">Sigue a Estampados DLV en Facebook e Instagram</p>
              </div>

              <div className="space-y-3 mb-5">
                {FOLLOW_LINKS.map((net) => (
                  <a
                    key={net.id}
                    href={net.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block rounded-lg bg-gradient-to-r ${net.color} text-white font-bold py-3 px-4 flex items-center justify-center gap-2 transition-all hover:scale-[1.01]`}
                  >
                    <net.icon className="h-5 w-5" />
                    {net.label} ↗
                  </a>
                ))}
              </div>

              <p className="text-white/50 text-xs mb-4 text-center">
                Después de seguirnos, saca una captura de tu perfil mostrando que sigues las redes y súbela aquí:
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-white/20 text-white/60 hover:text-white py-3 px-4 flex items-center gap-1 text-sm"
                >
                  <ArrowLeft className="h-4 w-4" />Volver
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => uploadProof('follow', null)}
                  className={`flex-1 rounded-xl py-3 font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                    uploading
                      ? 'bg-white/10 text-white/30 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-xl hover:scale-[1.02]'
                  }`}
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  {uploading ? 'Subiendo...' : 'Subir captura de seguimiento 📸'}
                </button>
              </div>
            </div>
          )}

          {/* Paso 3: Formulario de registro */}
          {step === 3 && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
              <div className="text-center mb-5">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                </div>
                <h4 className="text-xl font-bold text-white">¡Casi listo! Completa tus datos</h4>
                <p className="text-white/60 text-sm mt-1">Todos tus comprobantes fueron recibidos ✅</p>
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
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contest-name" className="text-white/80">Nombre completo *</Label>
                    <Input id="contest-name" placeholder="Tu nombre" value={form.name} onChange={setF('name')} required className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contest-phone" className="text-white/80">Teléfono / WhatsApp *</Label>
                    <Input id="contest-phone" placeholder="+56 9 XXXX XXXX" value={form.phone} onChange={setF('phone')} required className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contest-city" className="text-white/80">Ciudad *</Label>
                  <Input id="contest-city" placeholder="Quilpué, Viña del Mar..." value={form.city} onChange={setF('city')} required className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contest-design" className="text-white/80">¿Qué diseño te gustaría estampar? (opcional)</Label>
                  <Textarea id="contest-design" placeholder="Cuéntanos tu idea: un logo, un nombre, un personaje..." value={form.designIdea} onChange={setF('designIdea')} rows={3} className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
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
                  Al participar aceptas las bases del concurso. Los ganadores serán contactados por email/teléfono.
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
          <li className="text-orange-300">• Para participar: comparte la web en 2 redes sociales distintas + sigue nuestras redes (con captura de pantalla)</li>
          <li>• Estampados DLV se reserva el derecho de validar la participación</li>
        </ul>
      </div>
    </div>
  );
}
