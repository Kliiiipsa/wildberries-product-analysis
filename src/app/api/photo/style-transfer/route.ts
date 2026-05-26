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
const SOURCE_PROMPT = `Look at this fashion/product photo and describe the clothing in detail.
Return ONLY valid JSON (no markdown):
{
  "preserve": "comma-separated English list: every clothing item with exact color, cut, fabric; accessories; visible body parts and pose"
}
Example: "loose oversized white linen shirt, wide-leg white trousers, leopard turban, black sunglasses, pearl earrings, tan slides"`;

// ── Prompt 2: STYLE → comprehensive analysis (visual + layout + text) ─────────
const STYLE_ANALYSIS_PROMPT = `Analyze this product/fashion photo comprehensively for style transfer.
Return ONLY valid JSON (no markdown, no nested objects, all values are plain strings):

{
  "dominantType": "text_overlay",
  "visualBackground": "exact background: specific colors, gradient direction, texture, atmosphere, setting, props",
  "visualLighting": "lighting: direction, quality, color temperature, shadows",
  "visualColorPalette": "3-5 specific color names (e.g. warm amber, ivory, charcoal)",
  "visualMood": "overall aesthetic in one sentence (e.g. luxury editorial infographic, clean minimalist)",
  "layoutType": "right-panel",
  "layoutPanelSide": "right",
  "layoutPanelWidthPct": "45",
  "layoutPanelColor": "#FFFFFF",
  "layoutPanelOpacity": "0.95",
  "textHeadline": "exact main title or heading text",
  "textSubheadline": "exact subtitle text",
  "textFeatures": "feature 1 | feature 2 | feature 3",
  "textSizes": "S | M | L",
  "textFooter": "exact footer or signature text",
  "textBrand": "exact brand or company name"
}

RULES:
- dominantType: "text_overlay" if ANY text present, "background" if zero text, "lighting" if special lighting only
- layoutType: "right-panel" (text right side), "left-panel" (text left), "center-overlay" (centered text box), "bottom-panel" (text at bottom)
- layoutPanelSide: "right", "left", "center", "bottom"
- layoutPanelWidthPct: for panels 30–55, for center-overlay 60–85
- Copy ALL text EXACTLY character by character — Russian Cyrillic text is expected
- textFeatures: separate features with " | "
- textSizes: separate sizes with " | "
- Set "" for absent fields`;

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

interface StyleFacts {
  dominantType?: string;
  visualBackground?: string;
  visualLighting?: string;
  visualColorPalette?: string;
  visualMood?: string;
  layoutType?: string;
  layoutPanelSide?: string;
  layoutPanelWidthPct?: string;
  layoutPanelColor?: string;
  layoutPanelOpacity?: string;
  textHeadline?: string;
  textSubheadline?: string;
  textFeatures?: string;
  textSizes?: string;
  textFooter?: string;
  textBrand?: string;
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

function buildFluxPrompt(preserve: string, f: StyleFacts, userNote: string): string {
  const visualDesc = [
    f.visualBackground,
    f.visualLighting,
    f.visualColorPalette ? `Color palette: ${f.visualColorPalette}` : '',
    f.visualMood,
  ].filter(Boolean).join('. ');

  let prompt =
    `[PRESERVE] Keep EXACTLY unchanged: ${preserve} ` +
    `[CHANGE] Apply the complete visual style from the reference image to this photo: ${visualDesc || 'match the reference visual style and atmosphere'}. ` +
    `CRITICAL RULE: Do NOT generate ANY text, letters, words, numbers, labels, symbols, or typographic elements on the image. ` +
    `The result must be a completely text-free clean photograph. ` +
    `[QUALITY] Professional fashion photography, Canon EOS R5, 50mm f/1.8, natural light, no AI artifacts.`;

  if (userNote && f.dominantType !== 'text_overlay') {
    prompt += ` [USER] ${userNote}`;
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

    // ── Step 2: Two parallel Qwen calls ───────────────────────────────────
    const qwenAc    = new AbortController();
    const qwenTimer = setTimeout(() => qwenAc.abort(), 40_000);

    const [sourceContent, styleContent] = await Promise.all([
      callQwen(yandexKey, folderId, SOURCE_PROMPT,         sourceData, qwenAc.signal, 500),
      callQwen(yandexKey, folderId, STYLE_ANALYSIS_PROMPT, styleData,  qwenAc.signal, 1200),
    ]);
    clearTimeout(qwenTimer);

    console.log(`[style-transfer] src_len=${sourceContent.length} sty_len=${styleContent.length}`);
    console.log(`[style-transfer] sty_raw(300): ${styleContent.slice(0, 300)}`);

    // ── Parse source: clothing to preserve ───────────────────────────────
    const srcParsed = tryParse<{ preserve?: string }>(sourceContent);
    const preserve  =
      srcParsed?.preserve?.trim() ||
      field(sourceContent, 'preserve') ||
      'all clothing items and accessories from the original photo';

    // ── Parse style: comprehensive analysis ───────────────────────────────
    const styleFacts: StyleFacts = tryParse<StyleFacts>(styleContent) ?? {};

    // Regex fallback for each field
    const styleFields: (keyof StyleFacts)[] = [
      'dominantType', 'visualBackground', 'visualLighting', 'visualColorPalette', 'visualMood',
      'layoutType', 'layoutPanelSide', 'layoutPanelWidthPct', 'layoutPanelColor', 'layoutPanelOpacity',
      'textHeadline', 'textSubheadline', 'textFeatures', 'textSizes', 'textFooter', 'textBrand',
    ];
    if (!styleFacts.dominantType) {
      for (const k of styleFields) {
        if (!styleFacts[k]) (styleFacts as Record<string, string>)[k] = field(styleContent, k);
      }
    }

    // Override dominantType based on text presence (OCR is ground truth)
    const hasText = !!(styleFacts.textHeadline || styleFacts.textFeatures || styleFacts.textBrand);
    if (hasText) {
      styleFacts.dominantType = 'text_overlay';
    } else if (!styleFacts.dominantType) {
      styleFacts.dominantType = 'background';
    }

    const dominantType = styleFacts.dominantType || 'background';
    console.log(`[style-transfer] dominantType=${dominantType} headline="${styleFacts.textHeadline?.slice(0,40)}" features="${styleFacts.textFeatures?.slice(0,60)}"`);

    // ── Build FLUX prompt — visual only, NO TEXT ──────────────────────────
    const fluxPrompt = buildFluxPrompt(preserve, styleFacts, userNote);
    console.log(`[style-transfer] fluxPrompt_len=${fluxPrompt.length}`);
    console.log(`[style-transfer] fluxPrompt(200): ${fluxPrompt.slice(0, 200)}`);

    // ── Step 3: FLUX — generate visual style only ─────────────────────────
    const fluxAc    = new AbortController();
    const fluxTimer = setTimeout(() => fluxAc.abort(), 60_000);
    const fluxResp  = await fetch('https://api.siliconflow.com/v1/images/generations', {
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

    // ── Build layoutData for Canvas compositing ───────────────────────────
    const layoutData: LayoutData | null = (dominantType === 'text_overlay') ? {
      panelSide:     styleFacts.layoutPanelSide     || 'right',
      panelWidthPct: parseInt(styleFacts.layoutPanelWidthPct || '45', 10) || 45,
      panelColor:    styleFacts.layoutPanelColor     || '#FFFFFF',
      panelOpacity:  parseFloat(styleFacts.layoutPanelOpacity || '0.95') || 0.95,
      headline:      styleFacts.textHeadline         || '',
      subheadline:   styleFacts.textSubheadline      || '',
      features:      (styleFacts.textFeatures || '').split('|').map(s => s.trim()).filter(Boolean),
      sizes:         (styleFacts.textSizes    || '').split('|').map(s => s.trim()).filter(Boolean),
      footer:        styleFacts.textFooter           || '',
      brand:         styleFacts.textBrand            || '',
    } : null;

    return Response.json({
      imageUrl:    dataUrl ?? resultUrl,
      prompt:      fluxPrompt,
      sourceClothing: preserve,
      dominantType,
      visualMood:  styleFacts.visualMood || '',
      layoutData,
    });

  } catch (e) {
    const msg = String(e);
    console.log(`[style-transfer] caught: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
