'use client';
// =============================================================================
// Administración de Concursos — Pestaña del panel de marketing
// Permite: crear sorteos, activar/pausar/desactivar, ver participantes
// con capturas, y elegir ganadores manualmente.
// =============================================================================
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Trophy, Gift, Users, Camera, Play, Pause, Square, Plus,
  Loader2, ExternalLink, Eye, MessageSquare, Download,
} from 'lucide-react';
import Link from 'next/link';

const STATUS_BADGE = {
  active: { label: 'ACTIVO', cls: 'bg-green-500/20 text-green-300 border-green-500/40' },
  paused: { label: 'PAUSADO', cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  ended: { label: 'FINALIZADO', cls: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40' },
  future: { label: 'PROGRAMADO', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
};

export function ContestAdmin() {
  const [contest, setContest] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [participantError, setParticipantError] = useState(null);
  const [picking, setPicking] = useState(false);
  const [newTitle, setNewTitle] = useState('Concurso Estampados DLV');
  const [newDays, setNewDays] = useState('90');

  const fetchAll = async () => {
    try {
      const r1 = await fetch('/api/marketing/contest/admin');
      const d1 = await r1.json();
      if (!r1.ok) { setContest(null); setParticipantError('No se pudieron cargar los datos del sorteo'); setLoading(false); return; }
      setContest(d1.contest || null);
      if (d1.contest?.id) {
        const r2b = await fetch('/api/marketing/contest/participants?contestId=' + encodeURIComponent(d1.contest.id));
        const d2 = await r2b.json();
        if (r2b.ok) setParticipants(d2.participants || []);
      } else {
        setParticipants([]);
      }
    } catch { /* noop */ }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const api = async (path, body) => {
    const r = await fetch(`/api/marketing${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r;
  };

  const handleCreate = async () => {
    if (newTitle.length < 3) return toast.error('Ingresa un título');
    const days = parseInt(newDays);
    if (!days || days < 7 || days > 365) return toast.error('Duración entre 7 y 365 días');
    setSending(true);
    try {
      const r = await api('/contest/create', { title: newTitle, durationDays: days });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al crear el sorteo');
      toast.success('Sorteo creado y activado 🎉');
      setShowCreate(false);
      fetchAll();
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  };

  const handleStatus = async (status) => {
    setSending(true);
    try {
      const r = await api('/contest/set-status', { status });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      toast.success(`Sorteo ${status === 'active' ? 'activado' : status === 'paused' ? 'pausado' : 'finalizado'}`);
      fetchAll();
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  };

  const handlePickWinners = async () => {
    if (participants.length < 3) {
      return toast.warning(`Necesitas al menos 3 participantes (actualmente ${participants.length})`);
    }
    setPicking(true);
    try {
      const r = await api('/contest/pick-winners-auto', {});
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error al sortear ganadores');
      toast.success('🏆 Ganadores elegidos y emails enviados');
      fetchAll();
    } catch (e) { toast.error(e.message); }
    finally { setPicking(false); }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const daysLeft = contest?.endDate ? Math.max(0, Math.ceil((new Date(contest.endDate).getTime() - Date.now()) / 86400000)) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Sistema de Concursos</h3>
          <p className="text-sm text-zinc-500">Crea, pausa y administra sorteos. Los ganadores reciben email automático.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/concurso" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><ExternalLink className="h-4 w-4 mr-1" /> Ver página pública</Button>
          </Link>
          <Link href="/sorteo" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><Trophy className="h-4 w-4 mr-1" /> Vista sorteo</Button>
          </Link>
          {!contest && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" /> Crear sorteo
            </Button>
          )}
        </div>
      </div>

      {/* Sorteo actual */}
      {contest ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{contest.title}</CardTitle>
              <Badge className={STATUS_BADGE[contest.status]?.cls || STATUS_BADGE.ended.cls}>
                {STATUS_BADGE[contest.status]?.label || contest.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-zinc-500">Inicio</p>
                <p className="font-semibold">{fmtDate(contest.startDate)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Fin</p>
                <p className="font-semibold">{fmtDate(contest.endDate)}</p>
              </div>
              <div>
                <p className="text-zinc-500">Participantes</p>
                <p className="font-semibold flex items-center gap-1"><Users className="h-4 w-4 text-orange-500" /> {participants.length}</p>
              </div>
              <div>
                <p className="text-zinc-500">Días restantes</p>
                <p className="font-semibold text-orange-600">{daysLeft !== null ? daysLeft : '—'}</p>
              </div>
            </div>

            {/* Ganadores */}
            {contest.winners && (
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 space-y-1.5">
                <p className="font-bold text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" /> Ganadores elegidos</p>
                {contest.winners.first && <p className="text-sm">🥇 {contest.winners.first.name} — {contest.winners.first.city} ({contest.winners.first.email})</p>}
                {contest.winners.second && <p className="text-sm">🥈 {contest.winners.second.name} — {contest.winners.second.city} ({contest.winners.second.email})</p>}
                {contest.winners.third && <p className="text-sm">🥉 {contest.winners.third.name} — {contest.winners.third.city} ({contest.winners.third.email})</p>}
              </div>
            )}

            {/* Acciones */}
            <div className="flex flex-wrap gap-2 pt-2">
              {contest.status === 'active' && (
                <>
                  <Button variant="outline" size="sm" disabled={sending} onClick={() => handleStatus('paused')}>
                    <Pause className="h-4 w-4 mr-1" /> Pausar sorteo
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-500 border-red-500/40 hover:bg-red-500/10" disabled={sending} onClick={() => handleStatus('ended')}>
                    <Square className="h-4 w-4 mr-1" /> Finalizar
                  </Button>
                  {!contest.winners && participants.length >= 3 && (
                    <Button size="sm" disabled={picking} onClick={handlePickWinners}>
                      {picking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trophy className="h-4 w-4 mr-1" />}
                      Sortear ganadores
                    </Button>
                  )}
                </>
              )}
              {contest.status === 'paused' && (
                <Button size="sm" disabled={sending} onClick={() => handleStatus('active')}>
                  <Play className="h-4 w-4 mr-1" /> Reanudar sorteo
                </Button>
              )}
              {contest.status === 'ended' && (
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Crear nuevo sorteo
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Gift className="h-12 w-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 mb-4">No hay un sorteo activo. Crea uno para comenzar a recibir participaciones.</p>
            <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Crear sorteo</Button>
          </CardContent>
        </Card>
      )}

      {/* Participantes */}
      {participantError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">{participantError}</div>
      )}
      {participants.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Participantes ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {participants.map((p, i) => (
                <div key={i} className="rounded-lg border p-3 hover:bg-zinc-50 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">{p.name}</p>
                      <p className="text-xs text-zinc-500">{p.email} · {p.phone} · {p.city}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowDetail(p)}>
                      <Eye className="h-4 w-4 mr-1" /> Ver comprobantes
                    </Button>
                  </div>
                  {p.designIdea && <p className="text-xs text-zinc-600 mt-1">💡 Diseño: {p.designIdea}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diálogo crear sorteo */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="text-lg">Crear nuevo sorteo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Título del sorteo</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Concurso Estampados DLV" />
              </div>
              <div className="space-y-2">
                <Label>Duración (días)</Label>
                <Input type="number" value={newDays} onChange={(e) => setNewDays(e.target.value)} min={7} max={365} />
                <p className="text-xs text-zinc-500">Recomendado: 90 días (3 meses) para lograr viralidad.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button className="flex-1" disabled={sending} onClick={handleCreate}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Gift className="h-4 w-4 mr-1" />}
                  Crear y activar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Diálogo detalle participante con capturas */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowDetail(null)}>
          <Card className="w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{showDetail.name}</CardTitle>
              <p className="text-sm text-zinc-500">{showDetail.email} · {showDetail.phone} · {showDetail.city}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg bg-zinc-50 p-3 text-sm">
                <p className="font-semibold mb-1">Redes compartidas:</p>
                <div className="flex flex-wrap gap-2">
                  {(showDetail.sharedNetworks || []).length > 0 ? (
                    (showDetail.sharedNetworks).map((n, i) => (
                      <Badge key={i} variant="secondary">{n}</Badge>
                    ))
                  ) : <span className="text-zinc-400 text-xs">Sin registro</span>}
                </div>
              </div>
              <p className="text-sm font-semibold">Comprobantes (capturas):</p>
              {(() => {
                const proofs = [
                  showDetail.proofShare1Url ? { url: showDetail.proofShare1Url, label: 'Compartido en red 1' } : null,
                  showDetail.proofShare2Url ? { url: showDetail.proofShare2Url, label: 'Compartido en red 2' } : null,
                  showDetail.proofFollowUrl ? { url: showDetail.proofFollowUrl, label: 'Sigue las redes' } : null,
                ].filter(Boolean);
                return proofs.length > 0 ? (
                  <div className="grid gap-2">
                    {proofs.map((pr, i) => (
                      <a key={i} href={pr.url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={pr.url} alt={`Comprobante ${i + 1}`} className="rounded-lg border max-h-64 w-auto mx-auto" loading="lazy" />
                        <p className="text-xs text-center text-zinc-500 mt-1 flex items-center justify-center gap-1">
                          <Camera className="h-3 w-3" /> {pr.label}
                          <Download className="h-3 w-3" />
                        </p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 text-center py-4">Sin capturas registradas</p>
                );
              })()}
              <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(`https://wa.me/56${showDetail.phone.replace(/[^0-9]/g, '')}`, '_blank')}>
                <MessageSquare className="h-4 w-4 mr-1" /> Contactar por WhatsApp
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
