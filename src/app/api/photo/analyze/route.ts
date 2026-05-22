import { NextRequest } from 'next/server';

export const maxDuration = 60;

const PROMPT = `Ты эксперт по визуальному контенту для Wildberries. Проанализируй фотографию товара для карточки на маркетплейсе.

ВАЖНО: Все текстовые значения в JSON пиши ТОЛЬКО на русском языке (кроме generatePrompt — он должен быть на английском).

Верни ТОЛЬКО валидный JSON без markdown-блоков и без лишнего текста:
{
  "good": ["что уже хорошо, 2-3 коротких пункта"],
  "improve": ["что улучшить, 2-4 коротких пункта"],
  "recommendations": {
    "composition": ["конкретное действие по композиции"],
    "technique": ["конкретное действие по технике съёмки"],
    "styling": ["конкретное действие по стайлингу"]
  },
  "ideas": [
    {"title": "Название концепции", "description": "Краткое описание съёмки", "tag": "Главная"},
    {"title": "Название", "description": "Описание", "tag": "Выгода"},
    {"title": "Название", "description": "Описание", "tag": null},
    {"title": "Название", "description": "Описание", "tag": null},
    {"title": "Название", "description": "Описание", "tag": null}
  ],
  "generatePrompt": "Professional product photography improvement prompt in English for Flux img2img"
}

Правила:
- ideas: 5-7 идей для фотосессии. tag: "Главная" (лучшая для главного фото), "Выгода" (показывает выгоду), null (остальные)
- generatePrompt: конкретный английский промпт что улучшить, начинать с действия (например: "Change background to clean white studio...")
- Все пункты — конкретные, без воды`;

async function toBase64DataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить изображение: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

export async function POST(req: NextRequest) {
  const { imageUrl } = await req.json();

  if (!imageUrl) {
    return Response.json({ error: 'imageUrl обязателен' }, { status: 400 });
  }

  const apiKey = (process.env.YANDEX_API_KEY ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();

  if (!apiKey) {
    return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 55_000);

  try {
    // Yandex requires base64 data URL, not external URLs
    const imageData = imageUrl.startsWith('data:') ? imageUrl : await toBase64DataUrl(imageUrl);

    const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: `gpt://${folderId}/qwen3.6-35b-a3b/latest`,
        messages: [
          {
            role: 'system',
            content: '/nothink',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      return Response.json({ error: `Yandex API ${resp.status}: ${text}` }, { status: 500 });
    }

    const data = await resp.json();
    const msg = data?.choices?.[0]?.message;
    const content = msg?.content ?? msg?.reasoning_content ?? null;

    if (!content) {
      return Response.json({ error: `Пустой ответ: ${JSON.stringify(data)}` }, { status: 500 });
    }

    let analysis;
    try {
      const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(clean);
    } catch {
      analysis = content;
    }

    return Response.json({ analysis });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
