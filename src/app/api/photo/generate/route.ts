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
    // Convert source image to binary Blob for multipart upload
    let imageBlob: Blob;
    if (imageUrl.startsWith('data:')) {
      const commaIdx = imageUrl.indexOf(',');
      const b64 = commaIdx >= 0 ? imageUrl.slice(commaIdx + 1) : imageUrl;
      const mimeMatch = imageUrl.match(/^data:([^;]+);/);
      const mime = mimeMatch?.[1] ?? 'image/jpeg';
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      imageBlob = new Blob([bytes], { type: mime });
    } else {
      const imgRes = await fetch(imageUrl, { headers: { 'Referer': 'https://www.wildberries.ru/' } });
      if (!imgRes.ok) throw new Error(`Не удалось загрузить фото: ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      const ct = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
      imageBlob = new Blob([buf], { type: ct });
    }

    const sizekb = Math.round(imageBlob.size / 1024);
    console.log(`[generate] multipart size=${sizekb}KB, model: FLUX.1-Kontext-pro`);

    // Try /v1/images/edits (multipart/form-data) — proper img2img endpoint
    const formData = new FormData();
    formData.append('model', 'black-forest-labs/FLUX.1-Kontext-pro');
    formData.append('prompt', prompt);
    formData.append('image', imageBlob, 'image.jpg');
    formData.append('guidance_scale', '3.5');
    formData.append('num_inference_steps', '28');

    const resp = await fetch('https://api.siliconflow.com/v1/images/edits', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });
    clearTimeout(timer);

    const respText = await resp.text();
    console.log(`[generate] FLUX edits status: ${resp.status}, body: ${respText.slice(0, 600)}`);

    if (resp.ok) {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(respText); } catch { return Response.json({ error: `Не JSON: ${respText.slice(0,200)}` }, { status: 500 }); }
      const url = (data?.images as Array<{url:string}>)?.[0]?.url ?? (data?.data as Array<{url:string}>)?.[0]?.url ?? null;
      if (url) return Response.json({ imageUrl: url, model: 'flux-kontext-pro' });
    }

    // Fallback: /v1/images/generations with raw base64 (no data: prefix)
    console.log(`[generate] edits failed (${resp.status}), trying generations endpoint`);
    const commaIdx = imageUrl.startsWith('data:') ? imageUrl.indexOf(',') : -1;
    const imageForGen = commaIdx >= 0 ? imageUrl.slice(commaIdx + 1) : imageUrl;

    const ac1b = new AbortController();
    const t1b = setTimeout(() => ac1b.abort(), 50_000);
    const resp2 = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST', signal: ac1b.signal,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'black-forest-labs/FLUX.1-Kontext-pro', prompt, image: imageForGen, guidance_scale: 3.5, num_inference_steps: 28 }),
    });
    clearTimeout(t1b);
    const resp2Text = await resp2.text();
    console.log(`[generate] generations status: ${resp2.status}, body: ${resp2Text.slice(0, 400)}`);
    if (resp2.ok) {
      let d2: Record<string, unknown> = {};
      try { d2 = JSON.parse(resp2Text); } catch { /* ignore */ }
      const u2 = (d2?.images as Array<{url:string}>)?.[0]?.url ?? null;
      if (u2) return Response.json({ imageUrl: u2, model: 'flux-kontext-pro' });
    }

    // Fallback to Qwen-Image-Edit
    const imageForQwen = imageUrl.startsWith('data:') ? imageUrl : await toBase64(imageUrl);
    const ac2 = new AbortController();
    const t2 = setTimeout(() => ac2.abort(), 50_000);
    const r2 = await fetch('https://api.siliconflow.com/v1/images/generations', {
      method: 'POST', signal: ac2.signal,
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'Qwen/Qwen-Image-Edit', prompt, image: imageForQwen, image_size: '1056x1584', num_inference_steps: 30, guidance_scale: 12 }),
    });
    clearTimeout(t2);
    if (!r2.ok) {
      const t = await r2.text().catch(() => r2.statusText);
      return Response.json({ error: `Все методы упали. edits=${resp.status}, gen=${resp2.status}, qwen=${r2.status}: ${t}` }, { status: 500 });
    }
    const d3 = await r2.json();
    const u3 = d3?.images?.[0]?.url ?? null;
    if (!u3) return Response.json({ error: `Нет URL от Qwen: ${JSON.stringify(d3)}` }, { status: 500 });
    return Response.json({ imageUrl: u3, model: 'qwen' });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
