import { NextRequest } from 'next/server';

export const maxDuration = 60;

async function toBase64(url: string): Promise<string> {
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
    // Convert to base64 — FLUX Kontext requires it (URL alone is treated as text-to-image)
    const imageData = imageUrl.startsWith('data:') ? imageUrl : await toBase64(imageUrl);

    // FLUX.1-Kontext-pro expects raw base64 without the "data:mime;base64," prefix
    const fluxImage = imageData.startsWith('data:') ? imageData.split(',')[1] : imageData;

    const resp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-Kontext-pro',
        prompt,
        image: fluxImage,
        prompt_enhancement: false,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      // Fallback to Qwen-Image-Edit
      if (resp.status === 400) {
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
          return Response.json({ error: `SiliconFlow ${r2.status}: ${t}` }, { status: 500 });
        }
        const d2 = await r2.json();
        const u2 = d2?.images?.[0]?.url ?? null;
        if (!u2) return Response.json({ error: `Нет URL: ${JSON.stringify(d2)}` }, { status: 500 });
        return Response.json({ imageUrl: u2, model: 'qwen' });
      }
      return Response.json({ error: `SiliconFlow ${resp.status}: ${errText}` }, { status: 500 });
    }

    const data = await resp.json();
    const url = data?.images?.[0]?.url ?? null;
    if (!url) return Response.json({ error: `Нет URL: ${JSON.stringify(data)}` }, { status: 500 });

    return Response.json({ imageUrl: url, model: 'flux-kontext-pro' });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
