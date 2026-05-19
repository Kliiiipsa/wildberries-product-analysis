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

## Примечания

- Все токены хранятся в `.env.local` как `WB_API_TOKEN`
- Для `seller-analytics-api` иногда нужен явный префикс `Bearer `
- Воронка `/analytics/v3/sales-funnel` — только одиночные nmId
- Таймаут Edge Runtime на Vercel: **30 секунд** — все запросы должны укладываться в него
