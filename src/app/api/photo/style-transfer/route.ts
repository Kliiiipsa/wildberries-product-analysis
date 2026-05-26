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

// ── Prompt 2: STYLE image → WHAT TO APPLY (facts only, no instructions) ────
// Qwen describes what it observes. Server builds FLUX instructions from these facts.
const STYLE_PROMPT = `Look at this product/fashion photo and describe what you observe.
Return ONLY valid JSON with ALL flat string fields (no nested objects, no markdown):

{
  "dominantType": "text_overlay",
  "dominantElement": "one sentence: the single most visually striking element in this photo",
  "styleEnvironment": "one sentence: what visual style exists here that could be applied to another photo",
  "backgroundDescription": "describe the background: color, material, type",
  "lightingDescription": "describe the lighting: direction, quality, color temperature",
  "textBoxPosition": "center",
  "textBoxWidthPct": "75",
  "textBoxStyle": "white box with thin grey border and rounded corners",
  "badgePosition": "bottom-left",
  "ocr_headline": "copy the largest boldest text EXACTLY as written",
  "ocr_body": "copy the body paragraph text EXACTLY as written",
  "ocr_footer": "copy any footer or signature text EXACTLY as written",
  "ocr_badge": "copy any badge or label text EXACTLY as written",
  "ocr_badge_color": "#FF1493",
  "ocr_brand": "copy any brand name EXACTLY as written"
}

Rules:
- dominantType must be EXACTLY one of: text_overlay, graphic_badge, background, lighting
- textBoxPosition must be: top, center, or bottom
- If no text overlay found: set ocr_ fields to empty string, textBoxPosition to empty string
- ALL values must be strings (including textBoxWidthPct)
- Do NOT include any nested objects`;

// ── Build FLUX [CHANGE] instruction server-side ────────────────────────────
// Qwen provides facts; we construct the FLUX instruction from those facts.
interface StyleFacts {
  dominantType?: string;
  dominantElement?: string;
  styleEnvironment?: string;
  backgroundDescription?: string;
  lightingDescription?: string;
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

  if (dt === 'text_overlay') {
    const pos = f.textBoxPosition || 'center';
    const w = f.textBoxWidthPct || '75';
    const style = f.textBoxStyle || 'thin light-grey border and rounded corners';
    const badgePos = f.badgePosition || 'bottom-left';
    const badgeColor = f.ocr_badge_color || 'pink';

    let instruction = `Add a completely blank white rectangular frame with ${style}, `
      + `positioned at the ${pos} of the image, occupying approximately ${w}% of image width. `
      + `The frame interior must be PERFECTLY EMPTY — zero text, zero characters, no symbols, just clean white space. `;

    if (f.ocr_badge) {
      instruction += `Also add an empty ${badgeColor} rectangular label shape at the ${badgePos} corner of the image — no text inside it. `;
    }
    if (f.ocr_brand) {
      instruction += `Add brand text area at top-right corner of the image — blank. `;
    }
    return instruction.trim();
  }

  if (dt === 'graphic_badge') {
    return `Apply graphic overlay elements from the reference image: ${f.dominantElement || ''}. Keep clothing unchanged.`;
  }

  if (dt === 'background') {
    const bg = f.backgroundDescription || f.dominantElement || 'similar background';
    return `Replace the background with: ${bg}. Keep the model and clothing perfectly unchanged.`;
  }

  if (dt === 'lighting') {
    const light = f.lightingDescription || f.dominantElement || 'similar lighting';
    return `Apply this lighting treatment: ${light}. Keep everything else unchanged.`;
  }

  // Fallback
  return `Apply this visual style from the reference: ${f.dominantElement || f.styleEnvironment || 'reference style'}. Keep model and clothing unchanged.`;
}

function buildSceneInstruction(f: StyleFacts): string {
  const dt = (f.dominantType || '').toLowerCase();
  if (dt === 'text_overlay') {
    return `Studio photo: model in original outfit, with a clean white rectangular frame overlaid at ${f.textBoxPosition || 'center'} of image, matching the layout style of the reference photo.`;
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

    // ── Step 2: Two Qwen calls in parallel (one image each) ───────────────
    const qwenAc = new AbortController();
    const qwenTimer = setTimeout(() => qwenAc.abort(), 35_000);

    const [sourceContent, styleContent] = await Promise.all([
      callQwen(yandexKey, folderId, SOURCE_PROMPT, sourceData, qwenAc.signal, 500),
      callQwen(yandexKey, folderId, STYLE_PROMPT, styleData, qwenAc.signal, 1000),
    ]);
    clearTimeout(qwenTimer);

    console.log(`[style-transfer] src_len=${sourceContent.length} sty_len=${styleContent.length}`);
    console.log(`[style-transfer] style_raw(300): ${styleContent.slice(0, 300)}`);

    // ── Parse source: preserve ────────────────────────────────────────────
    const srcParsed = tryParse<{ preserve?: string }>(sourceContent);
    const preserve =
      srcParsed?.preserve?.trim() ||
      field(sourceContent, 'preserve') ||
      'all clothing items and accessories from the original photo';

    // ── Parse style: flat facts ───────────────────────────────────────────
    const styleFacts: StyleFacts = tryParse<StyleFacts>(styleContent) ?? {};

    // Fallback: extract each field independently via regex
    if (!styleFacts.dominantType) {
      styleFacts.dominantType      = field(styleContent, 'dominantType');
      styleFacts.dominantElement   = field(styleContent, 'dominantElement');
      styleFacts.styleEnvironment  = field(styleContent, 'styleEnvironment');
      styleFacts.backgroundDescription = field(styleContent, 'backgroundDescription');
      styleFacts.lightingDescription   = field(styleContent, 'lightingDescription');
      styleFacts.textBoxPosition   = field(styleContent, 'textBoxPosition');
      styleFacts.textBoxWidthPct   = field(styleContent, 'textBoxWidthPct');
      styleFacts.textBoxStyle      = field(styleContent, 'textBoxStyle');
      styleFacts.badgePosition     = field(styleContent, 'badgePosition');
      styleFacts.ocr_headline      = field(styleContent, 'ocr_headline');
      styleFacts.ocr_body          = field(styleContent, 'ocr_body');
      styleFacts.ocr_footer        = field(styleContent, 'ocr_footer');
      styleFacts.ocr_badge         = field(styleContent, 'ocr_badge');
      styleFacts.ocr_badge_color   = field(styleContent, 'ocr_badge_color');
      styleFacts.ocr_brand         = field(styleContent, 'ocr_brand');
    }

    // OCR text presence overrides dominantType — if we found text, it IS a text_overlay
    // (Qwen sometimes misclassifies text_overlay as "background" — OCR is ground truth)
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
    const change = buildChangeInstruction(styleFacts);
    const scene  = buildSceneInstruction(styleFacts);

    let fluxPrompt =
      `[PRESERVE] Keep unchanged: ${preserve} ` +
      `[CHANGE] ${change} ` +
      (scene ? `[SCENE] ${scene} ` : '') +
      `[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts.`;

    if (userNote) {
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
          textBoxWidthPct: (fieldNum(styleContent, 'textBoxWidthPct') ?? parseInt(styleFacts.textBoxWidthPct || '75', 10)) || 75,
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
