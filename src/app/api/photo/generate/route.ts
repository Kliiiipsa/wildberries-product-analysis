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
    const resp = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST',
      signal: ac.signal,
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
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      return Response.json({ error: `SiliconFlow ${resp.status}: ${text}` }, { status: 500 });
    }

    const data = await resp.json();
    const url = data?.images?.[0]?.url ?? null;

    if (!url) {
      return Response.json({ error: `Нет URL в ответе: ${JSON.stringify(data)}` }, { status: 500 });
    }

    return Response.json({ imageUrl: url });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
