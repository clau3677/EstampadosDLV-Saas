'use client';
// =============================================================================
// Prospección B2B — Panel admin (Quinta Región)
// -----------------------------------------------------------------------------
// Pestañas: Dashboard · Campañas · Prospectos · Mensajes · Bajas · Auditoría · Configuración
// Backend: /api/prospeccion/* (lib/api/prospeccion.js)
// Modo por defecto: SIMULACIÓN (los mensajes solo se registran, nunca se envían
// hasta que Sandra confirme proveedor de email real).
// =============================================================================
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  UserPlus, RefreshCw, Play, Pause, Search, Loader2, Plus,
  CheckCircle2, X, XCircle, AlertTriangle, ShieldAlert, FileText, MessageCircle,
  MapPin, Star, Mail, Phone, Globe, Instagram, Building2,
  BarChart3, ListFilter, MailPlus, ClipboardList, Zap, Gauge, Download,
} from 'lucide-react';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const STATE_META = {
  descartado: { label: 'Descartado', cls: 'bg-slate-100 text-slate-600' },
  candidato: { label: 'Candidato', cls: 'bg-blue-100 text-blue-700' },
  requiere_revision: { label: 'Requiere revisión', cls: 'bg-amber-100 text-amber-700' },
  aprobado_contacto: { label: 'Aprobado contacto', cls: 'bg-emerald-100 text-emerald-700' },
  contactado: { label: 'Contactado', cls: 'bg-sky-100 text-sky-700' },
  respondio: { label: 'Respondió', cls: 'bg-violet-100 text-violet-700' },
  reunion: { label: 'Reunión', cls: 'bg-fuchsia-100 text-fuchsia-700' },
  no_interesado: { label: 'No interesado', cls: 'bg-rose-100 text-rose-600' },
  rebote: { label: 'Rebote', cls: 'bg-red-100 text-red-600' },
  baja: { label: 'Baja', cls: 'bg-zinc-200 text-zinc-700' },
  bloqueado: { label: 'Bloqueado', cls: 'bg-neutral-300 text-neutral-700' },
};

const STATUS_META = {
  borrador: { label: 'Borrador', cls: 'bg-slate-100 text-slate-600' },
  activa: { label: 'Activa', cls: 'bg-emerald-100 text-emerald-700' },
  pausada: { label: 'Pausada', cls: 'bg-amber-100 text-amber-700' },
  completada: { label: 'Completada', cls: 'bg-violet-100 text-violet-700' },
  cancelada: { label: 'Cancelada', cls: 'bg-rose-100 text-rose-600' },
};

const CAT_LABELS = {
  restaurantes: 'Restaurantes', cafeterias: 'Cafeterías', bares: 'Bares',
  alojamiento_turismo: 'Alojamiento y turismo', salud_privada: 'Salud privada',
  educacion: 'Educación', gimnasios: 'Gimnasios', automotor: 'Automotor',
  retail: 'Retail', servicios_profesionales: 'Servicios profesionales',
  construccion: 'Construcción', otros: 'Otros',
};

function scoreBadge(score) {
  const s = score?.final ?? 0;
  const cls = s >= 70 ? 'bg-emerald-100 text-emerald-700' : s >= 45 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
  return <Badge className={cls}>{s}</Badge>;
}

async function api(path, opts = {}) {
  const res = await fetch(`/api/prospeccion${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function ProspeccionPage() {
  const [config, setConfig] = useState(null);
  const [leadStats, setLeadStats] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [messages, setMessages] = useState({ items: [], total: 0 });
  const [leads, setLeads] = useState({ items: [], total: 0, filters: {} });
  const [suppressions, setSuppressions] = useState({ items: [], total: 0 });
  const [audit, setAudit] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');

  const loadAll = useCallback(async () => {
    try {
      const [cfg, stats, cams, msgs] = await Promise.all([
        api('/config').catch(() => null),
        api('/leads/stats').catch(() => null),
        api('/campaigns').catch(() => ({ items: [] })),
        api('/messages?pageSize=10').catch(() => ({ items: [] })),
      ]);
      setConfig(cfg);
      setLeadStats(stats);
      setCampaigns(cams.items || cams);
      setMessages(msgs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadLeads = useCallback(async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    params.set('pageSize', '50');
    setLeads(await api(`/leads?${params.toString()}`));
  }, []);

  const loadSuppressions = useCallback(async () => {
    setSuppressions(await api('/suppressions?pageSize=100'));
  }, []);

  const loadAudit = useCallback(async () => {
    setAudit(await api('/audit?pageSize=100'));
  }, []);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-orange-500" /> Prospección B2B
            <Badge className="bg-orange-100 text-orange-700 ml-1">Quinta Región</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Encuentra negocios locales (restaurantes, cafeterías, gimnasios, talleres...) y prepáralos para contactarlos con mensajes personalizados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config?.simulationMode && (
            <Badge className="bg-emerald-100 text-emerald-700 gap-1">
              <ShieldAlert className="h-3 w-3" /> Modo simulación — nada se envía
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard">1 · Dashboard</TabsTrigger>
          <TabsTrigger value="prospectos">2 · Prospectos</TabsTrigger>
          <TabsTrigger value="mensajes">3 · Mensajes</TabsTrigger>
          <TabsTrigger value="campanas">4 · Campañas</TabsTrigger>
          <TabsTrigger value="bajas">5 · Bajas</TabsTrigger>
          <TabsTrigger value="auditoria">6 · Auditoría</TabsTrigger>
          <TabsTrigger value="config">7 · Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 pt-4">
          <DashboardCards leadStats={leadStats} config={config} campaigns={campaigns} messages={messages} onRefresh={loadAll} />
        </TabsContent>

        <TabsContent value="campanas" className="pt-4">
          <CampaignsTab campaigns={campaigns} onRefresh={loadAll} config={config} />
        </TabsContent>

        <TabsContent value="prospectos" className="pt-4">
          <LeadsTab leads={leads} config={config} onLoad={loadLeads} />
        </TabsContent>

        <TabsContent value="mensajes" className="pt-4">
          <MessagesTab messages={messages} config={config} />
        </TabsContent>

        <TabsContent value="bajas" className="pt-4">
          <SuppressionsTab suppressions={suppressions} onLoad={loadSuppressions} />
        </TabsContent>

        <TabsContent value="auditoria" className="pt-4">
          <AuditTab audit={audit} onLoad={loadAudit} />
        </TabsContent>

        <TabsContent value="config" className="pt-4">
          <ConfigTab config={config} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function DashboardCards({ leadStats, config, campaigns, messages, onRefresh }) {
  const totalLeads = leadStats ? Object.values(leadStats.byState || {}).reduce((a, b) => a + b, 0) : 0;
  const avgScore = leadStats?.score?.average ?? 0;
  const aprobados = leadStats?.byState?.aprobado_contacto || 0;
  const requeridos = leadStats?.byState?.requiere_revision || 0;
  const msgsSent = messages?.total ?? 0;
  const simBadge = config?.simulationMode ? <Badge className="bg-emerald-100 text-emerald-700 ml-2">Simulación</Badge> : <Badge className="bg-rose-100 text-rose-700 ml-2">Envío real</Badge>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Prospectos totales</CardTitle></CardHeader>
        <CardContent className="text-3xl font-bold">{totalLeads}</CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-1"><Gauge className="h-4 w-4" /> Score promedio</CardTitle></CardHeader>
        <CardContent className="text-3xl font-bold">{avgScore}</CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Aprobados para contacto</CardTitle></CardHeader>
        <CardContent className="text-3xl font-bold text-emerald-600">{aprobados}</CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pendientes de revisión</CardTitle></CardHeader>
        <CardContent className="text-3xl font-bold text-amber-600">{requeridos}</CardContent>
      </Card>
      <Card className="col-span-2 md:col-span-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center">
            <MailPlus className="h-4 w-4 mr-1" /> Mensajes {simBadge}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="text-2xl font-bold">{msgsSent}</div>
          <div className="text-xs text-muted-foreground">Campañas: {campaigns?.length || 0}</div>
        </CardContent>
      </Card>
      {leadStats?.byCategory && Object.keys(leadStats.byCategory).length > 0 && (
        <Card className="col-span-2 md:col-span-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Prospectos por rubro</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(leadStats.byCategory).map(([cat, n]) => (
              <Badge key={cat} variant="outline" className="gap-1">
                <Building2 className="h-3 w-3" /> {CAT_LABELS[cat] || cat}: {n}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------------
function CampaignsTab({ campaigns, onRefresh, config }) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);

  const createCampaign = async (data) => {
    setCreating(true);
    try {
      const c = await api('/campaigns', { method: 'POST', body: JSON.stringify(data) });
      toast.success(`Campaña "${c.name}" creada en borrador`);
      setShowCreate(false);
      await onRefresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleCampaign = async (id, action) => {
    try {
      await api(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
      toast.success(action === 'pause' ? 'Campaña pausada' : 'Campaña reanudada');
      await onRefresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Campañas de prospección</h2>
          <p className="text-sm text-muted-foreground">Una campaña define qué negocios descubrir (rubros, comunas) y cómo contactarlos.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nueva campaña
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Aún no hay campañas. Crea la primera para empezar a descubrir negocios.
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {campaigns.map(c => {
            const st = STATUS_META[c.status] || STATUS_META.borrador;
            return (
              <Card key={c.id} className="space-y-3 cursor-pointer hover:ring-1 hover:ring-orange-300 transition-all" onClick={() => setDetail(c)}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    {c.name} <Badge className={st.cls}>{st.label}</Badge>
                  </CardTitle>
                  <CardDescription className="flex flex-wrap gap-2 pt-1">
                    {(c.channels || []).map(ch => (
                      <Badge key={ch} variant="outline" className="gap-1">
                        {ch === 'whatsapp' ? <MessageCircle className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                        {ch === 'whatsapp' ? 'WhatsApp' : ch === 'email' ? 'Email' : ch}
                      </Badge>
                    ))}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(c.categories || []).map(cat => <Badge key={cat} variant="secondary">{CAT_LABELS[cat] || cat}</Badge>)}
                    {(c.communes || []).map(cm => <Badge key={cm} variant="secondary" className="gap-1"><MapPin className="h-2.5 w-2.5" />{cm}</Badge>)}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Canales: {c.channels ? c.channels.map(ch => ch === 'email' ? 'Email' : 'WhatsApp').join(' + ') : 'Email'}</span>
                    <span>{c.frequency === 'semanal' ? 'Semanal' : c.frequency === 'solo_vez' ? 'Una vez' : 'Diaria'}</span>
                    <span>Email máx/día: {c.maxPerDayEmail ?? 25}</span>
                    <span>WhatsApp máx/día: {c.maxPerDayWhatsapp ?? 50}</span>
                    <span>Ventana: {c.windowStart ?? 10}:00–{c.windowEnd ?? 19}:00h</span>
                    <span>Máx contactos: {c.maxContacts ?? '—'}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.status === 'borrador' ? (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); toggleCampaign(c.id, 'activate'); }}>
                        <Play className="h-3.5 w-3.5 mr-1" /> Activar
                      </Button>
                    ) : c.status === 'activa' ? (
                      <>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); toggleCampaign(c.id, 'pause'); }}>
                          <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
                        </Button>
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); toggleCampaign(c.id, 'complete'); }}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Completar
                        </Button>
                        <Button size="sm" variant="outline" className="text-rose-600 hover:text-rose-700" onClick={(e) => { e.stopPropagation(); toggleCampaign(c.id, 'cancel'); }}>
                          <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                        </Button>
                      </>
                    ) : c.status === 'pausada' ? (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); toggleCampaign(c.id, 'activate'); }}>
                        <Play className="h-3.5 w-3.5 mr-1" /> Reanudar
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateCampaignDialog open={showCreate} onClose={() => setShowCreate(false)} onCreate={createCampaign} loading={creating} />
      <CampaignDetailDialog campaign={detail} config={config} onClose={() => { setDetail(null); onRefresh(); }} />
    </div>
  );
}

/** Detalle de campaña: prospectos asignados y flujo de aprobación de mensajes. */
function CampaignDetailDialog({ campaign, config, onClose }) {
  const [leads, setLeads] = useState([]);
  const [preview, setPreview] = useState(null);
  const [approving, setApproving] = useState(false);
  const waEnabled = (campaign?.channels || []).includes('whatsapp') || Boolean(config?.whatsapp?.connected);

  useEffect(() => {
    if (!campaign?.id) return;
    api(`/campaigns/${campaign.id}/leads`).then(rows => setLeads(rows || [])).catch(() => setLeads([]));
  }, [campaign?.id]);

  const previewMsg = async (leadId, channel = 'email') => {
    try {
      setPreview(await api(`/messages?preview=1&channel=${channel}&leadId=${encodeURIComponent(leadId)}`));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const approveAll = async () => {
    const ids = leads.filter(l => l.campaignLeadState === 'pendiente_revision').map(l => l.campaignLeadId);
    if (ids.length === 0) return toast.info('No hay prospectos pendientes de aprobación en esta campaña');
    setApproving(true);
    try {
      const r = await api('/messages/approve', { method: 'POST', body: JSON.stringify({ campaignId: campaign.id, campaignLeadIds: ids }) });
      toast.success(`${r.created || 0} mensajes aprobados${r.skipped?.length ? ` (${r.skipped.length} omitidos)` : ''}`);
      // Recargar
      const rows = await api(`/campaigns/${campaign.id}/leads`).catch(() => null);
      setLeads(rows?.items || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setApproving(false);
    }
  };

  if (!campaign) return null;

  return (
    <Dialog open={!!campaign} onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{campaign.name} <Badge className={STATUS_META[campaign.status]?.cls}>{STATUS_META[campaign.status]?.label}</Badge></DialogTitle>
          <DialogDescription>{campaign.description || 'Sin descripción'}</DialogDescription>
        </DialogHeader>
        {campaign.stats && (
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(campaign.stats.leadsByState).map(([s, n]) => <Badge key={s} variant="outline">{STATE_META[s]?.label || s}: {n}</Badge>)}
            {Object.entries(campaign.stats.messagesByStatus).map(([s, n]) => <Badge key={s} className="bg-sky-100 text-sky-700">msgs {s}: {n}</Badge>)}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <div className="text-sm font-medium">Prospectos en campaña: {leads.length}</div>
          <Button size="sm" onClick={approveAll} disabled={approving}>
            {approving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Aprobar pendientes
          </Button>
        </div>
        <div className="space-y-2">
          {leads.map(l => (
            <Card key={l.campaignLeadId}>
              <CardContent className="py-3 flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium truncate">{l.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {CAT_LABELS[l.category] || l.category} · {l.commune} · estado {STATE_META[l.campaignLeadState]?.label || l.campaignLeadState}
                    {scoreBadge(l.score)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => previewMsg(l.id, 'email')}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Preview email
                  </Button>
                  {waEnabled && (
                    <Button size="sm" variant="outline" onClick={() => previewMsg(l.id, 'whatsapp')}>
                      <MessageCircle className="h-3.5 w-3.5 mr-1" /> Preview WSP
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {leads.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aún no hay prospectos. Ejecuta un descubrimiento desde la pestaña Prospectos.</p>}
        </div>
        {preview && (
          <Card className="bg-slate-50">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Vista previa del mensaje</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {preview.subject && <div className="font-semibold">Asunto: {preview.subject}</div>}
              <p className="whitespace-pre-wrap text-muted-foreground">{preview.body || 'Sin cuerpo'}</p>
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateCampaignDialog({ open, onClose, onCreate, loading }) {
  const [form, setForm] = useState({
    name: '', description: '',
    categories: [], communes: [], minScore: 0, maxContacts: 50,
    channels: ['email'], frequency: 'diaria',
    maxPerDayEmail: 25, maxPerDayWhatsapp: 50,
    windowStart: 10, windowEnd: 19,
  });

  const toggleCat = (cat) => setForm(f => ({
    ...f,
    categories: f.categories.includes(cat) ? f.categories.filter(c => c !== cat) : [...f.categories, cat],
  }));

  const toggleCom = (com) => setForm(f => ({
    ...f,
    communes: f.communes.includes(com) ? f.communes.filter(c => c !== com) : [...f.communes, com],
  }));

  const setCh = (ch, on) => setForm(f => ({
    ...f,
    channels: on ? [...f.channels, ch] : f.channels.filter(c => c !== ch),
  }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Nombre requerido');
    if (form.channels.length === 0) return toast.error('Elige al menos un canal');
    await onCreate({
      name: form.name,
      description: form.description,
      categories: form.categories,
      communes: form.communes,
      minScore: Number(form.minScore) || 0,
      maxContacts: Number(form.maxContacts) || 50,
      channels: form.channels,
      frequency: form.frequency,
      maxPerDayEmail: Number(form.maxPerDayEmail) || 25,
      maxPerDayWhatsapp: Number(form.maxPerDayWhatsapp) || 50,
      windowStart: Number(form.windowStart) || 10,
      windowEnd: Number(form.windowEnd) || 19,
    });
  };

  const ALL_CATS = Object.keys(CAT_LABELS);
  const ALL_COMS = ['Valparaíso', 'Viña del Mar', 'Concón', 'Quilpué', 'Villa Alemana', 'Limache', 'Quillota', 'La Calera', 'San Antonio', 'Cartagena', 'El Quisco', 'Algarrobo', 'Casablanca', 'San Felipe', 'Los Andes', 'Putaendo', 'Cabildo', 'La Ligua', 'Zapallar'];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva campaña de prospección</DialogTitle>
          <DialogDescription>Elige el canal (email, WhatsApp o ambos), la cadencia diaria, la frecuencia, el límite de contactos y a quién va dirigida (rubros, comunas, score mínimo).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Restaurantes Viña — Agosto" />
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Objetivo de la campaña..." />
          </div>
          <div className="space-y-2">
            <Label>Rubros objetivo</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CATS.map(cat => (
                <Badge key={cat} variant={form.categories.includes(cat) ? 'default' : 'outline'}
                  className="cursor-pointer py-1"
                  onClick={() => toggleCat(cat)}>
                  {CAT_LABELS[cat]}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Comunas</Label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COMS.map(com => (
                <Badge key={com} variant={form.communes.includes(com) ? 'default' : 'outline'}
                  className="cursor-pointer py-1 gap-1"
                  onClick={() => toggleCom(com)}>
                  {com}
                </Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Canales de envío (elige uno o ambos)</Label>
              <div className="flex flex-wrap gap-1.5">
                {['email', 'whatsapp'].map(ch => (
                  <Badge key={ch} variant={form.channels.includes(ch) ? 'default' : 'outline'}
                    className="cursor-pointer py-1.5 gap-1"
                    onClick={() => setCh(ch, !form.channels.includes(ch))}>
                    {ch === 'whatsapp' ? <MessageCircle className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                    {ch === 'email' ? 'Email (Gmail)' : 'WhatsApp (Baileys)'}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Frecuencia</Label>
              <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Diaria (todos los días, dentro de la ventana horaria)</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="solo_vez">Una sola vez</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Score mínimo para contactar</Label>
              <Input type="number" min={0} max={100} value={form.minScore} onChange={e => setForm(f => ({ ...f, minScore: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Máx contactos (0 = sin límite)</Label>
              <Input type="number" min={0} max={10000} value={form.maxContacts} onChange={e => setForm(f => ({ ...f, maxContacts: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label>Email máx por día</Label>
              <Input type="number" min={1} max={100} value={form.maxPerDayEmail} onChange={e => setForm(f => ({ ...f, maxPerDayEmail: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp máx por día</Label>
              <Input type="number" min={1} max={200} value={form.maxPerDayWhatsapp} onChange={e => setForm(f => ({ ...f, maxPerDayWhatsapp: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Hora inicio</Label>
              <Input type="number" min={0} max={23} value={form.windowStart} onChange={e => setForm(f => ({ ...f, windowStart: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Hora fin</Label>
              <Input type="number" min={0} max={23} value={form.windowEnd} onChange={e => setForm(f => ({ ...f, windowEnd: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear campaña'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Prospectos
// ---------------------------------------------------------------------------
function LeadsTab({ leads, config, onLoad }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Todas');
  const [com, setCom] = useState('Todas');
  const [dCat, setDCat] = useState('Todas');
  const [dCom, setDCom] = useState('Todas');
  const [state, setState] = useState('Todos');
  const [sortBy, setSortBy] = useState('score');
  const [contact, setContact] = useState('Todos');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => { onLoad({}); }, [onLoad]);
  useEffect(() => { api('/campaigns').then(c => setCampaigns(c.items || [])).catch(() => {}); }, []);

  const phoneTypeQs = () => {
    if (contact === 'celular') return 'celular';
    if (contact === 'fijo') return 'fijo';
    if (contact === 'correo') return 'correo';
    return undefined;
  };

  const applyFilters = () => {
    setPage(1);
    onLoad({ q: q || undefined, category: cat === 'Todas' ? undefined : cat, commune: com === 'Todas' ? undefined : com, state: state === 'Todos' ? undefined : state, sortBy: sortBy || undefined, phoneType: phoneTypeQs(), page: '1' });
  };

  const goPage = (p) => {
    setPage(p);
    onLoad({ q: q || undefined, category: cat === 'Todas' ? undefined : cat, commune: com === 'Todas' ? undefined : com, state: state === 'Todos' ? undefined : state, sortBy: sortBy || undefined, phoneType: phoneTypeQs(), page: String(p) });
  };

  const approveAll = async () => {
    const total = leads?.total || 0;
    const ok = window.confirm(`¿Aprobar TODOS los prospectos (${total}) del filtro actual para que queden listos para campañas?`);
    if (!ok) return;
    setApproving(true);
    try {
      const r = await api('/leads/approve-all', {
        method: 'POST',
        body: JSON.stringify({
          category: cat === 'Todas' ? undefined : cat,
          commune: com === 'Todas' ? undefined : com,
          phoneType: phoneTypeQs(),
        }),
      });
      toast.success(`Aprobados: ${r.approved} prospectos listos para contacto (${r.skipped || 0} omitidos)`);
      onLoad({});
    } catch (e) {
      toast.error(e.message);
    } finally {
      setApproving(false);
    }
  };

  const exportCsv = () => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (cat !== 'Todas') qs.set('category', cat);
    if (com !== 'Todas') qs.set('commune', com);
    if (state !== 'Todos') qs.set('state', state);
    if (sortBy) qs.set('sortBy', sortBy);
    const path = `/api/prospeccion/leads/csv?${qs.toString()}`;
    // Abrir la descarga directamente (la sesión admin via cookies se envía automáticamente)
    window.open(path, '_self');
    toast.success('Descargando prospectos en CSV');
  };

  // Descubrimiento directo: sin campaña, solo por rubro y comuna
  const runDirectDiscovery = async () => {
    if (dCat === 'Todas' && dCom === 'Todas') return toast.error('Elige al menos un rubro o una comuna');
    setRunning(true);
    try {
      const r = await api('/discovery-direct', {
        method: 'POST',
        body: JSON.stringify({
          categories: dCat !== 'Todas' ? [dCat] : undefined,
          communes: dCom !== 'Todas' ? [dCom] : undefined,
          limit: 500,
        }),
      });
      toast.success(`Descubrimiento: ${r.saved} prospectos guardados (${r.skipped?.duplicate || 0} duplicados, ${r.skipped?.suppressed || 0} suprimidos)`);
      onLoad({});
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  const changeState = async (leadId, newState) => {
    try {
      await api(`/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ state: newState }) });
      toast.success('Estado actualizado');
      onLoad({});
      setDetail(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-orange-500" /> Descubrimiento de negocios</CardTitle>
          <CardDescription>Elige un tipo de negocio y una comuna para encontrar prospectos. Guárdalos, revísalos y después crea la campaña de correos con los que apruebes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Select value={dCat} onValueChange={setDCat}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Tipo de negocio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todos los rubros</SelectItem>
              {Object.entries(CAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dCom} onValueChange={setDCom}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Comuna" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas las comunas</SelectItem>
              {['Valparaíso', 'Viña del Mar', 'Concón', 'Quilpué', 'Villa Alemana', 'Limache', 'Quillota', 'San Antonio', 'San Felipe', 'Los Andes'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={runDirectDiscovery} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
            Descubrir negocios
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Buscar por nombre..." value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Rubro" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todas">Todos los rubros</SelectItem>
            {Object.entries(CAT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={com} onValueChange={setCom}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Comuna" /></SelectTrigger>
          <SelectContent>
            {['Todas', 'Valparaíso', 'Viña del Mar', 'Concón', 'Quilpué', 'Villa Alemana', 'Limache', 'Quillota', 'San Antonio', 'San Felipe', 'Los Andes'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todos los estados</SelectItem>
            {Object.entries(STATE_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={contact} onValueChange={setContact}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Contacto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Todos">Todo contacto</SelectItem>
            <SelectItem value="celular">Solo celular</SelectItem>
            <SelectItem value="fijo">Solo fijo</SelectItem>
            <SelectItem value="correo">Solo con correo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Mayor puntaje</SelectItem>
            <SelectItem value="nombre">Nombre (A-Z)</SelectItem>
            <SelectItem value="comuna">Comuna (A-Z)</SelectItem>
            <SelectItem value="reciente">Más recientes</SelectItem>
            <SelectItem value="antiguo">Más antiguos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={applyFilters}><ListFilter className="h-4 w-4 mr-1" /> Filtrar</Button>
        <Button variant="outline" className="bg-green-50 text-green-700 hover:bg-green-100" onClick={approveAll} disabled={approving}>
          {approving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          Aprobar todos
        </Button>
        <Button variant="outline" className="bg-green-50 text-green-700 hover:bg-green-100" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-1" /> Exportar CSV
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm text-muted-foreground">
        <div>{leads.total} prospectos · Página {page} de {Math.max(1, Math.ceil(leads.total / 50))}</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => goPage(page - 1)}>← Anterior</Button>
          <Button size="sm" variant="outline" disabled={page >= Math.ceil(leads.total / 50)} onClick={() => goPage(page + 1)}>Siguiente →</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {(leads.items || []).map(lead => (
          <Card key={lead.id} className="cursor-pointer hover:ring-1 hover:ring-orange-300 transition-all" onClick={() => setDetail(lead)}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{lead.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {lead.commune || '—'}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">{scoreBadge(lead.score)}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-xs">{CAT_LABELS[lead.category] || lead.category || '—'}</Badge>
                <Badge className={`${STATE_META[lead.state]?.cls || 'bg-slate-100'} text-xs`}>{STATE_META[lead.state]?.label || lead.state}</Badge>
                {lead.email && <Badge variant="outline" className="text-xs gap-1"><Mail className="h-2.5 w-2.5" /> Sí</Badge>}
                {lead.phone && <Badge variant="outline" className="text-xs gap-1"><Phone className="h-2.5 w-2.5" /> Sí</Badge>}
                {lead.website && <Badge variant="outline" className="text-xs gap-1"><Globe className="h-2.5 w-2.5" /> Sí</Badge>}
              </div>
              <div className="text-[11px] text-muted-foreground">Fuente: {lead.source || '—'} · {fmtDate(lead.createdAt)}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {(!leads.items || leads.items.length === 0) && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Sin prospectos. Ejecuta un descubrimiento o ingresa prospectos manualmente.</CardContent></Card>
      )}

      <LeadDetailDialog lead={detail} onClose={() => setDetail(null)} onChangeState={changeState} />
    </div>
  );
}

function LeadDetailDialog({ lead, onClose, onChangeState }) {
  if (!lead) return null;
  const nextStates = {
    requiere_revision: ['candidato', 'aprobado_contacto', 'descartado'],
    candidato: ['aprobado_contacto', 'descartado'],
    aprobado_contacto: ['contactado', 'no_interesado'],
    contactado: ['respondio', 'reunion', 'no_interesado'],
    respondio: ['reunion', 'no_interesado'],
    reunion: ['no_interesado'],
    no_interesado: ['requiere_revision'],
    descartado: ['requiere_revision', 'candidato'],
  };
  const allowed = nextStates[lead.state] || [];

  return (
    <Dialog open={!!lead} onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">{lead.name} {scoreBadge(lead.score)}</DialogTitle>
          <DialogDescription className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {lead.commune || '—'}</Badge>
            <Badge variant="outline">{CAT_LABELS[lead.category] || lead.category || '—'}</Badge>
            <Badge className={STATE_META[lead.state]?.cls}>{STATE_META[lead.state]?.label || lead.state}</Badge>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {lead.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {lead.email}</div>}
          {lead.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {lead.phone}</div>}
          {lead.website && <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /> {lead.website}</div>}
          {lead.instagram && <div className="flex items-center gap-2"><Instagram className="h-4 w-4 text-muted-foreground" /> {lead.instagram}</div>}
          {lead.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {lead.address}</div>}
          {lead.rating != null && <div className="flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> {lead.rating} ({lead.reviewCount || 0} reseñas)</div>}
          {lead.notes && <div className="text-muted-foreground border-t pt-2">{lead.notes}</div>}
          {lead.score?.factors && (
            <div className="border-t pt-2">
              <div className="font-medium mb-1">Factores de score:</div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {lead.score.factors.filter(f => f.value).map(f => (
                  <li key={f.key}>+{f.points} · {f.evidence || f.key}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {allowed.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <Label>Cambiar estado</Label>
            <div className="flex flex-wrap gap-2">
              {allowed.map(s => (
                <Button key={s} size="sm" variant="outline" onClick={() => onChangeState(lead.id, s)}>
                  {STATE_META[s]?.label || s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------
function MessagesTab({ messages, config }) {
  const [runningJobs, setRunningJobs] = useState(false);

  const runJobQueue = async () => {
    setRunningJobs(true);
    try {
      const r = await api('/jobs/run', { method: 'POST' });
      toast.success(`Cola procesada: ${r.sent} enviados, ${r.errors} errores${r.skipped?.length ? ', ' + r.skipped.map(s => `${s.count} ${s.reason}`).join(', ') : ''}`);
      await window.dispatchEvent(new Event('prospeccion-refresh'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRunningJobs(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MailPlus className="h-4 w-4 text-orange-500" /> Mensajes
            {config?.simulationMode && <Badge className="bg-emerald-100 text-emerald-700">Modo simulación</Badge>}
          </CardTitle>
          <CardDescription>
            {config?.simulationMode
              ? 'Los mensajes aprobados se registran como "simulados" y NUNCA se envían. Esto protege tu reputación hasta confirmar el proveedor de email.'
              : `Los mensajes aprobados se ponen en cola de envío real. Correo: máximo ${config?.limits?.dailyMax || 100}/día, entre ${config?.limits?.startHour || 10}:00 y ${config?.limits?.endHour || 19}:00 (hora Chile). WhatsApp: envío automático cuando la sesión está conectada.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Button variant="outline" size="sm" onClick={runJobQueue} disabled={runningJobs}>
            {runningJobs ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {config?.simulationMode ? 'Procesar cola (solo registrará en BD)' : 'Procesar cola de envío real'}
          </Button>
        </CardContent>
      </Card>
      <div className="text-sm text-muted-foreground">{messages.total} mensajes registrados</div>
      <div className="space-y-2">
        {(messages.items || []).map(m => (
          <Card key={m.id}>
            <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{m.subject || 'WhatsApp / Guión'}</div>
                <div className="text-xs text-muted-foreground">
                  {m.recipient || '—'} · {m.channel === 'whatsapp' ? 'WhatsApp' : m.channel} · {fmtDate(m.createdAt)}
                </div>
              </div>
              <Badge className={m.status === 'enviado' ? 'bg-sky-100 text-sky-700' : m.status === 'fallido' ? 'bg-rose-100 text-rose-700' : m.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                {m.status === 'aprobado' ? (m.channel === 'whatsapp' ? 'Aprobado (WhatsApp)' : 'Aprobado') : m.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
        {(!messages.items || messages.items.length === 0) && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Aún no hay mensajes. Aprueba prospectos desde una campaña para generarlos.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bajas / Supresiones
// ---------------------------------------------------------------------------
function SuppressionsTab({ suppressions, onLoad }) {
  const [kind, setKind] = useState('email');
  const [value, setValue] = useState('');
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!value.trim()) return toast.error('Valor requerido');
    setAdding(true);
    try {
      await api('/suppressions', { method: 'POST', body: JSON.stringify({ type: kind, value: value.trim(), reason: 'Agregada desde el panel' }) });
      toast.success('Agregada a la lista de supresión');
      setValue('');
      await onLoad();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id) => {
    try {
      await api(`/suppressions/${id}`, { method: 'DELETE' });
      toast.success('Retirada de la lista');
      await onLoad();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-rose-500" /> Lista de supresión (bajas)</CardTitle>
          <CardDescription>Ningún mensaje se enviará jamás a contactos de esta lista, aunque estén en una campaña.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="domain">Dominio</SelectItem>
              <SelectItem value="phone">Teléfono</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="valor (ej: negocio@correo.cl)" value={value} onChange={e => setValue(e.target.value)} className="flex-1" onKeyDown={e => e.key === 'Enter' && add()} />
          <Button onClick={add} disabled={adding}>{adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {(suppressions.items || []).map(s => (
          <Card key={s.id}>
            <CardContent className="py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <Badge variant="outline">{s.kind}</Badge>
                <span className="truncate">{s.valueLower}</span>
                {s.reason && <span className="text-xs text-muted-foreground truncate">· {s.reason}</span>}
              </div>
              <Button size="sm" variant="ghost" className="text-rose-600 shrink-0" onClick={() => remove(s.id)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {(!suppressions.items || suppressions.items.length === 0) && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">La lista está vacía.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------
function AuditTab({ audit, onLoad }) {
  useEffect(() => { onLoad(); }, [onLoad]);
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground mb-2">{audit.total} eventos registrados (solo lectura, inmutables)</div>
      {(audit.items || []).map(e => (
        <Card key={e.id}>
          <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
            <Badge variant="outline" className="shrink-0">{e.action}</Badge>
            <span className="text-xs text-muted-foreground shrink-0">{fmtDate(e.createdAt)}</span>
            <span className="truncate">{e.actorName ? `${e.actorName} ` : ''}{e.details ? JSON.stringify(e.details).slice(0, 120) : ''}</span>
          </CardContent>
        </Card>
      ))}
      {(!audit.items || audit.items.length === 0) && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Sin eventos aún.</CardContent></Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
function ConfigTab({ config }) {
  const [testEmail, setTestEmail] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testingWa, setTestingWa] = useState(false);

  const sendRealTest = async () => {
    if (!testEmail.includes('@')) return toast.error('Ingresa un email válido');
    setTesting(true);
    try {
      const r = await api('/messages/test', { method: 'POST', body: JSON.stringify({ toEmail: testEmail }) });
      if (r.status === 'simulado' || config?.simulationMode) {
        toast.info('Correo de prueba guardado (modo simulación: aún no hay proveedor de email configurado)');
      } else {
        toast.success(`Correo de prueba ${r.delivery?.sent ? 'enviado en real a ' + testEmail : 'encolado'}`);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  const sendWaTest = async () => {
    const digits = testPhone.replace(/\D/g, '');
    if (digits.length < 11) return toast.error('Ingresa un teléfono válido, ej: +56 9 1234 5678');
    setTestingWa(true);
    try {
      const r = await api('/messages/test', { method: 'POST', body: JSON.stringify({ toPhone: '+' + digits }) });
      toast.success(r?.delivery?.sent ? 'Mensaje de prueba enviado por WhatsApp' : 'Mensaje encolado');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTestingWa(false);
    }
  };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-emerald-600" /> Modo de envío</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {config?.simulationMode ? (
            <div className="flex items-center gap-2 text-emerald-700 font-medium"><CheckCircle2 className="h-4 w-4" /> SIMULACIÓN activa — nada se envía</div>
          ) : (
            <div className="flex items-center gap-2 text-rose-600 font-medium"><AlertTriangle className="h-4 w-4" /> Envío real activo</div>
          )}
          <div className="text-xs space-y-1">
            {config?.providerConfigured ? (
              <Badge className="bg-emerald-100 text-emerald-700">Proveedor de email configurado (SMTP Gmail)</Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700">Sin proveedor de email — falta SMTP_APP_PASSWORD o RESEND_API_KEY</Badge>
            )}
            <p className="text-muted-foreground text-xs">Remitente: {config?.from}</p>
          </div>
          <div className="border-t pt-3">
            <Label className="text-xs">Enviar correo de prueba (se envía en real si el proveedor está configurado)</Label>
            <div className="flex gap-2 mt-1">
              <Input placeholder="tu-correo@ejemplo.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} className="max-w-sm" />
              <Button variant="outline" size="sm" onClick={sendRealTest} disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4 mr-1" />}
                {testing ? 'Enviando...' : 'Enviar prueba'}
              </Button>
            </div>
            {config?.limits && (
              <p className="text-xs text-muted-foreground pt-2">Límite de envío: {config.limits.dailyMax} correos/día · ventana {config.limits.startHour}:00–{config.limits.endHour}:00 (hora Chile)</p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><MessageCircle className="h-4 w-4 text-emerald-600" /> Canal WhatsApp (Baileys)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {config?.whatsapp?.connected ? (
            <div className="flex items-center gap-2 text-emerald-700 font-medium"><CheckCircle2 className="h-4 w-4" /> Sesión WhatsApp conectada — envío automático activo</div>
          ) : (
            <div className="flex items-center gap-2 text-amber-700 font-medium"><AlertTriangle className="h-4 w-4" /> Sesión WhatsApp no conectada — ve a <a className="underline" href="/admin/whatsapp">WhatsApp</a> para vincular tu teléfono con QR</div>
          )}
          <p className="text-xs text-muted-foreground">Canal gratuito (Baileys), sin costos por mensaje. Al crear una campaña elige «WhatsApp automático» para enviar los mensajes de prospección por este canal.</p>
          <div className="border-t pt-3">
            <Label className="text-xs">Enviar mensaje de prueba por WhatsApp</Label>
            <div className="flex gap-2 mt-1">
              <Input placeholder="+56 9 1234 5678" value={testPhone} onChange={e => setTestPhone(e.target.value)} className="max-w-xs" />
              <Button variant="outline" size="sm" onClick={sendWaTest} disabled={testingWa || !config?.whatsapp?.connected}>
                {testingWa ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-1" />}
                {testingWa ? 'Enviando...' : 'Enviar prueba'}
              </Button>
            </div>
            {!config?.whatsapp?.connected && <p className="text-xs text-muted-foreground pt-1">Conecta la sesión primero para habilitar el envío.</p>}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4" /> Fuentes de descubrimiento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between"><span>Google Maps (Google Places API — datos reales)</span><Badge className="bg-emerald-100 text-emerald-700">Activo</Badge></div>
          <div className="flex items-center justify-between"><span>Manual (ingreso del operador)</span><Badge className="bg-blue-100 text-blue-700">Activo</Badge></div>
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-base">Compliance anti-spam (siempre activo)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Enlace de baja obligatorio en todos los mensajes</div>
          <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Remitente identificado: Sandra Vásquez · Estampados DLV · Quilpué</div>
          <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Lista de supresión verificada antes de cada envío</div>
          <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Circuit breaker: &gt;10% de rebotes en una hora pausa la campaña automáticamente</div>
          <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Ventanas horarias y límites diarios configurables por campaña</div>
          <div className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> Toda acción queda registrada en auditoría inmutable</div>
        </CardContent>
      </Card>
    </div>
  );
}
