'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  MessageCircle, QrCode, PowerOff, Send, RefreshCw, CheckCircle2, XCircle,
  Clock, Smartphone, AlertTriangle, Info, ArrowLeft,
} from 'lucide-react';

const STATE_LABEL = {
  idle: { label: 'Sin iniciar', color: 'bg-slate-500', icon: PowerOff },
  connecting: { label: 'Conectando…', color: 'bg-amber-500', icon: RefreshCw },
  qr: { label: 'Esperando QR', color: 'bg-blue-500', icon: QrCode },
  connected: { label: 'Conectado', color: 'bg-emerald-500', icon: CheckCircle2 },
  disconnected: { label: 'Desconectado', color: 'bg-rose-500', icon: XCircle },
};

const EVENT_LABEL = {
  order_confirmation: 'Confirmación pedido',
  order_in_production: 'En producción',
  order_ready: 'Pedido listo',
  manual: 'Manual / Test',
};

export default function WhatsappPage() {
  const [status, setStatus] = useState({ state: 'idle', qrDataUrl: null, user: null, lastError: null, messagesSent: 0 });
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText] = useState('Hola desde Estampados DLV 👋');
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, messagesRes] = await Promise.all([
        fetch('/api/whatsapp/status').then((r) => r.json()),
        fetch('/api/whatsapp/messages?limit=30').then((r) => r.json()),
      ]);
      setStatus(statusRes);
      setMessages(Array.isArray(messagesRes) ? messagesRes : []);
    } catch (e) {
      console.warn('refresh error', e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const connect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/connect', { method: 'POST' }).then((r) => r.json());
      setStatus(res);
      toast.success('Iniciando conexión con WhatsApp…');
    } catch (e) {
      toast.error('No se pudo iniciar la conexión: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const doLogout = async () => {
    if (!confirm('¿Cerrar sesión de WhatsApp? Deberás escanear el QR nuevamente.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/logout', { method: 'POST' }).then((r) => r.json());
      setStatus(res);
      toast.success('Sesión cerrada');
    } catch (e) {
      toast.error('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) return toast.error('Ingresa un teléfono');
    if (!testText.trim()) return toast.error('Escribe el mensaje');
    setSending(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, text: testText, note: 'test manual' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'no se pudo enviar');
      toast.success('Mensaje enviado ✅');
      refresh();
    } catch (e) {
      toast.error('Fallo: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const StateInfo = STATE_LABEL[status.state] || STATE_LABEL.idle;
  const StateIcon = StateInfo.icon;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" />Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">WhatsApp</h1>
              <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border border-emerald-500/30">
                Zero-cost · Baileys
              </Badge>
            </div>
            <p className="text-slate-500 mt-1 text-sm">
              Notificaciones automáticas por WhatsApp sin costos por mensaje. Vincula tu teléfono con QR.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Estado + acciones */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${StateInfo.color} ${status.state === 'connecting' ? 'animate-pulse' : ''}`} />
                  Estado de la sesión
                </CardTitle>
                <CardDescription>
                  Basado en <a href="https://github.com/WhiskeySockets/Baileys" target="_blank" rel="noreferrer" className="underline">Baileys</a> · zero-cost, self-hosted
                </CardDescription>
              </div>
              <Badge variant="outline" className="gap-1.5">
                <StateIcon className={`h-3.5 w-3.5 ${status.state === 'connecting' ? 'animate-spin' : ''}`} />
                {StateInfo.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {status.user && (
              <div className="flex items-center gap-3 rounded-lg border bg-emerald-50/50 border-emerald-200 p-3">
                <Smartphone className="h-5 w-5 text-emerald-600" />
                <div className="text-sm">
                  <div className="font-medium text-emerald-900">Vinculado como {status.user.name || 'usuario WhatsApp'}</div>
                  <div className="text-emerald-700/80 text-xs">{status.user.id}</div>
                </div>
              </div>
            )}

            {status.state === 'qr' && status.qrDataUrl && (
              <div className="rounded-lg border border-dashed p-4 flex flex-col items-center gap-3 bg-slate-50">
                <div className="text-sm text-slate-700 font-medium flex items-center gap-2">
                  <QrCode className="h-4 w-4" /> Escanea este QR con WhatsApp
                </div>
                {/* QR de vinculación (data URL generado por el backend) */}
                <img src={status.qrDataUrl} alt="QR de vinculación" className="h-64 w-64 rounded-lg bg-white p-2 shadow-sm" />
                <div className="text-xs text-slate-500 text-center max-w-sm">
                  Abre WhatsApp en tu teléfono → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>
                </div>
              </div>
            )}

            {status.state === 'connecting' && (
              <div className="flex items-center gap-2 text-sm text-slate-600 p-3 rounded-lg border bg-amber-50/50 border-amber-200">
                <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                Conectando con los servidores de WhatsApp… (puede tardar unos segundos)
              </div>
            )}

            {status.state === 'disconnected' && status.lastError && (
              <div className="flex items-start gap-2 text-sm text-rose-800 p-3 rounded-lg border bg-rose-50 border-rose-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Última desconexión</div>
                  <div className="text-xs text-rose-700">{status.lastError}</div>
                </div>
              </div>
            )}

            {status.state === 'idle' && (
              <div className="text-sm text-slate-600 p-3 rounded-lg border bg-slate-50">
                Aún no iniciaste la sesión. Presiona <b>Vincular</b> para generar un QR y conectar tu WhatsApp.
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {status.state !== 'connected' && (
                <Button onClick={connect} disabled={loading} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <QrCode className="h-4 w-4" />
                  {status.state === 'idle' ? 'Vincular WhatsApp' : 'Reintentar'}
                </Button>
              )}
              {(status.state === 'connected' || status.state === 'qr') && (
                <Button onClick={doLogout} disabled={loading} variant="destructive" className="gap-2">
                  <PowerOff className="h-4 w-4" /> Cerrar sesión
                </Button>
              )}
              <Button onClick={refresh} variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" /> Refrescar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats + test */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Estadísticas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Mensajes enviados</span>
                <span className="font-semibold">{status.messagesSent || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Sesión iniciada</span>
                <span className="text-xs">{status.connectedAt ? new Date(status.connectedAt).toLocaleString('es-CL') : '—'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" /> Enviar mensaje de prueba
              </CardTitle>
              <CardDescription className="text-xs">
                Formato: +56 9 XXXX XXXX o 569XXXXXXXX
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="+56 9 1234 5678"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                disabled={status.state !== 'connected'}
              />
              <Textarea
                rows={3}
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                disabled={status.state !== 'connected'}
              />
              <Button
                onClick={sendTest}
                disabled={sending || status.state !== 'connected'}
                className="w-full gap-2"
              >
                <Send className="h-4 w-4" /> {sending ? 'Enviando…' : 'Enviar'}
              </Button>
              {status.state !== 'connected' && (
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Info className="h-3 w-3" /> Debes conectar WhatsApp primero
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Log de mensajes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Registro reciente</CardTitle>
              <CardDescription>Últimos mensajes enviados (automáticos y manuales)</CardDescription>
            </div>
            <Badge variant="secondary">{messages.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8">
              Sin mensajes aún. Cuando se despache un pedido o hagas un envío manual, aparecerá aquí.
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {messages.map((m) => (
                <div key={m.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <div className={`mt-1 h-2 w-2 rounded-full ${m.status === 'sent' ? 'bg-emerald-500' : m.status === 'skipped' ? 'bg-slate-400' : 'bg-rose-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{EVENT_LABEL[m.event] || m.event}</span>
                      {m.orderNumber && <Badge variant="outline" className="text-[10px]">{m.orderNumber}</Badge>}
                      <Badge
                        variant={m.status === 'sent' ? 'default' : m.status === 'skipped' ? 'secondary' : 'destructive'}
                        className="text-[10px]"
                      >
                        {m.status}
                      </Badge>
                      {m.reason && <span className="text-xs text-slate-500">({m.reason})</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {m.phone || '—'} · <Clock className="inline h-3 w-3" /> {new Date(m.createdAt).toLocaleString('es-CL')}
                    </div>
                    {m.text && (
                      <div className="mt-1 text-xs text-slate-600 bg-slate-50 rounded p-2 whitespace-pre-wrap line-clamp-3">
                        {m.text}
                      </div>
                    )}
                    {m.error && <div className="mt-1 text-xs text-rose-600">Error: {m.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator className="my-2" />

      {/* Info técnica */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">¿Cómo funciona?</div>
            <ul className="text-xs text-blue-800 list-disc pl-4 space-y-0.5">
              <li>Usa <a className="underline" href="https://github.com/WhiskeySockets/Baileys" target="_blank" rel="noreferrer">Baileys</a> (protocolo de WhatsApp Web) — no requiere API oficial ni pagos por mensaje.</li>
              <li>Las credenciales se guardan cifradas en MongoDB → la sesión sobrevive a reinicios del contenedor.</li>
              <li>Notifica automáticamente: confirmación de pedido, entrada a producción y pedido listo.</li>
              <li>Si el teléfono del cliente es inválido o WA está desconectado, el mensaje se marca <b>skipped</b> sin romper el flujo del pedido.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
