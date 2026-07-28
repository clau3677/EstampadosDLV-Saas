// /api/landings GET · POST · PATCH · DELETE — Landings SEO dinámicas
// /api/landings/generate POST — Genera contenido de landing con IA (MiniMax)
import { v4 as uuidv4 } from 'uuid';
import { COLLECTIONS, strip } from '@/lib/models';
import { json, err } from './_helpers';
import { chat as llmChat, isConfigured as llmIsConfigured } from '@/lib/agent/llm';

const SLUG_RE = /^[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// AI Landing Generator
// ---------------------------------------------------------------------------
// Genera todo el contenido SEO para una landing usando el LLM configurado
// (MiniMax). Contexto de negocio embebido en el system prompt.

const BUSINESS_CONTEXT = `
Eres el copywriter SEO de "Estampados DLV" (así, exactamente D-L-V, no DDL ni DVL),
un taller chileno especializado en:
- Impresión DTF Textil (Direct-to-Film) sobre poleras, polerón, mochilas, etc.
- DTF UV sobre rígidos (madera, acrílico, metal, vidrio, gadgets).
- Impresoras: Epson R1390 (31cm), Prestige R2 Pro (33cm), DTF UV (60cm).
- Servicios: gang sheets por metro, pedidos individuales, mayoristas.
- Ubicación base: Quilpué, Región de Valparaíso, Chile. Despachos a todo Chile.
- Ventajas: Impresión 300 DPI, entregas exprés, precios competitivos, atención personalizada.
- Público: emprendedores, tiendas de ropa, agencias de marketing, personas naturales.

Reglas absolutas:
- Marca "Estampados DLV" (jamás DDL, DVL, DDLV ni variantes).
- Escribe ÚNICAMENTE en español chileno neutro, usando el alfabeto latino
  (a-z, ñ, tildes, dígitos, signos comunes). NUNCA uses caracteres CJK
  (chino/japonés/coreano), cirílico ni árabe.
- Tono: profesional pero cercano, enfocado a conversión SEO.
- Usa palabras clave locales cuando aplique.
- No inventes precios ni promociones.
`.trim();

function buildPrompt({ service, city, region, tone, extraContext }) {
  const serviceLabel = {
    dtf_textil: 'DTF Textil (impresión sobre ropa)',
    dtf_uv: 'DTF UV (impresión sobre rígidos)',
    gang_sheet: 'Gang Sheet por metro',
    mayorista: 'Impresión DTF mayorista',
    general: 'servicios de impresión DTF',
  }[service] || service || 'servicios de impresión DTF';

  const locationHint = city
    ? `dirigido a clientes de ${city}${region ? ', Región de ' + region : ''}, Chile`
    : 'dirigido a clientes de todo Chile';

  return `Genera una landing page SEO en JSON estricto para el servicio "${serviceLabel}" ${locationHint}.
${tone ? `Tono adicional: ${tone}.` : ''}
${extraContext ? `Contexto extra: ${extraContext}` : ''}

REGLAS ESTRICTAS:
- Devuelve SOLO un objeto JSON válido, sin texto adicional, sin comentarios, sin markdown.
- Todo el texto en español chileno neutro.
- El body debe tener 2-4 párrafos, separados por \\n\\n (doble salto de línea).
- Incluye palabras clave locales naturalmente si hay ciudad.
- NO inventes precios, tiempos de entrega específicos ni promociones.
- NO uses emojis en H1, meta title, meta description ni slug.

FORMATO EXACTO REQUERIDO (todos los campos obligatorios):
{
  "slug": "kebab-case-sin-tildes-max-60-chars",
  "h1": "Título principal 45-70 chars, incluye ciudad si aplica",
  "intro": "1-2 frases 100-160 chars que aparecen bajo el H1",
  "body": "Párrafo 1...\\n\\nPárrafo 2...\\n\\nPárrafo 3 (opcional)",
  "ctaText": "Texto del botón CTA 3-5 palabras (ej: 'Cotiza tu diseño')",
  "metaTitle": "SEO title máx 60 chars, incluye keyword principal",
  "metaDescription": "SEO description 130-155 chars, con call to action",
  "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5", "kw6"]
}`;
}

// Parser robusto: acepta JSON puro, o JSON envuelto en ```json ... ```, o texto
// alrededor del JSON. Devuelve null si no puede parsear.
function extractJson(text) {
  if (!text) return null;
  // Extraer bloque ```json ... ``` si existe
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : text.trim();
  // Buscar el primer { y el último } balanceado
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  const jsonStr = candidate.slice(start, end + 1);
  try { return JSON.parse(jsonStr); }
  catch { return null; }
}

// Sanitiza los campos del JSON para asegurar límites y tipos correctos.
// También filtra caracteres NO latinos (CJK, cirílico, etc) que el LLM
// ocasionalmente cuela en las respuestas y arregla nombre de marca mal escrito.
function sanitizeGenerated(gen, { city } = {}) {
  // Rango permitido: latin básico + latin-1 + puntuación común
  const cleanNonLatin = (s) => String(s || '')
    // Remover caracteres CJK unificados
    .replace(/[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g, '')
    // Remover cirílico, hebreo, árabe
    .replace(/[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF]/g, '')
    // Arreglar variantes mal escritas de la marca
    .replace(/Estampados\s+(DDL|DVL|DDLV|DLD|DDV)/gi, 'Estampados DLV')
    // Normalizar espacios múltiples
    .replace(/\s{3,}/g, ' ')
    .trim();

  const clip = (s, n) => cleanNonLatin(s).slice(0, n).trim();
  const slug = String(gen.slug || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

  return {
    slug: slug || (city ? `dtf-${city.toLowerCase().replace(/\s+/g, '-')}` : 'dtf-servicio'),
    h1: clip(gen.h1, 100),
    intro: clip(gen.intro, 220),
    body: cleanNonLatin(gen.body).slice(0, 2500),
    ctaText: clip(gen.ctaText, 40) || 'Cotiza tu diseño',
    metaTitle: clip(gen.metaTitle, 60),
    metaDescription: clip(gen.metaDescription, 160),
    keywords: (Array.isArray(gen.keywords)
      ? gen.keywords.map(k => cleanNonLatin(k)).filter(Boolean).slice(0, 10)
      : cleanNonLatin(gen.keywords).split(',').map(k => k.trim()).filter(Boolean).slice(0, 10)),
  };
}

async function generateLandingWithAI({ service, city, region, tone, extraContext }) {
  const messages = [
    { role: 'system', content: BUSINESS_CONTEXT },
    { role: 'user', content: buildPrompt({ service, city, region, tone, extraContext }) },
  ];

  const t0 = Date.now();
  const result = await llmChat(messages, {
    temperature: 0.8,       // creatividad moderada para variar entre landings
    maxTokens: 1200,        // suficiente para body de 3 párrafos + meta tags
  });
  const took = Date.now() - t0;

  const rawContent = result.message?.content || '';
  const parsed = extractJson(rawContent);

  if (!parsed) {
    // Retry con temperatura baja pidiendo estrictamente JSON
    const retryMessages = [
      ...messages,
      { role: 'assistant', content: rawContent },
      { role: 'user', content: 'Tu respuesta anterior no fue JSON válido. Regenera SOLO el JSON puro, sin nada más. Sin markdown, sin explicaciones.' },
    ];
    const retry = await llmChat(retryMessages, { temperature: 0.2, maxTokens: 1200 });
    const parsed2 = extractJson(retry.message?.content || '');
    if (!parsed2) {
      throw new Error('IA no devolvió JSON válido tras 2 intentos');
    }
    return { fields: sanitizeGenerated(parsed2, { city }), tookMs: Date.now() - t0, usage: retry.usage };
  }

  return { fields: sanitizeGenerated(parsed, { city }), tookMs: took, usage: result.usage };
}

// ---------------------------------------------------------------------------
// Product-focused Landing Generator (una landing dedicada por producto)
// ---------------------------------------------------------------------------

function buildProductPrompt({ product, tone, extraContext }) {
  const variantSummary = (product.variants || []).slice(0, 6).map(v => {
    const specs = [];
    if (v.size) specs.push(`talla ${v.size}`);
    if (v.color) specs.push(`color ${v.color}`);
    return specs.join(', ');
  }).filter(Boolean).slice(0, 5).join(' · ') || 'talla única';

  const priceHint = product.price
    ? `Precio referencial: $${Number(product.price).toLocaleString('es-CL')} CLP.`
    : '';

  return `Genera una landing page SEO en JSON estricto DEDICADA al siguiente producto de "Estampados DLV". La landing debe convencer al visitante de comprar ESTE producto específico.

DATOS DEL PRODUCTO:
- Nombre: ${product.name}
- Categoría: ${product.category || 'producto'}${product.subcategory ? ' > ' + product.subcategory : ''}
- Descripción actual: ${product.description || '(sin descripción)'}
- ${priceHint}
- Variantes disponibles: ${variantSummary}
${product.material ? `- Material: ${product.material}` : ''}
${product.brand ? `- Marca: ${product.brand}` : ''}

${tone ? `Tono adicional: ${tone}.\n` : ''}${extraContext ? `Contexto extra: ${extraContext}\n` : ''}
REGLAS ESTRICTAS:
- Devuelve SOLO un objeto JSON válido, sin texto adicional, sin comentarios, sin markdown.
- Todo el texto en español chileno neutro (usar "tú" o "usted" consistentemente).
- El body debe tener 3 párrafos separados por \\n\\n. Enfócate en beneficios prácticos del producto (durabilidad, personalización, usos, calidad).
- Menciona SIEMPRE el nombre del producto en el H1 y una vez en el body.
- Habla del producto como si estuviera en stock y listo para personalizar/comprar.
- NO inventes especificaciones que no estén arriba (colores, medidas, materiales).
- NO uses emojis en H1, meta title, meta description ni slug.

FORMATO EXACTO REQUERIDO (todos los campos obligatorios):
{
  "slug": "kebab-case-derivado-del-nombre-del-producto-max-60-chars",
  "h1": "Título orientado al producto 45-70 chars (ej: '${product.name} · DTF y personalización premium')",
  "intro": "1-2 frases 100-160 chars que aparecen bajo el H1, mencionando el producto",
  "body": "Párrafo 1 (por qué elegir este producto)\\n\\nPárrafo 2 (usos/aplicaciones concretas)\\n\\nPárrafo 3 (calidad de impresión + entrega)",
  "ctaText": "Texto del botón CTA 3-5 palabras (ej: 'Comprar ahora', 'Pide el tuyo')",
  "metaTitle": "SEO title máx 60 chars con nombre del producto",
  "metaDescription": "SEO description 130-155 chars, con call to action",
  "keywords": ["nombre producto", "categoria", "personalizar", "dtf", "chile", "kw6"]
}`;
}

async function generateProductLandingWithAI({ product, tone, extraContext }) {
  const messages = [
    { role: 'system', content: BUSINESS_CONTEXT },
    { role: 'user', content: buildProductPrompt({ product, tone, extraContext }) },
  ];

  const t0 = Date.now();
  const result = await llmChat(messages, { temperature: 0.75, maxTokens: 1400 });
  const took = Date.now() - t0;

  const rawContent = result.message?.content || '';
  let parsed = extractJson(rawContent);

  if (!parsed) {
    const retry = await llmChat([
      ...messages,
      { role: 'assistant', content: rawContent },
      { role: 'user', content: 'Tu respuesta no fue JSON válido. Regenera SOLO el JSON puro, sin nada más.' },
    ], { temperature: 0.2, maxTokens: 1400 });
    parsed = extractJson(retry.message?.content || '');
    if (!parsed) throw new Error('IA no devolvió JSON válido tras 2 intentos');
  }

  const fields = sanitizeGenerated(parsed);

  // Elegir la mejor imagen del producto como hero/og
  const productImage = product.images?.[0]
    || (product.variants || []).find(v => v.image)?.image
    || null;

  return {
    fields: {
      ...fields,
      heroImage: productImage || '',
      ogImage: productImage || '',
    },
    tookMs: took,
    usage: result.usage,
  };
}

export default async function handleLandings(ctx) {
  const { method, route, db, request } = ctx;

  // -------- POST /api/landings/generate → IA --------
  if (route === '/landings/generate' && method === 'POST') {
    if (!llmIsConfigured()) {
      return err('IA no configurada. Falta MINIMAX_API_KEY en .env', 503);
    }
    const body = await request.json().catch(() => ({}));
    const { service, city, region, tone, extraContext } = body || {};
    try {
      const out = await generateLandingWithAI({ service, city, region, tone, extraContext });
      return json({
        ok: true,
        fields: out.fields,
        tookMs: out.tookMs,
        usage: out.usage,
      });
    } catch (e) {
      return err(`Generación IA falló: ${e.message}`, 500);
    }
  }

  // -------- POST /api/landings/generate-from-product → IA con contexto del producto --------
  if (route === '/landings/generate-from-product' && method === 'POST') {
    if (!llmIsConfigured()) {
      return err('IA no configurada. Falta MINIMAX_API_KEY en .env', 503);
    }
    const body = await request.json().catch(() => ({}));
    const { productId, tone, extraContext } = body || {};
    if (!productId) return err('productId requerido');

    const product = await db.collection(COLLECTIONS.PRODUCTS).findOne({ id: productId });
    if (!product) return err('Producto no encontrado', 404);

    try {
      const out = await generateProductLandingWithAI({ product, tone, extraContext });
      return json({
        ok: true,
        product: {
          id: product.id,
          name: product.name,
          slug: product.slug,
          images: product.images || [],
        },
        fields: out.fields,
        tookMs: out.tookMs,
        usage: out.usage,
      });
    } catch (e) {
      return err(`Generación IA falló: ${e.message}`, 500);
    }
  }

  // -------- POST /api/landings/from-product → Genera Y GUARDA la landing en 1 sólo paso --------
  // Body: { productId, tone?, extraContext?, overrides?: { slug, h1, ... } }
  if (route === '/landings/from-product' && method === 'POST') {
    if (!llmIsConfigured()) {
      return err('IA no configurada. Falta MINIMAX_API_KEY en .env', 503);
    }
    const body = await request.json().catch(() => ({}));
    const { productId, tone, extraContext, overrides } = body || {};
    if (!productId) return err('productId requerido');

    const product = await db.collection(COLLECTIONS.PRODUCTS).findOne({ id: productId });
    if (!product) return err('Producto no encontrado', 404);

    // Prevenir landings duplicadas para el mismo producto
    const existing = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ productId });
    if (existing) {
      return json({
        ok: true,
        reused: true,
        landing: strip(existing),
        message: 'Este producto ya tiene una landing. Se retorna la existente.',
      });
    }

    let generated;
    try {
      generated = await generateProductLandingWithAI({ product, tone, extraContext });
    } catch (e) {
      return err(`Generación IA falló: ${e.message}`, 500);
    }

    // Combinar campos generados con overrides del admin (opcional)
    const merged = { ...generated.fields, ...(overrides || {}) };

    // Asegurar slug único (si colisiona, agregar sufijo con el id corto del producto)
    let finalSlug = merged.slug;
    const dup = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ slug: finalSlug });
    if (dup) {
      finalSlug = `${merged.slug}-${product.id.slice(0, 6)}`;
    }

    const doc = {
      id: uuidv4(),
      slug: finalSlug,
      service: 'product',           // marca que es una landing "de producto"
      productId: product.id,        // referencia al producto
      location: null,
      h1: merged.h1,
      intro: merged.intro || '',
      body: merged.body || '',
      ctaText: merged.ctaText || 'Comprar ahora',
      metaTitle: merged.metaTitle || '',
      metaDescription: merged.metaDescription || '',
      ogImage: merged.ogImage || '',
      heroImage: merged.heroImage || '',
      keywords: Array.isArray(merged.keywords) ? merged.keywords : [],
      productsMode: 'manual',
      featuredProductIds: [product.id],   // el producto es el destacado
      maxProducts: 6,                     // opcional: productos relacionados en el grid
      active: true,
      generatedByAI: true,
      generationMetadata: {
        tookMs: generated.tookMs,
        promptTokens: generated.usage?.prompt_tokens,
        completionTokens: generated.usage?.completion_tokens,
        generatedAt: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection(COLLECTIONS.LANDING_PAGES).insertOne(doc);
    return json({ ok: true, landing: strip(doc), tookMs: generated.tookMs });
  }

  if (route !== '/landings') {
    // GET /api/landings/by-product?productId=xxx  → devuelve la landing asociada al producto (o null)
    if (route === '/landings/by-product' && method === 'GET') {
      const url = new URL(request.url);
      const productId = url.searchParams.get('productId');
      if (!productId) return err('productId requerido');
      const landing = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ productId });
      return json({ landing: landing ? strip(landing) : null });
    }
    return null;
  }

  if (method === 'GET') {
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('active') === 'true';
    const q = activeOnly ? { active: true } : {};
    const rows = await db.collection(COLLECTIONS.LANDING_PAGES).find(q).sort({ createdAt: -1 }).toArray();
    return json(strip(rows));
  }

  if (method === 'POST') {
    const body = await request.json();
    const slug = (body.slug || '').trim().toLowerCase();
    if (!slug || !body.h1) return err('slug y h1 son obligatorios');
    if (!SLUG_RE.test(slug)) return err('slug inválido (usa a-z, 0-9, guiones)');
    const dup = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ slug });
    if (dup) return err('Ya existe una landing con ese slug', 409);
    const validModes = ['manual', 'featured', 'all_active'];
    const productsMode = validModes.includes(body.productsMode) ? body.productsMode : 'manual';
    const doc = {
      id: uuidv4(),
      slug,
      service: body.service || 'general',
      productId: body.productId || null,   // NUEVA: si es una landing "de producto"
      location: body.location || null,
      h1: body.h1,
      intro: body.intro || '',
      body: body.body || '',
      ctaText: body.ctaText || 'Cotiza tu diseño',
      metaTitle: body.metaTitle || '',
      metaDescription: body.metaDescription || '',
      ogImage: body.ogImage || '',
      heroImage: body.heroImage || '',       // NUEVA: imagen destacada del Hero (opcional)
      keywords: Array.isArray(body.keywords) ? body.keywords : [],
      // Modo de selección de productos destacados:
      //   'manual'     → usa featuredProductIds (selección explícita, comportamiento clásico)
      //   'featured'   → automáticamente productos con `products.featured=true` (dinámico!)
      //   'all_active' → automáticamente todos los productos activos (limitado a maxProducts)
      productsMode,
      featuredProductIds: Array.isArray(body.featuredProductIds) ? body.featuredProductIds : [],
      maxProducts: Number(body.maxProducts) || 8,
      active: body.active !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection(COLLECTIONS.LANDING_PAGES).insertOne(doc);
    return json(strip(doc));
  }

  if (method === 'PATCH') {
    const body = await request.json();
    if (!body.id) return err('id requerido');
    const update = { updatedAt: new Date() };
    const allowed = ['slug', 'service', 'productId', 'location', 'h1', 'intro', 'body', 'ctaText',
                     'metaTitle', 'metaDescription', 'ogImage', 'heroImage', 'keywords',
                     'featuredProductIds', 'productsMode', 'maxProducts', 'active'];
    for (const k of allowed) if (k in body) update[k] = body[k];
    if ('productsMode' in update) {
      const validModes = ['manual', 'featured', 'all_active'];
      if (!validModes.includes(update.productsMode)) return err('productsMode inválido');
    }
    if (update.slug) {
      const s = String(update.slug).trim().toLowerCase();
      if (!SLUG_RE.test(s)) return err('slug inválido');
      update.slug = s;
      const dup = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ slug: s, id: { $ne: body.id } });
      if (dup) return err('slug ya usado', 409);
    }
    const r = await db.collection(COLLECTIONS.LANDING_PAGES).updateOne({ id: body.id }, { $set: update });
    if (!r.matchedCount) return err('no encontrado', 404);
    const updated = await db.collection(COLLECTIONS.LANDING_PAGES).findOne({ id: body.id });
    return json(strip(updated));
  }

  if (method === 'DELETE') {
    const body = await request.json();
    if (!body.id) return err('id requerido');
    const r = await db.collection(COLLECTIONS.LANDING_PAGES).deleteOne({ id: body.id });
    if (!r.deletedCount) return err('no encontrado', 404);
    return json({ ok: true });
  }

  return null;
}
