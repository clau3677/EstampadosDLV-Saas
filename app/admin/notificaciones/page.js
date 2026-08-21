'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, RefreshCw, Play, RotateCcw, Mail, MessageCircle, Clock, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const EVENT_LABEL = {
  order_confirmation: 'Confirmación de pedido',
  order_in_production: 'En producción',
  order_ready: 'Pedido listo',
  order_packed: 'Pedido empaquetado',
  order_handed_to_courier: 'Entregado al courier / en camino',
  order_delivered: 'Pedido entregado',
};

const STATUS_LABEL = {
  pending: 'Pendiente',
  processing: 'Procesando',
  sent: 'Enviado',
  failed: 'Fallido',
  skipped: 'Omitido',
};

function channelLabel(channel) {
  return channel === 'email' ? 'Correo' : 'WhatsApp';
}

function statusClass(status) {
  if (status === 'sent') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (status === 'failed') return 'bg-rose-100 text-rose-700 border-rose-200';
  if (status === 'skipped') return 'bg-slate-100 text-slate-700 border-slate-200';
  if (status === 'processing') return 'bg-blue-100 text-blue-700 border-blue-200';
  return 'bg-amber-100 text-amber-700 border-amber-200';
}

export default function NotificationsPage() {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('pending');
  const [waStatus, setWaStatus] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [queueRes, waRes, emailRes] = await Promise.all([
        fetch(`/api/notifications/queue?status=${encodeURIComponent(status)}`),
        fetch('/api/whatsapp/status'),
        fetch('/api/email/status'),
      ]);
      const queueBody = await queueRes.json();
      const waBody = await waRes.json();
      const emailBody = await emailRes.json();
      if (!queueRes.ok) throw new Error(queueBody.error || 'No se pudo leer la cola');
      setJobs(Array.isArray(queueBody) ? queueBody : []);
      setWaStatus(waBody);
      setEmailStatus(emailBody);
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar la cola');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  const runQueue = async () => {
    setRunning(true);
    try {
      const response = await fetch('/api/notifications/queue/run', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo ejecutar la cola');
      toast.success('Cola procesada');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'No se pudo ejecutar la cola');
    } finally {
      setRunning(false);
    }
  };

  const retryJob = async (id) => {
    setRetrying(id);
    try {
      const response = await fetch('/api/notifications/queue/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo reintentar');
      toast.success('Trabajo reencolado');
      await refresh();
    } catch (error) {
      toast.error(error.message || 'No se pudo reintentar');
    } finally {
      setRetrying(null);
    }
  };

  const waConnected = waStatus?.state === 'connected';
  const emailConfigured = emailStatus?.config?.configured;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Bell className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Notificaciones</h1>
            <p className="text-slate-500 mt-1 text-sm">Cola de avisos logísticos, reintentos y estado de canales.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard icon={Mail} title="Correo" value={emailConfigured ? 'Configurado' : 'No configurado'} ok={Boolean(emailConfigured)} detail={emailStatus?.config?.fromEmail || 'SMTP'} />
        <StatusCard icon={MessageCircle} title="WhatsApp" value={waConnected ? 'Conectado' : 'Sin conectar'} ok={waConnected} detail={waStatus?.state || 'idle'} />
        <StatusCard icon={Clock} title="Trabajos visibles" value={String(jobs.length)} ok={jobs.length === 0} detail={STATUS_LABEL[status] || status} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base">Cola de notificaciones</CardTitle>
              <CardDescription>Los fallos temporales se reintentan con backoff. WhatsApp queda pendiente mientras no haya número conectado.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
                <option value="pending">Pendientes</option>
                <option value="processing">Procesando</option>
                <option value="failed">Fallidos</option>
                <option value="skipped">Omitidos</option>
                <option value="sent">Enviados</option>
              </select>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
              </Button>
              <Button size="sm" onClick={runQueue} disabled={running} className="gap-2 bg-orange-600 hover:bg-orange-700">
                <Play className="h-4 w-4" /> {running ? 'Procesando…' : 'Procesar ahora'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">No hay trabajos en este estado.</div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    {job.channel === 'email' ? <Mail className="h-4 w-4 text-blue-600" /> : <MessageCircle className="h-4 w-4 text-emerald-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{EVENT_LABEL[job.event] || job.event}</span>
                      <Badge variant="outline">{channelLabel(job.channel)}</Badge>
                      <Badge className={statusClass(job.status)}>{STATUS_LABEL[job.status] || job.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Pedido: {job.orderId || '—'} · Intentos: {job.attempts || 0}/{job.maxAttempts || '—'} · Próximo intento: {job.runAt ? new Date(job.runAt).toLocaleString('es-CL') : 'ahora'}
                    </div>
                    {job.error && <div className="mt-1 flex items-center gap-1 text-xs text-rose-600"><AlertTriangle className="h-3 w-3" /> {job.error}</div>}
                  </div>
                  {(job.status === 'failed' || job.status === 'pending' || job.status === 'skipped') && (
                    <Button variant="outline" size="sm" onClick={() => retryJob(job.id)} disabled={retrying === job.id} className="gap-2">
                      <RotateCcw className={`h-4 w-4 ${retrying === job.id ? 'animate-spin' : ''}`} /> Reintentar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ icon: Icon, title, value, detail, ok }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><span>{title}</span>{ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}</div>
          <div className="font-semibold text-slate-900">{value}</div>
          <div className="truncate text-xs text-slate-500">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}
