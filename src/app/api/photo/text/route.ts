import { NextRequest } from 'next/server';

export const maxDuration = 30;

const INFOGRAPHIC_PROMPT = `Ты — копирайтер для карточек товаров на Wildberries. Специализация: продающая инфографика в стиле digpic.

Тебе дан анализ фото товара. Создай структурированный контент для профессиональной инфографики.

СТРУКТУРА ОТВЕТА:
1. productName — название товара, 1-3 слова, ЗАГЛАВНЫЕ БУКВЫ (например: "ШОРТЫ", "САРАФАН", "БРЮКИ")
2. productSubtitle — уточнение, строчные буквы (например: "с кружевом", "для лета", "свободный крой")
3. tagline — маленький тег сверху (1-3 слова, строчные), контекст или сезон (например: "летняя коллекция", "новинка 2026")
4. characteristics — ровно 3 характеристики товара. Каждая: title (2-4 слова, ЗАГЛАВНЫЕ) + value (факт или уточнение)
5. bottomText — финальный акцент внизу (1 короткая фраза строчными)

ПРАВИЛА ДЛЯ ХАРАКТЕРИСТИК:
- Описывай ТОЛЬКО то что реально видно на фото или типично для этого типа товара
- Пиши конкретно: "ДЛИНА 38 СМ", "ПОЯС НА РЕЗИНКЕ", "КРУЖЕВНАЯ КАЙМА"
- Не придумывай факты (состав ткани, точные размеры) если не знаешь — пиши свойство ("МЯГКИЙ МАТЕРИАЛ")
- Никаких эмодзи, никаких клише ("высокое качество", "лучший выбор")

ЗАПРЕЩЕНО использовать эмодзи в любых полях.

Верни ТОЛЬКО валидный JSON без markdown:
{
  "productName": "ШОРТЫ",
  "productSubtitle": "с кружевом",
  "tagline": "летняя коллекция",
  "characteristics": [
    {"title": "ВЫСОКАЯ ПОСАДКА", "value": "подчёркивает талию"},
    {"title": "КРУЖЕВНАЯ КАЙМА", "value": "добавляет женственности"},
    {"title": "СВОБОДНЫЙ КРОЙ", "value": "комфорт в движении"}
  ],
  "bottomText": "идеально для прогулок и встреч"
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
          { role: 'system', content: INFOGRAPHIC_PROMPT },
          { role: 'user', content: analysisText },
        ],
        max_tokens: 1000,
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
