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

/** Extract a single string field from raw content via regex */
function field(content: string, key: string): string {
  const m = content.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim() : '';
}

/** Extract a number field */
function fieldNum(content: string, key: string): number | null {
  const m = content.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

// ── Prompt 1: SOURCE image → WHAT TO PRESERVE ─────────────────────────────
// Qwen just describes what it sees — no FLUX instructions, just facts.
const SOURCE_PROMPT = `Look at this fashion/product photo and describe the clothing in detail.

Return ONLY valid JSON (no markdown):
{
  "preserve": "comma-separated English list of every clothing item with exact color, cut, fabric; accessories; visible body parts and pose"
}

Example preserve value: "loose oversized white linen long-sleeve shirt open collar, wide-leg high-waist white linen trousers, leopard-print turban headband, black oval sunglasses, pearl earrings, tan leather flat slides, black sports bra visible, right hand on hip"`;

// ── Prompt 2a: STYLE image → deep visual analysis for full style transfer ──────
const STYLE_VISUAL_PROMPT = `You are analyzing a fashion/product photo as a style reference for AI image editing.
Describe EVERYTHING needed to recreate this visual style on a different photo.
Return ONLY valid JSON (no markdown, no nested objects, all values plain strings):

{
  "dominantType": "text_overlay",
  "backgroundDescription": "EXACT background: colors with names/hex, gradient direction, texture, materials, props, atmosphere",
  "colorPalette": "3-5 dominant colors as specific names (e.g. warm golden-amber, cream, deep brown)",
  "lightingDescription": "lighting: direction, quality, color temperature, shadows",
  "layoutDescription": "composition layout: where is the model, where are text panels, how is space divided",
  "graphicElements": "ALL decorative/graphic elements: arrows, lines, boxes, badges, icons, frames, dividers — describe each",
  "textPanelDescription": "describe text panels: position (left/right/center/top/bottom), size relative to image, style (white box / semi-transparent / colored)",
  "overallMood": "overall visual style in one sentence (e.g. luxury editorial infographic, clean minimalist product card)",
  "textBoxPosition": "center",
  "textBoxWidthPct": "55",
  "badgePosition": "bottom-right"
}

RULES for dominantType:
- "text_overlay": ANY image with text elements (infographics, notices, product cards, labels, feature lists, titles) — even stylized
- "background": ONLY if zero text and background/setting is the main feature
- "lighting": ONLY if zero text and special lighting is the only feature
When unsure — choose "text_overlay".`;

// ── Prompt 2b: STYLE image → OCR only ────────────────────────────────────────
const STYLE_OCR_PROMPT = `You are an expert OCR engine. Extract EVERY word of text from this image.

This may include: stylized titles, italic text, decorative fonts, product feature lists, size charts, arrows with labels, brand names, captions.

Return ONLY valid JSON (no markdown):
{
  "headline": "largest/most prominent text, word for word",
  "body": "ALL other text joined with space — features, descriptions, labels, size info",
  "footer": "footer or signature text",
  "badge": "badge or tag text",
  "brand": "brand or company name"
}

- Copy EXACTLY — no paraphrasing
- Russian/Cyrillic text is expected and valid
- If ANY text is visible: headline OR body MUST be non-empty
- Use "" only if truly no text for that field`;

// Fallback OCR prompt
const STYLE_OCR_FALLBACK_PROMPT = `List every word of text you can see in this image, top to bottom.
Return ONLY valid JSON:
{
  "headline": "first or largest text",
  "body": "all remaining text combined",
  "footer": "",
  "badge": "",
  "brand": ""
}`;

// ── Build FLUX [CHANGE] instruction server-side ────────────────────────────
interface StyleFacts {
  dominantType?: string;
  dominantElement?: string;
  styleEnvironment?: string;
  backgroundDescription?: string;
  lightingDescription?: string;
  colorPalette?: string;
  layoutDescription?: string;
  graphicElements?: string;
  textPanelDescription?: string;
  overallMood?: string;
  textBoxPosition?: string;
  textBoxWidthPct?: string;
  badgePosition?: string;
  ocr_headline?: string;
  ocr_body?: string;
  ocr_footer?: string;
  ocr_badge?: string;
  ocr_badge_color?: string;
  ocr_brand?: string;
}

function buildChangeInstruction(f: StyleFacts): string {
  const dt = (f.dominantType || '').toLowerCase();

  if (dt === 'text_overlay') {
    // Full style transfer: background + layout + graphic elements + empty text areas
    const parts: string[] = [];

    parts.push(`Transform this photo into the visual style of the reference image.`);

    if (f.backgroundDescription) parts.push(`Background: ${f.backgroundDescription}.`);
    if (f.colorPalette)          parts.push(`Color palette: ${f.colorPalette}.`);
    if (f.lightingDescription)   parts.push(`Lighting: ${f.lightingDescription}.`);
    if (f.layoutDescription)     parts.push(`Layout: ${f.layoutDescription}.`);
    if (f.graphicElements)       parts.push(`Graphic elements to add: ${f.graphicElements}.`);
    if (f.textPanelDescription)  parts.push(`Text panels: add empty placeholder areas matching this description — ${f.textPanelDescription} — leave them COMPLETELY BLANK (no text).`);
    else {
      const pos = f.textBoxPosition || 'right';
      const w   = f.textBoxWidthPct || '50';
      parts.push(`Add empty clean text placeholder area at ${pos}, approximately ${w}% of image width — no text inside.`);
    }
    if (f.overallMood) parts.push(`Overall style: ${f.overallMood}.`);
    parts.push(`Keep the model and all clothing UNCHANGED.`);

    return parts.join(' ');
  }

  if (dt === 'background') {
    const bg = [f.backgroundDescription, f.colorPalette, f.lightingDescription, f.overallMood]
      .filter(Boolean).join(', ');
    return bg
      ? `Replace the background with: ${bg}. Keep the model and clothing perfectly unchanged.`
      : `Apply the visual style and atmosphere from the reference image. Keep the model and clothing perfectly unchanged.`;
  }

  if (dt === 'lighting') {
    const light = [f.lightingDescription, f.colorPalette, f.overallMood].filter(Boolean).join(', ');
    return `Apply this lighting treatment: ${light || 'similar lighting from reference'}. Keep everything else unchanged.`;
  }

  if (dt === 'graphic_badge') {
    return `Apply the graphic overlay style from the reference: ${f.graphicElements || f.overallMood || 'reference graphic elements'}. Keep clothing unchanged.`;
  }

  // Universal fallback
  const desc = [f.backgroundDescription, f.colorPalette, f.layoutDescription, f.overallMood]
    .filter(Boolean).join(', ');
  return `Apply the complete visual style of the reference image: ${desc || 'match reference visual style'}. Keep model and clothing unchanged.`;
}

function buildSceneInstruction(f: StyleFacts): string {
  const dt = (f.dominantType || '').toLowerCase();
  if (dt === 'text_overlay') {
    return [f.overallMood, f.backgroundDescription].filter(Boolean).join('. ') || '';
  }
  if (dt === 'background') return f.backgroundDescription || f.overallMood || '';
  return f.overallMood || f.styleEnvironment || '';
}



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
      temperature: 0.15,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => resp.statusText);
    throw new Error(`Qwen ${resp.status}: ${txt.slice(0, 150)}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sourceImageUrl: string = body?.sourceImageUrl ?? '';
  const styleImageUrl: string = body?.styleImageUrl ?? '';
  const userNote: string = (body?.userNote ?? '').trim();

  if (!sourceImageUrl || !styleImageUrl) {
    return Response.json({ error: 'sourceImageUrl и styleImageUrl обязательны' }, { status: 400 });
  }

  const yandexKey = (process.env.YANDEX_API_KEY ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();
  const sfKey = (process.env.SILICONFLOW_API_KEY ?? '').trim();

  if (!yandexKey) return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });
  if (!sfKey) return Response.json({ error: 'SILICONFLOW_API_KEY не задан' }, { status: 500 });

  try {
    // ── Step 1: Convert images ─────────────────────────────────────────────
    const [sourceData, styleData] = await Promise.all([
      toBase64DataUrl(sourceImageUrl),
      toBase64DataUrl(styleImageUrl),
    ]);
    console.log(`[style-transfer] src=${Math.round(sourceData.length / 1024)}KB sty=${Math.round(styleData.length / 1024)}KB`);

    // ── Step 2: THREE Qwen calls in parallel ─────────────────────────────
    // source → clothing, style-visual → classification, style-ocr → text extraction
    const qwenAc = new AbortController();
    const qwenTimer = setTimeout(() => qwenAc.abort(), 40_000);

    const [sourceContent, styleVisualContent, styleOcrContent] = await Promise.all([
      callQwen(yandexKey, folderId, SOURCE_PROMPT,       sourceData, qwenAc.signal, 500),
      callQwen(yandexKey, folderId, STYLE_VISUAL_PROMPT, styleData,  qwenAc.signal, 600),
      callQwen(yandexKey, folderId, STYLE_OCR_PROMPT,    styleData,  qwenAc.signal, 800),
    ]);
    clearTimeout(qwenTimer);

    console.log(`[style-transfer] src_len=${sourceContent.length} vis_len=${styleVisualContent.length} ocr_len=${styleOcrContent.length}`);
    console.log(`[style-transfer] vis_raw(200): ${styleVisualContent.slice(0, 200)}`);
    console.log(`[style-transfer] ocr_raw(200): ${styleOcrContent.slice(0, 200)}`);

    // ── Parse source: preserve ────────────────────────────────────────────
    const srcParsed = tryParse<{ preserve?: string }>(sourceContent);
    const preserve =
      srcParsed?.preserve?.trim() ||
      field(sourceContent, 'preserve') ||
      'all clothing items and accessories from the original photo';

    // ── Parse style visual: classification facts ──────────────────────────
    interface VisualFacts {
      dominantType?: string; dominantElement?: string; styleEnvironment?: string;
      backgroundDescription?: string; lightingDescription?: string; colorPalette?: string;
      layoutDescription?: string; graphicElements?: string;
      textPanelDescription?: string; overallMood?: string;
      textBoxPosition?: string; textBoxWidthPct?: string; badgePosition?: string;
    }
    const visualParsed: VisualFacts = tryParse<VisualFacts>(styleVisualContent) ?? {};
    if (!visualParsed.dominantType) {
      visualParsed.dominantType          = field(styleVisualContent, 'dominantType');
      visualParsed.dominantElement       = field(styleVisualContent, 'dominantElement');
      visualParsed.styleEnvironment      = field(styleVisualContent, 'styleEnvironment');
      visualParsed.backgroundDescription = field(styleVisualContent, 'backgroundDescription');
      visualParsed.lightingDescription   = field(styleVisualContent, 'lightingDescription');
      visualParsed.colorPalette          = field(styleVisualContent, 'colorPalette');
      visualParsed.layoutDescription     = field(styleVisualContent, 'layoutDescription');
      visualParsed.graphicElements       = field(styleVisualContent, 'graphicElements');
      visualParsed.textPanelDescription  = field(styleVisualContent, 'textPanelDescription');
      visualParsed.overallMood           = field(styleVisualContent, 'overallMood');
      visualParsed.textBoxPosition       = field(styleVisualContent, 'textBoxPosition');
      visualParsed.textBoxWidthPct       = field(styleVisualContent, 'textBoxWidthPct');
      visualParsed.badgePosition         = field(styleVisualContent, 'badgePosition');
    }

    // ── Parse style OCR: dedicated text extraction ────────────────────────
    interface OcrFacts { headline?: string; body?: string; footer?: string; badge?: string; brand?: string; }
    const ocrParsed: OcrFacts = tryParse<OcrFacts>(styleOcrContent) ?? {};
    if (!ocrParsed.headline && !ocrParsed.body) {
      ocrParsed.headline = field(styleOcrContent, 'headline');
      ocrParsed.body     = field(styleOcrContent, 'body');
      ocrParsed.footer   = field(styleOcrContent, 'footer');
      ocrParsed.badge    = field(styleOcrContent, 'badge');
      ocrParsed.brand    = field(styleOcrContent, 'brand');
    }

    console.log(`[style-transfer] ocr headline="${ocrParsed.headline?.slice(0,50)}" body="${ocrParsed.body?.slice(0,50)}"`);

    // ── Fallback OCR: retry if primary returned empty ─────────────────────
    // Qwen sometimes misses text on complex layered images — retry with simpler prompt
    if (!ocrParsed.headline && !ocrParsed.body && !ocrParsed.badge) {
      console.log(`[style-transfer] OCR empty — retrying with fallback prompt`);
      try {
        const fbAc = new AbortController();
        const fbTimer = setTimeout(() => fbAc.abort(), 20_000);
        const fbContent = await callQwen(yandexKey, folderId, STYLE_OCR_FALLBACK_PROMPT, styleData, fbAc.signal, 600);
        clearTimeout(fbTimer);
        console.log(`[style-transfer] ocr_fallback_raw(200): ${fbContent.slice(0, 200)}`);
        const fbParsed: OcrFacts = tryParse<OcrFacts>(fbContent) ?? {};
        if (!fbParsed.headline && !fbParsed.body) {
          fbParsed.headline = field(fbContent, 'headline');
          fbParsed.body     = field(fbContent, 'body');
        }
        if (fbParsed.headline) ocrParsed.headline = fbParsed.headline;
        if (fbParsed.body)     ocrParsed.body     = fbParsed.body;
        if (fbParsed.footer)   ocrParsed.footer   = fbParsed.footer;
        if (fbParsed.badge)    ocrParsed.badge    = fbParsed.badge;
        if (fbParsed.brand)    ocrParsed.brand    = fbParsed.brand;
        console.log(`[style-transfer] ocr fallback headline="${ocrParsed.headline?.slice(0,50)}"`);
      } catch (e) {
        console.log(`[style-transfer] OCR fallback failed (non-fatal): ${e}`);
      }
    }

    // ── Merge into StyleFacts ─────────────────────────────────────────────
    const styleFacts: StyleFacts = {
      dominantType:         visualParsed.dominantType,
      dominantElement:      visualParsed.dominantElement,
      styleEnvironment:     visualParsed.styleEnvironment,
      backgroundDescription:visualParsed.backgroundDescription,
      lightingDescription:  visualParsed.lightingDescription,
      colorPalette:         visualParsed.colorPalette,
      textBoxPosition:      visualParsed.textBoxPosition,
      textBoxWidthPct:      visualParsed.textBoxWidthPct,
      badgePosition:        visualParsed.badgePosition,
      layoutDescription:    visualParsed.layoutDescription,
      graphicElements:      visualParsed.graphicElements,
      textPanelDescription: visualParsed.textPanelDescription,
      overallMood:          visualParsed.overallMood,
      ocr_headline: ocrParsed.headline,
      ocr_body:     ocrParsed.body,
      ocr_footer:   ocrParsed.footer,
      ocr_badge:    ocrParsed.badge,
      ocr_brand:    ocrParsed.brand,
    };

    // OCR text presence overrides dominantType — dedicated OCR call is ground truth
    if (styleFacts.ocr_headline || styleFacts.ocr_body || styleFacts.ocr_badge) {
      styleFacts.dominantType = 'text_overlay';
    } else if (!styleFacts.dominantType) {
      styleFacts.dominantType = 'background';
    }

    const dominantType    = styleFacts.dominantType || 'background';
    const dominantElement = styleFacts.dominantElement || styleFacts.styleEnvironment || '';
    const styleEnvironment = styleFacts.styleEnvironment || '';

    console.log(`[style-transfer] dominantType=${dominantType} preserve_len=${preserve.length}`);

    // ── Build FLUX instructions from facts ────────────────────────────────
    // NOTE: for text_overlay, userNote text edits are applied client-side via
    // applyUserNoteToText() in StyleTransferPanel — no server-side Qwen step needed.
    const change = buildChangeInstruction(styleFacts);
    const scene  = buildSceneInstruction(styleFacts);

    let fluxPrompt =
      `[PRESERVE] Keep unchanged: ${preserve} ` +
      `[CHANGE] ${change} ` +
      (scene ? `[SCENE] ${scene} ` : '') +
      `[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts.`;

    // userNote goes to FLUX only for non-text-overlay (background/lighting changes)
    if (userNote && dominantType !== 'text_overlay') {
      fluxPrompt += ` [USER] Additional requirement: ${userNote}`;
    }

    console.log(`[style-transfer] fluxPrompt_len=${fluxPrompt.length}`);

    // ── Step 3: FLUX ───────────────────────────────────────────────────────
    const fluxAc = new AbortController();
    const fluxTimer = setTimeout(() => fluxAc.abort(), 55_000);
    const fluxResp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: fluxAc.signal,
      headers: { 'Authorization': `Bearer ${sfKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-Kontext-max',
        prompt: fluxPrompt,
        input_image: sourceData,
        output_format: 'jpeg',
      }),
    });
    clearTimeout(fluxTimer);

    const fluxText = await fluxResp.text();
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

    // Build extractedText object for client Canvas compositing
    const extractedText = (dominantType === 'text_overlay' && (styleFacts.ocr_headline || styleFacts.ocr_body))
      ? {
          headline: styleFacts.ocr_headline || '',
          bodyText: styleFacts.ocr_body || '',
          footerText: styleFacts.ocr_footer || '',
          badgeText: styleFacts.ocr_badge || '',
          badgeColor: styleFacts.ocr_badge_color || '#FF1493',
          brandText: styleFacts.ocr_brand || '',
          textBoxPosition: styleFacts.textBoxPosition || 'center',
          textBoxWidthPct: (fieldNum(styleVisualContent, 'textBoxWidthPct') ?? parseInt(styleFacts.textBoxWidthPct || '75', 10)) || 75,
        }
      : null;

    return Response.json({
      imageUrl: dataUrl ?? resultUrl,
      prompt: fluxPrompt,
      sourceClothing: preserve,
      styleEnvironment,
      dominantElement,
      dominantType,
      extractedText,
    });

  } catch (e) {
    const msg = String(e);
    console.log(`[style-transfer] caught: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
