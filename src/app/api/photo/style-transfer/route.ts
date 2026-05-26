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

const STYLE_ANALYSIS_PROMPT = `You receive TWO fashion/product photos for a creative style transfer task.

IMAGE 1 = SOURCE PHOTO — the clothing and model to PRESERVE exactly as-is.
IMAGE 2 = STYLE REFERENCE — your job is to identify the MOST VISUALLY DOMINANT element from this photo and apply it to IMAGE 1.

━━━ STEP 1: SCAN IMAGE 2 for visual elements, ranked by eye-catching impact ━━━
Look for these in order of visual priority:
1. TEXT OVERLAYS / INFOGRAPHICS — any text blocks, warning notices, promotional text, brand names printed ON the photo
2. GRAPHIC OVERLAYS — colored banners, sale badges, price tags, watermarks, frames, borders
3. BACKGROUND ENVIRONMENT — studio backdrop, lifestyle location, outdoor scene, interior
4. LIGHTING & COLOR GRADING — color temperature, shadows, mood, film effect

━━━ STEP 2: IDENTIFY the TOP dominant element ━━━
What single visual treatment makes IMAGE 2 instantly recognizable?
- If it's a TEXT OVERLAY: describe exact text content (translate to English if needed), font weight (bold/light), text color, background color of the block, exact position on the image (top/center/bottom, left/right)
- If it's a GRAPHIC BADGE: describe shape, color, text, position
- If it's ENVIRONMENT: describe location, lighting, background

━━━ STEP 3: BUILD the FLUX prompt ━━━
Generate a prompt that:
1. PRESERVES ALL clothing/accessories from IMAGE 1 (colors, cut, fabric, every detail)
2. APPLIES the dominant visual treatment from IMAGE 2 to IMAGE 1

Return ONLY valid JSON — no markdown:
{
  "dominantElement": "One sentence describing the single most visually striking element from IMAGE 2",
  "dominantType": "text_overlay" | "graphic_badge" | "background" | "lighting",
  "sourceClothing": "Brief description of IMAGE 1 subject and clothing",
  "styleEnvironment": "What visual treatment will be applied",
  "fluxPrompt": "..."
}

fluxPrompt EXACT structure:
[PRESERVE] Keep unchanged: [exhaustive list — every clothing item from IMAGE 1 with exact color, cut, fabric, visible accessories, body parts, pose]
[CHANGE] [If dominantType is text_overlay or graphic_badge: "Add [describe the overlay element precisely — text content in English, font style, block color, position on image, any badges or graphic elements exactly as seen in IMAGE 2"]. [If dominantType is background: "Replace background with [detailed environment from IMAGE 2]"]. [If dominantType is lighting: "Apply [specific lighting treatment from IMAGE 2]"]. Never change clothing.
[SCENE] [Detailed visual description of the combined result — model in original outfit + applied treatment from IMAGE 2]
[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts.

STRICT RULES:
- fluxPrompt in English ONLY (translate any Cyrillic text you find into English for the prompt)
- [PRESERVE] must list EVERY clothing detail from IMAGE 1 — be exhaustive
- Focus the [CHANGE] section on the SINGLE MOST DOMINANT element from IMAGE 2
- Do NOT change the model, face, or clothing from IMAGE 1
- Forbidden words: photorealistic, ultra-sharp, 8K, hyperdetailed, professional studio lighting`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sourceImageUrl: string = body?.sourceImageUrl ?? '';
  const styleImageUrl: string = body?.styleImageUrl ?? '';
  const userNote: string = (body?.userNote ?? '').trim();

  if (!sourceImageUrl || !styleImageUrl) {
    return Response.json(
      { error: 'sourceImageUrl и styleImageUrl обязательны' },
      { status: 400 },
    );
  }

  const yandexKey = (process.env.YANDEX_API_KEY ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();
  const sfKey = (process.env.SILICONFLOW_API_KEY ?? '').trim();

  if (!yandexKey) return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });
  if (!sfKey) return Response.json({ error: 'SILICONFLOW_API_KEY не задан' }, { status: 500 });

  const ac = new AbortController();

  try {
    // ── Step 1: Convert both images to base64 in parallel ──────────────────
    console.log('[style-transfer] converting images...');
    const [sourceData, styleData] = await Promise.all([
      toBase64DataUrl(sourceImageUrl),
      toBase64DataUrl(styleImageUrl),
    ]);
    console.log(`[style-transfer] source=${Math.round(sourceData.length / 1024)}KB style=${Math.round(styleData.length / 1024)}KB`);

    // ── Step 2: Qwen analyzes both images → FLUX prompt ────────────────────
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
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });
    clearTimeout(qwenTimer);

    if (!qwenResp.ok) {
      const txt = await qwenResp.text().catch(() => qwenResp.statusText);
      return Response.json({ error: `Qwen API ${qwenResp.status}: ${txt.slice(0, 200)}` }, { status: 500 });
    }

    const qwenData = await qwenResp.json();
    const content: string = qwenData?.choices?.[0]?.message?.content ?? '';
    console.log(`[style-transfer] Qwen response len=${content.length}`);

    let fluxPrompt = '';
    let sourceClothing = '';
    let styleEnvironment = '';
    let dominantElement = '';
    let dominantType = '';

    try {
      const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(clean);
      fluxPrompt = parsed.fluxPrompt ?? '';
      sourceClothing = parsed.sourceClothing ?? '';
      styleEnvironment = parsed.styleEnvironment ?? '';
      dominantElement = parsed.dominantElement ?? '';
      dominantType = parsed.dominantType ?? '';
    } catch {
      const match = content.match(/"fluxPrompt"\s*:\s*"([\s\S]*?)"\s*[,}]/);
      if (match) fluxPrompt = match[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
    }

    if (!fluxPrompt) {
      console.log(`[style-transfer] Qwen raw: ${content.slice(0, 400)}`);
      return Response.json(
        { error: 'Не удалось сгенерировать промпт. Попробуйте другие фотографии.' },
        { status: 500 },
      );
    }

    // ── Append user note to prompt if provided ────────────────────────────
    if (userNote) {
      fluxPrompt = fluxPrompt + ` [USER] Additional requirement: ${userNote}`;
    }

    console.log(`[style-transfer] dominantType=${dominantType} fluxPrompt_len=${fluxPrompt.length}`);

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
    console.log(`[style-transfer] done, dataUrl present=${!!dataUrl}`);

    return Response.json({
      imageUrl: dataUrl ?? resultUrl,
      prompt: fluxPrompt,
      sourceClothing,
      styleEnvironment,
      dominantElement,
      dominantType,
    });

  } catch (e) {
    const msg = String(e);
    console.log(`[style-transfer] caught: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
