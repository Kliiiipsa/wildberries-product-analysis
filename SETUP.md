# WB Analyzer — Инструкция по настройке

## 1. Установка зависимостей

```bash
cd e:\project1
npm install
```

## 2. Заполнение .env.local

Откройте файл `.env.local` и заполните ключи:

### GROQ_API_KEY (обязательно)
1. Зайдите на https://console.groq.com
2. Создайте API Key
3. Вставьте в `GROQ_API_KEY=gsk_...`

### GOOGLE_SPREADSHEET_ID (обязательно для Unit/Чек-лист)
1. Откройте таблицу "AnnSer22 | 10X WB"
2. Из URL скопируйте ID: `https://docs.google.com/spreadsheets/d/[ЭТОТ_ID]/edit`
3. Вставьте в `GOOGLE_SPREADSHEET_ID=...`

### GOOGLE_SERVICE_ACCOUNT_JSON (обязательно для Google Sheets)
1. Зайдите в Google Cloud Console → IAM & Admin → Service Accounts
2. Создайте сервисный аккаунт (или используйте существующий)
3. Создайте JSON-ключ (Actions → Manage Keys → Add Key → JSON)
4. Скачайте JSON-файл
5. **Важно**: Поделитесь Google-таблицей с email сервисного аккаунта (из поля `client_email` в JSON) с правами "Читатель"
6. Преобразуйте JSON в одну строку: `node -e "console.log(JSON.stringify(require('./key.json')))"`
7. Вставьте результат в `GOOGLE_SERVICE_ACCOUNT_JSON=...`

### WB_API_TOKEN (для статистики и рекламы)
1. Зайдите в Личный кабинет WB → Настройки → Доступ к API
2. Создайте новый токен с правами: Аналитика, Реклама
3. Вставьте в `WB_API_TOKEN=...`

### MPSTATS_API_KEY (для данных о конкурентах)
1. Зайдите на https://mpstats.io → Профиль → API
2. Скопируйте API-ключ
3. Вставьте в `MPSTATS_API_KEY=...`

## 3. Настройки листов

Если структура ваших листов отличается, настройте колонки:

```
UNIT_ARTICLE_COL=0          # Колонка A (0) содержит артикул в листе Unit
CHECKLIST_ARTICLE_COL=5     # Колонка F (5) содержит артикул в Чек-листе
CHECKLIST_DATE_COL=0        # Колонка A (0) содержит дату в Чек-листе
```

Формат поиска в Чек-листе: ячейка должна содержать артикул в начале строки.
Например: `770632673 - описание` или просто `770632673`

## 4. Запуск

```bash
npm run dev
```

Откройте: http://localhost:3000

## 5. Тест без API-ключей

Приложение работает частично даже без WB/Mpstats токенов:
- ✅ Карточка товара WB (публичный API — без токена)
- ✅ Отзывы WB (публичный API — без токена)
- ✅ Google Sheets Unit и Чек-лист
- ✅ Groq AI анализ
- ⚠️ Статистика WB (нужен WB_API_TOKEN)
- ⚠️ Реклама WB (нужен WB_API_TOKEN)
- ⚠️ Mpstats (нужен MPSTATS_API_KEY)

Groq проанализирует те данные, что удалось собрать, и явно укажет где данных нет.
