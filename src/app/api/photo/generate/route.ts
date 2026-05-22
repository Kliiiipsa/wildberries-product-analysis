import { NextRequest } from 'next/server';

export const maxDuration = 60;

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
    // Try FLUX.1-Kontext-pro first (better quality, photorealistic)
    // Falls back to Qwen-Image-Edit if Kontext-pro fails
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
        image: imageUrl,
        prompt_enhancement: false,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      // Fallback to Qwen if Kontext-pro not available
      if (resp.status === 400) {
        const ac2 = new AbortController();
        const timer2 = setTimeout(() => ac2.abort(), 55_000);
        const resp2 = await fetch('https://api.siliconflow.com/v1/images/generations', {
          method: 'POST',
          signal: ac2.signal,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'Qwen/Qwen-Image-Edit',
            prompt,
            image: imageUrl,
            image_size: '1056x1584',
            num_inference_steps: 30,
            guidance_scale: 12,
          }),
        });
        clearTimeout(timer2);
        if (!resp2.ok) {
          const t = await resp2.text().catch(() => resp2.statusText);
          return Response.json({ error: `SiliconFlow ${resp2.status}: ${t}` }, { status: 500 });
        }
        const d2 = await resp2.json();
        const u2 = d2?.images?.[0]?.url ?? null;
        if (!u2) return Response.json({ error: `Нет URL в ответе: ${JSON.stringify(d2)}` }, { status: 500 });
        return Response.json({ imageUrl: u2, model: 'qwen' });
      }
      return Response.json({ error: `SiliconFlow ${resp.status}: ${errText}` }, { status: 500 });
    }

    const data = await resp.json();
    const url = data?.images?.[0]?.url ?? null;

    if (!url) {
      return Response.json({ error: `Нет URL в ответе: ${JSON.stringify(data)}` }, { status: 500 });
    }

    return Response.json({ imageUrl: url, model: 'flux-kontext-pro' });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
