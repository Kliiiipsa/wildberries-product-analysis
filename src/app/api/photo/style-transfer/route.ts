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

// ── Prompt 2a: STYLE image → visual classification + atmosphere ──────────────
const STYLE_VISUAL_PROMPT = `Analyze this product/fashion photo and classify its visual style.
Return ONLY valid JSON (no markdown, no nested objects):

{
  "dominantType": "text_overlay",
  "dominantElement": "one sentence: the single most striking visual element",
  "styleEnvironment": "one sentence: overall visual style/mood that could be applied to another photo",
  "backgroundDescription": "SPECIFIC background: exact colors (e.g. warm golden-orange gradient), texture, props, atmosphere, any decorative elements",
  "lightingDescription": "lighting direction, quality, color temperature",
  "colorPalette": "2-4 dominant colors in the image, comma-separated",
  "textBoxPosition": "center",
  "textBoxWidthPct": "65",
  "textBoxStyle": "semi-transparent white box with soft shadow and rounded corners",
  "badgePosition": "bottom-right"
}

STRICT RULES for dominantType:
- "text_overlay": ANY image with visible text — notices, product descriptions, infographics, feature lists, size charts, titles, labels, captions — even if text is stylized, italic, or decorative
- "background": clean background/setting with ZERO significant text
- "lighting": special lighting is the ONLY main feature, ZERO significant text
When in doubt — choose "text_overlay".
ALL values must be plain strings.`;

// ── Prompt 2b: STYLE image → OCR only (dedicated text extraction) ────────────
const STYLE_OCR_PROMPT = `You are an expert OCR engine. Extract EVERY word of text visible in this image.

CRITICAL: This may include stylized, italic, decorative, handwritten-looking, or artistic text. Read ALL of it.
Look at: large titles, product feature lists, size charts, arrows with labels, brand names, any captions.

Return ONLY valid JSON (no markdown):
{
  "headline": "largest/most prominent text — copy word for word",
  "body": "ALL remaining text items joined with space — product features, descriptions, labels",
  "footer": "any footer, signature, or closing text",
  "badge": "any badge, tag, or label text",
  "brand": "brand or company name"
}

Rules:
- Copy text EXACTLY, character by character — no paraphrasing
- Include Russian/Cyrillic text — it is expected
- If ANY text is visible in the image, headline OR body MUST be non-empty
- Set "" only if truly no text exists for that field`;

// Fallback OCR prompt used if primary returns all empty
const STYLE_OCR_FALLBACK_PROMPT = `List every word of Russian text visible in this image, from top to bottom.
Return ONLY valid JSON:
{
  "headline": "first/largest text block",
  "body": "all other text combined",
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
  textBoxPosition?: string;
  textBoxWidthPct?: string;
  textBoxStyle?: string;
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

  // Rich background phrase — used across multiple types
  const bgPhrase = [f.backgroundDescription, f.colorPalette ? `color palette: ${f.colorPalette}` : '']
    .filter(Boolean).join(', ');

  if (dt === 'text_overlay') {
    const pos   = f.textBoxPosition || 'center';
    const w     = f.textBoxWidthPct || '65';
    const style = f.textBoxStyle    || 'semi-transparent white box with soft shadow and rounded corners';
    const badgePos   = f.badgePosition   || 'bottom-right';
    const badgeColor = f.ocr_badge_color || 'pink';

    // Apply background FIRST, then add empty text frame
    let instruction = '';
    if (bgPhrase) {
      instruction += `Apply this background and atmosphere: ${bgPhrase}. `;
    }
    instruction +=
      `Add a completely blank white rectangular frame with ${style}, `
      + `positioned at the ${pos} of the image, occupying approximately ${w}% of image width. `
      + `The frame interior must be PERFECTLY EMPTY — zero text, zero characters, no symbols, just clean white space. `;

    if (f.ocr_badge) {
      instruction += `Also add an empty ${badgeColor} rectangular label at the ${badgePos} corner — no text. `;
    }
    return instruction.trim();
  }

  if (dt === 'graphic_badge') {
    return `Apply graphic overlay elements from the reference image: ${f.dominantElement || ''}. Keep clothing unchanged.`;
  }

  if (dt === 'background') {
    const bg = bgPhrase || f.dominantElement || f.styleEnvironment || '';
    if (!bg || bg.length < 8) {
      return `Apply the visual style and atmosphere from the reference image. Keep the model and clothing perfectly unchanged.`;
    }
    return `Replace the background with: ${bg}. Keep the model and clothing perfectly unchanged.`;
  }

  if (dt === 'lighting') {
    const light = f.lightingDescription || f.dominantElement || 'similar lighting';
    return `Apply this lighting: ${light}. Keep everything else unchanged.`;
  }

  // Fallback
  const fallback = bgPhrase || f.dominantElement || f.styleEnvironment || 'reference visual style';
  return `Apply this visual style: ${fallback}. Keep model and clothing unchanged.`;
}

function buildSceneInstruction(f: StyleFacts): string {
  const dt = (f.dominantType || '').toLowerCase();
  if (dt === 'text_overlay') {
    const bg = f.backgroundDescription ? ` Background: ${f.backgroundDescription}.` : '';
    return `Product photo: model in original outfit with clean white text frame overlaid at ${f.textBoxPosition || 'center'} of image.${bg}`;
  }
  if (dt === 'background') {
    return f.backgroundDescription || '';
  }
  return f.styleEnvironment || '';
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
      textBoxPosition?: string; textBoxWidthPct?: string;
      textBoxStyle?: string; badgePosition?: string;
    }
    const visualParsed: VisualFacts = tryParse<VisualFacts>(styleVisualContent) ?? {};
    if (!visualParsed.dominantType) {
      visualParsed.dominantType         = field(styleVisualContent, 'dominantType');
      visualParsed.dominantElement      = field(styleVisualContent, 'dominantElement');
      visualParsed.styleEnvironment     = field(styleVisualContent, 'styleEnvironment');
      visualParsed.backgroundDescription= field(styleVisualContent, 'backgroundDescription');
      visualParsed.lightingDescription  = field(styleVisualContent, 'lightingDescription');
      visualParsed.colorPalette         = field(styleVisualContent, 'colorPalette');
      visualParsed.textBoxPosition      = field(styleVisualContent, 'textBoxPosition');
      visualParsed.textBoxWidthPct      = field(styleVisualContent, 'textBoxWidthPct');
      visualParsed.textBoxStyle         = field(styleVisualContent, 'textBoxStyle');
      visualParsed.badgePosition        = field(styleVisualContent, 'badgePosition');
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
      textBoxStyle:         visualParsed.textBoxStyle,
      badgePosition:        visualParsed.badgePosition,
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
