// ============================================================================
// Agent Engine — Loop de tool-calling con MiniMax
//
// Flujo por turno:
//   1) Cargar/crear conversation + contact.
//   2) Cargar mensajes previos (últimos N para respetar el context window).
//   3) Prepend system prompt (persona + instrucciones + KB inyectado).
//   4) Loop:
//      a) llamar chat(messages, tools=all)
//      b) si finish_reason='tool_calls' → ejecutar cada tool → push tool msgs → repetir
//      c) si finish_reason='stop' → guardar y responder al usuario
//   5) Circuit breaker: máx 5 iteraciones de tool-calling por turno.
// ============================================================================
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '@/lib/mongo';
import { chat } from './llm';
import { toolSchemas, runTool } from './tools';

const MAX_TOOL_ITERS = 5;
const MAX_HISTORY = 30;    // últimos N mensajes que se envían al LLM
const DEFAULT_PERSONA = {
  name: 'Vicky',
  role: 'asistente de ventas',
  tone: 'cercano, chileno, entusiasta, servicial y honesto. Usa a veces "po" con moderación, evita muletillas excesivas.',
  language: 'español chileno',
};

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------
function buildSystemPrompt(cfg, contact) {
  const persona = { ...DEFAULT_PERSONA, ...(cfg?.persona || {}) };
  const rules = cfg?.rules || [
    'Nunca inventes precios, plazos ni políticas. Si dudas, usa una tool o escala.',
    'Cotiza SOLO usando quote_gang_sheet. Nunca digas un precio de gang sheet que no salga de esa tool.',
    'Cuando el cliente confirme un pedido, USA create_order_draft y comparte el link de checkout.',
    'Escala a humano si: piden hablar con alguien, se enojan, pedido > $50.000 CLP, o hay una duda que no puedes resolver.',
    'Respuestas cortas (max ~4 líneas), naturales, sin listas ni markdown excesivo. Si necesitas listar, usa • y máximo 5 ítems.',
    'Nunca uses inglés a menos que el cliente lo use primero.',
    'Si el cliente hace preguntas SIN sentido o typos ("ke onda", "olaa"), respóndele normalmente sin comentar los errores.',
  ];

  const businessInfo = cfg?.businessInfo || {};
  const businessBlock = Object.keys(businessInfo).length
    ? `\n\nDATOS DEL NEGOCIO (úsalos como fuente de verdad):\n${JSON.stringify(businessInfo, null, 2)}`
    : '';

  const contactBlock = contact?.name
    ? `\n\nCliente actual: ${contact.name}${contact.phone ? ` · tel ${contact.phone}` : ''}`
    : '';

  return `Eres ${persona.name}, ${persona.role} de Estampados DLV — una tienda chilena especializada en impresión DTF (Direct-To-Film) y DTF UV. Vendes por WhatsApp y por el sitio web.

TONO: ${persona.tone}
IDIOMA: ${persona.language}

Tu objetivo:
1) Responder dudas de forma clara y precisa usando las tools disponibles.
2) Vender activamente — cuando detectes intención de compra, guía al cliente hacia un create_order_draft.
3) Ser útil sin ser insistente. Sonar humano, no robótico.

REGLAS INEGOCIABLES:
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

HERRAMIENTAS QUE TIENES DISPONIBLES:
- search_products / get_product_details / check_stock → catálogo real
- quote_gang_sheet → cotización oficial de DTF
- create_order_draft → borrador de pedido (crea checkout link)
- get_business_info / search_knowledge → datos del negocio
- escalate_to_human → handoff cuando corresponda

USA LAS TOOLS AGRESIVAMENTE. Nunca respondas cosas concretas (precios, disponibilidad, plazos) sin consultarlas primero.${businessBlock}${contactBlock}`;
}

// ---------------------------------------------------------------------------
// Conversation persistence helpers
// ---------------------------------------------------------------------------
async function loadConfig(db) {
  const cfg = await db.collection('agent_config').findOne({ id: 'default' });
  return cfg || null;
}

/** Devuelve la conversación (crea una si no existe) y su contact */
async function getOrCreateConversation(db, { conversationId, source, contactHint }) {
  const now = new Date();

  // 1) Contact (upsert por phone o email o crear anónimo)
  let contact = null;
  if (contactHint?.phone) {
    contact = await db.collection('agent_contacts').findOne({ phone: contactHint.phone });
  }
  if (!contact && contactHint?.email) {
    contact = await db.collection('agent_contacts').findOne({ email: contactHint.email });
  }
  if (!contact) {
    contact = {
      id: uuidv4(),
      name: contactHint?.name || null,
      phone: contactHint?.phone || null,
      email: contactHint?.email || null,
      source,
      firstSeenAt: now,
      lastMessageAt: now,
    };
    await db.collection('agent_contacts').insertOne(contact);
  } else {
    // Merge de campos nuevos
    const updates = { lastMessageAt: now };
    if (contactHint?.name && !contact.name) updates.name = contactHint.name;
    if (contactHint?.phone && !contact.phone) updates.phone = contactHint.phone;
    if (contactHint?.email && !contact.email) updates.email = contactHint.email;
    await db.collection('agent_contacts').updateOne({ id: contact.id }, { $set: updates });
    contact = { ...contact, ...updates };
  }

  // 2) Conversation (por conversationId provisto o por contact+source activa)
  let conv = null;
  if (conversationId) {
    conv = await db.collection('agent_conversations').findOne({ id: conversationId });
  }
  if (!conv) {
    conv = await db.collection('agent_conversations').findOne({
      contactId: contact.id,
      source,
      status: 'open',
    });
  }
  if (!conv) {
    conv = {
      id: conversationId || uuidv4(),
      contactId: contact.id,
      source,
      status: 'open',
      aiEnabled: true,
      stage: 'nuevo',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };
    await db.collection('agent_conversations').insertOne(conv);
  }
  return { conv, contact };
}

async function loadRecentMessages(db, conversationId, limit = MAX_HISTORY) {
  const rows = await db.collection('agent_messages')
    .find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.reverse().map(m => ({
    role: m.role,
    content: m.content,
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id, name: m.name } : {}),
  }));
}

async function persistMessage(db, { conversationId, role, content, tool_calls, tool_call_id, name, usage }) {
  await db.collection('agent_messages').insertOne({
    id: uuidv4(),
    conversationId,
    role,
    content: content ?? '',
    ...(tool_calls ? { tool_calls } : {}),
    ...(tool_call_id ? { tool_call_id, name } : {}),
    ...(usage ? { usage } : {}),
    createdAt: new Date(),
  });
  await db.collection('agent_conversations').updateOne(
    { id: conversationId },
    { $inc: { messageCount: 1 }, $set: { updatedAt: new Date() } }
  );
}

// ---------------------------------------------------------------------------
// MAIN — chat(): un turno completo (usuario → respuesta final asistente)
// ---------------------------------------------------------------------------
/**
 * @param {Object} params
 * @param {string} params.userMessage       — texto del cliente
 * @param {string} [params.conversationId]  — ID de la conversación (opcional; se crea si no existe)
 * @param {string} params.source            — 'web' | 'whatsapp'
 * @param {Object} [params.contactHint]     — { name, phone, email }
 * @returns {Promise<{ conversationId, contactId, reply, usage, toolCalls, escalated }>}
 */
export async function agentChat({ userMessage, conversationId, source, contactHint }) {
  if (!userMessage?.trim()) throw new Error('userMessage vacío');
  if (!source) throw new Error('source requerido (web|whatsapp)');

  const db = await getDb();
  const cfg = await loadConfig(db);
  const { conv, contact } = await getOrCreateConversation(db, { conversationId, source, contactHint });

  // Si la conversación está en human_takeover, NO responder — solo persistir
  if (!conv.aiEnabled) {
    await persistMessage(db, { conversationId: conv.id, role: 'user', content: userMessage });
    return {
      conversationId: conv.id,
      contactId: contact.id,
      reply: null,
      escalated: true,
      note: 'Conversación en modo humano — el AI no responde.',
    };
  }

  // 1) Persistir el mensaje del usuario
  await persistMessage(db, { conversationId: conv.id, role: 'user', content: userMessage });

  // 2) Armar messages: system + historial + (el user ya está en historial)
  const history = await loadRecentMessages(db, conv.id, MAX_HISTORY);
  const systemPrompt = buildSystemPrompt(cfg, contact);
  let messages = [{ role: 'system', content: systemPrompt }, ...history];

  const tools = toolSchemas();
  const ctx = { db, conversationId: conv.id, contactId: contact.id, source };

  // 3) Loop de tool-calling
  let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const toolCallsLog = [];
  let iter = 0;
  let assistantMsg = null;

  while (iter < MAX_TOOL_ITERS) {
    iter += 1;
    const r = await chat(messages, {
      tools,
      toolChoice: 'auto',
      temperature: cfg?.temperature ?? 0.7,
      maxTokens: cfg?.maxTokens ?? 1024,
    });

    // Sumar usage
    if (r.usage) {
      totalUsage.prompt_tokens += r.usage.prompt_tokens || 0;
      totalUsage.completion_tokens += r.usage.completion_tokens || 0;
      totalUsage.total_tokens += r.usage.total_tokens || 0;
    }

    assistantMsg = r.message;
    // Push del mensaje del assistant al historial (para próxima iteración)
    messages.push(assistantMsg);

    // ¿El assistant pidió tools?
    if (assistantMsg.tool_calls?.length) {
      // Persistir el mensaje del assistant CON los tool_calls (importante para replay)
      await persistMessage(db, {
        conversationId: conv.id,
        role: 'assistant',
        content: assistantMsg.content || '',
        tool_calls: assistantMsg.tool_calls,
      });

      // Ejecutar cada tool y agregar el resultado como mensaje 'tool'
      for (const tc of assistantMsg.tool_calls) {
        const name = tc.function?.name;
        const args = tc.function?.arguments;
        toolCallsLog.push({ name, args });

        const resultJson = await runTool(name, args, ctx);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name,
          content: resultJson,
        });
        await persistMessage(db, {
          conversationId: conv.id,
          role: 'tool',
          tool_call_id: tc.id,
          name,
          content: resultJson,
        });
      }
      // Continuar el loop — el modelo verá los resultados y decidirá el próximo paso
      continue;
    }

    // No hay tool_calls → respuesta final
    await persistMessage(db, {
      conversationId: conv.id,
      role: 'assistant',
      content: assistantMsg.content || '',
      usage: totalUsage,
    });
    break;
  }

  if (iter >= MAX_TOOL_ITERS && assistantMsg?.tool_calls?.length) {
    // Circuit breaker — forzamos una respuesta textual
    console.warn('[agent] tool loop exceeded, forcing text reply');
    const forcedResp = await chat(
      [...messages, { role: 'user', content: 'Basado en la información que ya tienes, responde al cliente ahora sin usar más tools.' }],
      { tools: [], temperature: 0.5, maxTokens: 400 }
    );
    assistantMsg = forcedResp.message;
    if (forcedResp.usage) {
      totalUsage.prompt_tokens += forcedResp.usage.prompt_tokens || 0;
      totalUsage.completion_tokens += forcedResp.usage.completion_tokens || 0;
      totalUsage.total_tokens += forcedResp.usage.total_tokens || 0;
    }
    await persistMessage(db, {
      conversationId: conv.id,
      role: 'assistant',
      content: assistantMsg.content || '',
      usage: totalUsage,
    });
  }

  // Chequear si se escaló
  const updated = await db.collection('agent_conversations').findOne({ id: conv.id });

  return {
    conversationId: conv.id,
    contactId: contact.id,
    reply: cleanReply(assistantMsg?.content || ''),
    usage: totalUsage,
    toolCalls: toolCallsLog,
    escalated: !updated?.aiEnabled,
  };
}

// Elimina bloques <think>...</think> que MiniMax puede filtrar
function cleanReply(text) {
  if (!text) return '';
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
