// ============================================================================
// MiniMax LLM Client — OpenAI-compatible chat completions
//
// Doc: https://platform.minimax.io/docs/api-reference/text-chat-openai
//
// Este módulo es la única puerta al LLM. Todos los demás módulos del agente
// (engine, tools loop) usan `chat(messages, opts)` de aquí.
//
// Config vía env:
//   MINIMAX_API_KEY   → Subscription Key (sk-cp-...)  ← plan Yearly Max
//   MINIMAX_BASE_URL  → https://api.minimax.io/v1     (por defecto)
//   MINIMAX_MODEL     → MiniMax-M2 (default económico) | MiniMax-M3 (flagship)
// ============================================================================

const BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2';

export function isConfigured() {
  return !!(process.env.MINIMAX_API_KEY && process.env.MINIMAX_API_KEY.startsWith('sk-'));
}

export function getPublicConfig() {
  return {
    configured: isConfigured(),
    baseUrl: BASE_URL,
    model: MODEL,
    keyType: process.env.MINIMAX_API_KEY?.startsWith('sk-cp-') ? 'subscription' : 'pay-as-you-go',
  };
}

/**
 * Invoca chat completions no-streaming. Retorna el mensaje del assistant y
 * la metadata de tokens/usage.
 *
 * @param {Array} messages   — historial completo [{role, content, tool_calls?, tool_call_id?, name?}]
 * @param {Object} [opts]
 * @param {Array}  [opts.tools]              — schemas de function calling
 * @param {string} [opts.toolChoice='auto']  — 'auto' | 'none' | {type:'function', function:{name}}
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.maxTokens=1024]
 * @param {string} [opts.model]              — override MINIMAX_MODEL
 * @returns {Promise<{ message, usage, finish_reason, raw }>}
 */
export async function chat(messages, opts = {}) {
  if (!isConfigured()) throw new Error('MINIMAX_API_KEY no configurado');

  const body = {
    model: opts.model || MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    // reasoning_split: true separa el chain-of-thought del content final
    // (M2 SIEMPRE hace reasoning, no se puede desactivar)
    reasoning_split: true,
    stream: false,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice || 'auto';
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(`MiniMax error: ${errMsg}`);
  }

  const choice = data.choices?.[0];
  if (!choice) throw new Error('MiniMax: respuesta sin choices');

  return {
    message: choice.message,           // { role, content, tool_calls? }
    usage: data.usage || null,
    finish_reason: choice.finish_reason,
    raw: data,
  };
}

/**
 * Ping simple para health-check (¿la key funciona? ¿el modelo responde?).
 * Consume ~30 tokens. Retorna { ok, latencyMs, model, error?, sample? }.
 */
export async function ping() {
  const t0 = Date.now();
  try {
    const r = await chat(
      [{ role: 'user', content: 'Di "OK" en 1 palabra.' }],
      { maxTokens: 40, temperature: 0 }
    );
    return {
      ok: true,
      latencyMs: Date.now() - t0,
      model: r.raw.model || MODEL,
      sample: (r.message.content || '').slice(0, 60),
      usage: r.usage,
    };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, error: e.message };
  }
}
