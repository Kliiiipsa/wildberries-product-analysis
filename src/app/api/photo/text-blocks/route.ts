import { NextRequest } from 'next/server';

export const maxDuration = 30;

const BLOCKS_PROMPT = `Ты — копирайтер для карточек товаров на Wildberries. Специализация: продающие текстовые блоки для наложения на фото.

Тебе дан анализ фото товара. Создай РОВНО 3 текстовых блока для наложения поверх фотографии.

Каждый блок должен быть конкретным и продающим:
- type: "headline" (главный заголовок), "badge" (значок-акцент), "feature" (характеристика), "promo" (промо), "context" (контекст)
- title: 1-5 слов, конкретно и кратко
- subtitle: 5-15 слов пояснение, или null если не нужен
- position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom"
- style: "dark" (тёмный фон) | "light" (светлый фон) | "accent" (красный акцент)

Правила:
- Блоки в разных позициях (не пересекаются)
- Первый блок — самый важный (headline или promo)
- Без эмодзи, без клише "высокое качество"

Верни ТОЛЬКО валидный JSON:
{
  "blocks": [
    {"id": "b1", "type": "headline", "title": "НОВИНКА 2026", "subtitle": "лёгкий материал, свободный крой", "position": "top-left", "style": "dark"},
    {"id": "b2", "type": "badge", "title": "−30%", "subtitle": null, "position": "top-right", "style": "accent"},
    {"id": "b3", "type": "feature", "title": "Размеры XS–3XL", "subtitle": "подходит для любой фигуры", "position": "bottom-left", "style": "light"}
  ]
}`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const analysis = body?.analysis;

  const apiKey = (process.env.YANDEX_API_KEY ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();

  if (!apiKey) {
    return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });
  }

  const analysisText = analysis
    ? `Анализ фото:\n- Что хорошо: ${(analysis.good ?? []).join('; ')}\n- Проблемы: ${(analysis.improve ?? []).join('; ')}`
    : 'Товар одежда для Wildberries.';

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25_000);

  try {
    const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Authorization': `Api-Key ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `gpt://${folderId}/yandexgpt-lite/latest`,
        messages: [
          { role: 'system', content: BLOCKS_PROMPT },
          { role: 'user', content: analysisText },
        ],
        max_tokens: 800,
        temperature: 0.5,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      return Response.json({ error: `Yandex API ${resp.status}: ${text}` }, { status: 500 });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? null;
    if (!content) return Response.json({ error: 'Пустой ответ' }, { status: 500 });

    try {
      const s = content.indexOf('{');
      const e = content.lastIndexOf('}');
      if (s === -1 || e === -1) throw new Error('no JSON');
      return Response.json(JSON.parse(content.slice(s, e + 1)));
    } catch {
      return Response.json({ error: `Не удалось разобрать JSON: ${content.slice(0, 200)}` }, { status: 500 });
    }
  } catch (err) {
    clearTimeout(timer);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
