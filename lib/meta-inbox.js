// ============================================================================
// lib/meta-inbox.js — Bandeja centralizada Facebook Messenger / Instagram Direct
//
// Usa el Meta Page Access Token (env META_PAGE_ACCESS_TOKEN) con:
//   - pages_messaging  → Messenger (leer y responder) ✅
//   - instagram_manage_messages → Instagram Direct (requiere token renovado con ese scope)
//
// Colecciones: meta_inbox_threads (caché de conversaciones), meta_inbox_messages (caché de mensajes)
// El panel consume estos endpoints:
//   GET  /api/agent/meta/threads?channel=messenger|instagram  → sincroniza y devuelve
//   POST /api/agent/meta/send {channel, threadId, text}       → envía respuesta
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/mongo';

export const META_PAGE_ID = '111576058006272';
export const META_IG_ACCOUNT_ID = '17841450354684525';
export const GRAPH_VERSION = 'v21.0';

// ---------- Token ----------
export function getMetaToken() {
  return process.env.META_PAGE_ACCESS_TOKEN || process.env.META_TOKEN || '';
}

// ---------- HTTP helper ----------
async function graphFetch(path, { method = 'GET', body = null, params = {}, timeoutMs = 12000 } = {}) {
  const token = getMetaToken();
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url.toString(), opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error?.message || `Meta API error ${res.status}`);
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Meta API no respondió dentro del tiempo esperado');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Conversations endpoint detection ----------
/**
 * Messenger e Instagram Direct se listan con /{page-id}/conversations usando
 * un token de página. Para Instagram, Meta exige el parámetro platform=instagram.
 */
export function conversationsPath() {
  return `/${META_PAGE_ID}/conversations`;
}

/** Parámetros adicionales para consultar el canal Instagram Direct. */
export function channelParams(channel) {
  return channel === 'instagram' ? { platform: 'instagram' } : {};
}

/**
 * Devuelve {available: boolean, error?: string} para saber si el canal está activo.
 */
export async function channelAvailability(channel) {
  try {
    await graphFetch(conversationsPath(channel), {
      params: { ...channelParams(channel), limit: 1 },
    });
    return { available: true };
  } catch (e) {
    return { available: false, error: e.message };
  }
}

// ---------- Conversión de participantes → contacto ----------
function participantOf(parts, selfIds) {
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    if (!selfIds.includes(String(p.id))) return p;
  }
  return parts[0] || null;
}

function canonicalKey(other) {
  // Clave única de conversación por participante: email@facebook.com (página) o id (IG)
  return `${String(other?.id || '')}`;
}

// ---------- Sincronización de conversaciones (poling) ----------
/**
 * Sincroniza las conversaciones de Meta y actualiza agent_conversations/contacts/messages
 * con source 'messenger' o 'instagram'. Devuelve la lista actualizada de conversaciones locales.
 */
export async function syncThreads(channel = 'messenger', { limit = 10 } = {}) {
  const db = await getDb();
  const isInstagram = channel === 'instagram';
  const listParams = {
    ...channelParams(channel),
    limit: String(isInstagram ? 1 : limit),
  };
  if (!isInstagram) {
    listParams.fields = 'updated_time,snippet,participants{name,email,id,username}';
  }
  const listResult = await graphFetch(conversationsPath(channel), { params: listParams });
  let remoteThreads = listResult.data || [];

  // Instagram devuelve errores de carga si se piden conversaciones y participantes
  // en una misma consulta. Primero listamos un ID y luego obtenemos su detalle.
  if (isInstagram && remoteThreads.length) {
    remoteThreads = await Promise.all(remoteThreads.map(async (thread) => {
      try {
        return await graphFetch(`/${thread.id}`, {
          params: { fields: 'updated_time,snippet,participants{name,id,username}' },
        });
      } catch (error) {
        console.warn('[meta/instagram-thread-detail]', error?.message || error);
        return thread;
      }
    }));
  }

  const selfIds = channel === 'instagram'
    ? [META_IG_ACCOUNT_ID]
    : [META_PAGE_ID];

  const convIds = [];
  for (const t of remoteThreads) {
    const other = participantOf(t.participants?.data || [], selfIds);
    if (!other) continue;
    const key = `${channel}:${t.id}`;
    const now = new Date();
    await db.collection('agent_conversations').updateOne(
      { metaKey: key },
      {
        $setOnInsert: {
          id: uuidv4(),
          source: channel,
          channel,
          metaThreadId: t.id,
          aiEnabled: false,
          messageCount: 0,
          needsAttention: true,
          stage: 'nuevo',
          status: 'active',
          createdAt: now,
        },
        $set: { updatedAt: now },
      },
      { upsert: true }
    );
    convIds.push(key);
  }

  // No marcar como cerradas las conversaciones omitidas por el límite de la consulta.
  // Solo sincronizamos las conversaciones más recientes; el historial local se conserva.
  const syncTasks = remoteThreads.map((thread) => async () => {
    const other = participantOf(thread.participants?.data || [], selfIds);
    if (!other) return;
    await syncThreadMessages(channel, thread.id, other);
  });
  await runWithConcurrency(syncTasks, 4);

  // Devolver lista enriquecida igual que /agent/conversations
  const rows = await db.collection('agent_conversations')
    .find({ channel, status: { $ne: 'closed' } })
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();

  const contactIds = [...new Set(rows.map(r => r.contactId).filter(Boolean))];
  const contactsById = new Map();
  if (contactIds.length) {
    const contacts = await db.collection('agent_contacts').find({ id: { $in: contactIds } }).toArray();
    for (const c of contacts) contactsById.set(c.id, c);
  }
  const enriched = [];
  for (const c of rows) {
    const last = await db.collection('agent_messages')
      .find({ conversationId: c.id, role: { $in: ['user', 'assistant'] } })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    enriched.push({
      ...strip(c),
      contact: strip(contactsById.get(c.contactId)) || null,
      lastMessage: last[0] ? { role: last[0].role, content: (last[0].content || '').slice(0, 120), createdAt: last[0].createdAt } : null,
    });
  }
  return enriched;
}

async function runWithConcurrency(tasks, concurrency = 4) {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const task = queue.shift();
      try {
        await task();
      } catch (error) {
        console.warn('[meta/thread-sync]', error?.message || error);
      }
    }
  });
  await Promise.all(workers);
}

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') {
    const { _id, ...rest } = v;
    return rest;
  }
  return v;
};

// ---------- Sincronización de mensajes de un thread ----------
async function syncThreadMessages(channel, threadId, other) {
  const db = await getDb();
  const conv = await db.collection('agent_conversations').findOne({ metaKey: `${channel}:${threadId}` });
  if (!conv) return;

  // Registrar/actualizar contacto
  let contact = null;
  if (channel === 'instagram') {
    contact = await upsertContact(db, conv.id, {
      name: other?.username || other?.name || 'Cliente Instagram',
      instagramId: other?.id || null,
    });
  } else {
    const name = other?.name || 'Cliente Facebook';
    contact = await upsertContact(db, conv.id, { name, metaUserId: other?.id || null });
  }

  // Buscar en agent_conversations: si el contacto ya existía con otra key… no: 1 conv ↔ 1 contacto
  await db.collection('agent_conversations').updateOne(
    { id: conv.id },
    { $set: { contactId: contact.id } }
  );

  // Descargar mensajes de Meta (los más recientes primero, paginamos 100)
  const msgRes = await graphFetch(`/${threadId}`, {
    params: {
      fields: 'messages{from{name,id},to{data{id}},message,created_time,attachments{url,type},source}',
      limit: '100',
    },
  });

  const selfIds = channel === 'instagram' ? [META_IG_ACCOUNT_ID] : [META_PAGE_ID];
  const msgs = msgRes.messages?.data || [];
  let inserted = 0;
  for (const m of msgs) {
    const isFromSelf = Array.isArray(m.to?.data)
      ? m.to.data.some(p => selfIds.includes(String(p.id)))
      : selfIds.includes(String(m.from?.id));
    const isOwnPageMessage = selfIds.includes(String(m.from?.id));
    const role = isFromSelf || isOwnPageMessage ? 'assistant' : 'user';
    if (!m.message && (!m.attachments?.data || !m.attachments.data.length)) continue;

    const metaMsgId = m.id || `${m.created_time}-${isFromSelf ? 'self' : 'other'}`;
    const content = m.message || (m.attachments?.data || []).map(a => a.url || a.type).join(' ');
    const existing = await db.collection('agent_messages').countDocuments({
      conversationId: conv.id,
      'metaMsgId': metaMsgId,
    });
    if (existing > 0) continue;
    const createdAt = m.created_time ? new Date(m.created_time) : new Date();
    await db.collection('agent_messages').insertOne({
      id: uuidv4(),
      conversationId: conv.id,
      role,
      content,
      humanSent: role === 'assistant' && isOwnPageMessage,
      metaMsgId,
      metaMsgTime: createdAt,
      createdAt,
    });
    inserted++;
  }

  // Reordenar createdAt de mensajes antiguos (meta los devuelve en orden inverso)
  const all = await db.collection('agent_messages')
    .find({ conversationId: conv.id })
    .sort({ metaMsgTime: 1 })
    .toArray();
  for (let i = 0; i < all.length; i++) {
    if (all[i].createdAt?.getTime() !== all[i].metaMsgTime?.getTime()) {
      await db.collection('agent_messages').updateOne(
        { id: all[i].id },
        { $set: { createdAt: all[i].metaMsgTime } }
      );
    }
  }

  await db.collection('agent_conversations').updateOne(
    { id: conv.id },
    { $set: { messageCount: all.length, updatedAt: new Date() } }
  );
}

async function upsertContact(db, conversationId, { name, metaUserId = null, instagramId = null }) {
  let contact = null;
  if (metaUserId) contact = await db.collection('agent_contacts').findOne({ metaUserId });
  if (!contact && instagramId) contact = await db.collection('agent_contacts').findOne({ instagramId });
  if (contact) {
    await db.collection('agent_contacts').updateOne(
      { id: contact.id },
      { $set: { name: contact.name || name, updatedAt: new Date() } }
    );
    return contact;
  }
  contact = {
    id: uuidv4(),
    name,
    metaUserId,
    instagramId,
    source: 'meta',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.collection('agent_contacts').insertOne(contact);
  return contact;
}

// ---------- Enviar respuesta ----------
export async function sendMetaReply(channel, conv, text) {
  const db = await getDb();
  const body = { recipient: {}, message: { text } };
  if (channel === 'instagram') {
    // Instagram: recipient = { id: instagramId del contacto }
    const contact = conv.contactId
      ? await db.collection('agent_contacts').findOne({ id: conv.contactId })
      : null;
    if (!contact?.instagramId) throw new Error('Contacto sin ID de Instagram');
    body.recipient = { id: contact.instagramId };
  } else {
    // Messenger: recipient = { id: id del usuario de Facebook (35065523686394595...) }
    const contact = conv.contactId
      ? await db.collection('agent_contacts').findOne({ id: conv.contactId })
      : null;
    if (!contact?.metaUserId) throw new Error('Contacto sin ID de Facebook');
    body.recipient = { id: contact.metaUserId };
  }
  let res = null;
  let metaError = null;
  try {
    res = await graphFetch('/me/messages', {
      method: 'POST',
      body,
      params: channel === 'instagram' ? {} : {},
    });
  } catch (e) {
    metaError = e.message || '';
    if (/\(#10\)/.test(metaError) || /24[- ]?hour/i.test(metaError) || /policy overv?iew/i.test(metaError)) {
      // Meta bloquea respuestas fuera de la ventana de 24 h (nueva política de
      // mensajería). No es un bug: se avisa al usuario en la bandeja.
      throw Object.assign(new Error('META_WINDOW_24H'), { code: 'META_WINDOW_24H', detail: metaError });
    }
    throw e;
  }
  // Registrar mensaje local
  await db.collection('agent_messages').insertOne({
    id: uuidv4(),
    conversationId: conv.id,
    role: 'assistant',
    content: text,
    humanSent: true,
    metaMsgId: res?.message_id || null,
    metaMsgTime: new Date(),
    createdAt: new Date(),
  });
  await db.collection('agent_conversations').updateOne(
    { id: conv.id },
    { $inc: { messageCount: 1 }, $set: { updatedAt: new Date() } }
  );
  return { ok: true, messageId: res?.message_id };
}
