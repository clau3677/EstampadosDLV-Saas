'use client';

// ============================================================================
// /admin/design-library
// Panel completo de administración de la Biblioteca de plantillas del
// Gang Sheet Builder. Integra 3 fuentes: Google Drive (sync), Upload manual,
// y visualización/edición de la biblioteca actual.
// ----------------------------------------------------------------------------
// Layout de 3 tabs:
//   1) Conexión Drive        — connect/disconnect + selector de carpetas
//   2) Biblioteca            — grid con edición inline + tags + activar/desactivar
//   3) Estadísticas          — uso, top plantillas, breakdown por tag
// ============================================================================
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Library, HardDrive, Upload, RefreshCw, Loader2, Search,
  CheckCircle2, XCircle, AlertTriangle, ExternalLink, Trash2, Eye, EyeOff,
  Folder, FolderOpen, LogOut, BarChart3, TrendingUp, Layers, Tag, Image as ImageIcon,
  ChevronRight, Save, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';

async function parseApiJson(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error(response.redirected ? 'La sesión administrativa expiró. Inicia sesión nuevamente.' : `La API devolvió HTML en vez de JSON (HTTP ${response.status}).`);
    }
    throw new Error(`Respuesta inválida de la API (HTTP ${response.status}).`);
  }
}

function formatSyncProgress(progress) {
  if (!progress) return null;
  const stats = progress.stats || {};
  return {
    checked: Number(stats.checked) || 0,
    downloaded: Number(stats.downloaded) || 0,
    skipped: Number(stats.skipped) || 0,
    failed: Number(stats.failed) || 0,
    stale: Number(stats.stale) || 0,
    discovered: Number(progress.totalDiscovered) || 0,
    currentFile: progress.currentFile || '',
    running: Boolean(progress.running),
    paused: Boolean(progress.paused),
    completed: Boolean(progress.completed),
  };
}

// ============================================================================
export default function DesignLibraryAdminPage() {
  const search = useSearchParams();
  const [activeTab, setActiveTab] = useState('drive');
  const [driveStatus, setDriveStatus] = useState(null);
  const [libraryStats, setLibraryStats] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      const [ds, ls] = await Promise.all([
        fetch('/api/drive/status', { cache: 'no-store' }).then(async r => r.ok ? parseApiJson(r) : null),
        fetch('/api/design-library/stats', { cache: 'no-store' }).then(async r => r.ok ? parseApiJson(r) : null),
      ]);
      setDriveStatus(ds);
      setLibraryStats(ls);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    refreshStatus();
    if (search.get('connected') === '1') {
      toast.success('Google Drive conectado ✓', { description: 'Ahora selecciona qué carpetas compartir' });
    }
  }, [search, refreshStatus]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Library className="h-5 w-5 text-orange-500" />
              Biblioteca de Plantillas
            </h1>
            <p className="text-xs text-slate-500">
              Las plantillas aparecen en el botón <b>"Biblioteca"</b> del Gang Sheet Builder
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            {libraryStats && (
              <>
                <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {libraryStats.totalActive} activas
                </Badge>
                {libraryStats.totalInactive > 0 && (
                  <Badge variant="outline" className="text-slate-500">
                    {libraryStats.totalInactive} ocultas
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="drive" className="text-sm">
              <HardDrive className="h-4 w-4 mr-1.5" />Google Drive
              {driveStatus?.connected && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
            </TabsTrigger>
            <TabsTrigger value="library" className="text-sm">
              <Layers className="h-4 w-4 mr-1.5" />Biblioteca ({libraryStats?.totalItems || 0})
            </TabsTrigger>
            <TabsTrigger value="upload" className="text-sm">
              <Upload className="h-4 w-4 mr-1.5" />Subir Manual
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-sm">
              <BarChart3 className="h-4 w-4 mr-1.5" />Estadísticas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="drive"><DriveTab status={driveStatus} onChange={refreshStatus} /></TabsContent>
          <TabsContent value="library"><LibraryTab onChange={refreshStatus} /></TabsContent>
          <TabsContent value="upload"><UploadTab onChange={refreshStatus} /></TabsContent>
          <TabsContent value="stats"><StatsTab stats={libraryStats} onRefresh={refreshStatus} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ============================================================================
// TAB 1: Google Drive
// ============================================================================
function DriveTab({ status, onChange }) {
  const [folders, setFolders] = useState(null);
  const [imageCounts, setImageCounts] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!status?.connected) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/drive/folders', { cache: 'no-store' });
        const data = await parseApiJson(r);
        if (!r.ok) throw new Error(data.error || 'error');
        setFolders(data.folders || []);
        setImageCounts(data.imageCounts || {});
        setSelected(new Set(data.selectedFolderIds || []));
      } catch (e) {
        toast.error('No se pudieron cargar las carpetas', { description: e.message });
      } finally { setLoading(false); }
    })();
  }, [status?.connected, status?.updatedAt]);

  const filtered = useMemo(() => {
    if (!folders) return [];
    if (!q.trim()) return folders;
    const ql = q.toLowerCase();
    return folders.filter(f => f.name?.toLowerCase().includes(ql));
  }, [folders, q]);

  const toggleFolder = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const saveSelection = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/drive/folders/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderIds: Array.from(selected) }),
      });
      const data = await parseApiJson(r);
      if (!r.ok) throw new Error(data.error || 'error');
      toast.success('Selección guardada', { description: `${selected.size} carpeta${selected.size === 1 ? '' : 's'}` });
      onChange();
    } catch (e) {
      toast.error('Error guardando', { description: e.message });
    } finally { setSaving(false); }
  };

  const [syncProgress, setSyncProgress] = useState(null);

  const readProgress = useCallback(async () => {
    const r = await fetch('/api/drive/sync/progress', { cache: 'no-store' });
    const data = await parseApiJson(r);
    if (!r.ok) throw new Error(data.error || 'No se pudo leer el progreso');
    const progress = formatSyncProgress(data);
    setSyncProgress(progress);
    return progress;
  }, []);

  useEffect(() => {
    readProgress().catch(() => {});
  }, [readProgress]);

  const runSync = async () => {
    if (selected.size === 0) {
      toast.error('Primero selecciona al menos 1 carpeta');
      return;
    }
    await saveSelection();
    setSyncing(true);
    try {
      toast.loading('Preparando sincronización reanudable…', { id: 'sync' });
      let startResponse = await fetch('/api/drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      let startData = await parseApiJson(startResponse);
      if (!startResponse.ok) throw new Error(startData.error || 'error');
      let progress = formatSyncProgress(startData.progress || startData);
      setSyncProgress(progress);

      // Cada llamada procesa pocos archivos y guarda checkpoint en Mongo.
      // Si el navegador se cierra, la siguiente ejecución continúa desde el último archivo.
      let guard = 0;
      while (progress?.running && guard < 20000) {
        // eslint-disable-next-line no-await-in-loop
        const batchResponse = await fetch('/api/drive/sync/continue', { method: 'POST' });
        // eslint-disable-next-line no-await-in-loop
        const batchData = await parseApiJson(batchResponse);
        if (!batchResponse.ok) throw new Error(batchData.error || 'Error procesando lote');
        progress = formatSyncProgress(batchData.progress || batchData);
        setSyncProgress(progress);
        toast.loading(`Sincronizando: ${progress.checked} revisadas · ${progress.downloaded} nuevas · ${progress.skipped} sin cambios${progress.currentFile ? ` · ${progress.currentFile}` : ''}`, { id: 'sync' });
        if (progress.failed > 0) toast.warning(`${progress.failed} archivos requieren reintento`, { id: 'sync-warning' });
        guard += 1;
      }
      if (guard >= 20000) throw new Error('La sincronización excedió el límite de lotes de esta sesión; puedes reanudarla sin perder lo descargado.');
      toast.success(progress?.paused ? 'Sincronización pausada con checkpoint ✓' : 'Sincronización completa ✓', {
        id: 'sync',
        description: `${progress?.downloaded || 0} nuevas · ${progress?.skipped || 0} sin cambios · ${progress?.failed || 0} fallaron · ${progress?.stale || 0} conservadas fuera de Drive`,
      });
      onChange();
    } catch (e) {
      await readProgress().catch(() => {});
      toast.error('Error de sync', { id: 'sync', description: e.message });
    } finally { setSyncing(false); }
  };

  const disconnect = async () => {
    setDisconnectOpen(false);
    try {
      const r = await fetch('/api/drive/disconnect', { method: 'POST' });
      const data = await parseApiJson(r);
      if (!r.ok) throw new Error(data.error || 'error');
      toast.success('Drive desconectado', {
        description: `${data.retainedLibraryItems || 0} diseños conservados en la biblioteca local. La sincronización queda pausada.`,
      });
      setFolders(null);
      setSelected(new Set());
      onChange();
    } catch (e) {
      toast.error('Error desconectando', { description: e.message });
    }
  };

  // No conectado
  if (!status?.connected) {
    return (
      <>
      {status?.assetsRetained && (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 p-3 flex gap-2 text-xs text-blue-900">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <b>{status.retainedLibraryItems || status.totalAssets || 0} diseños conservados localmente.</b>{' '}
            Google Drive está desconectado, pero las imágenes ya sincronizadas siguen disponibles en la biblioteca y en el Gang Sheet Builder.
            Al reconectar, la sincronización actualizará solo los archivos que hayan cambiado.
          </div>
        </div>
      )}
      <Card className="border-slate-200">
        <CardContent className="p-8">
          <div className="text-center max-w-md mx-auto space-y-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-orange-100 to-amber-100 mx-auto flex items-center justify-center">
              <HardDrive className="h-8 w-8 text-orange-600" />
            </div>
            <h2 className="text-xl font-bold">Conectá tu Google Drive</h2>
            <p className="text-sm text-slate-500">
              Podés elegir <b>carpetas específicas</b> de tu Drive para compartir con tus clientes.
              Las imágenes se sincronizan a tu servidor y aparecen en la biblioteca del Gang Sheet Builder.
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-left text-amber-900">
              <b className="flex items-center gap-1.5"><Info className="h-3.5 w-3.5" />¿Cómo funciona?</b>
              <ol className="list-decimal ml-4 mt-1 space-y-0.5">
                <li>Autorizás acceso <b>solo de lectura</b> a tu Drive</li>
                <li>Elegís qué carpetas compartir (podés cambiarlo cuando quieras)</li>
                <li>Los archivos se sincronizan a tu servidor</li>
                <li>Tus clientes las ven en el botón <b>"Biblioteca"</b> del builder</li>
              </ol>
            </div>
            {status?.oauthConfigured === false ? (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-900">
                ⚠️ Google OAuth no configurado en el servidor.
                Faltan las variables <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en el <code>.env</code>.
              </div>
            ) : (
              <Button asChild size="lg" className="bg-orange-500 hover:bg-orange-600 w-full">
                <a href="/api/drive/oauth/start">
                  <HardDrive className="h-4 w-4 mr-2" />Conectar Google Drive
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      </>
    );
  }

  // Conectado
  return (
    <div className="space-y-4">
      {/* Estado de conexión */}
      <Card className="border-emerald-200 bg-emerald-50/50">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-emerald-900">Google Drive conectado</div>
            <div className="text-xs text-emerald-700 truncate">
              {status.email || 'cuenta desconocida'} · {status.totalAssets} imágenes sincronizadas
              {status.lastSyncAt && ` · último sync ${new Date(status.lastSyncAt).toLocaleString('es-CL')}`}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDisconnectOpen(true)} className="text-rose-700 hover:bg-rose-50 border-rose-200">
            <LogOut className="h-3.5 w-3.5 mr-1" />Desconectar
          </Button>
        </CardContent>
      </Card>

      {syncProgress && (syncing || syncProgress.running || syncProgress.paused || syncProgress.checked > 0) && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              {syncProgress.running ? <Loader2 className="h-4 w-4 text-blue-600 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              <b className="text-sm text-blue-900">{syncProgress.running ? 'Sincronización en progreso' : syncProgress.paused ? 'Sincronización pausada; puedes reanudarla' : 'Última sincronización'}</b>
              <span className="ml-auto text-xs text-blue-800">{syncProgress.checked} revisadas{syncProgress.discovered ? ` de ${syncProgress.discovered} descubiertas` : ''}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded bg-white border border-blue-100 p-2"><b className="text-emerald-700">{syncProgress.downloaded}</b><br />nuevas</div>
              <div className="rounded bg-white border border-blue-100 p-2"><b className="text-slate-700">{syncProgress.skipped}</b><br />sin cambios</div>
              <div className="rounded bg-white border border-blue-100 p-2"><b className="text-rose-700">{syncProgress.failed}</b><br />fallidas</div>
              <div className="rounded bg-white border border-blue-100 p-2"><b className="text-amber-700">{syncProgress.stale}</b><br />conservadas</div>
            </div>
            {syncProgress.currentFile && <div className="text-[11px] text-blue-800 truncate">Procesando: {syncProgress.currentFile}</div>}
          </CardContent>
        </Card>
      )}

      {/* Selector de carpetas */}
      <Card>
        <CardHeader className="border-b bg-slate-50">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-orange-500" />
              Carpetas de tu Drive
            </CardTitle>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />Recargar
              </Button>
              <Button
                size="sm"
                onClick={saveSelection}
                disabled={saving || syncing}
                variant="outline"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Guardar selección
              </Button>
              <Button
                size="sm"
                onClick={runSync}
                disabled={syncing || selected.size === 0}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {syncing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Sincronizando…</> : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Sincronizar ahora</>}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="h-6 w-6 mx-auto text-orange-500 animate-spin mb-2" />
              <p className="text-sm text-slate-500">Cargando carpetas de tu Drive…</p>
            </div>
          ) : folders && folders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              <Folder className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              No hay carpetas en tu Drive
            </div>
          ) : folders ? (
            <>
              <div className="p-3 border-b bg-white sticky top-0 z-10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder={`Buscar entre ${folders.length} carpetas…`}
                    className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-300 text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  <b>{selected.size}</b> carpeta{selected.size === 1 ? '' : 's'} seleccionada{selected.size === 1 ? '' : 's'}
                  {selected.size > 0 && (
                    <>
                      {' '}·{' '}
                      {Array.from(selected).reduce((sum, id) => sum + (imageCounts[id] || 0), 0)} imágenes en total
                    </>
                  )}
                </div>
              </div>
              <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-100">
                {filtered.map(f => {
                  const isSelected = selected.has(f.id);
                  const imgCount = imageCounts[f.id];
                  return (
                    <label
                      key={f.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFolder(f.id)}
                        className="h-4 w-4 accent-orange-500"
                      />
                      {isSelected ? <FolderOpen className="h-4 w-4 text-orange-500" /> : <Folder className="h-4 w-4 text-slate-400" />}
                      <span className="flex-1 text-sm font-medium truncate">{f.name}</span>
                      {imgCount !== undefined && (
                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                          imgCount === 0 ? 'bg-slate-100 text-slate-500' :
                          imgCount < 10 ? 'bg-blue-100 text-blue-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>
                          {imgCount} img
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Info: Testing mode */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex gap-2 text-xs text-blue-900">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div>
          <b>Modo Testing de Google:</b> tu app está en modo desarrollo. Solo la cuenta <code className="bg-white/60 px-1 rounded">{status.email}</code> puede conectarse.
          Si más adelante querés que otras cuentas conecten sus Drives, tenés que "Publicar la app" en Google Cloud Console y pasar el review de Google.
          Para tu uso actual (solo tu cuenta) <b>no es necesario</b>.
        </div>
      </div>

      {/* Alert dialog: desconectar */}
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar Google Drive?</AlertDialogTitle>
            <AlertDialogDescription>
              Se revocará el acceso a Google Drive y se pausará la sincronización futura. Las {status.totalAssets || 0} imágenes ya sincronizadas
              <b> se conservarán en la biblioteca local</b> para que tus clientes puedan seguir utilizándolas. Las imágenes originales en tu Drive <b>NO se tocan</b>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={disconnect} className="bg-rose-500 hover:bg-rose-600">
              Sí, desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// TAB 2: Biblioteca (grid con edición/toggle)
// ============================================================================
function thumbUrl(imageUrl, w = 200) {
  if (!imageUrl) return '';
  try {
    const url = new URL(imageUrl);
    return `/api/thumbnails?src=${encodeURIComponent(url.pathname.replace(/^\/uploads\//, ''))}&w=${w}&format=webp`;
  } catch { return imageUrl; }
}

function LibraryTab({ onChange }) {
  const PAGE_SIZE = 96;
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [q, setQ] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterFolder, setFilterFolder] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Refs para evitar stale closures en callbacks
  const pageRef = useRef(1);
  const fetchingRef = useRef(false);
  const qRef = useRef('');
  const folderRef = useRef('');
  const loadGridRef = useRef(null);

  // Sincronizar refs con state
  useEffect(() => { qRef.current = q; }, [q]);
  useEffect(() => { folderRef.current = filterFolder; }, [filterFolder]);

  // Core fetch function — siempre lee desde refs para evitar stale closures
  const doFetch = useCallback(async (reset = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const currentPage = reset ? 1 : pageRef.current;
    if (reset) {
      pageRef.current = 1;
      setItems([]);
      setHasMore(true);
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        size: String(PAGE_SIZE),
      });
      if (qRef.current.trim()) params.set('search', qRef.current.trim());
      if (folderRef.current) params.set('folder', folderRef.current);

      const r = await fetch(`/api/design-library?${params.toString()}`, { cache: 'no-store' });
      const data = await parseApiJson(r);
      if (!r.ok) throw new Error(data.error || 'No se pudo cargar la biblioteca');
      const newItems = Array.isArray(data.items) ? data.items : [];

      if (reset) {
        setItems(newItems);
      } else {
        setItems(prev => {
          const existing = new Set(prev.map(i => i.id));
          return [...prev, ...newItems.filter(i => !existing.has(i.id))];
        });
      }

      setTotal(data.total || 0);
      if (data.folders) setFolders(data.folders);
      setHasMore(currentPage < (data.totalPages || 1));

      if (reset) setLoading(false);
      else setLoadingMore(false);
    } catch (e) {
      toast.error('Error cargando', { description: e.message });
      if (reset) setLoading(false);
      else setLoadingMore(false);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Load more — incrementa página y llama doFetch
  const loadMore = useCallback(() => {
    if (fetchingRef.current) return;
    pageRef.current += 1;
    doFetch(false);
  }, [doFetch]);

  // Reset (botón Refrescar)
  const load = useCallback(() => {
    if (fetchingRef.current) return;
    pageRef.current = 1;
    setItems([]);
    setTotal(0);
    setHasMore(true);
    setLoading(true);
    setLoadingMore(false);
    doFetch(true);
  }, [doFetch]);

  // Load initial
  useEffect(() => {
    load();
  }, [load]);

  // Scroll infinito
  useEffect(() => {
    if (!loadGridRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !fetchingRef.current && hasMore) {
          pageRef.current += 1;
          doFetch(false);
        }
      },
      { rootMargin: '500px' }
    );
    observer.observe(loadGridRef.current);
    return () => observer.disconnect();
  }, [hasMore, doFetch]);

  const filtered = useMemo(() => {
    return items.filter(it => {
      if (filterSource !== 'all' && (it.source || 'manual') !== filterSource) return false;
      return true;
    });
  }, [items, filterSource]);

  const toggle = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const setActive = async (id, active) => {
    try {
      await fetch(`/api/design-library/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      setItems(items.map(it => it.id === id ? { ...it, active } : it));
      toast.success(active ? 'Plantilla activada' : 'Plantilla ocultada');
      onChange();
    } catch (e) { toast.error('Error', { description: e.message }); }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} plantilla${selectedIds.size === 1 ? '' : 's'}?`)) return;
    try {
      const r = await fetch('/api/design-library/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await parseApiJson(r);
      if (!r.ok) throw new Error(data.error || 'No se pudieron eliminar las plantillas');
      toast.success(`${selectedIds.size} plantillas eliminadas`);
      setSelectedIds(new Set());
      load();
      onChange();
    } catch (e) { toast.error('Error', { description: e.message }); }
  };

  return (
    <Card>
      <CardHeader className="border-b bg-slate-50 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o carpeta…"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-300 text-sm"
            />
          </div>
          <select
            value={filterFolder} onChange={(e) => setFilterFolder(e.target.value)}
            className="h-9 px-2 rounded-md border border-slate-300 text-sm"
          >
            <option value="">Todas las carpetas</option>
            {folders.map(f => (
              <option key={f.name} value={f.name}>{f.name} ({f.count})</option>
            ))}
          </select>
          <select
            value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
            className="h-9 px-2 rounded-md border border-slate-300 text-sm"
          >
            <option value="all">Todas las fuentes</option>
            <option value="drive">Solo Drive</option>
            <option value="manual">Solo manuales</option>
          </select>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Refrescar
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={bulkDelete} className="text-rose-600 border-rose-200 hover:bg-rose-50">
              <Trash2 className="h-3.5 w-3.5 mr-1" />Eliminar {selectedIds.size}
            </Button>
          )}
        </div>
        <div className="text-xs text-slate-500">
          {filtered.length} cargadas de {total} plantillas{hasMore ? ' (scroll para más…)' : ''}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="text-center py-10">
            <Loader2 className="h-6 w-6 mx-auto animate-spin text-orange-500 mb-2" />
            <p className="text-sm text-slate-500">Cargando biblioteca…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-slate-500">
            <ImageIcon className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            {items.length === 0
              ? 'La biblioteca está vacía. Conectá Drive o subí archivos manualmente.'
              : `No hay resultados para "${q}"`}
          </div>
        ) : (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map(item => {
              const isSel = selectedIds.has(item.id);
              const isHidden = item.active === false;
              return (
                <div
                  key={item.id}
                  className={`relative rounded-lg border-2 bg-white p-2 transition-all ${
                    isSel ? 'border-orange-500 ring-2 ring-orange-200' :
                    isHidden ? 'border-slate-200 opacity-50' :
                    'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Checkbox selección */}
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="absolute top-1 left-1 h-5 w-5 rounded bg-white border-2 border-slate-300 flex items-center justify-center hover:border-orange-500"
                  >
                    {isSel && <CheckCircle2 className="h-4 w-4 text-orange-500" />}
                  </button>
                  {/* Source badge */}
                  <span className={`absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    item.source === 'drive' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-white'
                  }`}>
                    {item.source === 'drive' ? 'DRIVE' : 'MANUAL'}
                  </span>

                  <div className="aspect-square rounded bg-slate-50 flex items-center justify-center overflow-hidden mb-2">
                    <img src={thumbUrl(item.imageUrl)} alt={item.name} loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="text-xs font-semibold text-slate-900 truncate" title={item.name}>{item.name}</div>
                  {item.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {item.tags.slice(0, 2).map(t => (
                        <span key={t} className="text-[9px] bg-slate-100 text-slate-600 rounded px-1 py-0.5 truncate max-w-[80px]">{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-slate-500 font-mono">↗ {item.uses || 0}</span>
                    <button
                      type="button"
                      onClick={() => setActive(item.id, !isHidden ? false : true)}
                      title={isHidden ? 'Mostrar' : 'Ocultar'}
                      className="text-slate-400 hover:text-orange-600"
                    >
                      {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div ref={loadGridRef} className="h-1" />
          {hasMore && (
            <div className="text-center py-6">
              {loadingMore ? (
                <>
                  <Loader2 className="h-5 w-5 mx-auto animate-spin text-orange-500 mb-1" />
                  <p className="text-xs text-slate-500">Cargando más…</p>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={loadMore}>
                  <ChevronRight className="h-3.5 w-3.5 mr-1" />Cargar más ({total - items.length} restantes)
                </Button>
              )}
            </div>
          )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TAB 3: Subir Manual
// ============================================================================
function UploadTab({ onChange }) {
  const [files, setFiles] = useState([]); // { file, name, imageUrl, srcWidthPx, srcHeightPx, status }
  const [uploading, setUploading] = useState(false);
  const [tags, setTags] = useState('');
  const fileInputRef = useRef(null);

  const handleSelect = async (fileList) => {
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    const previews = arr.map(f => ({
      file: f,
      name: f.name.replace(/\.[^.]+$/, ''),
      status: 'pending',
      imageUrl: null,
    }));
    setFiles(prev => [...prev, ...previews]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleSelect(e.dataTransfer.files);
  };

  const uploadAll = async () => {
    if (files.length === 0) return;
    setUploading(true);
    const tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
    const uploaded = [];

    for (const item of files) {
      if (item.status === 'done') continue;
      try {
        // Subir archivo al server via /api/uploads/image (endpoint existente)
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('folder', 'library');
        // eslint-disable-next-line no-await-in-loop
        const uploadRes = await fetch('/api/uploads/image', { method: 'POST', body: fd });
        const uploadData = await parseApiJson(uploadRes);
        if (!uploadRes.ok) throw new Error(uploadData.error || 'upload failed');

        // Detectar dimensiones
        const img = new window.Image();
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = uploadData.url;
        });

        uploaded.push({
          name: item.name,
          imageUrl: uploadData.url,
          srcWidthPx: img.naturalWidth,
          srcHeightPx: img.naturalHeight,
          tags: tagArr,
        });
        item.status = 'done';
        item.imageUrl = uploadData.url;
        setFiles([...files]);
      } catch (e) {
        item.status = 'error';
        item.error = e.message;
        setFiles([...files]);
      }
    }

    if (uploaded.length > 0) {
      try {
        const bulkRes = await fetch('/api/design-library/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: uploaded }),
        });
        const bulkData = await parseApiJson(bulkRes);
        if (!bulkRes.ok) throw new Error(bulkData.error || 'No se pudieron registrar las plantillas');
        toast.success(`${bulkData.inserted} plantillas agregadas`, { description: tagArr.length ? `Tags: ${tagArr.join(', ')}` : undefined });
        setFiles([]);
        setTags('');
        onChange();
      } catch (e) {
        toast.error('Error insertando en biblioteca', { description: e.message });
      }
    }
    setUploading(false);
  };

  return (
    <Card>
      <CardHeader className="border-b bg-slate-50">
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4 text-orange-500" />
          Subir plantillas manualmente
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-orange-400 hover:bg-orange-50/30 rounded-lg p-8 text-center cursor-pointer transition-colors"
        >
          <Upload className="h-8 w-8 mx-auto text-slate-400 mb-2" />
          <div className="text-sm font-semibold text-slate-700">Arrastra imágenes aquí</div>
          <div className="text-xs text-slate-500 mt-1">o haz clic para seleccionar · PNG, JPG, WEBP</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleSelect(e.target.files)}
          />
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs font-semibold text-slate-700 mb-1 block">Tags (separados por coma)</label>
          <input
            type="text" value={tags} onChange={(e) => setTags(e.target.value)}
            placeholder="Ej: logo, deportivo, chile"
            className="w-full h-9 px-3 rounded-md border border-slate-300 text-sm"
          />
        </div>

        {/* Preview de archivos */}
        {files.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative aspect-square rounded border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                  {f.imageUrl ? (
                    <img src={f.imageUrl} alt={f.name} className="max-w-full max-h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-500 p-2 truncate">{f.file.name}</span>
                  )}
                  {f.status === 'done' && <CheckCircle2 className="absolute top-1 right-1 h-4 w-4 text-emerald-500 bg-white rounded-full" />}
                  {f.status === 'error' && <XCircle className="absolute top-1 right-1 h-4 w-4 text-rose-500 bg-white rounded-full" />}
                  {f.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 h-4 w-4 bg-white rounded-full flex items-center justify-center hover:bg-rose-50"
                    >
                      <XCircle className="h-3 w-3 text-slate-400" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFiles([])} disabled={uploading}>Limpiar</Button>
              <Button onClick={uploadAll} disabled={uploading} className="bg-orange-500 hover:bg-orange-600">
                {uploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Subiendo…</> : <><Upload className="h-4 w-4 mr-1" />Subir {files.length}</>}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TAB 4: Estadísticas
// ============================================================================
function StatsTab({ stats, onRefresh }) {
  if (!stats) return (
    <div className="text-center py-10">
      <Loader2 className="h-6 w-6 mx-auto animate-spin text-orange-500 mb-2" />
    </div>
  );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Resumen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-orange-500" />Resumen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Total activas" value={stats.totalActive} />
          <Row label="Total ocultas" value={stats.totalInactive} />
          <Row label="Desde Drive" value={stats.bySource?.drive || 0} />
          <Row label="Subidas manuales" value={stats.bySource?.manual || 0} />
          <Row label="Usos totales" value={stats.totalUses} highlight />
        </CardContent>
      </Card>

      {/* Top usadas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />Top 10 más usadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.topUsed?.length === 0 ? (
            <p className="text-xs text-slate-500">Todavía nadie ha usado las plantillas.</p>
          ) : (
            <div className="space-y-1.5">
              {stats.topUsed?.map((item, i) => (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-mono w-4 text-right">{i + 1}</span>
                  <img src={item.imageUrl} alt="" className="h-6 w-6 rounded object-contain bg-slate-50" />
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="font-mono font-bold text-emerald-700">{item.uses}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Por tag */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Tag className="h-4 w-4 text-blue-500" />Distribución por tag
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.byTag?.length === 0 ? (
            <p className="text-xs text-slate-500">Sin tags aún.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {stats.byTag?.map(t => (
                <span key={t.tag} className="text-xs bg-slate-100 text-slate-700 rounded-full px-2.5 py-1">
                  {t.tag} <b className="text-orange-600 ml-1">{t.count}</b>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className={`font-mono font-bold ${highlight ? 'text-orange-600 text-lg' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}
