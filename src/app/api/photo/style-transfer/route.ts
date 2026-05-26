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

// Repair truncated JSON (same pattern as analyze route)
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

// ── Qwen prompt: returns FLAT fields (no big string inside JSON → no parse errors) ──
const STYLE_ANALYSIS_PROMPT = `You receive TWO fashion/product photos for a style transfer task.

IMAGE 1 = SOURCE PHOTO — clothing and model to PRESERVE exactly.
IMAGE 2 = STYLE REFERENCE — find its MOST VISUALLY DOMINANT element to transfer.

━━━ STEP 1: Scan IMAGE 2 for elements (priority order) ━━━
1. TEXT OVERLAYS / INFOGRAPHICS — text blocks, warnings, promotional notices printed ON the photo
2. GRAPHIC ELEMENTS — colored banners, sale badges, price tags, watermarks, borders, frames
3. BACKGROUND — studio, lifestyle location, outdoor scene, interior
4. LIGHTING — color temperature, shadows, mood, film effect

━━━ STEP 2: Pick the SINGLE most visually dominant element ━━━
What makes IMAGE 2 instantly recognizable? That's the element to transfer.

━━━ STEP 3: Return JSON with SEPARATE fields (do NOT put the full prompt in one field) ━━━

Return ONLY valid JSON, no markdown, no explanation:
{
  "dominantElement": "One clear sentence describing the single most striking visual element from IMAGE 2",
  "dominantType": "text_overlay",
  "sourceClothing": "Precise description of IMAGE 1 clothing: exact colors, cut, fabric, accessories, visible body parts and pose",
  "styleEnvironment": "What will be visually applied from IMAGE 2 to IMAGE 1",
  "preserve": "Exhaustive comma-separated list of everything to keep from IMAGE 1 unchanged: all clothing items with exact colors, cut, fabric details, accessories; model pose; visible body parts",
  "change": "Precise English description of what to ADD or CHANGE based on IMAGE 2 dominant element. If text overlay: describe text content in English, font weight, text color, block background color, exact position. If graphic badge: shape, color, text, corner. If background: scene details. If lighting: light quality and color.",
  "scene": "Detailed scene description: model wearing IMAGE 1 outfit combined with the visual treatment from IMAGE 2"
}

For dominantType use EXACTLY ONE of these values (no quotes variations):
- text_overlay  (if IMAGE 2 has text printed over the photo)
- graphic_badge  (if IMAGE 2 has sale badge, logo, watermark, price tag, colored banner)
- background  (if main element is the scene/location/backdrop)
- lighting  (if main element is color grading, mood, film effect)

RULES:
- All values must be valid JSON strings (escape any quotes inside strings with backslash)
- preserve and change must be in English only
- Do NOT translate or summarize — be specific and detailed in every field`;

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
    // ── Step 1: Convert both images to base64 ─────────────────────────────
    console.log('[style-transfer] converting images...');
    const [sourceData, styleData] = await Promise.all([
      toBase64DataUrl(sourceImageUrl),
      toBase64DataUrl(styleImageUrl),
    ]);
    console.log(`[style-transfer] source=${Math.round(sourceData.length / 1024)}KB style=${Math.round(styleData.length / 1024)}KB`);

    // ── Step 2: Qwen analyzes both images ─────────────────────────────────
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
        max_tokens: 1500,
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

    // ── Parse Qwen JSON response ───────────────────────────────────────────
    interface QwenResult {
      dominantElement?: string;
      dominantType?: string;
      sourceClothing?: string;
      styleEnvironment?: string;
      preserve?: string;
      change?: string;
      scene?: string;
    }

    let parsed: QwenResult = {};
    try {
      const clean = content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      // Try to repair truncated JSON
      try {
        const clean = content
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
        parsed = JSON.parse(repairJson(clean));
      } catch {
        // Last resort: extract individual fields via regex
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
        console.log(`[style-transfer] used regex fallback, preserve_len=${parsed.preserve?.length}`);
      }
    }

    // ── Build FLUX prompt from separate fields (avoids JSON escape issues) ─
    const preserve = parsed.preserve?.trim() || '';
    const change = parsed.change?.trim() || '';
    const scene = parsed.scene?.trim() || '';

    if (!preserve || !change) {
      console.log(`[style-transfer] Qwen raw (first 600): ${content.slice(0, 600)}`);
      return Response.json(
        {
          error: `Qwen не смог разобрать фото. Попробуйте более чёткое фото 2 (без размытия). Debug: preserve="${preserve.slice(0, 80)}" change="${change.slice(0, 80)}"`,
        },
        { status: 500 },
      );
    }

    let fluxPrompt =
      `[PRESERVE] Keep unchanged: ${preserve} ` +
      `[CHANGE] ${change} ` +
      (scene ? `[SCENE] ${scene} ` : '') +
      `[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts.`;

    // Append user note
    if (userNote) {
      fluxPrompt += ` [USER] Additional requirement: ${userNote}`;
    }

    console.log(`[style-transfer] dominantType=${parsed.dominantType} prompt_len=${fluxPrompt.length}`);

    // ── Step 3: FLUX generates ─────────────────────────────────────────────
    const ac2 = new AbortController();
    const fluxTimer = setTimeout(() => ac2.abort(), 55_000);
    const fluxResp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: ac2.signal,
      headers: {
        'Authorization': `Bearer ${sfKey}`,
        'Content-Type': 'application/json',
      },
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
      return Response.json(
        { error: `FLUX ${fluxResp.status}: ${fluxText.slice(0, 200)}` },
        { status: 500 },
      );
    }

    const resultUrl = (fluxParsed?.images as Array<{ url: string }>)?.[0]?.url ?? null;
    if (!resultUrl) {
      return Response.json({ error: 'FLUX не вернул URL' }, { status: 500 });
    }

    const dataUrl = await toBase64DataUrl(resultUrl).catch(() => null);
    console.log(`[style-transfer] done, dataUrl=${!!dataUrl}`);

    return Response.json({
      imageUrl: dataUrl ?? resultUrl,
      prompt: fluxPrompt,
      sourceClothing: parsed.sourceClothing ?? '',
      styleEnvironment: parsed.styleEnvironment ?? '',
      dominantElement: parsed.dominantElement ?? '',
      dominantType: parsed.dominantType ?? '',
    });

  } catch (e) {
    const msg = String(e);
    console.log(`[style-transfer] caught: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
