'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Sparkles, ArrowLeft, RefreshCw, Save, Plus, Trash2, Pencil, MessageSquare,
  CheckCircle2, XCircle, Activity, Zap, HelpCircle, FileText,
} from 'lucide-react';

export default function AgentePage() {
  const [config, setConfig] = useState(null);
  const [llm, setLlm] = useState(null);
  const [ping, setPing] = useState(null);
  const [pinging, setPinging] = useState(false);
  const [kb, setKb] = useState([]);
  const [saving, setSaving] = useState(false);

  // Form state for editing config
  const [persona, setPersona] = useState({ name: '', role: '', tone: '', language: '' });
  const [businessInfo, setBusinessInfo] = useState({});
  const [rulesText, setRulesText] = useState('');

  const load = useCallback(async () => {
    const [cfgRes, kbRes] = await Promise.all([
      fetch('/api/agent/config').then((r) => r.json()),
      fetch('/api/agent/knowledge').then((r) => r.json()),
    ]);
    setConfig(cfgRes.config || {});
    setLlm(cfgRes.llm || null);
    setKb(Array.isArray(kbRes) ? kbRes : []);
    if (cfgRes.config) {
      setPersona(cfgRes.config.persona || {});
      setBusinessInfo(cfgRes.config.businessInfo || {});
      setRulesText((cfgRes.config.rules || []).join('\n'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doPing = async () => {
    setPinging(true);
    try {
      const r = await fetch('/api/agent/ping').then((x) => x.json());
      setPing(r);
      if (r.ok) toast.success(`LLM OK · ${r.latencyMs}ms`);
      else toast.error(`LLM error: ${r.error}`);
    } catch (e) {
      toast.error('Ping fail: ' + e.message);
    } finally {
      setPinging(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const rules = rulesText.split('\n').map(s => s.trim()).filter(Boolean);
      const res = await fetch('/api/agent/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, businessInfo, rules }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      toast.success('Configuración guardada ✅');
      load();
    } catch (e) {
      toast.error('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const doSeed = async () => {
    if (!confirm('¿Cargar KB inicial con datos de ejemplo? Solo funciona si no hay config previa.')) return;
    try {
      const r = await fetch('/api/agent/seed', { method: 'POST' }).then((x) => x.json());
      if (r.seeded) toast.success(`Cargado · ${r.kbCount} items de KB`);
      else toast.info('KB ya cargado previamente');
      load();
    } catch (e) {
      toast.error('Fail: ' + e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Agente Vicky</h1>
              <Badge className="bg-purple-500/10 text-purple-700 hover:bg-purple-500/10 border border-purple-500/30">
                MiniMax M2 · Ventas + Soporte
              </Badge>
              {llm?.configured
                ? <Badge className="bg-emerald-500/10 text-emerald-700 border border-emerald-500/30">LLM conectado</Badge>
                : <Badge variant="destructive">LLM sin configurar</Badge>}
            </div>
            <p className="text-slate-500 mt-1 text-sm">
              Configuración del agente vendedor IA, base de conocimiento y estado del modelo.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={doPing} disabled={pinging} className="gap-1.5">
              <Activity className={`h-3.5 w-3.5 ${pinging ? 'animate-pulse' : ''}`} /> Ping LLM
            </Button>
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/bandeja"><MessageSquare className="h-3.5 w-3.5" /> Bandeja</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Ping result */}
      {ping && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {ping.ok
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : <XCircle className="h-4 w-4 text-rose-600" />}
              <span>{ping.ok ? `OK · ${ping.model} · ${ping.latencyMs}ms` : `ERROR: ${ping.error}`}</span>
            </div>
            {ping.usage && (
              <div className="text-xs text-slate-500">
                {ping.usage.total_tokens} tokens
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="persona" className="w-full">
        <TabsList>
          <TabsTrigger value="persona"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Persona & Reglas</TabsTrigger>
          <TabsTrigger value="business"><FileText className="h-3.5 w-3.5 mr-1.5" />Negocio</TabsTrigger>
          <TabsTrigger value="kb"><HelpCircle className="h-3.5 w-3.5 mr-1.5" />Base de Conocimiento ({kb.length})</TabsTrigger>
          <TabsTrigger value="llm"><Zap className="h-3.5 w-3.5 mr-1.5" />LLM</TabsTrigger>
        </TabsList>

        {/* PERSONA & REGLAS */}
        <TabsContent value="persona" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Personalidad</CardTitle>
              <CardDescription>Define cómo se comporta el agente en cada conversación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nombre" value={persona.name} onChange={v => setPersona({ ...persona, name: v })} />
                <Field label="Rol" value={persona.role} onChange={v => setPersona({ ...persona, role: v })} />
                <Field label="Idioma" value={persona.language} onChange={v => setPersona({ ...persona, language: v })} />
              </div>
              <FieldArea label="Tono" value={persona.tone} onChange={v => setPersona({ ...persona, tone: v })} rows={3} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reglas del agente</CardTitle>
              <CardDescription>Una regla por línea. Se inyectan al system prompt.</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={8}
                value={rulesText}
                onChange={e => setRulesText(e.target.value)}
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </TabsContent>

        {/* BUSINESS INFO */}
        <TabsContent value="business" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Datos del negocio</CardTitle>
              <CardDescription>Vicky los usa para responder preguntas sobre horarios, dirección, envío, etc.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Nombre del negocio" value={businessInfo.name || ''} onChange={v => setBusinessInfo({ ...businessInfo, name: v })} />
                <Field label="Instagram" value={businessInfo.instagram || ''} onChange={v => setBusinessInfo({ ...businessInfo, instagram: v })} />
                <Field label="Dirección" value={businessInfo.address || ''} onChange={v => setBusinessInfo({ ...businessInfo, address: v })} />
                <Field label="Horario" value={businessInfo.hours || ''} onChange={v => setBusinessInfo({ ...businessInfo, hours: v })} />
                <Field label="Plazo entrega" value={businessInfo.turnaround || ''} onChange={v => setBusinessInfo({ ...businessInfo, turnaround: v })} />
                <Field label="Métodos de pago" value={businessInfo.payment || ''} onChange={v => setBusinessInfo({ ...businessInfo, payment: v })} />
              </div>
              <FieldArea label="Envío" value={businessInfo.shipping || ''} onChange={v => setBusinessInfo({ ...businessInfo, shipping: v })} rows={2} />
              <FieldArea label="Descripción / Servicios" value={businessInfo.description || ''} onChange={v => setBusinessInfo({ ...businessInfo, description: v })} rows={3} />
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving} className="gap-2 bg-purple-600 hover:bg-purple-700">
              <Save className="h-4 w-4" /> {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </TabsContent>

        {/* KB */}
        <TabsContent value="kb" className="space-y-4">
          <KnowledgeBase items={kb} onChange={load} onSeed={doSeed} />
        </TabsContent>

        {/* LLM */}
        <TabsContent value="llm" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Configuración del modelo</CardTitle>
              <CardDescription>Variables leídas desde .env — no editables desde el panel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ReadOnlyRow label="Proveedor" value="MiniMax (Yearly Max Plan)" />
              <ReadOnlyRow label="Modelo" value={llm?.model} />
              <ReadOnlyRow label="Base URL" value={llm?.baseUrl} />
              <ReadOnlyRow label="Tipo de key" value={llm?.keyType} />
              <ReadOnlyRow label="Estado" value={llm?.configured ? '✅ Configurado' : '❌ Falta MINIMAX_API_KEY'} />
              <ReadOnlyRow label="Temperature" value={config?.temperature ?? 0.7} />
              <ReadOnlyRow label="Max tokens/respuesta" value={config?.maxTokens ?? 1024} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Playground rápido</CardTitle>
              <CardDescription>Prueba un mensaje sin persistir en el historial admin.</CardDescription>
            </CardHeader>
            <CardContent>
              <Playground />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-slate-600 block mb-1">{label}</label>
      <Input value={value || ''} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function FieldArea({ label, value, onChange, rows = 3 }) {
  return (
    <div>
      <label className="text-xs text-slate-600 block mb-1">{label}</label>
      <Textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={rows} />
    </div>
  );
}

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-xs">{String(value ?? '—')}</span>
    </div>
  );
}

function KnowledgeBase({ items, onChange, onSeed }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [type, setType] = useState('qa');
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setShowForm(false); setEditingId(null); setType('qa');
    setQ(''); setA(''); setTitle(''); setBody(''); setTags('');
  };

  const startEdit = (item) => {
    setShowForm(true);
    setEditingId(item.id);
    setType(item.type);
    setQ(item.question || '');
    setA(item.answer || '');
    setTitle(item.title || '');
    setBody(item.body || '');
    setTags((item.tags || []).join(', '));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        type,
        question: type === 'qa' ? q : null,
        answer: type === 'qa' ? a : null,
        title: type === 'block' ? title : null,
        body: type === 'block' ? body : null,
        tags: tags.split(',').map(s => s.trim()).filter(Boolean),
      };
      const url = editingId ? `/api/agent/knowledge/${editingId}` : '/api/agent/knowledge';
      const method = editingId ? 'PATCH' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('save fail');
      toast.success(editingId ? 'Actualizado' : 'Creado');
      reset();
      onChange();
    } catch (e) {
      toast.error('Fail: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('¿Eliminar este item?')) return;
    await fetch(`/api/agent/knowledge/${id}`, { method: 'DELETE' });
    toast.success('Eliminado');
    onChange();
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {items.length} item{items.length === 1 ? '' : 's'} en la base de conocimiento.
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <Button onClick={onSeed} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Cargar KB inicial
            </Button>
          )}
          <Button onClick={() => setShowForm(true)} size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700">
            <Plus className="h-3.5 w-3.5" /> Nuevo item
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editingId ? 'Editar item' : 'Nuevo item de KB'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant={type === 'qa' ? 'default' : 'outline'} onClick={() => setType('qa')}>Q&A</Button>
              <Button size="sm" variant={type === 'block' ? 'default' : 'outline'} onClick={() => setType('block')}>Bloque libre</Button>
            </div>
            {type === 'qa' ? (
              <>
                <FieldArea label="Pregunta" value={q} onChange={setQ} rows={2} />
                <FieldArea label="Respuesta" value={a} onChange={setA} rows={4} />
              </>
            ) : (
              <>
                <Field label="Título" value={title} onChange={setTitle} />
                <FieldArea label="Contenido" value={body} onChange={setBody} rows={5} />
              </>
            )}
            <Field label="Tags (separados por coma)" value={tags} onChange={setTags} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="rounded-lg border p-3 bg-white flex items-start gap-3">
            <Badge variant={it.type === 'qa' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
              {it.type === 'qa' ? 'Q&A' : 'Bloque'}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{it.question || it.title}</div>
              <div className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">{it.answer || it.body}</div>
              {it.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {it.tags.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                </div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(it)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={() => remove(it.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="text-center text-sm text-slate-500 py-10">
            Sin items en la KB. Presiona &quot;Cargar KB inicial&quot; para poblarla con datos base del negocio.
          </div>
        )}
      </div>
    </>
  );
}

function Playground() {
  const [msg, setMsg] = useState('');
  const [convId, setConvId] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    const localUser = { role: 'user', content: msg };
    setMessages(m => [...m, localUser]);
    setMsg('');
    try {
      const r = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, conversationId: convId || undefined, source: 'web', contact: { name: 'Playground Admin' } }),
      }).then(x => x.json());
      if (r.conversationId) setConvId(r.conversationId);
      setMessages(m => [...m, { role: 'assistant', content: r.reply || '(sin respuesta)', tools: r.toolCalls, usage: r.usage }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: 'ERROR: ' + e.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="border rounded-lg p-3 min-h-[200px] max-h-[400px] overflow-y-auto space-y-2 bg-slate-50">
        {messages.length === 0 && <div className="text-xs text-slate-400 text-center py-10">Envía un mensaje para probar</div>}
        {messages.map((m, i) => (
          <div key={i} className={`text-sm whitespace-pre-wrap ${m.role === 'user' ? 'text-slate-900' : 'text-slate-700'}`}>
            <b>{m.role === 'user' ? 'Tú' : 'Vicky'}:</b> {m.content}
            {m.tools?.length > 0 && (
              <div className="mt-1 text-[10px] text-purple-600">
                🔧 usó: {m.tools.map(t => t.name).join(', ')}
              </div>
            )}
            {m.usage && (
              <div className="text-[10px] text-slate-400 mt-0.5">
                {m.usage.total_tokens} tokens
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Escribe un mensaje…"
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !busy && send()}
          disabled={busy}
        />
        <Button onClick={send} disabled={busy || !msg.trim()}>
          {busy ? 'Pensando…' : 'Enviar'}
        </Button>
        {convId && (
          <Button variant="outline" onClick={() => { setConvId(''); setMessages([]); }}>
            Nueva conv.
          </Button>
        )}
      </div>
    </div>
  );
}
