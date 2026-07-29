'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Zap, ArrowLeft, RefreshCw, FolderOpen, FileImage, Download, RotateCcw,
  CheckCircle2, XCircle, AlertTriangle, Info, HardDrive, Printer,
} from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function PrePrensaPage() {
  const [status, setStatus] = useState(null);
  const [exportsList, setExportsList] = useState([]);
  const [orderIdInput, setOrderIdInput] = useState('');
  const [gangSheetIdInput, setGangSheetIdInput] = useState('');
  const [exporting, setExporting] = useState(false);
  const [retryingId, setRetryingId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        fetch('/api/pre-press/status').then((r) => r.json()),
        fetch('/api/pre-press/exports?limit=30').then((r) => r.json()),
      ]);
      setStatus(s);
      setExportsList(Array.isArray(e) ? e : []);
    } catch (err) {
      console.warn('refresh', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const doExport = async () => {
    if (!orderIdInput.trim() && !gangSheetIdInput.trim()) {
      return toast.error('Ingresa un orderId o gangSheetId');
    }
    setExporting(true);
    try {
      const body = {};
      if (gangSheetIdInput.trim()) body.gangSheetId = gangSheetIdInput.trim();
      else body.orderId = orderIdInput.trim();
      const res = await fetch('/api/pre-press/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error');
      toast.success(data.count
        ? `Exportados ${data.count} gang sheet(s) ✅`
        : `Exportado ${data.export?.filename || 'archivo'} ✅`);
      setOrderIdInput('');
      setGangSheetIdInput('');
      refresh();
    } catch (e) {
      toast.error('Fallo: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const retryExport = async (id) => {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/pre-press/exports/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error');
      toast.success('Reintento exitoso ✅');
      refresh();
    } catch (e) {
      toast.error('Fallo: ' + e.message);
    } finally {
      setRetryingId(null);
    }
  };

  const totalFolderFiles = status?.foldersHealth?.reduce((sum, f) => sum + (f.fileCount || 0), 0) || 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pre-Prensa</h1>
              <Badge className="bg-purple-500/10 text-purple-700 hover:bg-purple-500/10 border border-purple-500/30">
                Zero-Click · 300 DPI
              </Badge>
            </div>
            <p className="text-slate-500 mt-1 text-sm">
              Renderiza automáticamente los gang sheets a PNG 300 DPI y los deposita en el hot folder de cada impresora.
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <FileImage className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Total exports</div>
                <div className="text-2xl font-bold">{status?.totalExports ?? '—'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Hoy</div>
                <div className="text-2xl font-bold">{status?.exportsToday ?? '—'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Archivos en folders</div>
                <div className="text-2xl font-bold">{totalFolderFiles}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Base path</div>
                <div className="text-xs font-mono truncate max-w-[140px]" title={status?.hotFoldersBase}>
                  {status?.hotFoldersBase || '—'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hot Folders health */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Printer className="h-4 w-4" /> Hot Folders por Impresora
          </CardTitle>
          <CardDescription className="text-xs">
            Cada carpeta local se sincroniza con el RIP (Digital Factory, Cadlink, etc.). El nombre coincide con el <code>code</code> de la impresora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {(status?.foldersHealth || []).map((f) => (
              <div key={f.printerCode} className="rounded-lg border p-3 bg-slate-50/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-medium text-sm">{f.printerLabel}</div>
                  <Badge variant="secondary" className="text-[10px]">{f.fileCount} archivo{f.fileCount === 1 ? '' : 's'}</Badge>
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate" title={f.dir}>{f.dir}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export manual */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Exportar manualmente</CardTitle>
          <CardDescription className="text-xs">
            Indica el <b>gangSheetId</b> o el <b>orderId</b> (exporta todos sus gang sheets). El auto-export ocurre al mover un ítem a &quot;En Impresión&quot; en el Kanban.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-600 mb-1 block">gangSheetId</label>
            <Input
              placeholder="uuid del gang sheet"
              value={gangSheetIdInput}
              onChange={(e) => setGangSheetIdInput(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600 mb-1 block">orderId</label>
            <Input
              placeholder="uuid del pedido"
              value={orderIdInput}
              onChange={(e) => setOrderIdInput(e.target.value)}
              disabled={!!gangSheetIdInput.trim()}
            />
          </div>
          <div className="md:col-span-2">
            <Button
              onClick={doExport}
              disabled={exporting}
              className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <Zap className="h-4 w-4" /> {exporting ? 'Renderizando…' : 'Exportar a hot folder'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log de exports */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Registro de exportaciones</CardTitle>
              <CardDescription>Últimos {exportsList.length} archivos generados</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
              <RefreshCw className="h-3 w-3" /> Refrescar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {exportsList.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-10">
              Aún no hay exportaciones. Mueve un pedido a &quot;En Impresión&quot; en Kanban o usa el formulario de arriba.
            </div>
          ) : (
            <div className="space-y-2">
              {exportsList.map((ex) => {
                const isOk = ex.status === 'sent_to_hotfolder';
                return (
                  <div key={ex.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm bg-white">
                    {/* Thumbnail */}
                    <div className="shrink-0 h-16 w-16 rounded-md border bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2216%22%20height=%2216%22><rect%20width=%228%22%20height=%228%22%20fill=%22%23e2e8f0%22/><rect%20x=%228%22%20y=%228%22%20width=%228%22%20height=%228%22%20fill=%22%23e2e8f0%22/></svg>')] flex items-center justify-center overflow-hidden">
                      {isOk ? (
                        <img
                          src={`/api/pre-press/file?id=${ex.id}`}
                          alt={ex.filename}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <XCircle className="h-6 w-6 text-rose-500" />
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{ex.filename || '(sin archivo)'}</span>
                        <Badge variant={isOk ? 'default' : 'destructive'} className="text-[10px]">
                          {ex.status}
                        </Badge>
                        {ex.orderNumber && <Badge variant="outline" className="text-[10px]">{ex.orderNumber}</Badge>}
                        {ex.printerCode && <Badge variant="secondary" className="text-[10px]">{ex.printerCode}</Badge>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {ex.widthPx && ex.heightPx
                          ? `${ex.widthPx}×${ex.heightPx}px · ${ex.widthMm}×${ex.heightMm}mm · ${ex.dpi}DPI · ${formatBytes(ex.fileSize)}`
                          : '—'} · {new Date(ex.createdAt).toLocaleString('es-CL')}
                      </div>
                      {ex.error && (
                        <div className="mt-1 text-xs text-rose-600 flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {ex.error}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {isOk && (
                        <Button asChild variant="outline" size="sm" className="gap-1.5 h-8">
                          <a href={`/api/pre-press/file?id=${ex.id}`} download={ex.filename}>
                            <Download className="h-3 w-3" /> PNG
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 h-8"
                        disabled={retryingId === ex.id}
                        onClick={() => retryExport(ex.id)}
                      >
                        <RotateCcw className={`h-3 w-3 ${retryingId === ex.id ? 'animate-spin' : ''}`} />
                        Reintentar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 text-sm text-purple-900">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">Zero-Click Pre-Prensa</div>
            <ul className="text-xs text-purple-800 list-disc pl-4 space-y-0.5">
              <li>Cuando un ítem pasa a <b>En Impresión</b> en el Kanban, todos sus gang sheets se renderizan y depositan automáticamente en el hot folder correspondiente.</li>
              <li>Los PNGs son <b>transparentes a 300 DPI</b>, listos para Digital Factory / Cadlink.</li>
              <li>Idempotente: si ya se exportó ese gang sheet, no se duplica.</li>
              <li>Fallos son no-bloqueantes y quedan auditables en este panel.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
