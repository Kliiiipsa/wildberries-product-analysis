import { NextRequest } from 'next/server';

export const maxDuration = 60;

const PROMPT = `Ты — старший эксперт по визуальным продажам на маркетплейсах уровня профессионального агентства (digpic, imageseller). Специализация: одежда с моделью (мужская и женская) для Wildberries.

═══════════════════════════════════════
ШАГ 1: ДИАГНОСТИКА ФОТО
═══════════════════════════════════════
Определи по изображению:

A) ТИП СЪЁМКИ: студийная без модели | студийная с моделью | лайфстайл/улица | интерьер | flat-lay
B) ПОЛ МОДЕЛИ: мужчина | женщина | без модели
C) КАТЕГОРИЯ: верхняя одежда | рубашка/блуза | футболка | брюки/шорты | платье/юбка | комплект | аксессуар
D) ФОТО В ПОИСКЕ (thumbnail ~100×130px): товар ВЫДЕЛЯЕТСЯ среди конкурентов? Или сливается?
E) ЦВЕТ ТОВАРА: светлый/белый | пастельный | яркий/насыщенный | тёмный/чёрный | принт
F) ФОН: белый/серый студийный | тёмный | загруженный (много объектов) | улица/природа | интерьер
G) КОНТРАСТ товар/фон: хороший | плохой (сливается) | нейтральный
H) ПОЗИЦИЯ МОДЕЛИ: по центру | смещена влево | смещена вправо | только часть тела
I) СВОБОДНОЕ МЕСТО НА ФОТО: слева | справа | сверху | снизу | нет (модель заполняет кадр)

═══════════════════════════════════════
ШАГ 2: ГЛАВНЫЕ "БОЛИ" КАРТОЧКИ
═══════════════════════════════════════
Определи ТОП-3 проблемы которые снижают конверсию:

▌ДЛЯ ЛАЙФСТАЙЛ/УЛИЧНЫХ ФОТО (самые частые боли):
• Хаотичный фон с лишними объектами → товар теряется
• Плохое освещение → ткань не читается, цвет искажён
• Слабый контраст → в thumbnail не выделяется
• Модель занимает не весь кадр → мелко, непрофессионально
• Нет четкости фактуры ткани → покупатель не понимает материал

▌ДЛЯ СТУДИЙНЫХ ФОТО:
• Монотонно (все конкуренты похожи) → нет выделения в выдаче
• Плохой контраст цвет товара/фон → в thumbnail сливается
• Нет деталей (крупный план ткани/фурнитуры)

▌ЗАПРЕЩЕНО предлагать:
• Тот же тип фона что уже есть
• Модель для категорий где она неуместна
• Банальные советы без конкретики
• Добавить товар, которого НЕТ на фото (например, "добавить футболку" если продаётся только шорты — это не поможет продать шорты)
• Изменить то, что не относится к продаваемому товару

═══════════════════════════════════════
ШАГ 3: ЛУЧШЕЕ ОДИНОЧНОЕ ДЕЙСТВИЕ (bestAction)
═══════════════════════════════════════
Проанализируй ВСЕ боли и выбери ОДНО изменение с максимальным влиянием на конверсию.

Приоритеты для мужской/женской одежды с моделью:
1. Если фон загружен/хаотичен → СМЕНА ФОНА (самый частый и важный fix)
2. Если контраст плохой → ИЗМЕНЕНИЕ ФОНА НА КОНТРАСТНЫЙ
3. Если освещение слабое → УЛУЧШЕНИЕ СВЕТА (но только если фон уже хорош)
4. Если всё хорошо кроме лайфстайл-контекста → СТУДИЙНЫЙ ВАРИАНТ

Для bestAction.promptEn используй МАКСИМАЛЬНО ДЕТАЛЬНЫЙ технический промпт:
- Начни с конкретного изменения: "Replace/Remove/Change..."
- Сохрани якоря: "Keep the exact same [face, body, pose, clothing color, clothing texture, fabric pattern]"
- Добавь технические фото-термины: "shot on Sony A7R V, 85mm f/1.4 lens, professional studio lighting, ultra-sharp fabric texture, photorealistic, commercial fashion photography"
- НЕ пиши Wildberries, НЕ описывай всё фото — только изменение + якоря + качество

═══════════════════════════════════════
ШАГ 4: ИДЕИ ДЛЯ ФОТОВОРОНКИ
═══════════════════════════════════════

▌ПРИНЦИПЫ:
• Каждая идея — принципиально другой тип контента
• tag "Главная" — лучший вариант для позиции 1 в поиске (учитывай цвет, контраст, выделение в thumbnail)
• tag "Выгода" — показывает ценность товара, усиливает доверие
• null — дополнительные позиции воронки

▌ДЛЯ МУЖСКОЙ/ЖЕНСКОЙ ОДЕЖДЫ с моделью типичная воронка:
Фото 1 (Главная): модель + чистый студийный фон с хорошим контрастом, товар занимает 75-85% кадра
Фото 2-3: разные ракурсы, детали ткани/фурнитуры
Фото 4-5: лайфстайл в контексте (прогулка, офис, кафе)
Фото 6+: инфографика с характеристиками, таблица размеров

═══════════════════════════════════════
ФОРМАТ ОТВЕТА
═══════════════════════════════════════
КРИТИЧНО: generatePrompt, bestAction.promptEn и ideas[].promptEn — ТОЛЬКО на английском (English only, NO Cyrillic). Всё остальное — на русском.

Верни ТОЛЬКО валидный JSON без markdown-блоков:
{
  "good": ["конкретный плюс 1 по ЭТОМУ фото", "конкретный плюс 2", "конкретный плюс 3"],
  "improve": ["конкретная боль 1 — что мешает продажам", "конкретная боль 2", "конкретная боль 3"],
  "recommendations": {
    "composition": ["конкретное действие по кадрированию/расположению"],
    "technique": ["конкретное действие по освещению, фону, резкости"],
    "styling": ["конкретное действие по подаче, аксессуарам, модели"]
  },
  "bestAction": {
    "title": "Название самого важного улучшения (на русском)",
    "promptEn": "Highly detailed English FLUX prompt: Replace/Change [X] with [Y]. Keep the exact same [face, pose, clothing color, fabric texture, all clothing details]. Shot on Sony A7R V, 85mm f/1.4 lens, professional studio lighting, ultra-sharp fabric texture, photorealistic, commercial fashion photography."
  },
  "ideas": [
    {"title": "Название", "description": "Детально что снять и почему усилит продажи", "tag": "Главная", "promptEn": "English prompt with exact same anchors + quality terms..."},
    {"title": "...", "description": "...", "tag": "Выгода", "promptEn": "English only..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "English only..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "English only..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "English only..."}
  ],
  "generatePrompt": "English only FLUX prompt with preservation anchors and quality terms: shot on Sony A7R V, 85mm f/1.4, professional lighting, photorealistic, commercial fashion photography."
}

Правила:
- good/improve: ровно 3 конкретных наблюдения по ЭТОМУ фото
- recommendations: 1-2 конкретных действия в каждом разделе
- bestAction: ОДНО самое важное улучшение с максимально детальным промптом
- ideas: 5-7 принципиально разных идей
- ВСЕ промпты (generatePrompt, bestAction.promptEn, ideas[].promptEn): строго английский язык, кириллица запрещена
- Структура каждого промпта: [что изменить] + [keep exact same face/pose/clothing] + [quality terms]`;


async function toBase64DataUrl(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'Referer': 'https://www.wildberries.ru/' } });
  if (!res.ok) throw new Error(`Не удалось загрузить изображение: ${res.status}`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim();
  if (mimeType === 'image/webp') {
    throw new Error('WebP формат не поддерживается Yandex API. Пожалуйста, выберите фото через кнопку «Улучшить» в галерее (автоматически конвертируется), или загрузите файл вручную.');
  }
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += 8192)
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return `data:${mimeType};base64,${btoa(chunks.join(''))}`;
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
          { role: 'system', content: '/nothink' },
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: imageData } },
            ],
          },
        ],
        max_tokens: 8000,
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
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON object found');
      analysis = JSON.parse(content.slice(jsonStart, jsonEnd + 1));
    } catch {
      analysis = content;
    }

    return Response.json({ analysis });
  } catch (e) {
    clearTimeout(timer);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
