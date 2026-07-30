// =============================================================================
// IA Optimizador para Google Ads
// -----------------------------------------------------------------------------
// Analiza métricas de campañas existentes y genera recomendaciones de:
// - Ajuste de presupuesto
// - Ajuste de puja (CPC)
// - Optimización de keywords
// - Generación de copy para anuncios (titulares + descripciones)
//
// Usa MiniMax API (mismo patrón que post-generator.js)
// =============================================================================

import { chat as llmChat, isConfigured as llmIsConfigured } from '@/lib/agent/llm';

const SYSTEM_PROMPT = `Eres un experto en optimización de campañas de Google Ads para una empresa de impresión DTF (Direct to Film) en Chile llamada "Estampados DLV".

El negocio se enfoca en:
- Impresión DTF textil (diseños personalizados para poleras, polerones, gorras)
- Impresión DTF UV (para materiales rígidos)
- Venta de metros DTF para impresores
- Envío a todo Chile

Precios en CLP (pesos chilenos). Público objetivo: emprendedores, imprentas, diseñadores gráficos, y personas que necesitan diseños personalizados en Chile.

Tus recomendaciones deben ser:
1. Prácticas y accionables
2. Basadas en datos reales de las métricas proporcionadas
3. Escritas en español de Chile (tú, lenguaje cercano)
4. Con estimaciones de impacto cuando sea posible
5. Incluir rangos de presupuesto sugeridos

Responde SIEMPRE con JSON puro, sin markdown ni explicaciones.`;

function buildOptimizationPrompt({ accountMetrics, campaignMetrics, keywords }) {
  const accountSummary = accountMetrics
    ? `Resumen de cuenta (${accountMetrics.period.start} - ${accountMetrics.period.end}):
       Clics: ${accountMetrics.clicks}
       Impresiones: ${accountMetrics.impressions}
       Gasto total: ${accountMetrics.costClp} CLP
       CTR: ${accountMetrics.ctr.toFixed(2)}%
       CPC promedio: ${accountMetrics.averageCpc.toFixed(0)} CLP
       Conversiones: ${accountMetrics.conversions}
       Valor conversiones: ${accountMetrics.conversionsValue} CLP
       Tasa de conversión: ${accountMetrics.conversionRate.toFixed(2)}%
       Costo por conversión: ${accountMetrics.costPerConversion.toFixed(0)} CLP`
    : 'No hay datos de cuenta disponibles.';

  const campaignsSummary = campaignMetrics?.length
    ? `Campañas:\n${campaignMetrics.map((c) =>
        `  - ${c.campaignName}: ${c.campaignStatus} | Clics: ${c.clicks} | Impr: ${c.impressions} | Gasto: ${c.costClp} CLP | CTR: ${c.ctr.toFixed(2)}% | Conv: ${c.conversions} | CPC: ${c.averageCpc.toFixed(0)} CLP`
      ).join('\n')}`
    : 'No hay campañas activas aún.';

  const keywordsSummary = keywords?.length
    ? `Keywords:\n${keywords.map((k) =>
        `  - "${k.text}" (${k.matchType}): Impr: ${k.impressions} | Clics: ${k.clicks} | Costo: ${k.costClp} CLP | CTR: ${k.ctr.toFixed(2)}% | QS: ${k.qualityScore}`
      ).join('\n')}`
    : 'No hay keywords activas aún.';

  return `Analiza las siguientes métricas de Google Ads y proporciona recomendaciones de optimización:

${accountSummary}

${campaignsSummary}

${keywordsSummary}

Por favor genera un JSON con la siguiente estructura:
{
  "summary": "Resumen ejecutivo en 2-3 oraciones",
  "budgetRecommendations": [
    {
      "action": "aumentar_presupuesto | reducir_presupuesto | mantener_presupuesto",
      "target": "nombre de campaña o 'cuenta general'",
      "reason": "razón basada en datos",
      "suggestedAmount": 0,
      "currentAmount": 0,
      "impact": "impacto esperado"
    }
  ],
  "bidRecommendations": [
    {
      "action": "aumentar_puja | reducir_puja | mantener_puja",
      "target": "keyword o campaña",
      "reason": "razón basada en datos",
      "suggestedBidClp": 0,
      "impact": "impacto esperado"
    }
  ],
  "keywordRecommendations": [
    {
      "action": "pausar | mantener | agregar | mejorar_landing",
      "keyword": "texto de la keyword",
      "reason": "razón basada en datos",
      "suggestedMatchType": "EXACT | PHRASE | BROAD"
    }
  ],
  "generalTips": ["consejo 1", "consejo 2", "consejo 3"]
}

Si no hay suficientes datos para una recomendación específica, indícalo claramente.`;
}

export async function generateOptimizationReport({ accountMetrics, campaignMetrics, keywords }) {
  const prompt = buildOptimizationPrompt({ accountMetrics, campaignMetrics, keywords });
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  const t0 = Date.now();
  const result = await llmChat(messages, { temperature: 0.3, maxTokens: 2000 });
  let parsed = extractJson(result.message?.content || '');

  if (!parsed) {
    const retry = await llmChat([
      ...messages,
      { role: 'assistant', content: result.message?.content || '' },
      { role: 'user', content: 'Tu respuesta no fue JSON válido. Regenera SOLO el JSON puro, sin markdown.' },
    ], { temperature: 0.2, maxTokens: 2000 });
    parsed = extractJson(retry.message?.content || '');
    if (!parsed) throw new Error('IA no devolvió JSON válido tras 2 intentos');
  }

  return {
    report: parsed,
    rawText: result.message?.content || '',
    tookMs: Date.now() - t0,
    model: result.raw?.model || 'minimax',
  };
}

// -----------------------------------------------------------------------------
// Generador de copy para anuncios de Google Ads
// -----------------------------------------------------------------------------

const AD_COPY_SYSTEM = `Eres un copywriter experto en Google Ads para una empresa de impresión DTF en Chile llamada "Estampados DLV".

Reglas de Google Ads Responsive Search Ads:
- TITULARES (headlines): máximo 15 (recomendados 8-10), máximo 30 caracteres cada uno
- DESCRIPCIONES (descriptions): máximo 4 (recomendados 2-3), máximo 90 caracteres cada uno

El tono debe ser directo, profesional pero cercano. Incluir beneficios claros, urgencia cuando corresponda, y llamados a la acción.

Público objetivo: emprendedores, imprentas, diseñadores en Chile que necesitan impresión DTF de calidad.

Responde SIEMPRE con JSON puro, sin markdown ni explicaciones.`;

function buildAdCopyPrompt({ productName, productDescription, productPrice, adFocus }) {
  return `Genera titulares y descripciones para un anuncio de Google Ads responsive search para el siguiente producto:

Producto: ${productName}
Descripción: ${productDescription}
Precio: ${productPrice ? `${productPrice} CLP` : 'Consultar precio'}
Enfoque del anuncio: ${adFocus || 'tráfico general a la ficha del producto'}

Requisitos:
- 10 titulares de máximo 30 caracteres cada uno
- 3 descripciones de máximo 90 caracteres cada uno
- Incluir al menos 2 titulares con llamados a acción (ej: "Compra ahora", "Cotiza gratis")
- Incluir al menos 1 titular con el nombre de la marca "Estampados DLV"
- Incluir beneficios clave: calidad, envío a todo Chile, personalización
- Lenguaje español de Chile

Genera un JSON con:
{
  "headlines": ["texto1", "texto2", ...],
  "descriptions": ["texto1", "texto2", "texto3"],
  "displayPath": ["dtf", "impresion"]
}`;
}

export async function generateAdCopy({ productName, productDescription, productPrice, adFocus }) {
  const prompt = buildAdCopyPrompt({ productName, productDescription, productPrice, adFocus });
  const messages = [
    { role: 'system', content: AD_COPY_SYSTEM },
    { role: 'user', content: prompt },
  ];

  const t0 = Date.now();
  const result = await llmChat(messages, { temperature: 0.7, maxTokens: 1000 });
  let parsed = extractJson(result.message?.content || '');

  if (!parsed) {
    const retry = await llmChat([
      ...messages,
      { role: 'assistant', content: result.message?.content || '' },
      { role: 'user', content: 'Tu respuesta no fue JSON válido. Regenera SOLO el JSON puro, sin markdown.' },
    ], { temperature: 0.2, maxTokens: 1000 });
    parsed = extractJson(retry.message?.content || '');
    if (!parsed) throw new Error('IA no devolvió JSON válido para copy de anuncio');
  }

  return {
    headlines: parsed.headlines || [],
    descriptions: parsed.descriptions || [],
    displayPath: parsed.displayPath || ['dtf', 'impresion'],
    tookMs: Date.now() - t0,
    model: result.raw?.model || 'minimax',
  };
}

export function isGeneratorConfigured() {
  return llmIsConfigured();
}

// -----------------------------------------------------------------------------
// Helper: extraer JSON de respuesta del LLM
// -----------------------------------------------------------------------------

function extractJson(text) {
  // Buscar bloque JSON en la respuesta
  const jsonMatch = text.match(/\{[\s\S]*?\}/g);
  if (!jsonMatch) return null;

  // Intentar parsear cada bloque, preferir el más grande
  for (const candidate of jsonMatch.sort((a, b) => b.length - a.length)) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}
