import { NextRequest } from 'next/server';

export const maxDuration = 60;

const PROMPT = `Ты старший эксперт по контент-маркетингу и визуальным продажам на маркетплейсах. Анализируй фотографию товара строго по системе ниже.

═══════════════════════════════════════
КАК РАБОТАЕТ ФОТОВОРОНКА
═══════════════════════════════════════
Фото 1 (главное) — покупатель видит его в поиске как thumbnail ~100×130px. Задача: мгновенно зацепить взгляд и передать суть товара. Должно ВЫДЕЛЯТЬСЯ среди конкурентов в выдаче.
Фото 2–3 — разные ракурсы, детали, второй взгляд.
Фото 4–5 — лайфстайл, товар в использовании, эмоция, контекст.
Фото 6+ — инфографика с характеристиками, таблица размеров, состав, выгоды.

═══════════════════════════════════════
ШАГ 1: ОБЯЗАТЕЛЬНЫЙ АНАЛИЗ ФОТО
═══════════════════════════════════════
Перед любыми рекомендациями определи всё это по изображению:

A) ТИП СЪЁМКИ: студийное без модели | студийное с моделью | лайфстайл/интерьер | улица/природа | flat-lay | крупный план детали
B) КАТЕГОРИЯ ТОВАРА: одежда/обувь | аксессуары (сумки, украшения, часы) | товары для дома/интерьера | электроника/гаджеты | красота/уход | еда/напитки | спорт/туризм | детские товары | другое
C) ЦВЕТ ТОВАРА: белый/кремовый/очень светлый | светло-пастельный | яркий/насыщенный | тёмный/чёрный/глубокий | нейтральный серый/бежевый | принт/многоцветный
D) ЦВЕТ ФОНА: белый/светло-серый | тёмный/чёрный | насыщенный цветной | интерьер/комната | природа/улица | размытый боке
E) КОНТРАСТ: хороший (товар выделяется) | плохой (товар сливается с фоном) | нейтральный
F) МОДЕЛЬ/ЧЕЛОВЕК: нет | да — полный рост | да — пояс и выше | да — только руки/деталь
G) ИНФОГРАФИКА/ТЕКСТ НА ФОТО: нет | да — умеренно | да — перегружено

═══════════════════════════════════════
ШАГ 2: ПРАВИЛА ИДЕЙ ПО СИТУАЦИЯМ
═══════════════════════════════════════

▌КОНТРАСТ (самое важное для главного фото):
• Белый/светлый товар + белый/светлый фон → ОБЯЗАТЕЛЬНО предложи тёмный, глубокий или насыщенный фон (антрацит, тёмно-синий, бежевый тёплый и т.д.)
• Тёмный товар + тёмный фон → предложи белый, светло-серый или контрастный фон
• Яркий товар + пёстрый фон → предложи нейтральный серый фон чтобы товар читался
• Контраст уже хороший → работай с другими аспектами, не меняй фон просто так

▌ТИП СЪЁМКИ → что улучшать:
• Студийное без модели → идеи: версия с моделью/рукой для масштаба, крупный план ключевой детали, лайфстайл в контексте использования, инфографика с выгодами
• Студийное с моделью → идеи: крупный план ключевой детали товара, flat-lay/раскладка, лайфстайл в реальном контексте, инфографика (размерная сетка, состав, свойства)
• Лайфстайл с лишними объектами → идея «Главная»: чистый студийный вариант с контрастным фоном; для других позиций: минималистичный интерьер с акцентом на товаре
• Flat-lay → идеи: версия с моделью если применимо, объёмный/3D вариант, крупный план текстуры, стайлинг с дополняющими предметами

▌КАТЕГОРИЯ ТОВАРА → специфика:
• Одежда/обувь: главное фото → модель в полный рост, товар занимает 75–85% кадра. Воронка: деталь ткани/шва/фурнитуры, flat-lay с сочетающимися вещами, таблица размеров, лайфстайл-образ в контексте (прогулка, офис, вечер)
• Аксессуары: главное → товар крупно на контрастном фоне. Воронка: масштаб относительно руки/тела, детали материала/фурнитуры, стайлинг с образом, несколько ракурсов
• Товары для дома: главное → товар на нейтральном фоне. Воронка: товар в интерьере в использовании, размер рядом с узнаваемым предметом, детали материала/качества
• Электроника/гаджеты: главное → чистый студийный с акцентом на ключевую функцию. Воронка: интерфейс/экран в действии, разъёмы и порты, в руках для масштаба, инфографика с характеристиками
• Красота/уход: главное → упаковка крупно. Воронка: текстура продукта (крем, сыворотка, помада), нанесение на кожу, ключевые ингредиенты/результат, коллекция линейки
• Еда/напитки: главное → аппетитный вид, правило «food porn». Воронка: состав и ингредиенты, процесс приготовления, подача на столе, крупный план текстуры

▌ЧТО СТРОГО ЗАПРЕЩЕНО ПРЕДЛАГАТЬ:
• Не предлагай тот же тип фона который уже есть (фон белый — не предлагай «сделать белый»)
• Не предлагай модель для товаров категорий где модель неуместна (электроника, еда, домашние предметы — не одежда)
• Не предлагай «убрать фон» если фон уже чистый
• Не дублируй идеи — каждая из 5–7 идей должна быть принципиально другим типом контента

═══════════════════════════════════════
ФОРМАТ ОТВЕТА
═══════════════════════════════════════
ЯЗЫК ОТВЕТА: все поля JSON — на русском языке. ИСКЛЮЧЕНИЕ: поля promptEn и generatePrompt — ТОЛЬКО на английском языке (English). Писать их на русском — ЗАПРЕЩЕНО.

Верни ТОЛЬКО валидный JSON без markdown-блоков и без лишнего текста:
{
  "good": ["конкретный плюс 1 — что именно хорошо на ЭТОМ фото", "конкретный плюс 2", "конкретный плюс 3"],
  "improve": ["конкретный минус 1 — что мешает продажам", "конкретный минус 2", "конкретный минус 3"],
  "recommendations": {
    "composition": ["конкретное действие: что именно изменить в кадрировании/расположении товара"],
    "technique": ["конкретное действие: что изменить в освещении, фоне, резкости"],
    "styling": ["конкретное действие: что изменить в подаче, аксессуарах, модели, раскладке"]
  },
  "ideas": [
    {"title": "Название отражающее суть", "description": "Детально: что снять, как, почему это усилит продажи для этого конкретного товара", "tag": "Главная", "promptEn": "Replace the [X] with [Y]. Keep the exact same [product details], same lighting, same pose, realistic photo, professional product photography."},
    {"title": "...", "description": "...", "tag": "Выгода", "promptEn": "English only prompt here..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "English only prompt here..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "English only prompt here..."},
    {"title": "...", "description": "...", "tag": null, "promptEn": "English only prompt here..."}
  ],
  "generatePrompt": "Replace the [X] with [Y]. Keep the exact same [product/model details], same lighting, same pose, realistic photo, professional product photography."
}

Правила JSON:
- good/improve: ровно 3 пункта, конкретные наблюдения по ЭТОМУ фото — не шаблонные фразы
- recommendations: 1–2 конкретных действия в каждом разделе
- ideas: 5–7 идей, каждая — принципиально другой тип контента. tag "Главная" — лучший вариант для позиции 1 в поиске с учётом цвета товара, tag "Выгода" — усиливает ценность, null — дополнительные позиции воронки
- generatePrompt и ideas[].promptEn: ТОЛЬКО английский язык (English only). Любой кириллический символ в этих полях — ошибка.

КРИТИЧЕСКИ ВАЖНЫЙ ФОРМАТ промптов (generatePrompt и promptEn) — ТОЛЬКО НА АНГЛИЙСКОМ:
Модель редактирует исходное фото — промпт ОБЯЗАН явно удерживать всё что нельзя менять.
Структура: [WHAT TO CHANGE], keep the exact same [list of everything to preserve], same lighting, same pose, same [product details], realistic photo, professional product photography.
Правильный пример (именно такой формат, именно на английском): "Replace the white background with deep charcoal seamless studio backdrop. Keep the exact same woman, exact same white linen suit, exact same standing pose, exact same lighting direction, same facial expression, realistic photo, professional product photography."
НИКОГДА: не пиши слово "Wildberries". Не описывай всё фото целиком — только изменение + якоря сохранения.`;


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
