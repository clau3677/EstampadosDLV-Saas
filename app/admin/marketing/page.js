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
  Search, Target, TrendingUp, Zap,
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
          <TabsTrigger value="ads">Anuncios Meta</TabsTrigger>
          <TabsTrigger value="google">Google Ads</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="connections">Conexiones</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          <PostsTab isConnected={isConnected} aiConfigured={status?.aiConfigured} />
        </TabsContent>
        <TabsContent value="ads">
          <AdsTab isConnected={isConnected} hasAdAccount={!!account?.adAccountId} />
        </TabsContent>
        <TabsContent value="google">
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
function PostsTab({ isConnected, aiConfigured }) {
  const [posts, setPosts] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
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
      const res = await fetch(`/api/marketing/posts?status=${filter}`);
      if (res.ok) setPosts(await res.json());
    } catch (e) { console.warn(e); }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

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
      refresh();
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
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error publicando');
      toast.success('Publicado en Meta ✅');
      refresh();
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
      const res = await fetch(`/api/marketing/posts?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error eliminando');
      toast.success('Post eliminado');
      refresh();
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
            <label className="text-xs font-medium text-muted-foreground">Producto</label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un producto…" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
                    src={post.imageUrl}
                    alt={post.altText || post.productName}
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
            <div>
              <label className="text-xs font-medium text-muted-foreground">Producto</label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña: Google Ads
// ---------------------------------------------------------------------------
function GoogleAdsTab() {
  const [googleStatus, setGoogleStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/google/status');
      if (res.ok) setGoogleStatus(await res.json());
    } catch (e) { console.warn('google status', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const isConfigured = googleStatus?.googleAdsConfigured;
  const isConnected = googleStatus?.account?.status === 'connected';

  return (
    <div className="space-y-6">
      {/* Estado de configuración */}
      {!isConfigured && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>Configuración pendiente en el servidor:</strong>
              <ul className="list-disc ml-5 mt-1 space-y-0.5">
                <li><code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> (Google Cloud Console)</li>
                <li><code>GOOGLE_ADS_DEVELOPER_TOKEN</code> (Google Ads API)</li>
                <li><code>GOOGLE_ADS_CUSTOMER_ID</code> (ID de cliente de Google Ads)</li>
                <li><code>GOOGLE_ADS_REDIRECT_URI</code> = <code>https://estampadosdlv.com/api/marketing/google/oauth/callback</code></li>
              </ul>
              <p className="text-xs mt-2 text-amber-700">Cuando configures estas variables, todo se activará automáticamente.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pestañas internas de Google Ads */}
      <Tabs defaultValue="connect">
        <TabsList className="grid grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="connect">Conexión</TabsTrigger>
          <TabsTrigger value="create">Crear Campaña</TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="optimize">IA Optimización</TabsTrigger>
        </TabsList>

        <TabsContent value="connect">
          <GoogleConnectTab status={googleStatus} loading={loading} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="create">
          <GoogleCreateTab isConnected={isConnected} />
        </TabsContent>
        <TabsContent value="metrics">
          <GoogleMetricsTab isConnected={isConnected} />
        </TabsContent>
        <TabsContent value="optimize">
          <GoogleOptimizeTab isConnected={isConnected} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-pestaña: Conexión Google
// ---------------------------------------------------------------------------
function GoogleConnectTab({ status, loading, onChanged }) {
  const [connecting, setConnecting] = useState(false);
  const account = status?.account;
  const isConnected = account?.status === 'connected';

  const startOAuth = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/marketing/google/oauth/start');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error iniciando OAuth');
      window.location.href = data.url;
    } catch (e) {
      toast.error(e.message);
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('¿Desconectar Google Ads? Las campañas activas se pausarán.')) return;
    try {
      const res = await fetch('/api/marketing/google/accounts', { method: 'DELETE' });
      if (!res.ok) throw new Error('error desconectando');
      toast.success('Cuenta Google Ads desconectada');
      onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4 text-orange-600" /> Cuenta Google Ads
        </CardTitle>
        <CardDescription>Conecta tu cuenta de Google Ads para crear campañas de búsqueda con IA.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}

        {!loading && isConnected && (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-orange-600" />
                <span className="font-medium">Google Ads</span>
                <Badge className="bg-emerald-100 text-emerald-700">Conectado</Badge>
              </div>
              {account.connectedAt && (
                <p className="text-xs text-muted-foreground">Conectado: {fmtDate(account.connectedAt)}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {status?.campaignCount ?? 0} campaña(s) · {status?.activeCampaigns ?? 0} activa(s)
              </p>
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

        {!loading && !isConnected && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Al conectar, autorizarás a la app para crear y administrar campañas de Google Ads en tu cuenta.
            </p>
            <Button onClick={startOAuth} disabled={connecting} className="w-full bg-orange-600 hover:bg-orange-700">
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Conectar con Google Ads
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-pestaña: Crear Campaña con IA
// ---------------------------------------------------------------------------
function GoogleCreateTab({ isConnected }) {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('5000');
  const [days, setDays] = useState('7');
  const [creating, setCreating] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/google/campaigns');
      if (res.ok) setCampaigns(await res.json());
    } catch (e) { console.warn(e); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const create = async () => {
    if (!name) return toast.error('Ingresa un nombre para la campaña');
    setCreating(true);
    try {
      const res = await fetch('/api/marketing/google/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: productId || undefined,
          name,
          dailyBudgetClp: Number(budget),
          days: Number(days),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error creando campaña');
      toast.success('Campaña creada en PAUSA — la IA generó el copy automáticamente ✅');
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
      const res = await fetch('/api/marketing/google/campaigns/status', {
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
      <Card className="lg:col-span-1 h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-orange-500" /> Nueva campaña con IA
          </CardTitle>
          <CardDescription>
            La IA genera titulares y descripciones optimizados para tu producto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isConnected && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Conecta tu cuenta Google Ads primero en la pestaña Conexión.
            </p>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Producto (opcional — para copy de IA)</label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Sin producto (copy genérico)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin producto (copy genérico)</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nombre de la campaña</label>
            <Input placeholder="ej: DTF Textil — Agosto 2026" value={name} onChange={(e) => setName(e.target.value)} />
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
            Total estimado: {fmtCLP(Number(budget || 0) * Number(days || 0))} · La IA genera 10 titulares + 3 descripciones.
          </p>
          <Button className="w-full" onClick={create} disabled={creating || !isConnected}>
            {creating
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creando con IA…</>
              : <><Zap className="h-4 w-4 mr-2" /> Crear campaña (en pausa)</>}
          </Button>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-3">
        <h3 className="font-semibold text-sm">Campañas Google Ads ({campaigns.length})</h3>
        {campaigns.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Sin campañas de Google Ads aún. Crea la primera con IA.
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
                  {c.productName && (
                    <Badge variant="outline" className="text-[10px]">{c.productName}</Badge>
                  )}
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
// Sub-pestaña: Métricas Google Ads
// ---------------------------------------------------------------------------
function GoogleMetricsTab({ isConnected }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [daysBack, setDaysBack] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing/google/metrics?days=${daysBack}`);
      if (res.ok) setData(await res.json());
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [daysBack]);

  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);

  if (!isConnected) {
    return (
      <Card className="mt-4">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Conecta tu cuenta Google Ads para ver métricas.
        </CardContent>
      </Card>
    );
  }

  const m = data?.accountMetrics;
  const isError = m?.error;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Rendimiento Google Ads
          {data?.fetchedAt && <span className="text-[11px] text-muted-foreground font-normal">actualizado {fmtDate(data.fetchedAt)}</span>}
        </h3>
        <div className="flex items-center gap-2">
          <Select value={String(daysBack)} onValueChange={(v) => setDaysBack(Number(v))}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="14">Últimos 14 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Resumen de cuenta */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-[11px] text-muted-foreground uppercase">Clics</p>
            <p className="text-lg font-bold">{isError ? '—' : (m?.clicks ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-[11px] text-muted-foreground uppercase">Impresiones</p>
            <p className="text-lg font-bold">{isError ? '—' : (m?.impressions ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-[11px] text-muted-foreground uppercase">Gasto</p>
            <p className="text-lg font-bold">{isError ? '—' : fmtCLP(m?.costClp ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-[11px] text-muted-foreground uppercase">CTR</p>
            <p className="text-lg font-bold">{isError ? '—' : `${(m?.ctr ?? 0).toFixed(2)}%`}</p>
          </CardContent>
        </Card>
      </div>

      {/* Campañas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Campañas</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{m?.error}</p>
          ) : (!data?.campaignMetrics || data.campaignMetrics.length === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin datos de campañas todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3">Campaña</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Clics</th>
                    <th className="py-2 pr-3">Impr.</th>
                    <th className="py-2 pr-3">CTR</th>
                    <th className="py-2 pr-3">CPC</th>
                    <th className="py-2 pr-3">Gasto</th>
                    <th className="py-2">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaignMetrics.map((c, i) => (
                    <tr key={c.campaignId + '-' + i} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{c.campaignName}</td>
                      <td className="py-2 pr-3">
                        <Badge className={c.campaignStatus === 'ENABLED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}>
                          {c.campaignStatus === 'ENABLED' ? 'Activa' : 'Pausada'}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{c.clicks}</td>
                      <td className="py-2 pr-3">{c.impressions}</td>
                      <td className="py-2 pr-3">{c.ctr ? `${Number(c.ctr).toFixed(2)}%` : '—'}</td>
                      <td className="py-2 pr-3">{c.averageCpc ? `${c.averageCpc.toFixed(0)} CLP` : '—'}</td>
                      <td className="py-2 pr-3">{fmtCLP(c.costClp)}</td>
                      <td className="py-2">{c.conversions}</td>
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
// Sub-pestaña: IA Optimización
// ---------------------------------------------------------------------------
function GoogleOptimizeTab({ isConnected }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(null);

  const generateReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/google/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error generando reporte');
      setReport(data.report);
      toast.success('Reporte de optimización generado ✅');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const applyRecommendation = async (rec) => {
    const label = `${rec.action} para ${rec.target}`;
    if (!confirm(`¿Aplicar: ${label}?`)) return;
    setApplying(label);
    try {
      let body = {};
      if (rec.type === 'bid') {
        body = { type: 'bid', target: rec.target, value: rec.suggestedBidClp || rec.suggestedValue };
      } else if (rec.type === 'budget') {
        body = { type: 'budget', target: rec.target, value: rec.suggestedAmount || rec.suggestedValue };
      } else if (rec.type === 'status') {
        body = { type: 'status', target: rec.target, value: rec.newStatus || 'PAUSED' };
      }
      const res = await fetch('/api/marketing/google/optimize/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'error aplicando');
      toast.success('Recomendación aplicada ✅');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setApplying(null);
    }
  };

  if (!isConnected) {
    return (
      <Card className="mt-4">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-2 opacity-40" />
          Conecta tu cuenta Google Ads para que la IA analice tus campañas.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-3">
        <Button onClick={generateReport} disabled={loading}>
          {loading
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando con IA…</>
            : <><Zap className="h-4 w-4 mr-2" /> Generar reporte de optimización</>}
        </Button>
        <p className="text-xs text-muted-foreground">
          La IA analiza CTR, CPC, conversiones y keywords para generar recomendaciones accionables.
        </p>
      </div>

      {report && (
        <div className="space-y-4">
          {/* Resumen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" /> Resumen Ejecutivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{report.summary || 'No hay resumen disponible.'}</p>
            </CardContent>
          </Card>

          {/* Recomendaciones de presupuesto */}
          {report.budgetRecommendations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-blue-600" /> Presupuesto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.budgetRecommendations.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{r.target}</p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                      <p className="text-[11px] text-emerald-700">{r.impact}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        r.action === 'aumentar_presupuesto' ? 'bg-emerald-100 text-emerald-700' :
                        r.action === 'reducir_presupuesto' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-100 text-slate-600'
                      }>
                        {r.action === 'aumentar_presupuesto' ? 'Aumentar' :
                         r.action === 'reducir_presupuesto' ? 'Reducir' : 'Mantener'}
                      </Badge>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => applyRecommendation({ ...r, type: 'budget' })}
                        disabled={applying !== null || r.action === 'mantener_presupuesto'}
                      >
                        {applying === `${r.action} para ${r.target}`
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : 'Aplicar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recomendaciones de puja */}
          {report.bidRecommendations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-orange-600" /> Puja (CPC)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.bidRecommendations.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{r.target}</p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                      {r.suggestedBidClp && (
                        <p className="text-[11px] text-emerald-700">Puja sugerida: {fmtCLP(r.suggestedBidClp)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        r.action === 'aumentar_puja' ? 'bg-emerald-100 text-emerald-700' :
                        r.action === 'reducir_puja' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-100 text-slate-600'
                      }>
                        {r.action === 'aumentar_puja' ? 'Aumentar' :
                         r.action === 'reducir_puja' ? 'Reducir' : 'Mantener'}
                      </Badge>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => applyRecommendation({ ...r, type: 'bid' })}
                        disabled={applying !== null || r.action === 'mantener_puja'}
                      >
                        {applying === `${r.action} para ${r.target}`
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : 'Aplicar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Keywords */}
          {report.keywordRecommendations?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4 text-purple-600" /> Keywords
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.keywordRecommendations.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">"{r.keyword}"</p>
                      <p className="text-xs text-muted-foreground">{r.reason}</p>
                      {r.suggestedMatchType && (
                        <p className="text-[11px] text-muted-foreground">Tipo sugerido: {r.suggestedMatchType}</p>
                      )}
                    </div>
                    <Badge className={
                      r.action === 'mantener' ? 'bg-emerald-100 text-emerald-700' :
                      r.action === 'pausar' ? 'bg-rose-100 text-rose-700' :
                      'bg-blue-100 text-blue-700'
                    }>
                      {r.action === 'mantener' ? 'Mantener' :
                       r.action === 'pausar' ? 'Pausar' :
                       r.action === 'agregar' ? 'Agregar' : r.action}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Tips generales */}
          {report.generalTips?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Consejos generales</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc ml-5 space-y-1 text-sm">
                  {report.generalTips.map((tip, i) => <li key={i}>{tip}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
