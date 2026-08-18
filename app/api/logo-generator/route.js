import { NextResponse } from "next/server";
import { coll } from "@/lib/mongo";

// ============================================================
// Creador de logos — MiniMax image-01
// Límite: 3 logos por IP / 24 h (protege la cuota de la suscripción)
// Genera 4 variantes por solicitud y verifica la ortografía del
// nombre de la empresa con el LLM; reintenta si todas fallan.
// ============================================================

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const MINI_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2";

const LOGO_STYLES = {
  Minimal: "Minimal and timeless: two or three simple geometric shapes with generous negative space, clean and flat.",
  Geometric: "Geometric and precise: built from angular polygonal shapes, grid-aligned with sharp, clean edges; modern and structured.",
  Gradiente: "Sleek and contemporary: smooth gradient shading that flows across soft, fluid shapes for a dynamic, modern feel.",
  Mascota: "A friendly mascot character: rounded, expressive and approachable, built from bold, confident shapes.",
  "Dibujado a mano": "Hand-drawn and organic: sketchy, natural linework with imperfect strokes and a human, crafted feel.",
  Lujo: "Elegant and luxurious: fine, thin monoline work, refined, minimal and premium.",
  Retro: "Retro and vintage: a classic heritage badge feel with nostalgic, time-worn detailing.",
  "3D": "Modern and dimensional: soft three-dimensional depth with gentle lighting and subtle shadows, smooth and polished.",
};

const LOGO_TYPES = {
  "icon-name":
    "a combination mark: a distinctive icon paired with the company name in clean, legible typography",
  icon: "an icon-only symbol: a single, standalone graphic mark",
  wordmark:
    "a wordmark: the company name set as distinctive, stylized typography, with no separate icon",
  monogram:
    "a monogram / lettermark built only from the company's initials, arranged into a single geometric mark",
  emblema:
    "an emblem / badge: the company name enclosed within a bordered shape such as a circle, shield or seal",
  abstracto: "an abstract geometric mark, non-representational, modern and clean",
};

const DETAIL_LEVELS = {
  Minimal:
    "Keep it minimalist: two or three simple shapes, generous negative space, no fine detail, instantly recognizable even at favicon size.",
  Balanceado:
    "Use a clean, balanced level of detail: simple enough to scale anywhere, with enough character to be memorable.",
  Detallado:
    "Allow refined, considered detail and craftsmanship, while keeping it a clean, scalable logo.",
};

// Colores con nombre: el modelo de imagen entiende mejor nombres que hex.
const NAMED_COLORS = [
  ["white", [255, 255, 255]],
  ["black", [0, 0, 0]],
  ["grey", [128, 128, 128]],
  ["red", [200, 30, 30]],
  ["orange", [235, 140, 30]],
  ["yellow", [235, 200, 30]],
  ["lime", [160, 205, 40]],
  ["green", [30, 140, 70]],
  ["teal", [30, 140, 135]],
  ["cyan", [50, 185, 215]],
  ["blue", [40, 90, 200]],
  ["indigo", [70, 70, 170]],
  ["purple", [120, 60, 180]],
  ["magenta", [190, 50, 140]],
  ["pink", [235, 120, 165]],
  ["brown", [120, 80, 50]],
];

function colorName(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  let best = NAMED_COLORS[0][0];
  let bestD = Infinity;
  for (const [name, [nr, ng, nb]] of NAMED_COLORS) {
    const d = (r - nr) ** 2 + (g - ng) ** 2 + (b - nb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

function buildPrompt(data) {
  const logoType = data.logoType || "icon-name";
  const hasText = ["icon-name", "wordmark", "monogram", "emblema"].includes(logoType);
  const style = LOGO_STYLES[data.selectedStyle] || LOGO_STYLES["Minimal"];
  const typeDesc = LOGO_TYPES[logoType] || LOGO_TYPES["icon-name"];
  const detail = DETAIL_LEVELS[data.detailLevel] || DETAIL_LEVELS["Balanceado"];
  const flatStyle = !["3D", "Gradiente"].includes(data.selectedStyle);

  const mediumClause = flatStyle
    ? "Flat 2D vector logo, built from solid-color shapes with crisp, clean edges"
    : "Modern, polished logo with smooth, clean rendering";

  const name = data.companyName || "the brand";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  let textClause;
  if (!hasText) {
    textClause =
      "Render it as a purely graphic symbol with no lettering: use clean shapes and open negative space where text would otherwise sit. Absolutely no letters, glyphs or fake characters anywhere in the image.";
  } else if (logoType === "monogram") {
    textClause = `Build it from ONLY the initials "${initials}" — exactly these ${initials.length} letters, nothing more. Each letter clean, complete and correctly formed. Do not add any extra words, letters or brand name text.`;
  } else {
    textClause = `Set the company name "${name}" in the logo. This name must appear EXACTLY as written, letter by letter: "${name}" — do not omit, add, repeat or distort any letter. Every letter must be clear, complete, correctly spelled and highly legible at small size. Write the name only once. Do not include any other words, taglines or invented text.`;
  }

  const colorTargets = {
    "icon-name": "both the icon and the company-name text",
    icon: "the symbol",
    wordmark: "the lettering",
    monogram: "the monogram lettering",
    emblema: "the symbol, the lettering and the border",
    abstracto: "the mark",
  };
  const targets = colorTargets[logoType] || "the entire logo";

  const brandColorPhrase =
    data.primaryColor === "auto"
      ? `a single cohesive brand color of your choice that best suits ${name} and this style`
      : `${colorName(data.primaryColor)} (exact hex ${data.primaryColor})`;

  const bgPhrase =
    data.backgroundColor === "auto"
      ? `a perfectly even, flat, single-color background of your choice (white or a soft neutral usually works best), uniform across the whole frame with no vignette, gradient, shadow or texture`
      : `a perfectly even, flat ${colorName(data.backgroundColor)} (${data.backgroundColor}) background, uniform across the whole frame with no vignette, gradient, shadow or texture`;

  const depthAllowance = flatStyle
    ? "Every fill is solid and flat"
    : "Lighter and darker tones of that same color are fine for depth";

  let colorClause;
  if (data.monochrome) {
    colorClause = `Color: ${targets} ${targets.includes(" and ") ? "are all" : "is"} one solid flat shade of ${brandColorPhrase}, a single color throughout. Place it on ${bgPhrase}, keeping every part clearly legible against that background.`;
  } else {
    colorClause = `Color: ${targets} ${targets.includes(" and ") ? "are" : "is"} ${brandColorPhrase}${data.primaryColor === "auto" ? "" : ", even where this style is conventionally drawn in other colors"}. ${depthAllowance}, with no unrelated colors introduced. Place it on ${bgPhrase}, keeping every part clearly legible against that background.`;
  }

  // Restricciones negativas explícitas (reduce los errores típicos de IA en logos)
  const negativePrompt =
    "Avoid: mockups, wall signs, business cards, 3D renders, background textures, tiny details, fake or unreadable letters, distorted typography, random symbols replacing letters, extra words, taglines, watermarks, copied famous brand styles, photographic scenes, complex gradients, realistic shadows.";

  const parts = [
    `Create a professional logo concept for a brand called "${name}". ${style} ${detail}`,
    "",
    `${typeDesc} for "${name}".`,
    "",
    `${textClause}`,
    "",
    `Layout: centered, balanced composition — the symbol and the name together occupy roughly 60% of the frame, with generous even margins on all sides. The name text sits directly next to or under the symbol, clearly connected as one single lockup. Crisp, clean edges on a solid, uncluttered background. Scalable from favicon to signage, and must remain legible at small size.`,
    "",
    `${colorClause}`,
    "",
    `${negativePrompt}`,
  ];
  if (data.additionalInfo) parts.push(`Additional direction: ${data.additionalInfo}.`);
  return parts.join("\n");
}

// --- LLM para verificar ortografía del nombre en el logo (MiniMax M2) ---
async function checkSpellingWithLLM(prompt) {
  const body = {
    model: MINI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a quality-check assistant for AI-generated logos. You receive a logo image and the company name it must contain. Answer ONLY with a JSON object: { \"text_ok\": true/false, \"written\": \"the text exactly as rendered in the logo\" }",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: "" } }, // placeholder, filled per image
        ],
      },
    ],
  };
  return body;
}

// Genera la imagen con MiniMax image-01 y devuelve base64
async function generateImages(prompt, count = 1) {
  const res = await fetch(`${MINIMAX_BASE_URL}/image_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "image-01",
      prompt,
      aspect_ratio: "1:1",
      n: count,
      response_format: "url",
    }),
    signal: AbortSignal.timeout(240000), // 4 min máx.
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`MiniMax image-01 HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = await res.json();
  const urls = json?.data?.image_urls || [];
  if (urls.length === 0) throw new Error("MiniMax no devolvió imágenes");

  const base64s = [];
  for (const url of urls) {
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!imgRes.ok) throw new Error(`Descarga de imagen falló HTTP ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    base64s.push(`data:image/jpeg;base64,${buf.toString("base64")}`);
  }
  return base64s;
}

// Verifica con el LLM que el texto del logo coincida con el nombre esperado.
// Devuelve { ok: bool, written: string }
async function verifyLogoText(imageBase64, expectedName, initials) {
  try {
    const name = expectedName || "the brand";
    const res = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MINI_MODEL,
        messages: [
          {
            role: "system",
            content: `Analiza la imagen de un logo generado por IA. La empresa se llama "${name}" (iniciales "${initials}"). Responde SOLO con JSON: {"text_ok": true/false, "written": "texto exacto tal como aparece en el logo"}. text_ok es true si el texto renderizado coincide exactamente con "${name}" letra por letra (para monograma, si las iniciales "${initials}" son correctas). Si el logo no tiene texto, text_ok es true.`,
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageBase64 } },
              { type: "text", text: "Revisa si el texto de este logo está bien escrito." },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) return { ok: true }; // sin verificación → no bloquear
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content || "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return { ok: true };
    const parsed = JSON.parse(m[0]);
    return { ok: !!parsed.text_ok, written: parsed.written || "" };
  } catch {
    return { ok: true }; // falla la verificación → se devuelve igual, no bloquear
  }
}

// Rate limit simple por IP con MongoDB (colección logo_usage)
async function checkRateLimit(ip) {
  if (!ip) return { allowed: false };
  try {
    const limit = Number(process.env.LOGO_RATE_LIMIT || 3);
    const usages = await coll("logo_usage");
    const doc = await usages.findOne({ ip, expiresAt: { $gt: new Date() } });
    if (!doc) {
      await usages.insertOne({
        ip,
        count: 1,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      });
      return { allowed: true, remaining: limit - 1 };
    }
    if (doc.count >= limit) return { allowed: false, remaining: 0 };
    await usages.updateOne({ _id: doc._id }, { $inc: { count: 1 } });
    return { allowed: true, remaining: limit - (doc.count + 1) };
  } catch {
    return { allowed: true }; // si la DB falla, no bloquear al cliente
  }
}

export async function POST(req) {
  if (!MINIMAX_API_KEY) {
    return NextResponse.json({ error: "Servicio no configurado" }, { status: 500 });
  }

  // Rate limit por IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rate = await checkRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error:
          "Has alcanzado el límite de 3 logos gratis por día. Vuelve mañana o contáctanos por WhatsApp +569 5416 9052.",
      },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const schemaKeys = [
    "companyName",
    "selectedStyle",
    "logoType",
    "primaryColor",
    "backgroundColor",
    "detailLevel",
    "monochrome",
    "additionalInfo",
  ];
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Petición inválida" }, { status: 400 });
  }
  const data = {};
  for (const k of schemaKeys) data[k] = body[k];
  if (!data.companyName || data.companyName.length > 120) {
    return NextResponse.json({ error: "Ingresa un nombre de marca válido (máx. 120 caracteres)" }, { status: 400 });
  }

  const prompt = buildPrompt(data);

  const name = data.companyName;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const images = [];
  let attempts = 0;
  const maxAttempts = 2; // máximo 2 rondas de 4 imágenes (cuida la cuota)
  while (images.length < 2 && attempts < maxAttempts) {
    attempts += 1;
    const batch = await generateImages(prompt, 4);

    // Verificar ortografía de cada variante
    const checks = await Promise.all(
      batch.map((img) => verifyLogoText(img, name, initials)),
    );
    for (let i = 0; i < batch.length; i++) {
      if (checks[i].ok) images.push({ base64: batch[i], written: checks[i].written || name });
    }

    // Si ninguna pasó la verificación, reintentar una sola vez
    if (images.length === 0 && attempts >= maxAttempts) {
      // Última ronda: devolver las 4 con advertencia (no bloquear)
      batch.forEach((img, i) => images.push({ base64: img, written: checks[i].written || name, warned: true }));
    }
  }

  return NextResponse.json({ images, remaining: rate.remaining });
}
