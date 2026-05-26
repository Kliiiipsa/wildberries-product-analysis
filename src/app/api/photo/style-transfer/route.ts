import { NextRequest } from 'next/server';

export const maxDuration = 120;

/**
 * Converts a URL or data: URL to a base64 JPEG data URL.
 * Downloads server-side to avoid CORS issues.
 */
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

const STYLE_ANALYSIS_PROMPT = `You receive TWO product/fashion photos for a style transfer task.

IMAGE 1 = SOURCE PHOTO — the product/clothing photo that will be transformed.
IMAGE 2 = STYLE REFERENCE — the photo whose visual environment, lighting, background and atmosphere must be adopted.

Your job: write a FLUX Kontext image-to-image prompt that:
1. PRESERVES every detail of the clothing/product from IMAGE 1 exactly (colors, cut, fabric, accessories, model pose)
2. REPLACES the visual environment with the style from IMAGE 2 (background, lighting, color palette, atmosphere, depth of field)

Return ONLY valid JSON — no markdown, no explanation:
{
  "sourceClothing": "brief description of IMAGE 1 clothing/subject",
  "styleEnvironment": "brief description of IMAGE 2 visual style/environment",
  "fluxPrompt": "[PRESERVE]...[CHANGE]...[SCENE]...[QUALITY]..."
}

The fluxPrompt MUST follow this EXACT 4-part structure:

[PRESERVE] Keep unchanged: [list ALL clothing from IMAGE 1 with precise detail — exact color names, cut type, fabric texture, drawstrings, buttons, lace, pockets, all visible accessories; also list body parts visible — hands, legs, tattoos, pose direction]
[CHANGE] Apply new visual environment inspired by IMAGE 2: [describe the specific background type, overall lighting direction and quality from IMAGE 2, dominant color palette, atmosphere — do NOT change the model or clothing]
[SCENE] [Precise environment matching IMAGE 2: background material and color with hex-like description, light source angle and color temperature, shadow direction, depth of field, atmosphere details — must be specific enough for FLUX to recreate the mood]
[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts.

STRICT RULES:
- fluxPrompt in English ONLY — no Cyrillic
- [PRESERVE] must be exhaustive — list every clothing detail you can see in IMAGE 1
- [CHANGE] must describe ONLY the environmental/style change — never touch clothing
- [SCENE] must capture the essence of IMAGE 2's visual environment
- Do NOT swap the model/person
- Do NOT add or remove any clothing
- Do NOT use forbidden words: photorealistic, ultra-sharp, 8K, hyperdetailed, professional studio lighting`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const sourceImageUrl: string = body?.sourceImageUrl ?? '';
  const styleImageUrl: string = body?.styleImageUrl ?? '';

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
    console.log('[style-transfer] converting images to base64...');
    const [sourceData, styleData] = await Promise.all([
      toBase64DataUrl(sourceImageUrl),
      toBase64DataUrl(styleImageUrl),
    ]);
    console.log(`[style-transfer] source=${Math.round(sourceData.length / 1024)}KB style=${Math.round(styleData.length / 1024)}KB`);

    // ── Step 2: Qwen analyzes both images → generates FLUX prompt ──────────
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

    // Parse fluxPrompt from Qwen JSON response
    let fluxPrompt = '';
    let sourceClothing = '';
    let styleEnvironment = '';
    try {
      const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(clean);
      fluxPrompt = parsed.fluxPrompt ?? '';
      sourceClothing = parsed.sourceClothing ?? '';
      styleEnvironment = parsed.styleEnvironment ?? '';
    } catch {
      // Fallback: extract fluxPrompt via regex if JSON is malformed
      const match = content.match(/"fluxPrompt"\s*:\s*"([\s\S]*?)"\s*[,}]/);
      if (match) {
        fluxPrompt = match[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
      }
    }

    if (!fluxPrompt) {
      console.log(`[style-transfer] Qwen raw: ${content.slice(0, 400)}`);
      return Response.json(
        { error: 'Не удалось сгенерировать промпт. Попробуйте другие фотографии.' },
        { status: 500 },
      );
    }
    console.log(`[style-transfer] fluxPrompt_len=${fluxPrompt.length}`);

    // ── Step 3: FLUX applies style ─────────────────────────────────────────
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

    // ── Step 4: Download result server-side → data URL (avoids CORS 403) ──
    const dataUrl = await toBase64DataUrl(resultUrl).catch(() => null);
    console.log(`[style-transfer] done, dataUrl present=${!!dataUrl}`);

    return Response.json({
      imageUrl: dataUrl ?? resultUrl,
      prompt: fluxPrompt,
      sourceClothing,
      styleEnvironment,
    });

  } catch (e) {
    const msg = String(e);
    console.log(`[style-transfer] caught: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
