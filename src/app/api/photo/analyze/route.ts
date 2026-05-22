import { NextRequest } from 'next/server';

export const maxDuration = 60;

const PROMPT = `Ты эксперт по визуальному контенту для Wildberries. Проанализируй фотографию товара для карточки на маркетплейсе.

Требования Wildberries к фото:
- Главное фото: белый или светло-серый фон, товар занимает 80-85% кадра, без лишних объектов
- Освещение: равномерное, без резких теней, без пересветов
- Ракурс: анфас или 3/4, товар читается сразу
- Модель (если есть): лицо видно, поза естественная, одежда без складок
- Инфографика: не перекрывает товар, текст читаем, цвета не кричащие

ВАЖНО: Все текстовые значения в JSON пиши ТОЛЬКО на русском языке (кроме generatePrompt — он должен быть на английском).

Верни ТОЛЬКО валидный JSON без markdown-блоков и без лишнего текста:
{
  "good": ["конкретный плюс 1", "конкретный плюс 2", "конкретный плюс 3"],
  "improve": ["конкретный минус 1", "конкретный минус 2", "конкретный минус 3"],
  "recommendations": {
    "composition": ["конкретное действие: что именно изменить в кадрировании или расположении товара"],
    "technique": ["конкретное действие: что изменить в освещении, фоне, резкости"],
    "styling": ["конкретное действие: что изменить в подаче, аксессуарах, модели, раскладке"]
  },
  "ideas": [
    {"title": "Студийный белый фон", "description": "Модель в полный рост на чистом белом фоне, равномерный студийный свет, товар в фокусе", "tag": "Главная", "promptEn": "Replace background with clean white seamless studio backdrop. Add even soft studio lighting. Keep the model, clothing and pose exactly the same."},
    {"title": "Акцент на выгоде", "description": "Крупный план с инфографикой: ключевые характеристики товара поверх фото, не перекрывая товар", "tag": "Выгода", "promptEn": "Change to close-up shot highlighting fabric texture and details. Clean light grey background. Keep the clothing exactly the same."},
    {"title": "Название идеи", "description": "Детальное описание", "tag": null, "promptEn": "English edit instructions: what exactly to change. Keep the model and clothing exactly the same."},
    {"title": "Название идеи", "description": "Детальное описание", "tag": null, "promptEn": "English edit instructions."},
    {"title": "Название идеи", "description": "Детальное описание", "tag": null, "promptEn": "English edit instructions."}
  ],
  "generatePrompt": "FLUX Kontext edit instructions in English: describe ONLY the specific changes to make, not the full image. Example: 'Replace the background with a clean white seamless studio backdrop. Remove the chair and table from the scene. Keep the model and clothing exactly as is.'"
}

Правила:
- good/improve: 3 конкретных пункта каждый (не общих слова, а конкретные наблюдения по этому фото)
- recommendations: по 1-2 конкретных действия в каждом разделе
- ideas: 5-7 идей. tag "Главная" — лучшая концепция для главного фото WB, "Выгода" — показывает выгоду покупки, null — дополнительные
- generatePrompt: ОБЯЗАТЕЛЬНО на английском. Стиль FLUX Kontext — описывай только ИЗМЕНЕНИЯ (что убрать, что заменить, что добавить). НИКОГДА не пиши слово "Wildberries" — пиши "marketplace" или "e-commerce". В конце добавь: "Keep the model pose, clothing, and composition exactly the same."
- ideas[].promptEn: для каждой идеи напиши конкретный английский промпт в стиле FLUX Kontext (только изменения, без слова Wildberries). В конце каждого: "Keep the model and clothing exactly the same."`;

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
