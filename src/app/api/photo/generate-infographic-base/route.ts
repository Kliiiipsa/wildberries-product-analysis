import { NextRequest } from 'next/server';
import { fal } from '@fal-ai/client';

export const maxDuration = 60;

/**
 * fal.ai image-editing model used to generate the clean text-free base.
 * Default: fal-ai/flux-pro/kontext (~$0.04/image).
 * NOT the /max variant (~$0.08/image) — too expensive for constant generation.
 * Override with FAL_IMAGE_MODEL only if you know what you're doing.
 */
const FAL_MODEL = (process.env.FAL_IMAGE_MODEL ?? 'fal-ai/flux-pro/kontext').trim();

/**
 * Output aspect ratio for the kontext model.
 * Default 3:4 — matches the 900×1200 WB card exactly, so the base isn't cropped
 * by the canvas cover-fit. A square (1:1) would crop full-body clothing shots and
 * change the product framing, violating the "do not change the product" rule.
 * Set FAL_ASPECT_RATIO=auto (or none/input) to omit the field and preserve the
 * input photo's own aspect ratio instead.
 */
const FAL_ASPECT_RATIO = (process.env.FAL_ASPECT_RATIO ?? '3:4').trim();
const ASPECT_OFF = new Set(['auto', 'none', 'input', 'off']);
const VALID_ASPECT = new Set(['21:9', '16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16', '9:21']);

/**
 * Converts a URL or data: URL to a base64 data URL.
 * Downloads server-side to avoid CORS issues with the image CDN (fal.media).
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

  const falKey = (process.env.FAL_KEY ?? '').trim();
  if (!falKey) {
    return Response.json(
      { error: 'FAL_KEY не задан — добавьте ключ fal.ai в .env.local (см. .env.local.example)' },
      { status: 500 },
    );
  }
  fal.config({ credentials: falKey });

  try {
    // Convert image to base64 (accepts existing data: URL or remote URL).
    // fal accepts a data URI directly as image_url.
    const imageData = imageUrl.startsWith('data:')
      ? imageUrl
      : await toBase64DataUrl(imageUrl);

    // Append minimal safety suffix (pose + no-text reinforcement)
    const fullPrompt = fluxPrompt + INFOGRAPHIC_SUFFIX;

    console.log(`[infographic-base] fal model=${FAL_MODEL} prompt_len=${fullPrompt.length}`);

    // Build input strictly from fields the kontext model actually supports
    // (FluxKontextInput). Note: this model has NO `raw` field — only
    // flux-pro/v1.1-ultra does — so we don't pass it. `enhance_prompt` IS
    // supported and we disable it to keep the prompt verbatim.
    const input: Record<string, unknown> = {
      prompt: fullPrompt,
      image_url: imageData,
      output_format: 'jpeg',
      enhance_prompt: false,
    };
    if (!ASPECT_OFF.has(FAL_ASPECT_RATIO) && VALID_ASPECT.has(FAL_ASPECT_RATIO)) {
      input.aspect_ratio = FAL_ASPECT_RATIO;
    }

    const t0 = Date.now();
    const result = await fal.subscribe(FAL_MODEL, { input });
    const inferenceMs = Date.now() - t0;

    const data = result?.data as { images?: Array<{ url?: string }> } | undefined;
    const url = data?.images?.[0]?.url ?? null;
    console.log(
      `[infographic-base] fal done req=${result?.requestId ?? '?'} ` +
      `inference=${(inferenceMs / 1000).toFixed(1)}s url_present=${!!url}`,
    );

    if (!url) {
      return Response.json(
        { error: `fal.ai не вернул URL: ${JSON.stringify(result?.data).slice(0, 200)}` },
        { status: 500 },
      );
    }

    // fal returns a remote fal.media URL (or a data: URI if sync_mode is on).
    // Download result server-side → return data URL (avoids client CORS 403).
    const dataUrl = url.startsWith('data:')
      ? url
      : await toBase64DataUrl(url).catch(() => null);
    console.log(`[infographic-base] done, dataUrl present=${!!dataUrl}`);

    return Response.json({ imageUrl: dataUrl ?? url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[infographic-base] caught: ${msg}`);
    return Response.json({ error: `fal.ai: ${msg}` }, { status: 500 });
  }
}
