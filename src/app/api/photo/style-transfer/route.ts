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

const STYLE_ANALYSIS_PROMPT = `You receive TWO fashion/product photos for a style transfer task.

IMAGE 1 = SOURCE PHOTO — clothing and model to PRESERVE exactly.
IMAGE 2 = STYLE REFERENCE — find its MOST VISUALLY DOMINANT element to transfer.

━━━ STEP 1: Identify the dominant element in IMAGE 2 ━━━
Priority order:
1. TEXT OVERLAYS / INFOGRAPHICS — any text blocks, warning notices, headlines, body text, badges
2. GRAPHIC ELEMENTS — colored banners, watermarks, borders, frames
3. BACKGROUND — studio, lifestyle location
4. LIGHTING / COLOR GRADE

━━━ STEP 2: If dominant element is TEXT OVERLAY or GRAPHIC BADGE — do full OCR ━━━
Extract EVERY piece of text you can read from IMAGE 2:
- headline: the largest, boldest text (keep original language)
- bodyText: smaller paragraph text below headline (keep original language)
- footerText: small text at the bottom of the text block (keep original language)
- badgeText: text on any badge/label (e.g. "РАСПРОДАЖА", "SALE")
- badgeColor: the color of the badge background (hex if possible, else CSS color name)
- brandText: any brand name visible (e.g. "ESSENTIALS MINNIM")
- textBoxPosition: where the text box sits — "top", "center", or "bottom"
- textBoxWidthPct: estimated width of text box as percentage of image width (50–100)

━━━ STEP 3: Return flat JSON fields ━━━

Return ONLY valid JSON, no markdown:
{
  "dominantElement": "One sentence describing the most visually striking element from IMAGE 2",
  "dominantType": "text_overlay",
  "sourceClothing": "Precise description of IMAGE 1 clothing and model",
  "styleEnvironment": "What will be applied from IMAGE 2",
  "extractedText": {
    "headline": "exact headline text from IMAGE 2 or empty string",
    "bodyText": "exact body text from IMAGE 2 or empty string",
    "footerText": "exact footer text or empty string",
    "badgeText": "badge label text or empty string",
    "badgeColor": "#FF1493",
    "brandText": "brand name or empty string",
    "textBoxPosition": "center",
    "textBoxWidthPct": 75
  },
  "preserve": "Exhaustive English list of everything to keep from IMAGE 1: all clothing items with exact colors, cut, fabric; model pose; visible body parts",
  "change": "For text_overlay: Add a clean white rectangular text frame with thin light-grey border and rounded corners at [textBoxPosition] of image — the frame must be COMPLETELY EMPTY inside with NO text, no characters, no numbers, perfectly blank white interior. Also describe badge: empty [badgeColor] rectangular badge shape at bottom-left corner with no text. For other types: describe the visual change needed.",
  "scene": "Detailed description: model in IMAGE 1 outfit with the visual layout from IMAGE 2 applied"
}

dominantType must be exactly one of: text_overlay, graphic_badge, background, lighting

STRICT RULES:
- All JSON string values must be properly escaped
- preserve and change fields must be in English only
- extractedText fields keep the ORIGINAL language of the text found in IMAGE 2
- If no text overlay found, set extractedText to null`;

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

  const ac = new AbortController();

  try {
    console.log('[style-transfer] converting images...');
    const [sourceData, styleData] = await Promise.all([
      toBase64DataUrl(sourceImageUrl),
      toBase64DataUrl(styleImageUrl),
    ]);

    // ── Qwen: analyze both images, OCR text ────────────────────────────────
    const qwenTimer = setTimeout(() => ac.abort(), 30_000);
    const qwenResp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Authorization': `Api-Key ${yandexKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: `gpt://${folderId}/qwen3.6-35b-a3b/latest`,
        messages: [
          { role: 'system', content: '/nothink' },
          {
            role: 'user',
            content: [
              { type: 'text', text: STYLE_ANALYSIS_PROMPT },
              { type: 'image_url', image_url: { url: sourceData } },
              { type: 'image_url', image_url: { url: styleData } },
            ],
          },
        ],
        max_tokens: 1800,
        temperature: 0.2,
      }),
    });
    clearTimeout(qwenTimer);

    if (!qwenResp.ok) {
      const txt = await qwenResp.text().catch(() => qwenResp.statusText);
      return Response.json({ error: `Qwen API ${qwenResp.status}: ${txt.slice(0, 200)}` }, { status: 500 });
    }

    const qwenData = await qwenResp.json();
    const content: string = qwenData?.choices?.[0]?.message?.content ?? '';
    console.log(`[style-transfer] Qwen content_len=${content.length}`);

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

    interface QwenResult {
      dominantElement?: string;
      dominantType?: string;
      sourceClothing?: string;
      styleEnvironment?: string;
      extractedText?: ExtractedText | null;
      preserve?: string;
      change?: string;
      scene?: string;
    }

    let parsed: QwenResult = {};
    try {
      const clean = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      try {
        const clean = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        parsed = JSON.parse(repairJson(clean));
      } catch {
        const extract = (key: string) => {
          const m = content.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
          return m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : '';
        };
        parsed = {
          dominantElement: extract('dominantElement'),
          dominantType: extract('dominantType'),
          sourceClothing: extract('sourceClothing'),
          styleEnvironment: extract('styleEnvironment'),
          preserve: extract('preserve'),
          change: extract('change'),
          scene: extract('scene'),
        };
        console.log('[style-transfer] used regex fallback');
      }
    }

    const preserve = parsed.preserve?.trim() || '';
    const change = parsed.change?.trim() || '';
    const scene = parsed.scene?.trim() || '';

    if (!preserve || !change) {
      console.log(`[style-transfer] parse failed. raw: ${content.slice(0, 500)}`);
      return Response.json(
        { error: `Не удалось разобрать фото. Попробуйте другой референс. preserve="${preserve.slice(0, 60)}"` },
        { status: 500 },
      );
    }

    // Build FLUX prompt — for text overlay: empty frame, no text inside
    let fluxPrompt =
      `[PRESERVE] Keep unchanged: ${preserve} ` +
      `[CHANGE] ${change} ` +
      (scene ? `[SCENE] ${scene} ` : '') +
      `[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts.`;

    if (userNote) {
      fluxPrompt += ` [USER] Additional requirement: ${userNote}`;
    }

    console.log(`[style-transfer] dominantType=${parsed.dominantType} prompt_len=${fluxPrompt.length}`);

    // ── FLUX: generate ─────────────────────────────────────────────────────
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
      sourceClothing: parsed.sourceClothing ?? '',
      styleEnvironment: parsed.styleEnvironment ?? '',
      dominantElement: parsed.dominantElement ?? '',
      dominantType: parsed.dominantType ?? '',
      // Send extracted text back to client for Canvas compositing
      extractedText: parsed.extractedText ?? null,
    });

  } catch (e) {
    const msg = String(e);
    console.log(`[style-transfer] caught: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
