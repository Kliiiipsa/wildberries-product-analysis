// Prompt builder — generates prompts for Qwen (brief extraction) and FLUX (visual base).
// Not connected to UI or API routes yet.
//
// Note on architecture:
//   buildQwenBriefPrompt → used in a NEW text-only Qwen endpoint (not /api/photo/analyze).
//   /api/photo/analyze uses Qwen as vision model; this prompt is for text-based product analysis.
//   buildFluxBasePrompt → produces a FLUX Kontext prompt requesting clean visual base
//                         with empty zones for Canvas text overlay in post-production.

import type { InfographicBrief, InfographicTemplate, TemplateRenderZone } from '@/types/photo-pipeline';
import { buildInfographicBriefFromInput } from '@/lib/photo/brief-builder';
import { validateInfographicBrief } from '@/lib/photo/infographic-templates';

// ── Qwen JSON schema (documentation + prompt reference) ───────────────────────

/**
 * Expected JSON structure returned by Qwen in the brief-extraction flow.
 * Documented here as a type for parseQwenBriefResponse.
 */
export interface QwenBriefJsonResponse {
  productType: string;
  targetAudience: string;
  photoGoal: string;
  templateType: string;
  mainOffer: string;
  benefits: string[];
  style: string;
  /** Visual constraints Qwen detected for this specific product
   *  (e.g. "don't change fabric colour", "avoid high-contrast background for this pastel item").
   *  NOT generic rules — only product-specific observations.
   *  Backward compat: field was previously named 'forbidden'. Both are accepted in parseQwenBriefResponse. */
  visualConstraints: string[];
}

// ── Qwen brief prompt ─────────────────────────────────────────────────────────

/** Input for the Qwen brief-extraction prompt. */
export interface BriefPromptInput {
  productName?: string;
  productType?: string;
  category?: string;
  description?: string;
}

/**
 * Returns a system prompt that instructs Qwen to analyse a product
 * and return a structured JSON brief.
 *
 * Usage: send this as the system message + product info as user message.
 * Endpoint: a dedicated text-only Qwen call (separate from vision /api/photo/analyze).
 */
export function buildQwenBriefPrompt(input: BriefPromptInput): string {
  const productDesc = [
    input.productName,
    input.productType ?? input.category,
    input.description,
  ]
    .filter(Boolean)
    .join(' — ');

  return `Ты — эксперт по визуальному маркетингу на Wildberries. Проанализируй товар и верни ТОЛЬКО валидный JSON без markdown, без пояснений, без текста до или после JSON.

Товар: ${productDesc || '(не указан — определи по контексту)'}

Верни JSON строго по этой схеме:
{
  "productType": "тип товара по-русски, конкретно (напр. «мужские джоггеры», «женская блуза»)",
  "targetAudience": "целевая аудитория — пол и возраст (напр. «мужчины 20–35»)",
  "photoGoal": "show_product | show_benefits | show_sizes | show_details | show_lifestyle | build_trust",
  "templateType": "cover | benefits | size_grid | details | lifestyle | trust",
  "mainOffer": "главное торговое предложение — одна фраза до 60 символов, конкретная выгода",
  "benefits": ["преимущество 1 до 40 симв.", "преимущество 2", "преимущество 3"],
  "style": "визуальный стиль — 2–3 слова (напр. «premium casual», «minimalist clean»)",
  "visualConstraints": ["конкретное ограничение для ЭТОГО товара (напр. «не менять цвет ткани», «не добавлять яркий фон к пастельному товару»)"]
}

Правила:
- photoGoal и templateType должны логически совпадать
- benefits: ровно 3–5 пунктов, каждый до 40 символов, конкретные факты
- mainOffer: не маркетинговый штамп ("высокое качество"), а реальная выгода ("не мнётся после стирки")
- visualConstraints: только наблюдения об этом конкретном товаре, не общие правила
- ТОЛЬКО JSON — никакого текста вокруг`;
}

// ── FLUX base prompt ──────────────────────────────────────────────────────────

/**
 * Converts zone fractions to a natural-language spatial description for FLUX.
 * FLUX does not understand numeric coordinates — only English spatial descriptions.
 */
function zoneToSpatialDescription(zone: TemplateRenderZone): string {
  const x = zone.xFraction;
  const y = zone.yFraction;
  const w = zone.widthFraction;
  const h = zone.heightFraction;

  // Horizontal
  let hPos: string;
  if (x < 0.1 && w > 0.75) hPos = 'spanning the full width';
  else if (x < 0.20) hPos = 'on the left side';
  else if (x + w > 0.80) hPos = 'on the right side';
  else if (x > 0.35 && x + w < 0.65) hPos = 'in the center';
  else hPos = `roughly ${Math.round(x * 100)}%–${Math.round((x + w) * 100)}% across`;

  // Vertical
  let vPos: string;
  if (y < 0.15) vPos = 'near the top';
  else if (y + h > 0.85) vPos = 'near the bottom';
  else if (y > 0.65) vPos = 'in the lower portion';
  else if (y < 0.35) vPos = 'in the upper portion';
  else vPos = 'in the middle';

  return `${zone.name} (${hPos}, ${vPos})`;
}

/**
 * Builds a FLUX Kontext image-to-image prompt that requests a clean visual base.
 *
 * Strict rules enforced in the prompt:
 *   - No text, letters, numbers of any kind
 *   - No logos, watermarks, icons, symbols
 *   - Product unchanged (colour, shape, texture, material)
 *   - Specified zones must be empty/clean for Canvas text overlay
 */
export function buildFluxBasePrompt(
  brief: InfographicBrief,
  template: InfographicTemplate,
): string {
  const productType = brief.productType ?? 'the product';
  const isStudio = brief.shootType === 'studio' || !brief.shootType;

  // Collect zones that need to be kept empty (non-product, non-optional by default)
  const emptyZones = template.textZones
    .filter(z => !z.optional)
    .map(zoneToSpatialDescription);

  // Optional zones — clean but lower priority
  const optionalZones = template.textZones
    .filter(z => z.optional)
    .map(zoneToSpatialDescription);

  const emptyZonesText = emptyZones.length > 0
    ? `The following areas MUST be completely clean and uncluttered (they will receive text in post-production): ${emptyZones.join('; ')}.`
    : '';

  const optionalZonesText = optionalZones.length > 0
    ? ` Prefer clean background also in: ${optionalZones.join('; ')}.`
    : '';

  const bgDesc = isStudio
    ? 'Clean neutral studio background — consistent tone, no gradients, no shadows added to zones.'
    : 'Natural scene background matching the original photo atmosphere, depth-of-field and colour grade.';

  return (
    `[PRESERVE] Keep unchanged: ${productType} — exact colour, shape, fabric texture, ` +
    `material, every visible detail. Product placement and any model pose must remain ` +
    `pixel-perfect identical to the input image. ` +

    `[CLEAN ZONES] ${emptyZonesText}${optionalZonesText} ` +
    `Extend the existing background naturally into these zones — same depth-of-field, ` +
    `same exposure, same colour temperature. Do NOT darken, vignette, or add gradients. ` +

    `[ABSOLUTE PROHIBITIONS — ZERO EXCEPTIONS] ` +
    `No text of any kind — no letters, no words, no numbers, no characters. ` +
    `No logos, brand marks, or watermarks. ` +
    `No icons, pictograms, symbols, or decorative elements. ` +
    `No overlays, filters, or colour corrections applied to the product itself. ` +
    `Do not change product colour, shape, fabric texture, or any material properties. ` +
    `Do not add or remove objects. Do not alter lighting direction or colour temperature. ` +

    `[BACKGROUND] ${bgDesc} ` +

    `[QUALITY] Genuine photograph. Pose unchanged. No AI artifacts. ` +
    `Real film grain. No style changes. No foreground objects added.`
  );
}

// ── Qwen response parser ──────────────────────────────────────────────────────

/**
 * Safely parses a Qwen JSON response into an InfographicBrief.
 *
 * Steps:
 * 1. Extract JSON object from raw string (handles markdown code blocks)
 * 2. Map fields to InfographicBrief via buildInfographicBriefFromInput
 * 3. Validate — return null if required fields are missing
 *
 * Never throws — designed to be called at runtime without crashing the app.
 */
export function parseQwenBriefResponse(raw: string): InfographicBrief | null {
  try {
    // Strip markdown fences and Qwen3 thinking blocks
    const stripped = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\/nothink\b/g, '')
      .replace(/```(?:json)?\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Prefer `{"` to skip non-JSON {…} patterns from thinking text
    let jsonStart = stripped.indexOf('{"');
    if (jsonStart === -1) jsonStart = stripped.indexOf('{');
    const jsonEnd = stripped.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) return null;

    const parsed = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as
      Partial<QwenBriefJsonResponse> & { forbidden?: string[] };

    // Backward compat: map old 'forbidden' field → 'visualConstraints'
    if (!parsed.visualConstraints && Array.isArray(parsed.forbidden)) {
      parsed.visualConstraints = parsed.forbidden;
    }

    // Map Qwen fields → BriefBuilderInput → InfographicBrief
    const brief = buildInfographicBriefFromInput({
      productType:  typeof parsed.productType  === 'string' ? parsed.productType  : undefined,
      photoGoal:    typeof parsed.photoGoal    === 'string' ? parsed.photoGoal    : undefined,
      templateType: typeof parsed.templateType === 'string' ? parsed.templateType : undefined,
      benefits:     Array.isArray(parsed.benefits)          ? parsed.benefits      : undefined,
    });

    // Validate — if required fields are still missing, refuse to return a partial brief
    const validation = validateInfographicBrief(brief);
    if (!validation.valid) return null;

    return brief;
  } catch {
    // JSON parse error or unexpected shape — silently return null
    return null;
  }
}
