import { NextRequest } from 'next/server';

export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text: string = body?.text ?? '';
  if (!text.trim()) return Response.json({ error: 'text обязателен' }, { status: 400 });

  const apiKey = (process.env.YANDEX_API_KEY ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();

  if (!apiKey) return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 18_000);

  try {
    const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Authorization': `Api-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `gpt://${folderId}/yandexgpt-lite/latest`,
        messages: [
          {
            role: 'system',
            content: 'Ты — переводчик. Переведи текст с русского на английский. Это описание для генерации фотографии товара с помощью AI. Сохраняй все технические детали (Canon EOS, f/1.8 и т.д.). Верни ТОЛЬКО перевод без объяснений и без лишних слов.',
          },
          { role: 'user', content: text },
        ],
        max_tokens: 600,
        temperature: 0.1,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const t = await resp.text().catch(() => resp.statusText);
      return Response.json({ error: `Yandex API ${resp.status}: ${t}` }, { status: 500 });
    }

    const data = await resp.json();
    const translated = data?.choices?.[0]?.message?.content?.trim() ?? '';
    return Response.json({ translated });
  } catch (err) {
    clearTimeout(timer);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
