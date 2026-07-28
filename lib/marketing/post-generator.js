// =============================================================================
// Generador de posts con IA — MiniMax (auditoría jul-2026)
// -----------------------------------------------------------------------------
// Reutiliza el cliente LLM del agente (lib/agent/llm.js) con el mismo patrón
// probado de landings.js: prompt con contexto de negocio → JSON → sanitizado
// con retry a temperatura baja si el JSON no parsea.
// =============================================================================
import { chat as llmChat, isConfigured as llmIsConfigured } from '@/lib/agent/llm';
import { BUSINESS } from '@/lib/constants/business';
import { formatCLP } from '@/lib/format';

const BASE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://estampadosdlv.com').replace(/\/$/, '');

const SYSTEM_PROMPT = `Eres el community manager de ${BUSINESS.name}, un taller de impresión DTF y DTF UV en ${BUSINESS.address.city}, Chile, con envío 24-48h a todo el país.
Tono: cercano, chileno moderado (sin exceso de modismos), profesional pero cálido. Emojis con moderación (2-4 por post).
Público: emprendedores textiles, marcas de ropa, pymes y personas que quieren prendas personalizadas.
Diferenciales: impresión 300 DPI con canal blanco, editor visual online con IA, sin mínimo de compra, retiro gratis en Quilpué, WebPay/MercadoPago.
Responde SIEMPRE con JSON puro, sin markdown ni explicaciones.`;

function buildPrompt({ product, tone, occasion, platform }) {
  const price = product.basePrice || product.variants?.[0]?.price;
  return `Genera el contenido de UN post para ${platform === 'instagram' ? 'Instagram' : 'Facebook e Instagram'} sobre este producto:

Producto: ${product.name}
Categoría: ${product.category || '—'}
Descripción: ${product.description || '—'}
Precio: ${price ? formatCLP(price) : 'consultar'}
URL: ${BASE}/producto/${product.slug}
${occasion ? `Ocasión/campaña: ${occasion}` : ''}
${tone ? `Tono deseado: ${tone}` : ''}

Devuelve JSON con esta forma exacta:
{
  "caption": "texto del post, 3-5 líneas, con hook inicial, beneficio, precio si existe y llamado a la acción con la URL",
  "hashtags": ["#dtf", "#estampados", ...máximo 12, mezcla de nicho + Chile],
  "altText": "descripción de la imagen para accesibilidad, máx 100 caracteres",
  "suggestedTime": "HH:MM hora Chile sugerida para publicar (ej: 19:30)"
}`;
}

function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : text.trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); }
  catch { return null; }
}

function sanitize(gen, product) {
  const caption = String(gen.caption || '').trim().slice(0, 2000);
  const hashtags = (Array.isArray(gen.hashtags) ? gen.hashtags : [])
    .map(h => String(h).trim())
    .filter(h => /^#[\p{L}\p{N}_]+$/u.test(h))
    .slice(0, 12);
  return {
    caption: caption || `${product.name} disponible en ${BUSINESS.name} 🔥 Míralo en ${BASE}/producto/${product.slug}`,
    hashtags: hashtags.length ? hashtags : ['#dtf', '#estampados', '#chile'],
    altText: String(gen.altText || product.name).trim().slice(0, 100),
    suggestedTime: /^\d{2}:\d{2}$/.test(gen.suggestedTime || '') ? gen.suggestedTime : '19:00',
  };
}

export function isGeneratorConfigured() {
  return llmIsConfigured();
}

/**
 * Genera caption + hashtags + alt text para un producto.
 * @returns {{caption, hashtags, altText, suggestedTime, fullCaption, tookMs, usage}}
 */
export async function generatePostContent({ product, tone, occasion, platform = 'both' }) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildPrompt({ product, tone, occasion, platform }) },
  ];
  const t0 = Date.now();
  const result = await llmChat(messages, { temperature: 0.8, maxTokens: 800 });
  let parsed = extractJson(result.message?.content || '');
  let usage = result.usage;

  if (!parsed) {
    const retry = await llmChat([
      ...messages,
      { role: 'assistant', content: result.message?.content || '' },
      { role: 'user', content: 'Tu respuesta no fue JSON válido. Regenera SOLO el JSON puro, sin markdown.' },
    ], { temperature: 0.2, maxTokens: 800 });
    parsed = extractJson(retry.message?.content || '');
    usage = retry.usage;
    if (!parsed) throw new Error('IA no devolvió JSON válido tras 2 intentos');
  }

  const clean = sanitize(parsed, product);
  return {
    ...clean,
    fullCaption: `${clean.caption}\n\n${clean.hashtags.join(' ')}`,
    tookMs: Date.now() - t0,
    usage,
  };
}
