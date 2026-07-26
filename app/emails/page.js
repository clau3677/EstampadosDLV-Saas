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
  Mail, ArrowLeft, RefreshCw, Send, CheckCircle2, XCircle, AlertTriangle,
  Info, Clock, Server, Sparkles,
} from 'lucide-react';

const EVENT_LABEL = {
  order_confirmation: 'Confirmación pedido',
  order_in_production: 'En producción',
  order_ready: 'Pedido listo',
  manual: 'Manual / Test',
};

export default function EmailsPage() {
  const [config, setConfig] = useState(null);
  const [verify, setVerify] = useState({ ok: null, error: null });
  const [messages, setMessages] = useState([]);
  const [testTo, setTestTo] = useState('');
  const [testSubject, setTestSubject] = useState('Prueba desde Estampados DLV');
  const [testText, setTestText] = useState('Hola, este es un email de prueba desde el sistema de notificaciones automáticas.');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        fetch('/api/email/status').then((r) => r.json()),
        fetch('/api/email/messages?limit=30').then((r) => r.json()),
      ]);
      setConfig(s.config);
      setMessages(Array.isArray(m) ? m : []);
    } catch (e) {
      console.warn('refresh', e);
    }
  }, []);

  const doVerify = async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/email/verify', { method: 'POST' }).then((r) => r.json());
      setVerify(res);
      if (res.ok) toast.success('Conexión SMTP verificada ✅');
      else toast.error('Error SMTP: ' + (res.error || 'desconocido'));
    } catch (e) {
      toast.error('Error: ' + e.message);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    refresh();
    doVerify();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const sendTest = async () => {
    if (!testTo.trim()) return toast.error('Ingresa un email destinatario');
    if (!testSubject.trim()) return toast.error('Ingresa un asunto');
    if (!testText.trim()) return toast.error('Escribe el mensaje');
    setSending(true);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo, subject: testSubject, text: testText, note: 'test manual' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'no se pudo enviar');
      toast.success('Email enviado ✅');
      refresh();
    } catch (e) {
      toast.error('Fallo: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const statusBadge = () => {
    if (verify.ok === null) return { label: 'Verificando…', color: 'bg-slate-500', icon: RefreshCw, spin: true };
    if (verify.ok) return { label: 'Conectado', color: 'bg-emerald-500', icon: CheckCircle2, spin: false };
    return { label: 'Error', color: 'bg-rose-500', icon: XCircle, spin: false };
  };
  const st = statusBadge();
  const StIcon = st.icon;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Mail className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Emails</h1>
              <Badge className="bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 border border-blue-500/30">
                Zero-cost · Gmail SMTP
              </Badge>
            </div>
            <p className="text-slate-500 mt-1 text-sm">
              Notificaciones automáticas de pedidos vía SMTP con App Password de Google. Sin costos por email.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Config + estado */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className={`inline-block h-3 w-3 rounded-full ${st.color} ${st.spin ? 'animate-pulse' : ''}`} />
                  Configuración SMTP
                </CardTitle>
                <CardDescription>Definida en variables de entorno (.env)</CardDescription>
              </div>
              <Badge variant="outline" className="gap-1.5">
                <StIcon className={`h-3.5 w-3.5 ${st.spin ? 'animate-spin' : ''}`} />
                {st.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!config?.configured && (
              <div className="p-3 rounded-lg border bg-amber-50 border-amber-200 text-sm text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  SMTP no está configurado. Agrega <code>SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM_EMAIL</code> en <code>.env</code>.
                </div>
              </div>
            )}

            {verify.ok === false && verify.error && (
              <div className="p-3 rounded-lg border bg-rose-50 border-rose-200 text-sm text-rose-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Error de conexión SMTP</div>
                  <div className="text-xs text-rose-700">{verify.error}</div>
                </div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 text-sm">
              <ConfigRow icon={Server} label="Host" value={config?.host} />
              <ConfigRow icon={Server} label="Puerto" value={config ? `${config.port} ${config.secure ? '(SSL)' : '(STARTTLS)'}` : '—'} />
              <ConfigRow icon={Mail} label="Usuario" value={config?.user} />
              <ConfigRow icon={Mail} label="Remitente" value={config ? `${config.fromName} <${config.fromEmail}>` : '—'} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={doVerify} disabled={verifying} variant="outline" className="gap-2">
                <RefreshCw className={`h-4 w-4 ${verifying ? 'animate-spin' : ''}`} />
                {verifying ? 'Verificando…' : 'Verificar conexión'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Enviar test */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Enviar prueba
            </CardTitle>
            <CardDescription className="text-xs">Envío ad-hoc para verificar entregabilidad</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="destinatario@ejemplo.cl"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              disabled={!verify.ok}
            />
            <Input
              placeholder="Asunto"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
              disabled={!verify.ok}
            />
            <Textarea
              rows={4}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              disabled={!verify.ok}
            />
            <Button
              onClick={sendTest}
              disabled={sending || !verify.ok}
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
            >
              <Send className="h-4 w-4" /> {sending ? 'Enviando…' : 'Enviar email'}
            </Button>
            {!verify.ok && (
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Info className="h-3 w-3" /> Verifica la conexión primero
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Log de mensajes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Registro reciente</CardTitle>
              <CardDescription>Últimos emails enviados (automáticos y manuales)</CardDescription>
            </div>
            <Badge variant="secondary">{messages.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-8">
              Sin emails aún. Cuando un cliente pague o cuando muevas un pedido en Kanban, aparecerán aquí.
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
                      {m.to || '—'} · <Clock className="inline h-3 w-3" /> {new Date(m.createdAt).toLocaleString('es-CL')}
                    </div>
                    {m.subject && (
                      <div className="mt-1 text-xs text-slate-700 truncate">
                        <span className="text-slate-400">Asunto:</span> {m.subject}
                      </div>
                    )}
                    {m.messageId && (
                      <div className="mt-1 text-[10px] text-slate-400 font-mono truncate">msg-id: {m.messageId}</div>
                    )}
                    {m.error && <div className="mt-1 text-xs text-rose-600">Error: {m.error}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">¿Cómo funciona?</div>
            <ul className="text-xs text-blue-800 list-disc pl-4 space-y-0.5">
              <li>Enviamos mediante <b>Gmail SMTP</b> con un App Password (16 caracteres). Gratis hasta ~500 emails/día.</li>
              <li>Los emails se disparan automáticamente al confirmar un pedido, entrar a producción y quedar listo.</li>
              <li>Cada envío queda auditado en la colección <code>email_messages</code>.</li>
              <li>Si SMTP no está conectado o el email es inválido, se marca <b>skipped</b> sin romper el flujo del pedido.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-slate-50 border">
      <Icon className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-sm font-mono truncate">{value || '—'}</div>
      </div>
    </div>
  );
}
