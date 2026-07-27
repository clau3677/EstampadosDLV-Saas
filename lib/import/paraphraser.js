// Parafraseador de descripciones usando MiniMax LLM.
// Reescribe descripciones para evitar duplicate content SEO manteniendo la información técnica.
import { chat as minimaxChat, isConfigured } from '@/lib/agent/llm';

const PROMPT_TEMPLATE = `Eres un copywriter chileno experto en e-commerce de ropa. Reescribe la siguiente descripción de una prenda base (sin estampar) en un tono comercial, natural, en español de Chile. Reglas:
- Máximo 2-3 oraciones cortas.
- Preserva TODOS los datos técnicos: composición, gramaje, uso recomendado.
- Menciona que la prenda es ideal para personalizar con estampado DTF, serigrafía o bordado.
- NO uses palabras marketing exageradas (revólucionaria, increíble, mejor del mundo).
- Responde SOLO con el texto reescrito, sin comillas ni introducción.

Descripción original:
"""
{{ORIGINAL}}
"""

Reescrita:`;

export async function paraphraseDescription(original) {
  const clean = String(original || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length < 20) return clean; // muy corto, devolver tal cual

  const prompt = PROMPT_TEMPLATE.replace('{{ORIGINAL}}', clean.slice(0, 800));

  try {
    const res = await minimaxChat(
      [{ role: 'user', content: prompt }],
      { maxTokens: 300, temperature: 0.6 },
    );
    const text = res?.message?.content?.trim() || '';
    if (!text || text.length < 15) return clean; // fallback
    // limpia comillas envolventes por si el modelo las agrega
    return text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  } catch (e) {
    console.warn('[paraphraser] falling back to original:', e?.message);
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
