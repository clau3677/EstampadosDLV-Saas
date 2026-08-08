'use client';

// =============================================================================
// Módulo Marketing — Panel admin (auditoría jul-2026)
// -----------------------------------------------------------------------------
// Pestañas: Publicaciones · Anuncios (Meta) · Google Ads · Métricas · Conexiones
// Backend: /api/marketing/* (lib/api/marketing.js)
// =============================================================================

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Megaphone, RefreshCw, Sparkles, Send, CalendarClock, Trash2, Pencil,
  Facebook, Instagram, Link2, Unlink, CheckCircle2, XCircle, AlertTriangle,
  BarChart3, Rocket, ExternalLink, Copy, Clock, ImageIcon, Loader2,
  Search, Target, TrendingUp, Zap, MapPin,
} from 'lucide-react';

const fmtCLP = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n ?? 0);
const fmtDate = (d) => (d ? new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const POST_STATUS = {
  draft:     { label: 'Borrador',   cls: 'bg-slate-100 text-slate-700' },
  scheduled: { label: 'Programado', cls: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publicado',  cls: 'bg-emerald-100 text-emerald-700' },
  failed:    { label: 'Falló',      cls: 'bg-rose-100 text-rose-700' },
};

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function MarketingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/status');
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      console.warn('marketing status', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Feedback tras volver del OAuth de Meta
  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected === 'ok') toast.success('Cuenta Meta conectada — selecciona tu página abajo');
    else if (connected === 'error') toast.error(`Error al conectar con Meta: ${searchParams.get('detail') || 'desconocido'}`);
  }, [searchParams]);

  const account = status?.account;
  const isConnected = account?.status === 'connected';

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-orange-500" /> Marketing
            <Badge className="bg-blue-100 text-blue-700 ml-1">Meta</Badge>
            <Badge className="bg-orange-100 text-orange-700 ml-1">Google Ads</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Posts automáticos con IA, anuncios en Facebook, Instagram y Google — todo desde el panel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge className="bg-emerald-100 text-emerald-700 gap-1">
              <CheckCircle2 className="h-3 w-3" /> {account.pageName}
              {account.igUsername ? ` · @${account.igUsername}` : ''}
            </Badge>
          ) : (
            <Badge className="bg-slate-100 text-slate-600 gap-1">
              <XCircle className="h-3 w-3" /> Sin conexión Meta
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={refreshStatus}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Avisos de configuración del servidor */}
      {status && (!status.metaAppConfigured || !status.encryptionConfigured) && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Configuración pendiente en el servidor:</strong>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                {!status.metaAppConfigured && <li><code>META_APP_ID</code> y <code>META_APP_SECRET</code> (app en developers.facebook.com)</li>}
                {!status.encryptionConfigured && <li><code>MARKETING_ENCRYPTION_KEY</code> (generar con <code>openssl rand -hex 32</code>)</li>}
                {!status.cronSecretConfigured && <li><code>MARKETING_CRON_SECRET</code> (para el cron de publicación automática)</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full md:w-auto">
          <TabsTrigger value="posts">Publicaciones</TabsTrigger>
          <TabsTrigger value="ads">Meta Ads</TabsTrigger>
          <TabsTrigger value="google-ads">Google Ads</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="connections">Conexiones</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          <PostsTab isConnected={isConnected} aiConfigured={status?.aiConfigured} />
        </TabsContent>
        <TabsContent value="ads">
          <AdsTab isConnected={isConnected} hasAdAccount={!!account?.adAccountId} />
        </TabsContent>
        <TabsContent value="google-ads">
          <GoogleAdsTab />
        </TabsContent>
        <TabsContent value="metrics">
          <MetricsTab isConnected={isConnected} />
        </TabsContent>
        <TabsContent value="connections">
          <ConnectionsTab status={status} loading={loading} onChanged={refreshStatus} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña: Publicaciones
// ---------------------------------------------------------------------------
const SUPPLIER_LABELS = { cottonext: 'Cottonext', textilryu: 'Textil Ryu', treck: 'Treck' };

function PostsTab({ isConnected, aiConfigured }) {
  const [posts, setPosts] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [forceRefresh, setForceRefresh] = useState(0);
  const [supplierFilter, setSupplierFilter] = useState('all');
  // Generador
  const [productId, setProductId] = useState('');
  const [tone, setTone] = useState('');
  const [occasion, setOccasion] = useState('');
  const [platforms, setPlatforms] = useState(['facebook', 'instagram']);
  const [scheduledAt, setScheduledAt] = useState('');
  const [generating, setGenerating] = useState(false);
  // Edición
  const [editing, setEditing] = useState(null); // post en edición
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/posts?status=${filter}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) setPosts(await res.json());
    } catch (e) { console.warn(e); }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh, forceRefresh]);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const togglePlatform = (p) => {
    setPlatforms((prev) => {
      const next = prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p];
      return next.length ? next : prev; // al menos una
    });
  };

  const generate = async () => {
    if (!productId) return toast.error('Selecciona un producto');
    setGenerating(true);
    try {
      const res = await fetch('/api/marketing/posts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId, tone: tone || undefined, occasion: occasion || undefined,
          platforms, scheduledAt: scheduledAt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error generando post');
      toast.success(scheduledAt ? 'Post generado y programado ✅' : 'Post generado como borrador ✅');
      setOccasion(''); setScheduledAt('');
      // Refetch directo para asegurar que la lista se actualice
      try {
        const listRes = await fetch(`/api/marketing/posts?status=all&_t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (listRes.ok) setPosts(await listRes.json());
      } catch (e) { console.warn('Refresh posts failed:', e); }
      setForceRefresh(n => n + 1);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const publishNow = async (id) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/marketing/posts/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error publicando');
      toast.success('Publicado en Meta ✅');
      setForceRefresh(n => n + 1);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const removePost = async (id) => {
    if (!confirm('¿Eliminar este borrador?')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/marketing/posts?id=${id}`, { method: 'DELETE', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error eliminando');
      toast.success('Post eliminado');
      setForceRefresh(n => n + 1);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const res = await fetch('/api/marketing/posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          caption: editing.caption,
          hashtags: editing.hashtags,
          scheduledAt: editing.scheduledAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error guardando');
      toast.success('Post actualizado');
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Generador */}
      <Card className="lg:col-span-1 h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-orange-500" /> Generar post con IA
          </CardTitle>
          <CardDescription>
            La IA crea el texto y la imagen de marca (1080×1080) a partir del producto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!aiConfigured && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> MINIMAX_API_KEY no configurada en el servidor.
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
            <Select value={supplierFilter} onValueChange={(v) => { setSupplierFilter(v); setProductId(''); }}>
              <SelectTrigger><SelectValue placeholder="Todos los proveedores" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proveedores</SelectItem>
                {Object.entries(SUPPLIER_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Producto</label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un producto…" /></SelectTrigger>
              <SelectContent>
                {products
                  .filter((p) => supplierFilter === 'all' || p.supplier === supplierFilter)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} {p.supplier ? `(${SUPPLIER_LABELS[p.supplier] || p.supplier})` : ''}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Ocasión / campaña (opcional)</label>
            <Input placeholder="ej: Fiestas Patrias, lanzamiento…" value={occasion} onChange={(e) => setOccasion(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tono (opcional)</label>
            <Select value={tone || 'default'} onValueChange={(v) => setTone(v === 'default' ? '' : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Estándar (cercano)</SelectItem>
                <SelectItem value="urgente">Urgencia / oferta</SelectItem>
                <SelectItem value="profesional">Profesional B2B</SelectItem>
                <SelectItem value="divertido">Divertido / juvenil</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Plataformas</label>
            <div className="flex gap-2 mt-1">
              <Button
                type="button" size="sm"
                variant={platforms.includes('facebook') ? 'default' : 'outline'}
                onClick={() => togglePlatform('facebook')}
              >
                <Facebook className="h-4 w-4 mr-1" /> Facebook
              </Button>
              <Button
                type="button" size="sm"
                variant={platforms.includes('instagram') ? 'default' : 'outline'}
                onClick={() => togglePlatform('instagram')}
              >
                <Instagram className="h-4 w-4 mr-1" /> Instagram
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Programar para (opcional)</label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            <p className="text-[11px] text-muted-foreground mt-1">
              Vacío = queda como borrador para revisar antes de publicar.
            </p>
          </div>
          <Button className="w-full" onClick={generate} disabled={generating || !aiConfigured}>
            {generating
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando…</>
              : <><Sparkles className="h-4 w-4 mr-2" /> Generar post</>}
          </Button>
        </CardContent>
      </Card>

      {/* Lista de posts */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Posts ({posts.length})</h3>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Borradores</SelectItem>
              <SelectItem value="scheduled">Programados</SelectItem>
              <SelectItem value="published">Publicados</SelectItem>
              <SelectItem value="failed">Fallidos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {posts.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Aún no hay posts. Genera el primero con IA desde el panel izquierdo.
            </CardContent>
          </Card>
        )}

        {posts.map((post) => {
          const st = POST_STATUS[post.status] || POST_STATUS.draft;
          const isEditing = editing?.id === post.id;
          return (
            <Card key={post.id}>
              <CardContent className="py-4">
                <div className="flex gap-4">
                  {/* Imagen */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.imageUrl.startsWith('http') ? post.imageUrl : `/api/thumbnails?src=${encodeURIComponent(post.imageUrl)}&w=192&format=webp&q=80`}
                    alt={post.altText || post.productName}
                    loading="lazy"
                    decoding="async"
                    className="h-24 w-24 rounded-lg object-cover shrink-0 border"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{post.productName}</span>
                      <Badge className={st.cls}>{st.label}</Badge>
                      {post.platforms?.includes('facebook') && <Facebook className="h-3.5 w-3.5 text-blue-600" />}
                      {post.platforms?.includes('instagram') && <Instagram className="h-3.5 w-3.5 text-pink-600" />}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          rows={4}
                          value={editing.caption}
                          onChange={(e) => setEditing({ ...editing, caption: e.target.value })}
                        />
                        <Input
                          value={(editing.hashtags || []).join(' ')}
                          onChange={(e) => setEditing({
                            ...editing,
                            hashtags: e.target.value.split(/\s+/).filter(Boolean),
                          })}
                          placeholder="#hashtags separados por espacio"
                        />
                        <div className="flex items-center gap-2">
                          <Input
                            type="datetime-local"
                            className="w-56"
                            value={editing.scheduledAt ? new Date(editing.scheduledAt).toISOString().slice(0, 16) : ''}
                            onChange={(e) => setEditing({ ...editing, scheduledAt: e.target.value })}
                          />
                          <Button size="sm" onClick={saveEdit} disabled={busyId === post.id}>Guardar</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{post.caption}</p>
                        <p className="text-[11px] text-blue-600 mt-1 truncate">{(post.hashtags || []).join(' ')}</p>
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                          {post.status === 'scheduled' && (
                            <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {fmtDate(post.scheduledAt)}</span>
                          )}
                          {post.status === 'published' && (
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> {fmtDate(post.publishedAt)}</span>
                          )}
                          {post.status === 'failed' && post.publishErrors?.length > 0 && (
                            <span className="flex items-center gap-1 text-rose-600"><XCircle className="h-3 w-3" /> {post.publishErrors[0]}</span>
                          )}
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> creado {fmtDate(post.createdAt)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Acciones */}
                  {!isEditing && post.status !== 'published' && (
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => publishNow(post.id)}
                        disabled={!isConnected || busyId === post.id}
                        title={isConnected ? 'Publicar ahora' : 'Conecta Meta primero'}
                      >
                        {busyId === post.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing({ ...post })}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-500" onClick={() => removePost(post.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña: Anuncios (Meta Ads — recetas)
// ---------------------------------------------------------------------------
function AdsTab({ isConnected, hasAdAccount }) {
  const [campaigns, setCampaigns] = useState([]);
  const [posts, setPosts] = useState([]);
  const [products, setProducts] = useState([]);
  const [adsSupplierFilter, setAdsSupplierFilter] = useState('all');
  const [recipe, setRecipe] = useState('product_traffic');
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('5000');
  const [days, setDays] = useState('7');
  const [postId, setPostId] = useState('');
  const [productId, setProductId] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/campaigns');
      if (res.ok) setCampaigns(await res.json());
    } catch (e) { console.warn(e); }
  }, []);

  useEffect(() => {
    refresh();
    fetch('/api/marketing/posts?status=published').then((r) => r.json()).then((d) => setPosts(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/products').then((r) => r.json()).then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {});
  }, [refresh]);

  const create = async () => {
    if (!name.trim()) return toast.error('Ponle nombre a la campaña');
    if (recipe === 'boost_post' && !postId) return toast.error('Selecciona el post a impulsar');
    if (recipe === 'product_traffic' && !productId) return toast.error('Selecciona el producto');
    setCreating(true);
    try {
      const res = await fetch('/api/marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe, name,
          dailyBudgetClp: Number(budget), days: Number(days),
          postId: postId || undefined, productId: productId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error creando campaña');
      toast.success('Campaña creada en PAUSA — actívala cuando estés listo ✅');
      setName('');
      refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (c) => {
    const next = c.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setBusyId(c.id);
    try {
      const res = await fetch('/api/marketing/campaigns/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error');
      toast.success(next === 'ACTIVE' ? 'Campaña activada 🚀' : 'Campaña pausada');
      refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket className="h-4 w-4 text-orange-500" /> Nueva campaña
          </CardTitle>
          <CardDescription>
            Recetas simples: la campaña se crea <strong>en pausa</strong> y la activas cuando quieras.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(!isConnected || !hasAdAccount) && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {!isConnected ? 'Conecta tu cuenta Meta primero.' : 'No hay Ad Account seleccionada — reconecta en Conexiones.'}
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Receta</label>
            <Select value={recipe} onValueChange={setRecipe}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product_traffic">Tráfico a un producto</SelectItem>
                <SelectItem value="boost_post">Impulsar un post publicado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {recipe === 'product_traffic' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Proveedor</label>
                <Select value={adsSupplierFilter} onValueChange={(v) => { setAdsSupplierFilter(v); setProductId(''); }}>
                  <SelectTrigger><SelectValue placeholder="Todos los proveedores" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los proveedores</SelectItem>
                    {Object.entries(SUPPLIER_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Producto</label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {products
                      .filter((p) => adsSupplierFilter === 'all' || p.supplier === adsSupplierFilter)
                      .map((p) => <SelectItem key={p.id} value={p.id}>{p.name} {p.supplier ? `(${SUPPLIER_LABELS[p.supplier] || p.supplier})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {recipe === 'boost_post' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Post publicado</label>
              <Select value={postId} onValueChange={setPostId}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {posts.filter((p) => p.fbPostId).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.productName} · {fmtDate(p.publishedAt)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre de la campaña</label>
            <Input placeholder="ej: Poleras DTF — agosto" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Presupuesto diario (CLP)</label>
              <Input type="number" min="1000" step="500" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Duración (días)</label>
              <Input type="number" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Total estimado: {fmtCLP(Number(budget || 0) * Number(days || 0))} · Segmentación: Chile, 18-65.
          </p>
          <Button className="w-full" onClick={create} disabled={creating || !isConnected || !hasAdAccount}>
            {creating
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creando en Meta…</>
              : <><Rocket className="h-4 w-4 mr-2" /> Crear campaña (en pausa)</>}
          </Button>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-3">
        <h3 className="font-semibold text-sm">Campañas ({campaigns.length})</h3>
        {campaigns.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <Rocket className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Sin campañas aún. Crea la primera con una receta.
            </CardContent>
          </Card>
        )}
        {campaigns.map((c) => (
          <Card key={c.id}>
            <CardContent className="py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{c.name}</span>
                  <Badge className={c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                    {c.status === 'ACTIVE' ? 'Activa' : 'Pausada'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {c.recipe === 'boost_post' ? 'Impulso de post' : 'Tráfico a producto'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {fmtCLP(c.dailyBudgetClp)}/día · {c.days} días · creada {fmtDate(c.createdAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant={c.status === 'ACTIVE' ? 'outline' : 'default'}
                onClick={() => toggleStatus(c)}
                disabled={busyId === c.id}
              >
                {busyId === c.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : (c.status === 'ACTIVE' ? 'Pausar' : 'Activar')}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña: Métricas
// ---------------------------------------------------------------------------
function MetricsTab({ isConnected }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/metrics');
      if (res.ok) setData(await res.json());
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Conecta tu cuenta Meta para ver métricas de posts y anuncios.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Rendimiento
          {data?.fetchedAt && <span className="text-[11px] text-muted-foreground font-normal">actualizado {fmtDate(data.fetchedAt)}</span>}
        </h3>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {/* Campañas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Campañas (últimos 30 días)</CardTitle>
        </CardHeader>
        <CardContent>
          {(!data?.campaigns || data.campaigns.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {data?.campaignsError ? `Meta: ${data.campaignsError}` : 'Sin datos de campañas todavía.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3">Campaña</th>
                    <th className="py-2 pr-3">Alcance</th>
                    <th className="py-2 pr-3">Impresiones</th>
                    <th className="py-2 pr-3">Clics</th>
                    <th className="py-2 pr-3">CTR</th>
                    <th className="py-2">Gasto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => (
                    <tr key={c.campaign_id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{c.campaign_name}</td>
                      <td className="py-2 pr-3">{c.reach ?? '—'}</td>
                      <td className="py-2 pr-3">{c.impressions ?? '—'}</td>
                      <td className="py-2 pr-3">{c.clicks ?? '—'}</td>
                      <td className="py-2 pr-3">{c.ctr ? `${Number(c.ctr).toFixed(2)}%` : '—'}</td>
                      <td className="py-2">{c.spend ? fmtCLP(Number(c.spend)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Posts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Posts publicados</CardTitle>
        </CardHeader>
        <CardContent>
          {(!data?.posts || data.posts.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Aún no hay posts publicados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3">Producto</th>
                    <th className="py-2 pr-3">Publicado</th>
                    <th className="py-2 pr-3">FB ❤ / 💬 / ↗</th>
                    <th className="py-2">IG alcance / ❤ / 💬</th>
                  </tr>
                </thead>
                <tbody>
                  {data.posts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{p.productName}</td>
                      <td className="py-2 pr-3">{fmtDate(p.publishedAt)}</td>
                      <td className="py-2 pr-3">
                        {p.facebook ? `${p.facebook.likes} / ${p.facebook.comments} / ${p.facebook.shares}` : '—'}
                      </td>
                      <td className="py-2">
                        {p.instagram ? `${p.instagram.reach ?? 0} / ${p.instagram.likes ?? 0} / ${p.instagram.comments ?? 0}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña: Conexiones
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Toggle de Auto-Publishing
// ---------------------------------------------------------------------------
function AutoPublishingToggle({ status }) {
  const [autoStatus, setAutoStatus] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAutoStatus = async () => {
    try {
      const res = await fetch('/api/marketing/auto/status');
      const data = await res.json();
      if (data.ok) setAutoStatus(data);
    } catch (e) {
      console.error('Error fetching auto status:', e);
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => { setLoading(true); fetchAutoStatus(); };

  useState(() => { fetchAutoStatus(); });

  const toggle = async (enabled) => {
    setToggling(true);
    try {
      const res = await fetch('/api/marketing/auto/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchAutoStatus();
      }
    } catch (e) {
      console.error('Error toggling auto-publishing:', e);
    } finally {
      setToggling(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando estado...</p>;
  if (!autoStatus) return <p className="text-sm text-amber-600">No disponible</p>;

  const isEnabled = autoStatus.enabled;
  const remaining = autoStatus.totalActiveProducts - autoStatus.productsPublishedThisCycle;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isEnabled ? (
            <Play className="h-4 w-4 text-emerald-600" />
          ) : (
            <Pause className="h-4 w-4 text-amber-600" />
          )}
          <span className="text-sm font-medium">
            {isEnabled ? 'Activo — publicando automáticamente' : 'Pausado'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant={isEnabled ? 'destructive' : 'default'}
            size="sm"
            disabled={toggling}
            onClick={() => toggle(!isEnabled)}
          >
            {toggling ? (
              '...'
            ) : isEnabled ? (
              <><Pause className="h-3.5 w-3.5 mr-1" /> Pausar</>
            ) : (
              <><Play className="h-3.5 w-3.5 mr-1" /> Reanudar</>
            )}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border p-2">
          <p className="text-muted-foreground">Publicados</p>
          <p className="font-semibold">{autoStatus.productsPublishedThisCycle}</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="text-muted-foreground">Restantes</p>
          <p className="font-semibold">{Math.max(0, remaining)}</p>
        </div>
        <div className="rounded-lg border p-2">
          <p className="text-muted-foreground">Programados hoy</p>
          <p className="font-semibold">{autoStatus.scheduledToday}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ciclo: {autoStatus.totalActiveProducts} productos · Se publica 1 de cada categoría diaria · Sin repetir hasta agotar el catálogo.
        {autoStatus.cycleStartedAt ? ` · Ciclo iniciado: ${new Date(autoStatus.cycleStartedAt).toLocaleDateString('es-CL')}` : ''}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={refresh} disabled={toggling}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualizar
        </Button>
      </div>
    </div>
  );
}

function ConnectionsTab({ status, loading, onChanged }) {
  const [connecting, setConnecting] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [pageId, setPageId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');

  const account = status?.account;
  const isConnected = account?.status === 'connected';
  const pendingSelection = account?.status === 'pending_selection';

  const startOAuth = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/marketing/oauth/start');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error iniciando OAuth');
      window.location.href = data.url;
    } catch (e) {
      toast.error(e.message);
      setConnecting(false);
    }
  };

  const selectAccount = async () => {
    if (!pageId) return toast.error('Selecciona una página');
    setSelecting(true);
    try {
      const res = await fetch('/api/marketing/accounts/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, adAccountId: adAccountId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error seleccionando');
      toast.success('Cuenta configurada ✅');
      onChanged();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSelecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('¿Desconectar la cuenta Meta? Los posts programados dejarán de publicarse.')) return;
    try {
      const res = await fetch('/api/marketing/accounts', { method: 'DELETE' });
      if (!res.ok) throw new Error('error desconectando');
      toast.success('Cuenta desconectada');
      onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado`));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Conexión Meta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-blue-600" /> Cuenta Meta (Facebook + Instagram)
          </CardTitle>
          <CardDescription>
            Conecta la página de Facebook y la cuenta de Instagram Business del negocio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}

          {!loading && isConnected && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <Facebook className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">{account.pageName}</span>
                  <Badge className="bg-emerald-100 text-emerald-700">Conectada</Badge>
                </div>
                {account.igUsername ? (
                  <div className="flex items-center gap-2">
                    <Instagram className="h-4 w-4 text-pink-600" />
                    <span>@{account.igUsername}</span>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">
                    Sin Instagram Business vinculado a la página — vincúlalo en Meta Business Suite para publicar en IG.
                  </p>
                )}
                {account.adAccountId ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Rocket className="h-3.5 w-3.5" /> Ad Account: {account.adAccountId}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">Sin Ad Account — necesaria para crear anuncios.</p>
                )}
                {account.tokenExpiresAt && (
                  <p className="text-[11px] text-muted-foreground">
                    Token expira: {fmtDate(account.tokenExpiresAt)} — reconecta antes de esa fecha.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={startOAuth} disabled={connecting}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reconectar
                </Button>
                <Button variant="ghost" size="sm" className="text-rose-500" onClick={disconnect}>
                  <Unlink className="h-3.5 w-3.5 mr-1" /> Desconectar
                </Button>
              </div>
            </div>
          )}

          {!loading && pendingSelection && (
            <div className="space-y-3">
              <p className="text-sm text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> OAuth completado — elige la página y la cuenta publicitaria:
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Página de Facebook</label>
                <Select value={pageId} onValueChange={setPageId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona página…" /></SelectTrigger>
                  <SelectContent>
                    {(account.availablePages || []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Cuenta publicitaria (opcional)</label>
                <Select value={adAccountId || 'none'} onValueChange={(v) => setAdAccountId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Sin anuncios por ahora" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin anuncios por ahora</SelectItem>
                    {(account.availableAdAccounts || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={selectAccount} disabled={selecting} className="w-full">
                {selecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirmar selección
              </Button>
            </div>
          )}

          {!loading && !isConnected && !pendingSelection && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Al conectar, autorizarás a la app para publicar en tu página, en Instagram y administrar anuncios.
              </p>
              <Button onClick={startOAuth} disabled={connecting || !status?.metaAppConfigured} className="w-full bg-blue-600 hover:bg-blue-700">
                {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Facebook className="h-4 w-4 mr-2" />}
                Conectar con Meta
              </Button>
              {!status?.metaAppConfigured && (
                <p className="text-xs text-amber-600">Configura META_APP_ID y META_APP_SECRET en el servidor primero.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recursos: feed + cron */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feed de catálogo para Meta</CardTitle>
            <CardDescription>
              Pega esta URL en Commerce Manager → Data Sources → Data Feed para sincronizar tus productos y usar anuncios de catálogo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Input readOnly value={status?.feedUrl || ''} className="text-xs font-mono" />
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(status?.feedUrl, 'URL del feed')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <a href={status?.feedUrl} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm"><ExternalLink className="h-3.5 w-3.5" /></Button>
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Formato CSV compatible con Meta. Configura actualización diaria en Commerce Manager.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commerce Manager — Catálogo de productos</CardTitle>
            <CardDescription>
              Catálogo sincronizado automáticamente con Facebook. Los productos aparecerán en la Tienda de tu página de Facebook.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {status?.catalogId ? (
              <>
                <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium">Catálogo ID: {status.catalogId}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Feed: {status.feedUrl}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Facebook consulta el feed diariamente y actualiza automáticamente los productos, precios e inventario.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(status.catalogId, 'Catalog ID')}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copiar ID
                  </Button>
                  <a href="https://business.facebook.com/commerce/catalogs" target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver en Commerce Manager
                    </Button>
                  </a>
                </div>
              </>
            ) : (
              <p className="text-sm text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Agrega META_CATALOG_ID al .env del servidor para activar la sincronización automática.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publicación automática (cron)</CardTitle>
            <CardDescription>
              Para que los posts programados y las solicitudes de reseña se envíen solos, llama a este endpoint cada 10-15 min.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Input readOnly value={status?.dispatchUrl || ''} className="text-xs font-mono" />
              <Button variant="outline" size="sm" onClick={() => copyToClipboard(status?.dispatchUrl, 'URL del cron')}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <pre className="text-[11px] bg-slate-950 text-slate-200 rounded-lg p-3 overflow-x-auto">
{`# crontab del VPS (cada 10 min):
*/10 * * * * curl -s -X POST \\
  -H "x-cron-secret: $MARKETING_CRON_SECRET" \\
  ${status?.dispatchUrl || 'https://estampadosdlv.com/api/marketing/dispatch'}`}
            </pre>
            <p className="text-[11px] text-muted-foreground">
              Estado actual: {status?.stats?.scheduledCount ?? 0} post(s) programado(s) · {status?.stats?.pendingReviews ?? 0} reseña(s) pendiente(s).
            </p>
          </CardContent>
        </Card>
        {/* Auto-Publishing Toggle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Publicación automática diaria</CardTitle>
            <CardDescription>
              Genera 4 posts con IA cada día (Ropa de Trabajo, Ropa Lisa, Gorras, DTF Textil) y los publica automáticamente cada 3 horas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <AutoPublishingToggle status={status} />
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña: Google Ads
// ---------------------------------------------------------------------------
function GoogleAdsTab() {
  const [googleStatus, setGoogleStatus] = useState(null);
  const [subTab, setSubTab] = useState('connection');
  const [campaigns, setCampaigns] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [optimization, setOptimization] = useState(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [loadingOpt, setLoadingOpt] = useState(false);
  // Crear campaña
  const [newName, setNewName] = useState('');
  const [newBudget, setNewBudget] = useState('5');
  const [newMaxCpc, setNewMaxCpc] = useState('0.50');
  const [newFocus, setNewFocus] = useState('');
  const [creating, setCreating] = useState(false);

  const refreshGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/google/oauth/status');
      if (res.ok) setGoogleStatus(await res.json());
    } catch (e) { console.warn(e); }
  }, []);

  const refreshCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch('/api/marketing/google/campaigns');
      if (res.ok) { const d = await res.json(); setCampaigns(d.campaigns || []); }
    } catch (e) { console.warn(e); }
    finally { setLoadingCampaigns(false); }
  }, []);

  const refreshMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const res = await fetch('/api/marketing/google/metrics');
      if (res.ok) { const d = await res.json(); setMetrics(d.metrics || []); }
    } catch (e) { console.warn(e); }
    finally { setLoadingMetrics(false); }
  }, []);

  const refreshOptimization = useCallback(async () => {
    setLoadingOpt(true);
    try {
      const res = await fetch('/api/marketing/google/optimization');
      if (res.ok) setOptimization(await res.json());
    } catch (e) { console.warn(e); }
    finally { setLoadingOpt(false); }
  }, []);

  useEffect(() => { refreshGoogleStatus(); }, [refreshGoogleStatus]);

  const connect = async () => {
    try {
      const res = await fetch('/api/marketing/google/oauth/authorize');
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        toast.error('Google Ads no configurado en el servidor');
      }
    } catch (e) { toast.error('Error al conectar'); }
  };

  const disconnect = async () => {
    try {
      await fetch('/api/marketing/google/oauth/disconnect', { method: 'DELETE' });
      refreshGoogleStatus();
      toast.success('Google Ads desconectado');
    } catch (e) { toast.error('Error al desconectar'); }
  };

  const FOCUS_OPTIONS = [
    { key: 'dtf_textil', label: 'DTF Textil', icon: '🎨', desc: 'Impresión DTF en textiles' },
    { key: 'dtf_uv', label: 'DTF UV', icon: '💡', desc: 'Impresión UV para superficies rígidas' },
    { key: 'ropa_lisa', label: 'Ropa Lisa', icon: '👕', desc: 'Polerones y camisetas lisas' },
    { key: 'gorras', label: 'Gorras', icon: '🧢', desc: 'Gorras trucker y personalizadas' },
    { key: 'ropa_trabajo', label: 'Ropa de Trabajo', icon: '🦺', desc: 'Uniformes y ropa laboral' },
  ];

  const createCampaign = async () => {
    if (!newName.trim()) return toast.error('Ponle nombre a la campaña');
    if (!newFocus) return toast.error('Selecciona un foco de negocio');
    setCreating(true);
    try {
      const res = await fetch('/api/marketing/google/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          budgetUsd: Number(newBudget),
          maxCpcUsd: Number(newMaxCpc),
          focusKey: newFocus,
        }),
      });
      if (res.ok) {
        toast.success('Campaña creada exitosamente');
        setNewName(''); setNewBudget('5'); setNewMaxCpc('0.50'); setNewFocus('');
        refreshCampaigns();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || d.message || 'Error creando campaña. Verifica que la cuenta Google Ads esté conectada.');
      }
    } catch (e) { toast.error('Error creando campaña'); }
    finally { setCreating(false); }
  };

  const toggleCampaign = async (resourceName, currentStatus) => {
    const newStatus = currentStatus === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    try {
      const res = await fetch('/api/marketing/google/campaigns/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_name: resourceName, status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Campaña ${newStatus === 'ENABLED' ? 'activada' : 'pausada'}`);
        refreshCampaigns();
      } else {
        const d = await res.json();
        toast.error(d.message || 'Error actualizando campaña');
      }
    } catch (e) { toast.error('Error actualizando campaña'); }
  };

  const isConnected = googleStatus?.connected;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <Tabs defaultValue="connection" value={subTab} onValueChange={setSubTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="connection">Conexión</TabsTrigger>
          <TabsTrigger value="create">Crear Campaña</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="optimization">IA Optimización</TabsTrigger>
        </TabsList>

        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Google Ads — Estado de Conexión</CardTitle>
              <CardDescription>Conecta tu cuenta de Google Ads para crear y gestionar campañas desde el panel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {googleStatus?.configured === false && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-800">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  Google Ads no configurado en el servidor. Faltan variables de entorno: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID
                </div>
              )}
              {isConnected && (
                <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="font-medium text-emerald-800">Google Ads conectado</p>
                      <p className="text-xs text-emerald-600">Customer ID: {googleStatus.customerId} · Conectado desde {fmtDate(googleStatus.connectedAt)}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={disconnect} className="text-rose-600 border-rose-300 hover:bg-rose-50">
                    <Unlink className="h-3.5 w-3.5 mr-1" /> Desconectar
                  </Button>
                </div>
              )}
              {!isConnected && googleStatus?.configured !== false && (
                <Button onClick={connect} size="lg">
                  <Link2 className="h-4 w-4 mr-2" /> Conectar con Google Ads
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Crear Campaña de Búsqueda</CardTitle>
              <CardDescription>
Campañas orientadas a la <strong>Región de Valparaíso</strong>, en <strong>español</strong>, con anuncios generados por IA.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info de configuración */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-blue-800">
                  <p className="font-medium">Configuración automática</p>
                  <p className="text-blue-600 text-xs">Ubicación: Región de Valparaíso · Idioma: Español · Red: Búsqueda Google</p>
                </div>
              </div>

              {/* Selector de foco de negocio */}
              <div>
                <label className="text-sm font-medium mb-2 block">Foco de negocio *</label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {FOCUS_OPTIONS.map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => { setNewFocus(f.key); setNewName(f.key.toUpperCase()); }}
                      className={`p-3 rounded-lg border-2 text-center transition-all text-sm ${
                        newFocus === f.key
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                      }`}
                    >
                      <span className="text-xl block mb-1">{f.icon}</span>
                      <span className="font-medium block">{f.label}</span>
                      <span className="text-xs text-muted-foreground block mt-0.5">{f.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Campos de configuración */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Nombre de campaña</label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: DTF UV - Valparaíso" />
                </div>
                <div>
                  <label className="text-sm font-medium">Presupuesto diario (USD)</label>
                  <Input type="number" value={newBudget} onChange={(e) => setNewBudget(e.target.value)} min="1" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Puja máxima CPC (USD)</label>
                  <Input type="number" value={newMaxCpc} onChange={(e) => setNewMaxCpc(e.target.value)} step="0.01" min="0.01" />
                </div>
                <div className="flex items-end">
                  <Button onClick={createCampaign} disabled={!isConnected || creating || !newName.trim() || !newFocus} className="w-full">
                    {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
                    Crear Campaña con IA
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de campañas */}
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Campañas existentes</h3>
              <Button variant="outline" size="sm" onClick={refreshCampaigns}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualizar
              </Button>
            </div>
            {loadingCampaigns ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando campañas...
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay campañas aún.</p>
            ) : (
              <div className="space-y-2">
                {campaigns.map((c, i) => (
                  <Card key={i}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{c.campaign?.name || 'Sin nombre'}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.campaign?.advertisingChannelType || 'SEARCH'} ·
                          Status: {c.campaign?.status || 'UNKNOWN'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => toggleCampaign(c.resourceName || c.campaign?.resourceName, c.campaign?.status)}>
                          {c.campaign?.status === 'ENABLED' ? 'Pausar' : 'Activar'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Métricas Google Ads</CardTitle>
              <CardDescription>Rendimiento de tus campañas en los últimos 30 días.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" size="sm" onClick={refreshMetrics}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Actualizar métricas
              </Button>
              {loadingMetrics ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                </div>
              ) : metrics.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos de métricas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2">Campaña</th>
                        <th className="py-2">Clics</th>
                        <th className="py-2">Impresiones</th>
                        <th className="py-2">CTR</th>
                        <th className="py-2">CPC</th>
                        <th className="py-2">Gasto</th>
                        <th className="py-2">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-2 font-medium">{m.campaign?.name || '—'}</td>
                          <td className="py-2">{m.metrics?.clicks || '0'}</td>
                          <td className="py-2">{m.metrics?.impressions || '0'}</td>
                          <td className="py-2">{((Number(m.metrics?.ctr) || 0) * 100).toFixed(2)}%</td>
                          <td className="py-2">${((Number(m.metrics?.averageCpc) || 0) / 1000000).toFixed(2)}</td>
                          <td className="py-2">${((Number(m.metrics?.costMicros) || 0) / 1000000).toFixed(2)}</td>
                          <td className="py-2">{m.metrics?.conversions || '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">IA Optimización de Campañas</CardTitle>
              <CardDescription>La IA analiza tus métricas y genera recomendaciones para optimizar rendimiento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={refreshOptimization} disabled={loadingOpt}>
                {loadingOpt ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Analizar y Optimizar
              </Button>
              {optimization && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{optimization.summary}</p>
                  {optimization.stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <Card className="p-3">
                        <p className="text-muted-foreground">Campañas</p>
                        <p className="text-lg font-bold">{optimization.stats.campaigns}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-muted-foreground">Clics</p>
                        <p className="text-lg font-bold">{optimization.stats.totalClicks}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-muted-foreground">CTR Prom.</p>
                        <p className="text-lg font-bold">{optimization.stats.avgCtr}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-muted-foreground">Gasto Total</p>
                        <p className="text-lg font-bold">${optimization.stats.totalCostUsd}</p>
                      </Card>
                    </div>
                  )}
                  {optimization.recommendations?.map((r, i) => (
                    <div key={i} className={`rounded-lg border p-3 text-sm ${
                      r.type === 'warning' ? 'bg-amber-50 border-amber-300' :
                      r.type === 'success' ? 'bg-emerald-50 border-emerald-300' :
                      'bg-blue-50 border-blue-300'
                    }`}>
                      <p className="font-medium">{r.title} {r.campaign !== 'General' && <span className="text-muted-foreground font-normal">({r.campaign})</span>}</p>
                      <p className="text-muted-foreground mt-1">{r.detail}</p>
                      <p className="mt-1">{r.suggestion}</p>
                    </div>
                  ))}
                </div>
              )}
              {!optimization && !loadingOpt && (
                <p className="text-sm text-muted-foreground">Haz clic en "Analizar y Optimizar" para obtener recomendaciones.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

