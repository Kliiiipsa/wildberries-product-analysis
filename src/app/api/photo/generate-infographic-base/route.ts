import { NextRequest } from 'next/server';

export const maxDuration = 60;

/**
 * Converts a URL or data: URL to a base64 data URL.
 * Downloads server-side to avoid CORS issues with SiliconFlow CDN.
 */
async function toBase64DataUrl(url: string): Promise<string> {
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

/**
 * Minimal safety suffix — only reinforces pose preservation and no text.
 * Does NOT force composition percentages or solid-colour panels.
 * The fluxPrompt from analysis already handles composition naturally.
 */
const INFOGRAPHIC_SUFFIX =
  ' Preserve the original photo atmosphere, lighting character, colour grade, and mood completely.' +
  ' The model\'s pose must remain pixel-perfect identical to the input — do not change it.' +
  ' The extended background zone MUST maintain the original photo\'s exposure and brightness — do NOT darken it, do NOT add gradients, vignettes, or shadow overlays.' +
  ' The text zone must be naturally bright and airy, matching the original illumination.' +
  ' No new objects introduced. No artificial empty zones. No text, no logos, no watermarks.';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const fluxPrompt: string = body?.fluxPrompt ?? '';
  const imageUrl: string = body?.imageUrl ?? '';

  if (!fluxPrompt || !imageUrl) {
    return Response.json(
      { error: 'fluxPrompt и imageUrl обязательны' },
      { status: 400 },
    );
  }

  const apiKey = (process.env.SILICONFLOW_API_KEY ?? '').trim();
  if (!apiKey) {
    return Response.json({ error: 'SILICONFLOW_API_KEY не задан' }, { status: 500 });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55_000);

  try {
    // Convert image to base64 (accepts existing data: URL or remote URL)
    const imageData = imageUrl.startsWith('data:')
      ? imageUrl
      : await toBase64DataUrl(imageUrl);

    // Append minimal safety suffix (pose + no-text reinforcement)
    const fullPrompt = fluxPrompt + INFOGRAPHIC_SUFFIX;

    console.log(`[infographic-base] FLUX prompt_len=${fullPrompt.length}`);

    const resp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-Kontext-pro',
        prompt: fullPrompt,
        input_image: imageData,
        output_format: 'jpeg',
      }),
    });
    clearTimeout(timer);

    const respText = await resp.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(respText); } catch { /* ok */ }

    const inference = String((parsed?.timings as Record<string, unknown>)?.inference ?? '?');
    console.log(`[infographic-base] FLUX status=${resp.status} inference=${inference}s`);

    if (!resp.ok) {
      console.log(`[infographic-base] error body: ${respText.slice(0, 400)}`);
      return Response.json(
        { error: `FLUX ${resp.status}: ${respText.slice(0, 200)}` },
        { status: 500 },
      );
    }

    const url = (parsed?.images as Array<{ url: string }>)?.[0]?.url ?? null;
    if (!url) {
      return Response.json({ error: `FLUX не вернул URL: ${respText.slice(0, 200)}` }, { status: 500 });
    }

    // Download result server-side → return data URL (avoids client CORS 403)
    const dataUrl = await toBase64DataUrl(url).catch(() => null);
    console.log(`[infographic-base] done, dataUrl present=${!!dataUrl}`);

    return Response.json({ imageUrl: dataUrl ?? url });
  } catch (e) {
    clearTimeout(timer);
    const msg = String(e);
    console.log(`[infographic-base] caught: ${msg}`);
    return Response.json({ error: msg }, { status: 500 });
  }
}
