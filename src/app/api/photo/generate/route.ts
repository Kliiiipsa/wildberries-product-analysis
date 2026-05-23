import { NextRequest } from 'next/server';

export const maxDuration = 60;

async function toBase64DataUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'Referer': 'https://www.wildberries.ru/' } });
  if (!res.ok) throw new Error(`Не удалось загрузить изображение: ${res.status}`);
  const mime = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return `data:${mime};base64,${btoa(chunks.join(''))}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const imageUrl: string = body?.imageUrl ?? '';
  const prompt: string = body?.prompt ?? '';

  if (!imageUrl || !prompt) {
    return Response.json({ error: 'imageUrl и prompt обязательны' }, { status: 400 });
  }

  const apiKey = (process.env.SILICONFLOW_API_KEY ?? '').trim();
  if (!apiKey) {
    return Response.json({ error: 'SILICONFLOW_API_KEY не задан' }, { status: 500 });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55_000);

  try {
    const imageData = imageUrl.startsWith('data:') ? imageUrl : await toBase64DataUrl(imageUrl);
    const sizekb = Math.round(imageData.length / 1024);
    const mimeMatch = imageData.match(/^data:([^;]+);base64,/);
    const mime = mimeMatch?.[1] ?? 'unknown';
    const hasDataPrefix = imageData.startsWith('data:');
    console.log(`[generate] image: ${sizekb}KB, mime=${mime}, hasDataPrefix=${hasDataPrefix}`);
    const hasCyrillic = /[Ѐ-ӿ]/.test(prompt);
    console.log(`[generate] prompt (${prompt.length} chars, cyrillic=${hasCyrillic}): ${prompt.slice(0, 300)}`);
    if (hasCyrillic) console.log(`[generate] WARNING: prompt contains Russian — FLUX may ignore source image`);

    console.log(`[generate] image prefix (first 60 chars): ${imageData.slice(0, 60)}`);

    const fluxBody = {
      model: 'black-forest-labs/FLUX.1-Kontext-max',
      prompt,
      image: imageData,
      aspect_ratio: '2:3',
      output_format: 'jpeg',
    };
    console.log(`[generate] request keys: ${Object.keys(fluxBody).join(', ')}`);

    const resp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fluxBody),
    });
    clearTimeout(timer);

    const respText = await resp.text();
    let parsedResp: Record<string, unknown> = {};
    try { parsedResp = JSON.parse(respText); } catch { /* */ }
    const inference = String((parsedResp?.timings as Record<string, unknown>)?.inference ?? '?');
    console.log(`[generate] FLUX status=${resp.status} inference=${inference}s`);
    if (!resp.ok) {
      console.log(`[generate] FLUX error body: ${respText.slice(0, 500)}`);
    } else {
      const resultUrl = (parsedResp?.images as Array<{ url: string }>)?.[0]?.url ?? null;
      console.log(`[generate] FLUX ok, result url present=${!!resultUrl}`);
      const seed = parsedResp?.seed ?? parsedResp?.metadata;
      if (seed !== undefined) console.log(`[generate] seed/metadata: ${JSON.stringify(seed)}`);
    }

    if (resp.ok) {
      const url = (parsedResp?.images as Array<{ url: string }>)?.[0]?.url ?? null;
      if (url) return Response.json({ imageUrl: url, model: 'flux-kontext-max' });
      return Response.json({ error: `Нет URL: ${JSON.stringify(parsedResp)}` }, { status: 500 });
    }

    // Fallback: Qwen-Image-Edit
    console.log(`[generate] FLUX failed (${resp.status}), trying Qwen-Image-Edit`);
    const ac2 = new AbortController();
    const t2 = setTimeout(() => ac2.abort(), 50_000);
    const r2 = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST', signal: ac2.signal,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'Qwen/Qwen-Image-Edit',
        prompt, image: imageData,
        image_size: '1056x1584', num_inference_steps: 30, guidance_scale: 12,
      }),
    });
    clearTimeout(t2);
    if (!r2.ok) {
      const t = await r2.text().catch(() => r2.statusText);
      return Response.json({ error: `FLUX ${resp.status}: ${respText.slice(0, 200)} | Qwen ${r2.status}: ${t}` }, { status: 500 });
    }
    const d2 = await r2.json();
    const u2 = d2?.images?.[0]?.url ?? null;
    if (!u2) return Response.json({ error: `Нет URL от Qwen: ${JSON.stringify(d2)}` }, { status: 500 });
    return Response.json({ imageUrl: u2, model: 'qwen' });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
