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

function parseJson<T>(content: string): T | null {
  const clean = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean) as T; } catch { /* */ }
  try { return JSON.parse(repairJson(clean)) as T; } catch { /* */ }
  return null;
}

function extractField(content: string, key: string): string {
  const m = content.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '';
}

// ── Prompt 1: analyze SOURCE image → what to PRESERVE ──────────────────────
const SOURCE_PROMPT = `Analyze this fashion/product photo carefully.
List EVERY visible clothing item and accessory with maximum detail in English.

Return ONLY valid JSON (no markdown, no explanation):
{
  "preserve": "Exhaustive comma-separated English list: all clothing items with exact color, cut, fabric details, buttons, drawstrings, pockets; visible accessories; body parts (hands/legs/tattoos/pose direction)"
}

Be specific. Example: "loose oversized white linen long-sleeve shirt open collar, wide-leg high-waist white linen trousers, leopard-print turban headband, black oval sunglasses, pearl stud earrings, tan leather flat slides, black sports bra visible under open shirt, right hand on hip"`;

// ── Prompt 2: analyze STYLE image → what DOMINANT element to apply ──────────
const STYLE_PROMPT = `Analyze this product/fashion photo. Find its MOST VISUALLY DOMINANT element.

Priority order (check in this order, stop at first match):
1. TEXT OVERLAYS / INFOGRAPHICS — any text block, warning notice, headline printed ON the photo
2. GRAPHIC BADGES — sale labels, watermarks, price tags, colored banners, frames
3. BACKGROUND — studio backdrop, lifestyle location, outdoor scene
4. LIGHTING / COLOR GRADE — color temperature, mood, film effect

If TEXT OVERLAY found: perform full OCR of every text element visible.

Return ONLY valid JSON (no markdown):
{
  "dominantType": "text_overlay",
  "dominantElement": "One sentence: the most visually striking element in this photo",
  "styleEnvironment": "What visual treatment will be transferred to another photo",
  "change": "English description for FLUX: For text_overlay → Add empty white rectangular frame with thin light-grey border and rounded corners at [center/top/bottom] of image — COMPLETELY BLANK inside, zero text, zero characters. Also note badge: add empty [color] rectangle at [corner] with no text. For background → Replace background with [scene]. For lighting → Apply [light treatment].",
  "scene": "Describe the final combined result: model in original outfit + this visual treatment applied",
  "extractedText": {
    "headline": "largest boldest text from photo in original language",
    "bodyText": "full paragraph/body text in original language",
    "footerText": "small footer or signature text in original language",
    "badgeText": "badge or label text in original language",
    "badgeColor": "#FF1493",
    "brandText": "brand name if visible",
    "textBoxPosition": "center",
    "textBoxWidthPct": 75
  }
}

dominantType must be exactly one of: text_overlay, graphic_badge, background, lighting
If no text overlay exists: set extractedText to null`;

interface ExtractedText {
  headline?: string;
  bodyText?: string;
  footerText?: string;
  badgeText?: string;
  badgeColor?: string;
  brandText?: string;
  textBoxPosition?: string;
  textBoxWidthPct?: number;
}

interface SourceResult {
  preserve?: string;
}

interface StyleResult {
  dominantType?: string;
  dominantElement?: string;
  styleEnvironment?: string;
  change?: string;
  scene?: string;
  extractedText?: ExtractedText | null;
}

async function callQwen(
  apiKey: string,
  folderId: string,
  prompt: string,
  imageData: string,
  signal: AbortSignal,
  maxTokens = 1200,
): Promise<string> {
  const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Api-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
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
      temperature: 0.2,
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
    // ── Step 1: Convert both images in parallel ────────────────────────────
    console.log('[style-transfer] converting images...');
    const [sourceData, styleData] = await Promise.all([
      toBase64DataUrl(sourceImageUrl),
      toBase64DataUrl(styleImageUrl),
    ]);
    console.log(`[style-transfer] src=${Math.round(sourceData.length / 1024)}KB sty=${Math.round(styleData.length / 1024)}KB`);

    // ── Step 2: Two Qwen calls in parallel (one image each) ───────────────
    // Yandex API reliably handles one image per request.
    // Running in parallel: ~15-25s total instead of ~40s sequential.
    console.log('[style-transfer] calling Qwen x2 in parallel...');
    const qwenAc = new AbortController();
    const qwenTimer = setTimeout(() => qwenAc.abort(), 35_000);

    const [sourceContent, styleContent] = await Promise.all([
      callQwen(yandexKey, folderId, SOURCE_PROMPT, sourceData, qwenAc.signal, 600),
      callQwen(yandexKey, folderId, STYLE_PROMPT, styleData, qwenAc.signal, 1400),
    ]);
    clearTimeout(qwenTimer);

    console.log(`[style-transfer] source_len=${sourceContent.length} style_len=${styleContent.length}`);

    // ── Parse source result ────────────────────────────────────────────────
    const sourceParsed = parseJson<SourceResult>(sourceContent);
    const preserve =
      sourceParsed?.preserve?.trim() ||
      extractField(sourceContent, 'preserve') ||
      'all clothing items and accessories from the original photo';

    // ── Parse style result ─────────────────────────────────────────────────
    const styleParsed = parseJson<StyleResult>(styleContent);
    const change =
      styleParsed?.change?.trim() ||
      extractField(styleContent, 'change') ||
      '';
    const scene = styleParsed?.scene?.trim() || extractField(styleContent, 'scene') || '';
    const dominantType = styleParsed?.dominantType || extractField(styleContent, 'dominantType') || '';
    const dominantElement = styleParsed?.dominantElement || extractField(styleContent, 'dominantElement') || '';
    const styleEnvironment = styleParsed?.styleEnvironment || extractField(styleContent, 'styleEnvironment') || '';
    const extractedText: ExtractedText | null = styleParsed?.extractedText ?? null;

    console.log(`[style-transfer] preserve_len=${preserve.length} change_len=${change.length} dominantType=${dominantType}`);

    if (!change) {
      console.log(`[style-transfer] style raw: ${styleContent.slice(0, 500)}`);
      return Response.json(
        { error: `Не удалось разобрать стиль референса. Попробуйте другое фото 2. (change="${extractField(styleContent, 'change').slice(0, 60)}")` },
        { status: 500 },
      );
    }

    // ── Build FLUX prompt ──────────────────────────────────────────────────
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
    const ac2 = new AbortController();
    const fluxTimer = setTimeout(() => ac2.abort(), 55_000);
    const fluxResp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: ac2.signal,
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
