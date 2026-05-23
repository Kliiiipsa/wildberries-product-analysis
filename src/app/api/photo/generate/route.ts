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
    // FLUX.1-Kontext-pro: image field with data: prefix required, strength controls source fidelity
    const imageData = imageUrl.startsWith('data:') ? imageUrl : await toBase64DataUrl(imageUrl);
    const sizekb = Math.round(imageData.length / 1024);
    console.log(`[generate] ${sizekb}KB, model: FLUX.1-Kontext-max`);

    const resp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-Kontext-max',
        prompt,
        image: imageData,
        num_outputs: 1,
        guidance_scale: 3.0,
        num_inference_steps: 50,
        strength: 0.75,
      }),
    });
    clearTimeout(timer);

    const respText = await resp.text();
    let inference = '?';
    try { inference = String(JSON.parse(respText)?.timings?.inference ?? '?'); } catch { /* */ }
    console.log(`[generate] FLUX status=${resp.status} inference=${inference}s`);

    if (resp.ok) {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(respText); } catch { return Response.json({ error: `Не JSON: ${respText.slice(0, 200)}` }, { status: 500 }); }
      const url = (data?.images as Array<{ url: string }>)?.[0]?.url ?? null;
      if (url) return Response.json({ imageUrl: url, model: 'flux-kontext-max' });
      return Response.json({ error: `Нет URL: ${JSON.stringify(data)}` }, { status: 500 });
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
