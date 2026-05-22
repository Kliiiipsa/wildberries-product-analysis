# WB API — Справочник проверенных эндпоинтов

Файл ведётся автоматически: здесь хранятся только **подтверждённые** запросы и структуры ответов.
Формат: вопрос → проверенный ответ → дата подтверждения.

---

## ✅ Получение списка ярлыков (тегов)

**Вопрос:** Какой эндпоинт и структура для получения всех WB-ярлыков кабинета?

**Ответ:**
```
GET https://content-api.wildberries.ru/content/v2/tags
Authorization: <token>
```
Ответ: `{ "data": [ { "id": 123, "name": "Кирилл" } ] }`

**Подтверждено:** май 2026 ✅

---

## ✅ Список карточек с фильтром по ярлыку (tagIDs)

**Вопрос:** Поддерживает ли `/content/v2/get/cards/list` фильтр tagIDs? Если да — точный body?

**Ответ:**
```
POST https://content-api.wildberries.ru/content/v2/get/cards/list
Authorization: <token>
Content-Type: application/json

{
  "settings": {
    "cursor": { "limit": 100, "offset": 0 },
    "filter": { "tagIDs": [123], "withPhoto": -1 }
  }
}
```
Пагинация: offset += 100 пока `cards.length === 100`. При `withPhoto: -1` возвращает карточки с и без фото.
Ответ: `{ "cards": [ { "nmID": 123456, "title": "...", "brand": "...", "photos": [...] } ] }`

**Подтверждено:** май 2026 ✅

---

## ✅ Структура photos в ответе /content/v2/get/cards/list

**Структура массива `photos` в карточке товара (май 2026):**
```json
"photos": [
  {
    "photoId": 112345678,
    "sortOrder": 1,
    "isMain": true,
    "url": "https://basket-01.wbbasket.ru/vol123/part456/785628816/images/big/1.jpg",
    "smallUrl": "https://basket-01.wbbasket.ru/.../tm/1.jpg",
    "midUrl": "https://basket-01.wbbasket.ru/.../mid/1.jpg"
  },
  {
    "photoId": 112345679,
    "sortOrder": 2,
    "isMain": false,
    "url": "https://basket-01.wbbasket.ru/vol123/part456/785628816/images/big/2.jpg"
  }
]
```

**Правила извлечения:**
- `url` — основная ссылка (big, ~516×688). Использовать в первую очередь.
- `midUrl`, `smallUrl` — дополнительные размеры, присутствуют не всегда.
- `sortOrder` — порядок отображения. Сортировать массив по этому полю.
- `isMain` — флаг главного фото.
- Полей `big`, `c516x688`, `tm` нет — это устаревшие имена.

**Подтверждено:** май 2026 ✅

---

## ✅ Цены и скидки товаров

**Вопрос:** Какой эндпоинт для получения цен и скидок по всем товарам кабинета?

**Ответ:**
```
GET https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter?limit=1000&offset=0
Authorization: <token>
```
Пагинация: offset += 1000 пока `listGoods.length === 1000`.
Ответ: `{ "data": { "listGoods": [ { "nmID": 123, "discount": 30, "sizes": [ { "price": 1000, "discountedPrice": 700 } ] } ] } }`

**Подтверждено:** май 2026 ✅

---

## ✅ Остатки на складах WB

**Вопрос:** Какой эндпоинт и body для получения остатков на складах WB по списку nmId?

**Ответ:**
```
POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses
Authorization: Bearer <token>   ← обязателен префикс Bearer!
Content-Type: application/json

{ "nmIds": [123456, 789012], "limit": 10000, "offset": 0 }
```
Ответ: `{ "data": { "items": [ { "nmId": 123456, "quantity": 45 } ] } }`
Важно: токен должен начинаться с `Bearer ` — добавляй принудительно.

**Подтверждено:** май 2026 ✅

---

## ✅ Воронка продаж (одиночный nmId)

**Вопрос:** Какой эндпоинт и body для получения статистики воронки по одному nmId?

**Ответ:**
```
POST https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products
Authorization: <token>
Content-Type: application/json

{
  "selectedPeriod": { "start": "2026-04-19", "end": "2026-05-19" },
  "nmIds": [123456],
  "limit": 10,
  "offset": 0
}
```
Работает только для **одного** nmId — при нескольких возвращает пустой массив.
Ответ: `{ "data": { "products": [ { "nmID": 123456, "statistic": { "selected": { "metrics": { "orderCount": 10, ... }, "conversions": { "buyoutPercent": 72.5 } } } } ] } }`

**Подтверждено:** май 2026 ✅

---

## ✅ Пакетная статистика по nmId — NM Report v2

**Вопрос:** Какой эндпоинт и body для пакетного получения статистики по нескольким nmId?

**Body:**
```
POST https://seller-analytics-api.wildberries.ru/api/v2/nm-report/detail
Authorization: Bearer <token>
Content-Type: application/json

{
  "nmIds": [123456, 789012],
  "period": {
    "begin": "2026-05-19 00:00:00",
    "end":   "2026-05-19 15:00:00"
  },
  "timezone": "Europe/Moscow",
  "page": 1,
  "limit": 100
}
```
⚠️ Важно:
- Поле `nmIds` — строчная d! (`nmIDs` с заглавной — не работает)
- Формат времени: `"YYYY-MM-DD HH:MM:SS"` (МСК) — поддерживает произвольное время, не только полные сутки
- `timezone: "Europe/Moscow"` — обязателен для корректного среза
- Данные обновляются **раз в час** → `end` нужно брать = текущий полный час МСК

**Структура ответа:**
```json
{
  "data": {
    "cards": [
      {
        "nmID": 123456,
        "vendorCode": "string",
        "brandName": "string",
        "statistics": {
          "selectedPeriod": {
            "openCardCount": 200,
            "addToCartCount": 50,
            "ordersCount": 10,
            "ordersSumRub": 15000,
            "buyoutsCount": 8,
            "buyoutsSumRub": 12000,
            "cancelCount": 2,
            "cancelSumRub": 3000,
            "avgPriceRub": 1500,
            "avgOrdersCountPerDay": 0.5,
            "conversions": {
              "addToCartPercent": 25.0,
              "cartToOrderPercent": 20.0,
              "buyoutsPercent": 80.0
            }
          },
          "previousPeriod": { /* те же поля — за предыдущий сопоставимый период */ }
        }
      }
    ],
    "isNextPage": false
  }
}
```

**Ключевые поля:**
| Метрика | Путь | Тип |
|---|---|---|
| Заказы | `statistics.selectedPeriod.ordersCount` | int |
| Выкупы | `statistics.selectedPeriod.buyoutsCount` | int |
| Корзины | `statistics.selectedPeriod.addToCartCount` | int |
| Открытия карточки | `statistics.selectedPeriod.openCardCount` | int |
| % выкупа | `statistics.selectedPeriod.conversions.buyoutsPercent` | float |

⚠️ `buyoutsPercent` лежит внутри `conversions`, а не напрямую в `selectedPeriod`!

**`previousPeriod`** — автоматически возвращает те же метрики за аналогичный предыдущий период той же длины.
Пример: запрос `begin: "2026-05-19 00:00:00"`, `end: "2026-05-19 15:00:00"` →
- `selectedPeriod` = сегодня 00:00–15:00
- `previousPeriod` = вчера 00:00–15:00 ← **идеально для сравнения на одно и то же время суток**

**Подтверждено:** май 2026 ✅

---

## ✅ Рекламные кампании — детали и тип (advert/v2/adverts)

**Вопрос:** Как определить тип рекламной кампании (CPC / CPM ручная / CPM единая)?

**Ответ:**
```
GET https://advert-api.wildberries.ru/api/advert/v2/adverts?ids=123,456
Authorization: <token>
```
Ответ: `{ "adverts": [{ "id": 123, "bid_type": "unified", "settings": { "payment_type": "cpm" }, "nm_settings": [{ "nm_id": 456789 }] }] }`

**Определение типа:**
| `payment_type` | `bid_type` | Тип кампании |
|---|---|---|
| `"cpc"` | — | CPC (за клики) |
| `"cpm"` | `"manual"` | CPM ручная |
| `"cpm"` | `"unified"` | CPM единая |

- `payment_type` — внутри `settings` объекта
- `bid_type` — на верхнем уровне объекта кампании
- `nm_settings` — массив `{ nm_id: number }`, привязка кампании к артикулам

**Подтверждено:** май 2026 ✅

---

## ✅ Баланс рекламного кабинета

**Вопрос:** Как получить общий баланс рекламного кабинета?

**Ответ:**
```
GET https://advert-api.wildberries.ru/adv/v1/balance
Authorization: <token>
```
Параметров нет. Ответ содержит поля `balance`, `net`, `bonus` (точная структура может варьироваться).

**Подтверждено:** май 2026 ✅

---

## ✅ Остаток бюджета конкретной кампании

**Вопрос:** Как получить остаток бюджета отдельной кампании?

**Ответ:**
```
GET https://advert-api.wildberries.ru/adv/v1/budget?id=123456789
Authorization: <token>
```
Ответ: поле `total` или `balance` с остатком в рублях.

**Подтверждено:** май 2026 ✅

---

## ✅ MPSTATS — Полная карточка товара (конкурент)

**Вопрос:** Какой эндпоинт MPSTATS возвращает все данные по произвольному nmId (конкурент)?

**Ответ:**
```
GET https://mpstats.io/api/analytics/v1/wb/items/{nmId}/full
X-Mpstats-TOKEN: <token>
```

⚠️ `/api/wb/get/item/{nmId}/by_date` и `/summary` возвращают **405** (требуют OPTIONS) — не использовать.

**Ключевые поля ответа:**
```json
{
  "name": "...",
  "full_name": "...",
  "brand": "...",
  "rating": 5.0,
  "comments": 48,
  "balance": 69,
  "discount": 90,
  "price": {
    "price": 10000,
    "final_price": 1007,
    "wallet_price": 986
  },
  "period_stats": {
    "sales": 514,
    "revenue": 527091,
    "sales_avg": 17,
    "revenue_avg": 17002.94
  },
  "color": {
    "все_цвета": [
      { "цвет": "...", "id": 558069949, "фото": "https://basket-XX.wbbasket.ru/.../1.webp" }
    ]
  },
  "stock": { "fbo": 811, "fbs": 0 }
}
```

**Важно:**
- `price` — объект, не число! Цена со скидкой: `price.final_price`
- `balance` — доступно к покупке (не совпадает с `stock.fbo`)
- `period_stats.sales/revenue` — агрегат за ~30 дней (период в настройках аккаунта MPSTATS)
- Фото: `color.все_цвета[0].фото` — thumbnail (246×328)
- Ключи в ответе могут быть на русском (внутри вложенных объектов)

**Подтверждено:** май 2026 ✅

---

## Примечания

- Все токены хранятся в `.env.local` как `WB_API_TOKEN`
- Для `seller-analytics-api` иногда нужен явный префикс `Bearer `
- Воронка `/analytics/v3/sales-funnel` — только одиночные nmId
- Таймаут Edge Runtime на Vercel: **30 секунд** — все запросы должны укладываться в него
