// Parafraseador de descripciones usando MiniMax LLM.
// Reescribe descripciones para evitar duplicate content SEO manteniendo la información técnica.
//
// IMPORTANTE: MiniMax-M2 SIEMPRE hace reasoning (usa ~120-200 tokens en pensamiento
// antes del content). Por eso necesitamos max_tokens generoso (1000+).
import { chat as minimaxChat } from '@/lib/agent/llm';

const PROMPT_TEMPLATE = `Reescribe esta descripción de una prenda base sin estampar como si la vendieras en tu tienda chilena.

Reglas OBLIGATORIAS:
1. Máximo 2 oraciones cortas y directas.
2. Preserva TODOS los datos técnicos (composición, gramaje, tipo de tejido).
3. Menciona 1 vez que es ideal para personalizar con DTF, serigrafía, sublimación o bordado.
4. Español chileno natural, comercial. Sin marketing exagerado.
5. NO uses palabras como "increíble", "revolucionaria", "el mejor", "excelente calidad", "premium".
6. NO copies frases literales del original.
7. Empieza directo con la prenda (sin "Esta prenda es..." o similar).

Descripción original:
"""
{{ORIGINAL}}
"""

Respuesta (SOLO el texto reescrito, sin comillas, sin introducción):`;

/**
 * Limpia HTML residual y whitespace del texto original.
 */
function cleanText(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')      // strip HTML tags si quedaron
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function paraphraseDescription(original) {
  const clean = cleanText(original);
  if (!clean || clean.length < 30) return clean; // muy corto → devolver original

  const prompt = PROMPT_TEMPLATE.replace('{{ORIGINAL}}', clean.slice(0, 1000));

  try {
    const res = await minimaxChat(
      [{ role: 'user', content: prompt }],
      // Alto por MiniMax M2 reasoning tokens (100-200 típico) + content ~120 tokens
      { maxTokens: 1200, temperature: 0.75 },
    );

    const text = res?.message?.content?.trim() || '';

    // Debug logging (útil si vuelven a fallar)
    if (!text) {
      console.warn('[paraphraser] MiniMax returned empty content. finish_reason:', res?.finish_reason,
        'reasoning_tokens:', res?.usage?.completion_tokens_details?.reasoning_tokens);
      return clean;
    }
    if (text.length < 30) {
      console.warn('[paraphraser] MiniMax returned too short:', text);
      return clean;
    }

    // Limpieza: quitar comillas envolventes y prefijos comunes
    let out = text
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/^(Respuesta:|Reescrito:|Texto reescrito:)\s*/i, '')
      .trim();

    // Si por alguna razón el output es idéntico o casi idéntico al original,
    // preferir el paraphrase igual (mejor que nada), pero registrar aviso.
    if (out.toLowerCase() === clean.toLowerCase()) {
      console.warn('[paraphraser] paraphrase identical to original');
    }

    return out;
  } catch (e) {
    console.error('[paraphraser] error:', e?.message);
    return clean;
  }
}

/**
 * Batch paraphraser con concurrencia limitada.
 */
export async function paraphraseBatch(descriptions, concurrency = 2) {
  const results = new Array(descriptions.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= descriptions.length) return;
      results[i] = await paraphraseDescription(descriptions[i]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
