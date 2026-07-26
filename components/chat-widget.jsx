'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// LocalStorage keys
const LS_CONV_ID = 'dlv_agent_conversation_id';
const LS_CONTACT = 'dlv_agent_contact';
const LS_OPEN = 'dlv_agent_widget_open';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const [showLead, setShowLead] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Hidratar desde localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const cid = localStorage.getItem(LS_CONV_ID);
      if (cid) setConversationId(cid);
      const ct = localStorage.getItem(LS_CONTACT);
      if (ct) setContact(JSON.parse(ct));
      const wasOpen = localStorage.getItem(LS_OPEN) === '1';
      // No abrimos automáticamente en el primer load — respetamos discreción
      if (wasOpen) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  // Persistir open state
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(LS_OPEN, open ? '1' : '0'); } catch { /* ignore */ }
  }, [open, mounted]);

  // Cargar mensajes previos si hay conversationId
  const reloadMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const r = await fetch(`/api/agent/conversations/${conversationId}`).then((x) => x.json());
      if (r?.messages) {
        // Solo user/assistant visibles (no tool logs)
        setMessages(r.messages.filter((m) => m.role === 'user' || m.role === 'assistant'));
      }
    } catch { /* ignore */ }
  }, [conversationId]);

  useEffect(() => {
    if (open && conversationId && messages.length === 0) reloadMessages();
  }, [open, conversationId, messages.length, reloadMessages]);

  // Autoscroll al final
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // Focus input al abrir
  useEffect(() => {
    if (open && !showLead && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, showLead]);

  const persistContact = (c) => {
    setContact(c);
    try { localStorage.setItem(LS_CONTACT, JSON.stringify(c)); } catch { /* ignore */ }
  };

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setSending(true);

    // Añadir mensaje local del usuario inmediatamente
    const userMsg = { role: 'user', content: msg, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const r = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          conversationId: conversationId || undefined,
          source: 'web',
          contact: contact.name || contact.email || contact.phone ? contact : undefined,
        }),
      }).then((x) => x.json());

      if (r.conversationId && r.conversationId !== conversationId) {
        setConversationId(r.conversationId);
        try { localStorage.setItem(LS_CONV_ID, r.conversationId); } catch { /* ignore */ }
      }

      const assistantMsg = {
        role: 'assistant',
        content: r.reply || (r.escalated ? 'Te derivé con nuestro equipo — te contactarán pronto 👋' : '…'),
        createdAt: new Date().toISOString(),
        escalated: r.escalated,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Uy, tuve un problema técnico. ¿Podrías reintentar en un momento? 🙏',
        createdAt: new Date().toISOString(),
        error: true,
      }]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!contact.name && messages.length === 0) {
      setShowLead(true);
      return;
    }
    send();
  };

  const handleLeadSubmit = (e) => {
    e.preventDefault();
    if (!contact.name?.trim()) return;
    persistContact(contact);
    setShowLead(false);
    // Enviar un saludo automáticamente si aún no hay mensajes
    if (messages.length === 0) {
      const greeting = `Hola! Soy ${contact.name.split(' ')[0]}, cuéntame qué necesitas 👋`;
      setInput(greeting);
      setTimeout(() => send(greeting), 100);
    }
  };

  // Sugerencias rápidas iniciales (chips)
  const suggestions = [
    'Cuánto sale un metro de DTF?',
    'Qué prendas tienen?',
    'Hacen envíos?',
    'Dónde están?',
  ];

  if (!mounted) return null;

  return (
    <>
      {/* Botón flotante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[60] group h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-xl shadow-emerald-500/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
          aria-label="Abrir chat"
        >
          <MessageCircle className="h-6 w-6" strokeWidth={2.5} />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500" />
        </button>
      )}

      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-5 right-5 z-[60] w-[calc(100vw-40px)] sm:w-[380px] h-[calc(100vh-40px)] sm:h-[560px] max-h-[85vh] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
          {/* Header */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold text-sm leading-tight">Vicky</div>
                <div className="text-[11px] text-emerald-100 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  en línea · Estampados DLV
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Lead form (primera vez) */}
          {showLead && (
            <div className="p-4 border-b bg-slate-50">
              <form onSubmit={handleLeadSubmit} className="space-y-2">
                <div className="text-sm font-medium">Antes de arrancar 👋</div>
                <div className="text-xs text-slate-500">Cómo te llamas?</div>
                <input
                  type="text"
                  autoFocus
                  placeholder="Tu nombre"
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  className="w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="tel"
                  placeholder="WhatsApp (opcional)"
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                  className="w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={!contact.name?.trim()}>
                  Continuar
                </Button>
              </form>
            </div>
          )}

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50 to-white">
            {messages.length === 0 && !showLead && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="bg-white border rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm shadow-sm max-w-[280px]">
                    ¡Hola! Soy Vicky 👋 Trabajo en Estampados DLV. Pregúntame lo que necesites — puedo cotizar DTF, mostrarte el catálogo o armarte un pedido.
                  </div>
                </div>
                <div className="pt-2">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wide mb-1.5">O prueba:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-xs px-3 py-1.5 rounded-full border bg-white hover:bg-emerald-50 hover:border-emerald-300 transition text-left"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={m.id || i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
                {m.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm max-w-[280px] whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : m.escalated
                    ? 'bg-amber-50 border border-amber-200 rounded-tl-sm'
                    : m.error
                    ? 'bg-rose-50 border border-rose-200 rounded-tl-sm'
                    : 'bg-white border rounded-tl-sm'
                }`}>
                  <MessageContent text={m.content} />
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="bg-white border rounded-2xl rounded-tl-sm px-3.5 py-3 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t bg-white flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Escribe un mensaje…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending || showLead}
              className="flex-1 text-sm px-3.5 py-2.5 rounded-full border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || showLead}
              className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>

          <div className="px-3 pb-2 text-[10px] text-slate-400 text-center">
            Powered by IA · Puede cometer errores. Confirma detalles importantes.
          </div>
        </div>
      )}
    </>
  );
}

// Detecta URLs y las hace clickeables (para el link de checkout que retorna el agente)
function MessageContent({ text }) {
  if (!text) return null;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noreferrer noopener"
            className="underline font-medium hover:opacity-90 break-all"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}
