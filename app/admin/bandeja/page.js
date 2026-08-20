'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  MessageSquare, ArrowLeft, RefreshCw, Send, Bot, User, AlertTriangle,
  Globe, MessageCircle, Sparkles, Loader2, Wrench, Facebook, Camera,
} from 'lucide-react';

const SOURCE_LABEL = {
  web: { label: 'Web', icon: Globe, color: 'bg-blue-500' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-500' },
  messenger: { label: 'Messenger', icon: Facebook, color: 'bg-blue-600' },
  instagram: { label: 'Instagram', icon: Camera, color: 'bg-fuchsia-600' },
};

const STAGE_LABEL = {
  nuevo: 'Nuevo',
  interested: 'Interesado',
  quoted: 'Cotizado',
  ordered: 'Pedido',
  won: 'Ganado',
  lost: 'Perdido',
  human_takeover: 'Humano',
};

export default function BandejaPage() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [filterSource, setFilterSource] = useState(null);

  const loadConversations = useCallback(async () => {
    try {
      if (filterSource === 'messenger' || filterSource === 'instagram') {
        const url = new URL('/api/agent/meta/threads', window.location.origin);
        url.searchParams.set('channel', filterSource);
        const r = await fetch(url).then((x) => x.json());
        setConversations(Array.isArray(r?.conversations) ? r.conversations : []);
        setMetaUnavailable(r?.available === false);
        return;
      }
      const url = new URL('/api/agent/conversations', window.location.origin);
      if (filterSource) url.searchParams.set('source', filterSource);
      url.searchParams.set('limit', '100');
      const r = await fetch(url).then((x) => x.json());
      setConversations(Array.isArray(r) ? r : []);
    } catch { /* ignore */ }
  }, [filterSource]);
  const [metaUnavailable, setMetaUnavailable] = useState(false);

  const loadConversation = useCallback(async (id) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/agent/conversations/${id}`).then((x) => x.json());
      setSelected(r.conversation);
      setContact(r.contact);
      setMessages(r.messages || []);
    } catch (e) {
      toast.error('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto-refresh cada 5s (por si llegan mensajes de WhatsApp)
  useEffect(() => {
    const t = setInterval(() => {
      loadConversations();
      if (selected) loadConversation(selected.id);
    }, 5000);
    return () => clearInterval(t);
  }, [selected, loadConversations, loadConversation]);

  const toggleAI = async () => {
    if (!selected) return;
    const newVal = !selected.aiEnabled;
    await fetch(`/api/agent/conversations/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aiEnabled: newVal }),
    });
    toast.success(newVal ? 'IA activada' : 'IA desactivada (humano toma control)');
    loadConversation(selected.id);
    loadConversations();
  };

  const sendReply = async () => {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      // Canales Meta (Messenger/Instagram) se envían por su propio endpoint
      if (selected.channel === 'messenger' || selected.channel === 'instagram') {
        const r = await fetch('/api/agent/meta/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: selected.channel, conversationId: selected.id, text: replyText.trim() }),
        });
        const data = await r.json();
        if (data.window24h) {
          toast.error(data.error || 'Meta no permite responder fuera de la ventana de 24 horas.');
          // No limpiar el texto: Sandra puede reenviar cuando el cliente escriba
          setSending(false);
          return;
        }
        if (!r.ok) throw new Error(data.error || 'error');
        toast.success(`Enviado por ${selected.channel === 'messenger' ? 'Messenger' : 'Instagram Direct'} ✅`);
      } else {
        const r = await fetch(`/api/agent/conversations/${selected.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: replyText.trim() }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'error');
        if (data.waResult) {
          if (data.waResult.sent) toast.success('Enviado por WhatsApp ✅');
          else toast.warning('Guardado, pero WA falló: ' + data.waResult.error);
        } else {
          toast.success('Enviado ✅');
        }
      }
      setReplyText('');
      loadConversation(selected.id);
    } catch (e) {
      toast.error('Error: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3 w-3" /> Volver al Dashboard
        </Link>
        <div className="mt-3 flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <MessageSquare className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bandeja</h1>
            <p className="text-slate-500 mt-1 text-sm">
              Conversaciones activas Web + WhatsApp + Facebook + Instagram · toma control cuando quieras
            </p>
          </div>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/agente"><Sparkles className="h-3.5 w-3.5" /> Configurar Agente</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[380px_1fr] h-[calc(100vh-220px)]">
        {/* Lista de conversaciones */}
        <Card className="flex flex-col overflow-hidden">
          <div className="p-3 border-b bg-slate-50 flex items-center gap-2">
            <div className="text-xs font-semibold text-slate-600 flex-1">Conversaciones ({conversations.length})</div>
            <Button size="sm" variant="ghost" className="h-7" onClick={loadConversations}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
          <div className="p-2 border-b flex gap-1">
            <Button size="sm" variant={filterSource === null ? 'default' : 'ghost'} className="h-7 text-xs flex-1" onClick={() => setFilterSource(null)}>
              Todas
            </Button>
            <Button size="sm" variant={filterSource === 'web' ? 'default' : 'ghost'} className="h-7 text-xs" onClick={() => setFilterSource('web')}>
              <Globe className="h-3 w-3 mr-1" /> Web
            </Button>
            <Button size="sm" variant={filterSource === 'whatsapp' ? 'default' : 'ghost'} className="h-7 text-xs" onClick={() => setFilterSource('whatsapp')}>
              <MessageCircle className="h-3 w-3 mr-1" /> WA
            </Button>
            <Button size="sm" variant={filterSource === 'messenger' ? 'default' : 'ghost'} className="h-7 text-xs" onClick={() => setFilterSource('messenger')}>
              <Facebook className="h-3 w-3 mr-1" /> FB
            </Button>
            <Button size="sm" variant={filterSource === 'instagram' ? 'default' : 'ghost'} className="h-7 text-xs" onClick={() => setFilterSource('instagram')}>
              <Camera className="h-3 w-3 mr-1" /> IG
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {metaUnavailable && (
              <div className="text-center text-xs text-slate-400 py-6 px-4">
                Este canal no está disponible todavía. Para activarlo, genera un nuevo token en developers.facebook.com con los permisos de mensajes y avísame para configurarlo.
              </div>
            )}
            {conversations.length === 0 && !metaUnavailable && (
              <div className="text-center text-sm text-slate-400 py-10 px-4">
                No hay conversaciones aún. Prueba el widget desde /tienda o envía un WhatsApp al número vinculado.
              </div>
            )}
            {conversations.map((c) => {
              const src = SOURCE_LABEL[c.source] || SOURCE_LABEL.web;
              const SrcIcon = src.icon;
              const isSelected = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  className={`w-full text-left p-3 border-b hover:bg-slate-50 transition ${isSelected ? 'bg-purple-50 border-l-4 border-l-purple-500' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`h-9 w-9 rounded-full ${src.color} flex items-center justify-center text-white shrink-0 mt-0.5`}>
                      <SrcIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate max-w-[180px]">
                          {c.contact?.name || c.contact?.phone || '(anónimo)'}
                        </span>
                        {c.needsAttention && (
                          <AlertTriangle className="h-3 w-3 text-amber-500" />
                        )}
                        {!c.aiEnabled && (
                          <Badge variant="secondary" className="text-[9px] h-4">humano</Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {c.lastMessage?.content || '—'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex gap-2">
                        <span>{new Date(c.updatedAt).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>· {c.messageCount || 0} msgs</span>
                        {c.stage && c.stage !== 'nuevo' && <span>· {STAGE_LABEL[c.stage] || c.stage}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Hilo */}
        <Card className="flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Selecciona una conversación de la izquierda
            </div>
          ) : (
            <>
              {/* Header conversación */}
              <div className="p-3 border-b bg-slate-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {(() => {
                    const src = SOURCE_LABEL[selected.source] || SOURCE_LABEL.web;
                    const SrcIcon = src.icon;
                    return (
                      <>
                        <div className={`h-9 w-9 rounded-full ${src.color} flex items-center justify-center text-white`}>
                          <SrcIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{contact?.name || contact?.phone || '(anónimo)'}</div>
                          <div className="text-xs text-slate-500">
                            {contact?.phone || contact?.email || src.label}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleAI}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition ${
                      selected.aiEnabled
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                    title="Toggle IA en esta conversación"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    {selected.aiEnabled ? 'IA ON' : 'IA OFF'}
                  </button>
                </div>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                {loading && messages.length === 0 && (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                )}
                {messages.map((m) => {
                  if (m.role === 'tool') {
                    return (
                      <div key={m.id} className="flex justify-center">
                        <div className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 flex items-center gap-1">
                          <Wrench className="h-2.5 w-2.5" /> {m.name}
                        </div>
                      </div>
                    );
                  }
                  const isUser = m.role === 'user';
                  return (
                    <div key={m.id} className={`flex gap-2 ${isUser ? 'justify-end' : ''}`}>
                      {!isUser && (
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                          {m.role === 'assistant' ? <Sparkles className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                        </div>
                      )}
                      <div className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm max-w-[70%] whitespace-pre-wrap break-words ${
                        isUser
                          ? 'bg-slate-900 text-white rounded-br-sm'
                          : 'bg-slate-100 rounded-tl-sm'
                      }`}>
                        {m.content || <span className="italic text-slate-400 text-xs">(llamada a tool)</span>}
                        {m.toolCallsSummary?.length > 0 && (
                          <div className="mt-1 text-[10px] opacity-60">
                            🔧 {m.toolCallsSummary.join(', ')}
                          </div>
                        )}
                        <div className={`text-[9px] mt-1 ${isUser ? 'text-slate-400' : 'text-slate-500'}`}>
                          {new Date(m.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Composer */}
              <div className="border-t p-3 bg-white">
                {selected.aiEnabled ? (
                  <div className="text-xs text-slate-400 flex items-center gap-1.5 mb-2">
                    <Bot className="h-3 w-3" /> La IA está respondiendo automáticamente. Desactívala si quieres tomar control.
                  </div>
                ) : (
                  <div className="text-xs text-amber-600 flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="h-3 w-3" /> Modo humano — tu respuesta se enviará directamente al cliente.
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Escribe una respuesta manual…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !sending && sendReply()}
                    disabled={sending}
                  />
                  <Button onClick={sendReply} disabled={sending || !replyText.trim()} className="gap-1.5">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
