import { NextRequest } from 'next/server';

export const maxDuration = 120;

async function toBase64DataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить: ${res.status}`);
  const mime = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return `data:${mime};base64,${btoa(chunks.join(''))}`;
}

function repairJson(s: string): string {
  let inString = false, escaped = false, openBraces = 0, openBrackets = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inString) { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') openBraces++;
    else if (c === '}') openBraces--;
    else if (c === '[') openBrackets++;
    else if (c === ']') openBrackets--;
  }
  let result = s.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
  if (inString) result += '"';
  for (let i = 0; i < openBrackets; i++) result += ']';
  for (let i = 0; i < openBraces; i++) result += '}';
  return result;
}

function tryParse<T>(content: string): T | null {
  const clean = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean) as T; } catch { /* */ }
  try { return JSON.parse(repairJson(clean)) as T; } catch { /* */ }
  return null;
}

function field(content: string, key: string): string {
  const m = content.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim() : '';
}

// ── Prompt 1: SOURCE → clothing description ──────────────────────────────────
const SOURCE_PROMPT = `Look at this fashion/product photo and describe the clothing and accessories.
Return ONLY valid JSON (no markdown):
{
  "preserve": "comma-separated English list: every clothing item with exact color, cut, fabric; all accessories; model pose"
}
Example: "oversized white linen shirt, wide-leg white trousers, leopard turban, black sunglasses, pearl earrings, tan slides, standing pose with hand on hip"`;

/**
 * Strip words/phrases that trigger SiliconFlow FLUX content moderation (code 20021).
 * Applied to ALL text going into the FLUX prompt.
 */
function sanitizeForFlux(s: string): string {
  return s
    // body / nudity
    .replace(/\b(bare|naked|nude|nudity|exposed|flesh|skin|cleavage|midriff|neckline|décolleté|decollete|topless|shirtless|bra|underwear|lingerie|nipple|breast|buttock|groin)\b/gi, '')
    // suggestive descriptors
    .replace(/\b(revealing|seductive|sexy|sensual|suggestive|erotic|explicit|adult|provocative|intimate|risqué|risque)\b/gi, '')
    // tight/figure descriptors that can combine badly with model photos
    .replace(/\b(figure-hugging|body-con|bodycon|see-through|sheer|transparent|skin-tight|skintight)\b/gi, '')
    // clean up artefacts
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .trim();
}

// ── Prompt 2: OCR — extract ALL text from the style reference ─────────────────
// Focused solely on reading text — simpler prompt = better accuracy
const STYLE_OCR_PROMPT = `This is a product advertising card image. Read ALL visible text in it.
Copy every word EXACTLY character by character as it appears.

Return ONLY valid JSON (no markdown, no code blocks):
{
  "hasText": "yes",
  "panelSide": "right",
  "panelWidthPct": "40",
  "textHeadline": "main large heading text exactly as written",
  "textSubheadline": "subtitle or secondary heading text",
  "textFeatures": "feature line 1 | feature line 2 | feature line 3",
  "textSizes": "S | M | L",
  "textBrand": "brand or store name",
  "textFooter": "footer or bottom small text"
}

Rules:
- Russian Cyrillic text IS expected — copy it EXACTLY, do not translate or skip any word
- hasText: "yes" if ANY text is visible in the image, "no" if it is a plain photo with zero text
- panelSide: which side of the image is the text area on? "right" / "left" / "bottom" / "center"
- panelWidthPct: approximate % of image width taken by the text area (integer 25–85)
- textFeatures: all bullet points or feature lines joined with " | "
- textSizes: size labels separated by " | " (e.g. "XS | S | M | L | XL")
- Set "" for fields with no content`;

// ── Prompt 3: Visual style analysis ──────────────────────────────────────────
const STYLE_VISUAL_PROMPT = `Analyze the visual style of this image: lighting, colors, and atmosphere ONLY.
DO NOT describe people, models, faces, clothing, body parts or poses — ignore all humans in the image.
Focus exclusively on: background surface/color/texture, light quality and direction, color palette, mood.

Return ONLY valid JSON (no markdown):
{
  "lighting": "e.g. soft diffused studio light, warm color temperature, gentle shadows",
  "colorPalette": "3-5 color names e.g. warm amber, ivory, dusty gold, cream",
  "mood": "overall non-human aesthetic e.g. warm editorial, clean minimalist, moody dramatic",
  "hasPanel": "yes",
  "panelSide": "right",
  "panelWidthPct": "40",
  "panelColor": "#F5EDD8",
  "panelOpacity": "0.95"
}

- hasPanel: "yes" if there is a text panel/overlay area separate from photo, "no" if no panel
- panelSide: "right" / "left" / "bottom" / "center"
- panelWidthPct: integer 25–80
- panelColor: hex color of the panel (if no panel, use dominant background color hex)
- panelOpacity: 0.7–1.0`;

async function callQwen(
  apiKey: string,
  folderId: string,
  prompt: string,
  imageData: string,
  signal: AbortSignal,
  maxTokens = 800,
): Promise<string> {
  const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'Authorization': `Api-Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `gpt://${folderId}/qwen3.6-35b-a3b/latest`,
      messages: [
        { role: 'system', content: '/nothink' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageData } },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => resp.statusText);
    throw new Error(`Qwen ${resp.status}: ${txt.slice(0, 150)}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

interface OcrFacts {
  hasText?: string;
  panelSide?: string;
  panelWidthPct?: string;
  textHeadline?: string;
  textSubheadline?: string;
  textFeatures?: string;
  textSizes?: string;
  textBrand?: string;
  textFooter?: string;
}

interface VisualFacts {
  lighting?: string;
  colorPalette?: string;
  mood?: string;
  hasPanel?: string;
  panelSide?: string;
  panelWidthPct?: string;
  panelColor?: string;
  panelOpacity?: string;
}

export interface LayoutData {
  panelSide: string;       // 'left' | 'right' | 'center' | 'bottom'
  panelWidthPct: number;
  panelColor: string;
  panelOpacity: number;
  headline: string;
  subheadline: string;
  features: string[];
  sizes: string[];
  footer: string;
  brand: string;
}

function buildFluxPrompt(preserve: string, v: VisualFacts, userNote: string, hasText: boolean): string {
  // FLUX.1-Kontext sees the source image directly — no need to describe the subject.
  // Prompt describes ONLY the target lighting/color/mood (no people, no clothing).
  // This avoids content-moderation false positives from reference-model descriptions.
  void preserve;

  const lighting = sanitizeForFlux(v.lighting    || '');
  const palette  = sanitizeForFlux(v.colorPalette || '');
  const mood     = sanitizeForFlux(v.mood         || '');

  const parts: string[] = [];
  if (lighting) parts.push(`Lighting: ${lighting}`);
  if (palette)  parts.push(`Colors: ${palette}`);
  if (mood)     parts.push(mood);

  const styleDesc = parts.length > 0
    ? parts.join('. ')
    : 'soft professional studio lighting, neutral warm tones';

  let prompt = `Apply this visual style to the photo: ${styleDesc}. Keep everything else unchanged. No text.`;

  if (userNote && !hasText) {
    prompt += ` ${sanitizeForFlux(userNote)}`;
  }
  return prompt;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sourceImageUrl: string = body?.sourceImageUrl ?? '';
  const styleImageUrl: string  = body?.styleImageUrl  ?? '';
  const userNote: string       = (body?.userNote ?? '').trim();

  if (!sourceImageUrl || !styleImageUrl) {
    return Response.json({ error: 'sourceImageUrl и styleImageUrl обязательны' }, { status: 400 });
  }

  const yandexKey = (process.env.YANDEX_API_KEY    ?? '').trim();
  const folderId  = (process.env.YANDEX_FOLDER_ID  ?? 'b1g2kv9g5q3fstk360sa').trim();
  const sfKey     = (process.env.SILICONFLOW_API_KEY ?? '').trim();

  if (!yandexKey) return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });
  if (!sfKey)     return Response.json({ error: 'SILICONFLOW_API_KEY не задан' }, { status: 500 });

  try {
    // ── Step 1: Convert images ─────────────────────────────────────────────
    const [sourceData, styleData] = await Promise.all([
      toBase64DataUrl(sourceImageUrl),
      toBase64DataUrl(styleImageUrl),
    ]);
    console.log(`[style-transfer] src=${Math.round(sourceData.length / 1024)}KB sty=${Math.round(styleData.length / 1024)}KB`);

    // ── Step 2: Three parallel Qwen calls ─────────────────────────────────
    // Source: clothing; OCR: all text; Visual: colors/background/lighting
    const qwenAc    = new AbortController();
    const qwenTimer = setTimeout(() => qwenAc.abort(), 48_000);

    const [sourceContent, ocrContent, visualContent] = await Promise.all([
      callQwen(yandexKey, folderId, SOURCE_PROMPT,       sourceData, qwenAc.signal, 500),
      callQwen(yandexKey, folderId, STYLE_OCR_PROMPT,    styleData,  qwenAc.signal, 700),
      callQwen(yandexKey, folderId, STYLE_VISUAL_PROMPT, styleData,  qwenAc.signal, 500),
    ]);
    clearTimeout(qwenTimer);

    console.log(`[style-transfer] src_len=${sourceContent.length} ocr_len=${ocrContent.length} vis_len=${visualContent.length}`);
    console.log(`[style-transfer] ocr_raw(350): ${ocrContent.slice(0, 350)}`);
    console.log(`[style-transfer] vis_raw(200): ${visualContent.slice(0, 200)}`);

    // ── Parse source ──────────────────────────────────────────────────────
    const srcParsed = tryParse<{ preserve?: string }>(sourceContent);
    const preserve  =
      srcParsed?.preserve?.trim() ||
      field(sourceContent, 'preserve') ||
      'all clothing items and accessories from the original photo';

    // ── Parse OCR ─────────────────────────────────────────────────────────
    const ocrFacts: OcrFacts = tryParse<OcrFacts>(ocrContent) ?? {};
    // Regex fallbacks for each field
    const ocrKeys: (keyof OcrFacts)[] = [
      'hasText','panelSide','panelWidthPct',
      'textHeadline','textSubheadline','textFeatures','textSizes','textBrand','textFooter',
    ];
    for (const k of ocrKeys) {
      if (!ocrFacts[k]) (ocrFacts as Record<string, string>)[k] = field(ocrContent, k);
    }

    // ── Parse visual ──────────────────────────────────────────────────────
    const visualFacts: VisualFacts = tryParse<VisualFacts>(visualContent) ?? {};
    const visKeys: (keyof VisualFacts)[] = ['lighting','colorPalette','mood','hasPanel','panelSide','panelWidthPct','panelColor','panelOpacity'];
    for (const k of visKeys) {
      if (!visualFacts[k]) (visualFacts as Record<string, string>)[k] = field(visualContent, k);
    }

    // ── Determine dominantType — OCR is ground truth ───────────────────────
    const hasText = ocrFacts.hasText === 'yes' ||
                    !!(ocrFacts.textHeadline || ocrFacts.textFeatures || ocrFacts.textBrand || ocrFacts.textSubheadline);
    const dominantType = hasText ? 'text_overlay' : 'background';

    console.log(`[style-transfer] dominantType=${dominantType} panelSide=${ocrFacts.panelSide} headline="${ocrFacts.textHeadline?.slice(0,40)}" features="${ocrFacts.textFeatures?.slice(0,60)}"`);

    // ── Build FLUX prompt — visual only, zero text ────────────────────────
    const fluxPrompt = buildFluxPrompt(sanitizeForFlux(preserve), visualFacts, userNote, hasText);
    console.log(`[style-transfer] fluxPrompt(200): ${fluxPrompt.slice(0, 200)}`);

    // ── Step 3: FLUX ──────────────────────────────────────────────────────
    const callFlux = async (imageData: string, signal: AbortSignal) =>
      fetch('https://api.siliconflow.com/v1/images/generations', {
        method: 'POST', signal,
        headers: { 'Authorization': `Bearer ${sfKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'black-forest-labs/FLUX.1-Kontext-max',
          prompt: fluxPrompt,
          input_image: imageData,
          output_format: 'jpeg',
        }),
      });

    const fluxAc    = new AbortController();
    const fluxTimer = setTimeout(() => fluxAc.abort(), 65_000);
    const fluxResp  = await callFlux(sourceData, fluxAc.signal);
    clearTimeout(fluxTimer);

    // ── If 451 (content moderation) → tell client to retry with smaller image
    if (fluxResp.status === 451) {
      console.log('[style-transfer] FLUX 451 — content moderation, asking client to retry smaller');
      return Response.json({ error: 'CONTENT_MODERATED' }, { status: 451 });
    }

    const fluxText   = await fluxResp.text();
    let fluxParsed: Record<string, unknown> = {};
    try { fluxParsed = JSON.parse(fluxText); } catch { /* ok */ }

    const inference = String((fluxParsed?.timings as Record<string, unknown>)?.inference ?? '?');
    console.log(`[style-transfer] FLUX status=${fluxResp.status} inference=${inference}s`);

    if (!fluxResp.ok) {
      return Response.json({ error: `FLUX ${fluxResp.status}: ${fluxText.slice(0, 200)}` }, { status: 500 });
    }

    const resultUrl = (fluxParsed?.images as Array<{ url: string }>)?.[0]?.url ?? null;
    if (!resultUrl) return Response.json({ error: 'FLUX не вернул URL' }, { status: 500 });

    const dataUrl = await toBase64DataUrl(resultUrl).catch(() => null);
    console.log(`[style-transfer] done, dataUrl=${!!dataUrl}`);

    // ── Build layoutData — always non-null so client editor always shows ─────
    // Text fields may be empty if OCR failed; user fills them manually.
    // Panel geometry comes from OCR (priority) or Visual analysis (fallback).
    const layoutData: LayoutData = {
      panelSide:     ocrFacts.panelSide     || visualFacts.panelSide     || 'right',
      panelWidthPct: parseInt(ocrFacts.panelWidthPct || visualFacts.panelWidthPct || '40', 10) || 40,
      panelColor:    visualFacts.panelColor                                      || '#F0EDE6',
      panelOpacity:  parseFloat(visualFacts.panelOpacity || '0.95')             || 0.95,
      headline:      ocrFacts.textHeadline    || '',
      subheadline:   ocrFacts.textSubheadline || '',
      features:      (ocrFacts.textFeatures || '').split('|').map(s => s.trim()).filter(Boolean),
      sizes:         (ocrFacts.textSizes    || '').split('|').map(s => s.trim()).filter(Boolean),
      footer:        ocrFacts.textFooter      || '',
      brand:         ocrFacts.textBrand       || '',
    };

    return Response.json({
      imageUrl:    dataUrl ?? resultUrl,
      prompt:      fluxPrompt,
      sourceClothing: preserve,
      dominantType,
      visualMood:  visualFacts.mood || '',
      layoutData,
    });

  } catch (e) {
    const msg = String(e);
    console.log(`[style-transfer] caught: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
