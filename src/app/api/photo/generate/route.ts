import { NextRequest } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { imageUrl, prompt } = await req.json();

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
    const resp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-Kontext-dev',
        prompt,
        image: imageUrl,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      return Response.json({ error: `SiliconFlow ${resp.status}: ${text}` }, { status: 500 });
    }

    const data = await resp.json();
    const url = data?.data?.[0]?.url || data?.images?.[0]?.url || data?.image || null;

    if (!url) {
      return Response.json({ error: `Нет URL в ответе: ${JSON.stringify(data)}` }, { status: 500 });
    }

    return Response.json({ imageUrl: url });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
