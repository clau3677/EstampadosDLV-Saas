// ============================================================================
// /api/agent/*  — Endpoints del Agente Vendedor IA "Vicky" (Estampados DLV)
//
// PÚBLICOS (widget web, whatsapp integration):
//   POST /api/agent/chat        → { message, conversationId?, source, contact? }
//   POST /api/agent/handoff     → forzar handoff manual desde cliente/UI
//
// ADMIN (panel /agente, /bandeja):
//   GET  /api/agent/ping        → health check del LLM
//   GET  /api/agent/config      → configuración actual (persona, KB, business info)
//   PATCH /api/agent/config     → actualizar configuración
//
//   GET  /api/agent/knowledge         → lista KB
//   POST /api/agent/knowledge         → nuevo item (Q&A o bloque libre)
//   PATCH /api/agent/knowledge/:id    → editar
//   DELETE /api/agent/knowledge/:id   → borrar
//
//   GET  /api/agent/conversations               → lista conversaciones (paginado, filtros)
//   GET  /api/agent/conversations/:id           → detalle + mensajes
//   PATCH /api/agent/conversations/:id          → toggle aiEnabled, stage, notes
//   POST /api/agent/conversations/:id/send      → enviar mensaje manual (humano desde bandeja)
//
//   GET  /api/agent/drafts                      → lista borradores de pedido pendientes
//   GET  /api/agent/drafts/:id                  → detalle
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { json, err } from './_helpers';
import { agentChat } from '@/lib/agent/engine';
import { ping, getPublicConfig } from '@/lib/agent/llm';
import { seedAgentIfEmpty } from '@/lib/agent/seed';
import { sendText, getStatus as getWaStatus } from '@/lib/whatsapp/client';

// ---------------------------------------------------------------------------
// Utilidad: strip _id
// ---------------------------------------------------------------------------
const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const { _id, ...rest } = v;
    void _id;
    return rest;
  }
  return v;
};

export default async function handleAgent(ctx) {
  const { method, route, request, db } = ctx;
  if (!route.startsWith('/agent')) return null;

  // ── HEALTH ────────────────────────────────────────────────────────────
  if (route === '/agent/ping' && method === 'GET') {
    const r = await ping();
    const cfg = getPublicConfig();
    return json({ ...r, config: cfg });
  }

  // ── SEED (idempotente) ────────────────────────────────────────────────
  if (route === '/agent/seed' && method === 'POST') {
    const r = await seedAgentIfEmpty();
    return json(r);
  }

  // ── CONFIG ────────────────────────────────────────────────────────────
  if (route === '/agent/config' && method === 'GET') {
    const cfg = await db.collection('agent_config').findOne({ id: 'default' });
    return json({ config: strip(cfg) || null, llm: getPublicConfig() });
  }
  if (route === '/agent/config' && method === 'PATCH') {
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const allowed = ['persona', 'rules', 'businessInfo', 'temperature', 'maxTokens', 'enabled'];
    const $set = { updatedAt: now };
    for (const k of allowed) if (k in body) $set[k] = body[k];
    await db.collection('agent_config').updateOne(
      { id: 'default' },
      { $set, $setOnInsert: { id: 'default', createdAt: now } },
      { upsert: true }
    );
    const cfg = await db.collection('agent_config').findOne({ id: 'default' });
    return json({ ok: true, config: strip(cfg) });
  }

  // ── CHAT (público) ────────────────────────────────────────────────────
  if (route === '/agent/chat' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { message, conversationId, source = 'web', contact } = body || {};
    if (!message || !String(message).trim()) return err('message requerido');
    if (!['web', 'whatsapp'].includes(source)) return err('source debe ser web o whatsapp');
    try {
      const res = await agentChat({
        userMessage: message,
        conversationId,
        source,
        contactHint: contact,
      });
      return json(res);
    } catch (e) {
      console.error('[agent/chat]', e);
      return err(e.message || 'error', 500);
    }
  }

  // ── HANDOFF (público — cliente pide humano) ───────────────────────────
  if (route === '/agent/handoff' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const { conversationId, reason = 'customer_request', summary } = body || {};
    if (!conversationId) return err('conversationId requerido');
    await db.collection('agent_conversations').updateOne(
      { id: conversationId },
      {
        $set: {
          aiEnabled: false,
          humanTakeoverAt: new Date(),
          escalationReason: reason,
          escalationSummary: summary || 'Handoff manual desde cliente',
          stage: 'human_takeover',
        },
      }
    );
    return json({ ok: true });
  }

  // ── KNOWLEDGE BASE ────────────────────────────────────────────────────
  if (route === '/agent/knowledge' && method === 'GET') {
    const rows = await db.collection('agent_knowledge').find({}).sort({ createdAt: -1 }).toArray();
    return json(strip(rows));
  }
  if (route === '/agent/knowledge' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const item = {
      id: uuidv4(),
      type: body.type === 'qa' ? 'qa' : 'block',
      // QA: question/answer  · Block: title/body
      question: body.question || null,
      answer: body.answer || null,
      title: body.title || null,
      body: body.body || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      active: body.active !== false,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('agent_knowledge').insertOne(item);
    return json({ ok: true, item: strip(item) });
  }
  if (route.startsWith('/agent/knowledge/') && (method === 'PATCH' || method === 'DELETE')) {
    const id = route.split('/')[3];
    if (method === 'DELETE') {
      await db.collection('agent_knowledge').deleteOne({ id });
      return json({ ok: true });
    }
    const body = await request.json().catch(() => ({}));
    const $set = { updatedAt: new Date() };
    for (const k of ['question', 'answer', 'title', 'body', 'tags', 'active', 'type']) {
      if (k in body) $set[k] = body[k];
    }
    await db.collection('agent_knowledge').updateOne({ id }, { $set });
    const item = await db.collection('agent_knowledge').findOne({ id });
    return json({ ok: true, item: strip(item) });
  }

  // ── CONVERSATIONS ─────────────────────────────────────────────────────
  if (route === '/agent/conversations' && method === 'GET') {
    const url = new URL(request.url);
    const source = url.searchParams.get('source');
    const stage = url.searchParams.get('stage');
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const filter = {};
    if (source) filter.source = source;
    if (stage) filter.stage = stage;
    const rows = await db.collection('agent_conversations')
      .find(filter).sort({ updatedAt: -1 }).limit(limit).toArray();

    // Enriquecer con contact + último mensaje
    const contactIds = [...new Set(rows.map(r => r.contactId).filter(Boolean))];
    const contactsById = new Map();
    if (contactIds.length) {
      const contacts = await db.collection('agent_contacts').find({ id: { $in: contactIds } }).toArray();
      for (const c of contacts) contactsById.set(c.id, c);
    }
    const enriched = await Promise.all(rows.map(async (c) => {
      const last = await db.collection('agent_messages')
        .find({ conversationId: c.id, role: { $in: ['user', 'assistant'] } })
        .sort({ createdAt: -1 }).limit(1).toArray();
      return {
        ...strip(c),
        contact: strip(contactsById.get(c.contactId)) || null,
        lastMessage: last[0] ? { role: last[0].role, content: (last[0].content || '').slice(0, 120), createdAt: last[0].createdAt } : null,
      };
    }));
    return json(enriched);
  }

  if (route.startsWith('/agent/conversations/') && !route.endsWith('/send') && method === 'GET') {
    const id = route.split('/')[3];
    const conv = await db.collection('agent_conversations').findOne({ id });
    if (!conv) return err('conversación no encontrada', 404);
    const contact = conv.contactId ? await db.collection('agent_contacts').findOne({ id: conv.contactId }) : null;
    const messages = await db.collection('agent_messages')
      .find({ conversationId: id }).sort({ createdAt: 1 }).toArray();
    // No exponer tool_calls raw en la vista — colapsar como "IA usó tool: X"
    const visibleMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        name: m.name || null,
        toolCallsSummary: m.tool_calls ? m.tool_calls.map(tc => tc.function?.name) : null,
        createdAt: m.createdAt,
      }));
    return json({ conversation: strip(conv), contact: strip(contact), messages: visibleMessages });
  }

  if (route.startsWith('/agent/conversations/') && !route.endsWith('/send') && method === 'PATCH') {
    const id = route.split('/')[3];
    const body = await request.json().catch(() => ({}));
    const $set = { updatedAt: new Date() };
    for (const k of ['aiEnabled', 'stage', 'notes', 'status']) if (k in body) $set[k] = body[k];
    await db.collection('agent_conversations').updateOne({ id }, { $set });
    const conv = await db.collection('agent_conversations').findOne({ id });
    return json({ ok: true, conversation: strip(conv) });
  }

  // ── ENVIAR MENSAJE MANUAL (humano toma el control) ────────────────────
  if (route.startsWith('/agent/conversations/') && route.endsWith('/send') && method === 'POST') {
    const id = route.split('/')[3];
    const body = await request.json().catch(() => ({}));
    const { content } = body || {};
    if (!content?.trim()) return err('content requerido');

    const conv = await db.collection('agent_conversations').findOne({ id });
    if (!conv) return err('conversación no encontrada', 404);
    const contact = conv.contactId ? await db.collection('agent_contacts').findOne({ id: conv.contactId }) : null;

    // Persistir el mensaje del humano como "assistant" con flag humanSent
    await db.collection('agent_messages').insertOne({
      id: uuidv4(),
      conversationId: id,
      role: 'assistant',
      content,
      humanSent: true,
      createdAt: new Date(),
    });
    await db.collection('agent_conversations').updateOne(
      { id },
      { $inc: { messageCount: 1 }, $set: { updatedAt: new Date() } }
    );

    // Si la conversación es de WhatsApp y hay teléfono, enviarlo por WA
    let waResult = null;
    if (conv.source === 'whatsapp' && contact?.phone) {
      const waStatus = getWaStatus();
      if (waStatus.state === 'connected') {
        try {
          const r = await sendText(contact.phone, content);
          waResult = { sent: true, messageId: r.messageId };
        } catch (e) {
          waResult = { sent: false, error: e.message };
        }
      } else {
        waResult = { sent: false, error: `WhatsApp no conectado (${waStatus.state})` };
      }
    }

    return json({ ok: true, waResult });
  }

  // ── ORDER DRAFTS ──────────────────────────────────────────────────────
  if (route === '/agent/drafts' && method === 'GET') {
    const rows = await db.collection('agent_order_drafts').find({}).sort({ createdAt: -1 }).limit(100).toArray();
    return json(strip(rows));
  }
  if (route.startsWith('/agent/drafts/') && method === 'GET') {
    const id = route.split('/')[3];
    const draft = await db.collection('agent_order_drafts').findOne({ id });
    if (!draft) return err('draft no encontrado', 404);
    return json(strip(draft));
  }

  // ── META INBOX (Messenger / Instagram Direct) ─────────────────────────
  if (route === '/agent/meta/threads' && method === 'GET') {
    try {
      const url = new URL(request.url);
      const channel = url.searchParams.get('channel') === 'instagram' ? 'instagram' : 'messenger';
      const { syncThreads, channelAvailability } = await import('../meta-inbox');
      const available = await channelAvailability(channel);
      if (!available) return json({ available: false, conversations: [] });
      const conversations = await syncThreads(channel, { limit: 50 });
      return json({ available: true, conversations });
    } catch (e) {
      console.error('[meta/threads]', e);
      return json({ available: false, conversations: [], note: e.message });
    }
  }
  if (route === '/agent/meta/send' && method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const { channel, conversationId, text } = body || {};
      const ch = channel === 'instagram' ? 'instagram' : 'messenger';
      if (!conversationId || !text?.trim()) return err('faltan datos');
      const { sendMetaReply } = await import('../meta-inbox');
      const conv = await db.collection('agent_conversations').findOne({ id: conversationId, channel: ch });
      if (!conv) return err('conversación no encontrada', 404);
      await sendMetaReply(ch, conv, text.trim());
      return json({ ok: true });
    } catch (e) {
      console.error('[meta/send]', e);
      return err(e.message || 'error al enviar', 500);
    }
  }

  return null;
}
