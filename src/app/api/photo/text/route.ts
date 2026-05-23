import { NextRequest } from 'next/server';

export const maxDuration = 30;

const TEXT_PROMPT = `Ты — копирайтер для маркетплейса Wildberries. Специализация: продающие тексты для инфографики на фото товара.

Тебе дан анализ фото товара. На основе этого анализа сгенерируй 5 вариантов текстовых блоков для наложения на фото.

ПРАВИЛА:
- Тексты короткие: заголовок 2-5 слов, подзаголовок до 10 слов
- Говори о выгоде для покупателя, не о свойствах товара
- Конкретные цифры и факты работают лучше расплывчатых слов
- Используй триггеры: "Тёплый", "Водоотталкивающий", "Лёгкий", "-30°C", "Сезон 2026", "Хит"
- Никаких клише: "высокое качество", "лучший выбор", "для вас"

ФОРМАТЫ ТЕКСТОВЫХ БЛОКОВ:
1. Главный заголовок + подзаголовок (позиция — верх или низ фото)
2. Выгода-бейдж (1-3 слова в круге/квадрате)
3. Характеристика + иконка (кратко: "🌡 До -30°C")
4. Акция/срочность ("Осталось 3 шт", "Хит продаж")
5. Сезонный/контекстный ("Идеально для прогулок")

Верни ТОЛЬКО валидный JSON:
{
  "blocks": [
    {
      "id": "main",
      "type": "headline",
      "title": "Заголовок",
      "subtitle": "Подзаголовок до 10 слов",
      "position": "bottom",
      "style": "dark"
    },
    {
      "id": "badge",
      "type": "badge",
      "title": "Хит",
      "subtitle": null,
      "position": "top-left",
      "style": "accent"
    },
    {
      "id": "feature1",
      "type": "feature",
      "title": "🌡 До -30°C",
      "subtitle": "Защита от холода",
      "position": "top-right",
      "style": "light"
    },
    {
      "id": "promo",
      "type": "promo",
      "title": "Осталось 5 шт",
      "subtitle": null,
      "position": "bottom-left",
      "style": "accent"
    },
    {
      "id": "context",
      "type": "context",
      "title": "Сезон 2026",
      "subtitle": "Актуальный силуэт",
      "position": "bottom-right",
      "style": "light"
    }
  ]
}

Правила полей:
- type: "headline" | "badge" | "feature" | "promo" | "context"
- position: "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center"
- style: "dark" (тёмный фон) | "light" (светлый фон) | "accent" (акцентный цвет)
- subtitle может быть null`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const analysis = body?.analysis;
  const category = body?.category ?? '';

  const apiKey = (process.env.YANDEX_API_KEY ?? '').trim();
  const folderId = (process.env.YANDEX_FOLDER_ID ?? 'b1g2kv9g5q3fstk360sa').trim();

  if (!apiKey) {
    return Response.json({ error: 'YANDEX_API_KEY не задан' }, { status: 500 });
  }

  const analysisText = analysis
    ? `Анализ фото:\n- Плюсы: ${(analysis.good ?? []).join(', ')}\n- Проблемы: ${(analysis.improve ?? []).join(', ')}\n- Категория товара: ${category || 'одежда'}`
    : `Категория товара: ${category || 'одежда'}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25_000);

  try {
    const resp = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: `gpt://${folderId}/yandexgpt-lite/latest`,
        messages: [
          { role: 'system', content: TEXT_PROMPT },
          { role: 'user', content: analysisText },
        ],
        max_tokens: 2000,
        temperature: 0.6,
      }),
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      return Response.json({ error: `Yandex API ${resp.status}: ${text}` }, { status: 500 });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? null;

    if (!content) {
      return Response.json({ error: 'Пустой ответ от AI' }, { status: 500 });
    }

    let result;
    try {
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON');
      result = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    } catch {
      return Response.json({ error: `Не удалось разобрать JSON: ${content.slice(0, 200)}` }, { status: 500 });
    }

    return Response.json(result);
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
