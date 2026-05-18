import type { WBProduct, WBStockItem, WBStats, WBAdvertising, WBAdCampaign } from '@/types';
import { getLast7Days } from '@/lib/utils';

// Браузерные заголовки — WB блокирует чистые серверные запросы
const WB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
  'Origin': 'https://www.wildberries.ru',
  'Referer': 'https://www.wildberries.ru/',
};

// ─── Prices (Discounts & Prices API) ─────────────────────────────────────────

function extractGoodPrices(good: Record<string, unknown>): { priceBasic: number; priceSale: number; discount: number } | null {
  // Discounts API: цены могут быть в sizes[].price / sizes[].discountedPrice
  // либо прямо в good.price / good.discountedPrice (зависит от версии/ответа)
  const sizes = Array.isArray(good.sizes) ? good.sizes as Record<string, unknown>[] : [];
  const size = sizes[0];
  const priceBasic = Number(size?.price ?? good.price ?? 0);
  if (priceBasic === 0) return null;
  const discount = Number(good.discount ?? 0);
  const discountedRaw = Number(size?.discountedPrice ?? good.discountedPrice ?? 0);
  const priceSale = discountedRaw > 0
    ? discountedRaw
    : (discount > 0 ? Math.round(priceBasic * (1 - discount / 100)) : priceBasic);
  return { priceBasic, priceSale, discount };
}

async function fetchWBPrices(article: string, token: string): Promise<{ priceBasic: number; priceSale: number; discount: number } | null> {
  const nmId = parseInt(article, 10);
  const BASE = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter';

  // Шаг 1: пробуем с фильтром по nmID (если API его поддерживает)
  for (const filterParam of ['filterNmIds', 'filterNmId']) {
    try {
      const res = await fetch(`${BASE}?limit=100&${filterParam}=${article}`,
        { headers: { Authorization: token }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const listGoods: Record<string, unknown>[] = json?.data?.listGoods ?? [];
      // eslint-disable-next-line no-console
      console.log(`[WB Prices] ${filterParam}: count=${listGoods.length}, ids=${listGoods.slice(0, 5).map((g) => g.nmID ?? g.nmId).join(',')}`);
      const good = listGoods.find((g) => Number(g.nmID ?? g.nmId ?? 0) === nmId);
      if (good) {
        const prices = extractGoodPrices(good);
        // eslint-disable-next-line no-console
        console.log('[WB Prices] найдено через', filterParam, prices);
        if (prices) return prices;
      }
    } catch { /* пробуем следующий вариант */ }
  }

  // Шаг 2: фильтр не работает / артикул не найден → перебираем все товары продавца постранично
  // Лимит 5 страниц по 1000 = до 5000 товаров (~5-10s, но надёжно)
  // eslint-disable-next-line no-console
  console.log(`[WB Prices] фильтр не нашёл артикул ${nmId}, перебираем все товары...`);
  for (let offset = 0; offset < 5000; offset += 1000) {
    try {
      const res = await fetch(`${BASE}?limit=1000&offset=${offset}`,
        { headers: { Authorization: token }, signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) break;
      const json = await res.json();
      const listGoods: Record<string, unknown>[] = json?.data?.listGoods ?? [];
      if (listGoods.length === 0) break;
      // eslint-disable-next-line no-console
      console.log(`[WB Prices] страница offset=${offset}: count=${listGoods.length}`);
      const good = listGoods.find((g) => Number(g.nmID ?? g.nmId ?? 0) === nmId);
      if (good) {
        const prices = extractGoodPrices(good);
        // eslint-disable-next-line no-console
        console.log(`[WB Prices] найдено на offset=${offset}`, prices);
        if (prices) return prices;
      }
    } catch { break; }
  }

  // eslint-disable-next-line no-console
  console.log(`[WB Prices] артикул ${nmId} не найден в API цен продавца`);
  return null;
}

// ─── Product Card ─────────────────────────────────────────────────────────────

// Seller Content API — работает с токеном, не блокируется WB
async function fetchFromContentAPI(article: string, token: string): Promise<WBProduct | null> {
  try {
    const nmId = parseInt(article, 10);

    // Делаем запрос с limit=100 и без withPhoto (некоторые версии API игнорируют nmIDs при limit=1)
    const res = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: { cursor: { limit: 100 }, filter: { nmIDs: [nmId] } },
      }),
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = await res.json();

    // Ищем точное совпадение по nmID в ответе, на случай если API вернул несколько карточек
    const cards: Record<string, unknown>[] = json?.cards ?? [];
    const card = cards.find((c) => Number(c.nmID) === nmId) ?? null;

    if (!card) {
      // eslint-disable-next-line no-console
      console.log(`[WB Content API] артикул ${nmId} не найден среди ${cards.length} карточек (первый: ${cards[0]?.nmID ?? 'нет'})`);
      return null;
    }

    // eslint-disable-next-line no-console
    console.log('[WB Content API] card fields:', JSON.stringify({
      nmID: card.nmID, imtID: card.imtID, title: card.title, brand: card.brand,
      photosLen: Array.isArray(card.photos) ? (card.photos as unknown[]).length : typeof card.photos,
      mediaFilesLen: Array.isArray(card.mediaFiles) ? (card.mediaFiles as unknown[]).length : typeof card.mediaFiles,
      sizesLen: Array.isArray(card.sizes) ? (card.sizes as unknown[]).length : 0,
      sizes0: Array.isArray(card.sizes) ? (card.sizes as unknown[])[0] : undefined,
    }).slice(0, 500));

    // Цены Content API не содержит — запрашиваем через Discounts & Prices API
    const [priceInfo, description] = await Promise.all([
      fetchWBPrices(article, token),
      fetchWBDescription(article).catch(() => undefined),
    ]);

    const priceBasic = priceInfo?.priceBasic ?? 0;
    const priceSale = priceInfo?.priceSale ?? 0;
    const salePercent = priceBasic > 0 && priceSale < priceBasic
      ? Math.round((1 - priceSale / priceBasic) * 100)
      : (priceInfo?.discount ?? 0);

    // Content API v2:
    // - photos[] — массив объектов { big, c246x328, c516x688, square, tm }
    // - mediaFiles[] — альтернативное поле (массив строк-URL), встречается в некоторых карточках
    // - characteristics[] — массив { id, name, value[] }, цвет = item где name === "Цвет"
    const photoObjs = Array.isArray(card.photos) ? card.photos as Record<string, string>[] : [];
    const mediaFiles = Array.isArray(card.mediaFiles) ? card.mediaFiles as string[] : [];
    const photos = photoObjs.length || mediaFiles.length;

    const firstPhotoObj = photoObjs[0];
    const photoUrl = firstPhotoObj
      ? (firstPhotoObj.big || firstPhotoObj.c516x688 || firstPhotoObj.c246x328 || '')
      : (mediaFiles[0] || '');

    const characteristics = Array.isArray(card.characteristics)
      ? card.characteristics as { name: string; value: string[] }[]
      : [];
    const colorChar = characteristics.find((c) => c.name === 'Цвет');
    const colors = colorChar?.value ?? [];

    return {
      article,
      name: String(card.title || ''),       // Content API v2: поле называется "title", не "name"
      brand: String(card.brand || ''),
      supplierId: Number(card.supplierId || 0),
      imtId: Number(card.imtID || 0),
      subjectName: String(card.subjectName || ''),
      subjectParentName: String(card.subjectParentName || ''),
      pics: photos,
      rating: 0,
      feedbacks: 0,
      priceBasic,
      priceSale,
      salePercent,
      totalStock: 0,
      stocks: [],
      colors,
      description,
      mediaTypes: photoUrl || `Фото: ${photos}`,
      photoUrl: photoUrl || undefined,
    };
  } catch {
    return null;
  }
}

// Публичный Card API — даёт рейтинг, остатки (WB блокирует с 403, пробуем разные источники)
async function fetchFromPublicCardAPI(article: string): Promise<Partial<WBProduct> | null> {
  const id = parseInt(article, 10);
  const vol = Math.floor(id / 100000);
  const part = Math.floor(id / 1000);
  const basket = getBasket(vol);

  // Корзины для fallback-пробы если основная вернула 404 (WB периодически добавляет новые CDN)
  const extraBaskets = ['41', '42', '43', '44', '45'].filter((b) => b !== basket);
  const cdnUrls = [
    `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${article}/info/ru/card.json`,
    ...extraBaskets.map((b) => `https://basket-${b}.wbbasket.ru/vol${vol}/part${part}/${article}/info/ru/card.json`),
  ];

  const urls = [
    ...cdnUrls,
    `https://card.wb.ru/cards/detail?appType=1&curr=rub&dest=-1257786&nm=${article}`,
    `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=${article}`,
    `https://wbx-content-v2.wbstatic.net/ru/${article}.json`,
    // WB Search API — ищет по nmId в общем индексе, обходит блокировку card.wb.ru
    `https://search.wb.ru/exactmatch/ru/common/v7/search?query=${article}&resultset=catalog&limit=1&sort=popular&page=1&appType=1&dest=-1257786&curr=rub`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: WB_HEADERS, next: { revalidate: 0 }, signal: AbortSignal.timeout(6000) });
      // eslint-disable-next-line no-console
      if (!res.ok) { console.log(`[WB Public API] ${new URL(url).hostname} → HTTP ${res.status}`); continue; }
      const json = await res.json();

      // Формат basket card.json: { id, name, brand, imt_id, photos[], colors[], description }
      // Формат card.wb.ru / search.wb.ru: { data: { products: [{ name, brand, priceU, rating, feedbacks, sizes[] }] } }
      let p = json?.data?.products?.[0]
        ?? json?.catalog?.products?.[0]
        ?? (Array.isArray(json?.data) ? json.data[0] : null)
        ?? json?.resultset?.products?.[0];

      // Basket card.json имеет поле id и name на верхнем уровне
      if (!p && (json?.id || json?.nm_id) && (json?.name || json?.title)) p = json;
      if (!p) {
        // eslint-disable-next-line no-console
        console.log(`[WB Public API] ${new URL(url).hostname} → 200 но товар не распознан:`, JSON.stringify(json).slice(0, 200));
        continue;
      }

      // search.wb.ru ищет по строке, может вернуть чужой товар — проверяем nmId
      if (url.includes('search.wb.ru')) {
        const pId = Number(p.id || p.nm_id || p.nmId || 0);
        if (pId && pId !== id) {
          // eslint-disable-next-line no-console
          console.log(`[WB Public API] search.wb.ru → чужой товар (nmId=${pId} ≠ ${id}), пропускаем`);
          continue;
        }
      }

      // eslint-disable-next-line no-console
      console.log('[WB Public API] sample:', JSON.stringify({ url: new URL(url).hostname, name: p.name, rating: p.rating, feedbacks: p.feedbacks, priceU: p.priceU, pics: p.pics, photosLen: p.photos?.length }));

      const totalStock = (p.sizes || []).reduce(
        (acc: number, s: { stocks?: { qty: number }[] }) =>
          acc + (s.stocks || []).reduce((a: number, st: { qty: number }) => a + (st.qty || 0), 0),
        0
      );
      const stocks = (p.sizes || []).flatMap(
        (s: { stocks?: { wh: number; qty: number }[] }) =>
          (s.stocks || []).map((st: { wh: number; qty: number }) => ({ warehouseId: st.wh, qty: st.qty }))
      );

      return {
        name: p.name || '',
        brand: p.brand || '',
        supplierId: p.supplierId || 0,
        imtId: p.root || p.imtId || p.imt_id || 0,
        subjectName: p.subjectName || '',
        subjectParentName: p.subjectParentName || '',
        // basket использует photos[], card.wb.ru — pics (число)
        pics: p.pics || (Array.isArray(p.photos) ? p.photos.length : 0),
        rating: p.rating || 0,
        feedbacks: p.feedbacks || 0,
        priceBasic: Math.round((p.priceU || 0) / 100),
        priceSale: Math.round((p.salePriceU || 0) / 100),
        salePercent: p.sale || 0,
        totalStock,
        stocks,
        colors: (p.colors || []).map((c: { name: string }) => c.name),
        description: p.description || undefined,
      };
    } catch { continue; }
  }
  return null;
}

// Остатки на складах WB — официальный эндпоинт Analytics v1
// POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses
// Ответ: data.products[].sizes[].warehouses[].{ warehouseName, qty }
async function fetchWBNmReport(article: string, token: string): Promise<{
  feedbacks: number; avgRating: number; totalStock: number; imtId: number;
  stocks: WBStockItem[];
} | null> {
  const nmId = parseInt(article, 10);
  let totalStock = 0;
  const stocks: WBStockItem[] = [];

  // Bearer-префикс нужен для Analytics API (в отличие от Content/Statistics API)
  const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

  try {
    const res = await fetch(
      'https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses',
      {
        method: 'POST',
        headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nmIds: [nmId], limit: 1000, offset: 0 }),
        signal: AbortSignal.timeout(15000),
      }
    );
    // eslint-disable-next-line no-console
    console.log(`[WB Stocks] HTTP ${res.status}`);
    if (res.ok) {
      const json = await res.json();
      // Реальная структура API: data.items[] — плоский список (одна запись = один размер на одном складе)
      // { nmId, chrtId, warehouseId, warehouseName, regionName, quantity, inWayToClient, inWayFromClient }
      const items: Record<string, unknown>[] = json?.data?.items ?? [];
      const warehouseMap = new Map<string, number>();
      for (const item of items) {
        if (Number(item.nmId) !== nmId) continue;
        const name = String(item.warehouseName ?? '');
        const qty = Number(item.quantity ?? 0);
        warehouseMap.set(name, (warehouseMap.get(name) ?? 0) + qty);
        totalStock += qty;
      }
      for (const [warehouseName, qty] of warehouseMap) {
        if (qty > 0) stocks.push({ warehouseId: 0, warehouseName, qty });
      }
      // eslint-disable-next-line no-console
      console.log(`[WB Stocks] totalStock=${totalStock}, складов=${stocks.length}`, stocks.slice(0, 5).map((s) => `${s.warehouseName}:${s.qty}`).join(', '));
    } else {
      const body = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[WB Stocks] ошибка ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[WB Stocks] исключение:', String(e).slice(0, 120));
  }

  if (totalStock > 0 || stocks.length > 0) {
    return { feedbacks: 0, avgRating: 0, totalStock, imtId: 0, stocks };
  }

  // eslint-disable-next-line no-console
  console.log('[WB Stocks] нет остатков для артикула', article);
  return null;
}

export async function fetchWBProduct(article: string, token?: string): Promise<WBProduct | null> {
  // Запускаем все источники параллельно
  const [contentResult, publicResult, nmReport] = await Promise.all([
    token ? fetchFromContentAPI(article, token) : Promise.resolve(null),
    fetchFromPublicCardAPI(article),
    token ? fetchWBNmReport(article, token) : Promise.resolve(null),
  ]);

  // nmReport (Analytics API) — приоритетный источник остатков: даёт склады по именам
  const rating     = publicResult?.rating     || nmReport?.avgRating  || 0;
  const feedbacks  = publicResult?.feedbacks  || nmReport?.feedbacks  || 0;
  const totalStock = nmReport?.totalStock || publicResult?.totalStock || 0;
  // Склады: nmReport даёт warehouseName (именованные), publicResult — числовые ID; предпочитаем nmReport
  const stocks     = (nmReport?.stocks?.length ? nmReport.stocks : publicResult?.stocks) ?? [];

  if (contentResult && publicResult) {
    // Цены: приоритет contentResult (Discounts API) — официальный источник продавца.
    // publicResult.priceBasic берём только если contentResult не нашёл цену.
    const priceBasic  = contentResult.priceBasic  || publicResult.priceBasic  || 0;
    const priceSale   = contentResult.priceSale   || publicResult.priceSale   || 0;
    const salePercent = contentResult.salePercent || publicResult.salePercent || 0;
    return {
      ...contentResult,
      rating, feedbacks, totalStock, stocks,
      imtId: publicResult.imtId || contentResult.imtId || nmReport?.imtId || 0,
      priceBasic, priceSale, salePercent,
      colors: publicResult.colors?.length ? publicResult.colors : contentResult.colors,
    };
  }

  if (contentResult) {
    return {
      ...contentResult,
      rating, feedbacks, totalStock, stocks,
      imtId: contentResult.imtId || nmReport?.imtId || 0,
    };
  }

  if (publicResult) {
    const description = await fetchWBDescription(article).catch(() => undefined);
    return {
      article,
      name: publicResult.name || '',
      brand: publicResult.brand || '',
      supplierId: publicResult.supplierId || 0,
      imtId: publicResult.imtId || nmReport?.imtId || 0,
      subjectName: publicResult.subjectName || '',
      subjectParentName: publicResult.subjectParentName || '',
      pics: publicResult.pics || 0,
      rating, feedbacks, totalStock, stocks,
      priceBasic: publicResult.priceBasic || 0,
      priceSale:  publicResult.priceSale  || 0,
      salePercent: publicResult.salePercent || 0,
      colors: publicResult.colors || [],
      description,
      mediaTypes: `Фото: ${publicResult.pics || 0}`,
    };
  }

  // Обе карточные API недоступны, но остатки из Analytics API есть — возвращаем заглушку.
  // route.ts дополнит name/brand из рекламных данных через fetchWBProductFallback.
  if (nmReport && (nmReport.totalStock > 0 || nmReport.stocks.length > 0)) {
    return {
      article,
      name: '',
      brand: '',
      supplierId: 0,
      imtId: nmReport.imtId,
      subjectName: '',
      subjectParentName: '',
      pics: 0,
      rating: nmReport.avgRating,
      feedbacks: nmReport.feedbacks,
      priceBasic: 0,
      priceSale: 0,
      salePercent: 0,
      totalStock: nmReport.totalStock,
      stocks: nmReport.stocks,
      colors: [],
    };
  }

  throw new Error('WB card API: все источники недоступны (Content API и публичный API)');
}

async function fetchWBDescription(article: string): Promise<string | undefined> {
  try {
    const id = parseInt(article, 10);
    const vol = Math.floor(id / 100000);
    const part = Math.floor(id / 1000);
    const basket = getBasket(vol);
    const url = `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${article}/info/ru/card.json`;
    const res = await fetch(url, { headers: WB_HEADERS, next: { revalidate: 0 } });
    if (!res.ok) return undefined;
    const json = await res.json();
    return json?.description || undefined;
  } catch {
    return undefined;
  }
}

function getBasket(vol: number): string {
  if (vol <= 143) return '01'; if (vol <= 287) return '02'; if (vol <= 431) return '03';
  if (vol <= 719) return '04'; if (vol <= 1007) return '05'; if (vol <= 1061) return '06';
  if (vol <= 1115) return '07'; if (vol <= 1169) return '08'; if (vol <= 1313) return '09';
  if (vol <= 1601) return '10'; if (vol <= 1655) return '11'; if (vol <= 1919) return '12';
  if (vol <= 2045) return '13'; if (vol <= 2189) return '14'; if (vol <= 2405) return '15';
  if (vol <= 2621) return '16'; if (vol <= 2837) return '17'; if (vol <= 3053) return '18';
  if (vol <= 3269) return '19'; if (vol <= 3485) return '20'; if (vol <= 3701) return '21';
  if (vol <= 3917) return '22'; if (vol <= 4133) return '23'; if (vol <= 4349) return '24';
  if (vol <= 4565) return '25'; if (vol <= 4781) return '26'; if (vol <= 4997) return '27';
  if (vol <= 5213) return '28'; if (vol <= 5429) return '29'; if (vol <= 5645) return '30';
  if (vol <= 5861) return '31'; if (vol <= 6077) return '32'; if (vol <= 6293) return '33';
  if (vol <= 6509) return '34'; if (vol <= 6725) return '35'; if (vol <= 6941) return '36';
  if (vol <= 7157) return '37'; if (vol <= 7373) return '38'; if (vol <= 7589) return '39';
  return '40';
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export async function fetchWBStats(
  article: string, token: string
): Promise<{ stats: WBStats; meta?: SalesFunnelMeta } | null> {
  if (!token) return null;
  const { from, to } = getLast7Days();

  const [v3, v1] = await Promise.allSettled([
    tryAnalyticsV3SalesFunnel(article, token, from, to),
    tryStatisticsV1(article, token, from, to),
  ]);

  const r3 = v3.status === 'fulfilled' ? v3.value : null;
  const r1 = v1.status === 'fulfilled' ? v1.value : null;

  if (r3 && r1) {
    const useR3 = r3.stats.openCardCount > 0 || r3.stats.ordersCount >= r1.ordersCount;
    return { stats: useR3 ? r3.stats : r1, meta: r3.meta };
  }
  if (r3) return r3;
  if (r1) return { stats: r1 };
  return null;
}

// Согласно официальной документации WB:
// Правильный эндпоинт воронки продаж — /api/analytics/v3/sales-funnel/products
// Body: { selectedPeriod: { start, end }, nmIds: [], limit, offset }
// Ответ: { data: { products: [{ nmID, openCardCount, addToCartCount, ordersCount, ... }] } }
export interface SalesFunnelMeta {
  name: string;
  brand: string;
  rating: number;
  subjectName: string;
}

async function tryAnalyticsV3SalesFunnel(
  article: string, token: string, from: string, to: string
): Promise<{ stats: WBStats; meta: SalesFunnelMeta }> {
  const res = await fetch('https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products', {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selectedPeriod: { start: from, end: to },
      nmIds: [parseInt(article, 10)],
      limit: 1000,
      offset: 0,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.warn(`[WB SalesFunnel] HTTP ${res.status}: ${body.slice(0, 200)}`);
    throw new Error(`sales-funnel HTTP ${res.status}`);
  }

  const json = await res.json();
  // eslint-disable-next-line no-console
  console.log('[WB SalesFunnel] sample:', JSON.stringify(json?.data?.products?.[0]).slice(0, 400));

  const prod = json?.data?.products?.[0];
  if (!prod) throw new Error('sales-funnel: нет данных для артикула');

  // V3 API структура: statistic.selected.metrics.{views, addToWishList, openCount, cartCount, ...}
  //                   statistic.selected.conversions.{viewToCartPercent, cartToOrderPercent}
  const prodR = prod as Record<string, unknown>;

  // Извлекаем мета-данные товара из sub-объекта product: { title, brandName, feedbackRating, subjectName }
  const productInfo = (prodR.product ?? prodR) as Record<string, unknown>;
  const meta: SalesFunnelMeta = {
    name:        String(productInfo.title      ?? productInfo.name      ?? ''),
    brand:       String(productInfo.brandName  ?? productInfo.brand     ?? ''),
    rating:      Number(productInfo.feedbackRating ?? 0),
    subjectName: String(productInfo.subjectName ?? ''),
  };

  const selected = (
    ((prodR.statistic as Record<string, unknown>)?.selected)
    ?? prodR
  ) as Record<string, unknown>;

  // metrics — под-объект с показами и wishlist; остальные поля могут быть прямо в selected
  const metrics = (selected.metrics as Record<string, unknown>) ?? selected;

  // Хелпер: ищет поле сначала в metrics, потом в selected
  const g = (...keys: string[]) => {
    for (const k of keys) {
      if (metrics[k] != null) return Number(metrics[k]);
      if (selected[k] != null) return Number(selected[k]);
    }
    return 0;
  };

  const ordersCount      = g('orderCount',  'ordersCount');
  const rawBuyoutsCount  = g('buyoutCount', 'buyoutsCount');
  const ordersSumRub     = g('orderSum',    'ordersSumRub');
  const buyoutsSumRub    = g('buyoutSum',   'buyoutsSumRub');
  const cancelCount      = g('cancelCount');
  const cancelSumRub     = g('cancelSum',   'cancelSumRub');

  const convObj = selected.conversions as Record<string, unknown> | null | undefined;
  const addToCartPercent   = Number(convObj?.viewToCartPercent ?? convObj?.openCardToCartPercent ?? convObj?.addToCartPercent ?? 0);
  const cartToOrderPercent = Number(convObj?.cartToOrderPercent ?? 0);
  // API может не вернуть rawBuyoutsCount, но часто отдаёт готовый buyoutPercent в convObj
  const buyoutPct = Number(convObj?.buyoutPercent ?? convObj?.buyoutsPercent ?? 0);
  const buyoutsCount = rawBuyoutsCount > 0
    ? rawBuyoutsCount
    : (buyoutPct > 0 ? Math.round(ordersCount * buyoutPct / 100) : 0);
  const buyoutPercent = buyoutPct > 0 ? buyoutPct
    : (ordersCount > 0 ? (buyoutsCount / ordersCount) * 100 : 0);

  // eslint-disable-next-line no-console
  console.log('[WB SalesFunnel] parsed:', { views: g('views'), openCardCount: g('openCount', 'openCardCount'), ordersCount, buyoutsCount, buyoutPercent, meta });

  return {
    stats: {
      period: `${from} — ${to}`,
      views:          g('views', 'viewsCount'),
      openCardCount:  g('openCount', 'openCardCount'),
      addToCartCount: g('cartCount', 'addToCartCount'),
      addToWishlist:  g('addToWishList', 'addToWishlist'),
      ordersCount,
      ordersSumRub,
      buyoutsCount,
      buyoutsSumRub,
      buyoutPercent,
      cancelCount,
      cancelSumRub,
      avgPriceRub:          g('avgPrice', 'avgPriceRub') || (ordersCount > 0 ? ordersSumRub / ordersCount : 0),
      avgOrdersCountPerDay: g('avgOrdersCountPerDay') || ordersCount / 7,
      conversions: {
        addToCartPercent,
        cartToOrderPercent,
        buyoutsPercent: buyoutPercent,
      },
    },
    meta,
  };
}

async function tryStatisticsV1(article: string, token: string, from: string, to: string): Promise<WBStats> {
  // Statistics API v1 — orders + sales level data
  const ordersRes = await fetch(
    `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${from}T00:00:00`,
    { headers: { Authorization: token } }
  );
  if (!ordersRes.ok) throw new Error(`Statistics v1 orders: HTTP ${ordersRes.status}`);

  const orders: Record<string, unknown>[] = await ordersRes.json();
  const nmId = parseInt(article, 10);
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59);

  const filtered = orders.filter((o) => {
    const oNm = Number(o.nmId || o.nmID || 0);
    const oDate = new Date(String(o.date || o.lastChangeDate || ''));
    return oNm === nmId && oDate >= fromDate && oDate <= toDate;
  });

  const ordersCount = filtered.length;
  const ordersSumRub = filtered.reduce((a, o) => a + Number(o.totalPrice || o.priceWithDisc || 0), 0);
  const buyouts = filtered.filter((o) => Number(o.isSupply) === 1 || o.srid);
  const cancels = filtered.filter((o) => String(o.orderType || '').includes('Cancelled') || o.cancelDate);

  return {
    period: `${from} — ${to}`,
    views: 0,
    openCardCount: 0,
    addToCartCount: 0,
    addToWishlist: 0,
    ordersCount,
    ordersSumRub,
    buyoutsCount: buyouts.length,
    buyoutsSumRub: buyouts.reduce((a, o) => a + Number(o.totalPrice || 0), 0),
    buyoutPercent: ordersCount > 0 ? (buyouts.length / ordersCount) * 100 : 0,
    cancelCount: cancels.length,
    cancelSumRub: cancels.reduce((a, o) => a + Number(o.totalPrice || 0), 0),
    avgPriceRub: ordersCount > 0 ? ordersSumRub / ordersCount : 0,
    avgOrdersCountPerDay: ordersCount / 7,
    conversions: { addToCartPercent: 0, cartToOrderPercent: 0, buyoutsPercent: 0 },
  };
}

// ─── Advertising ─────────────────────────────────────────────────────────────

export async function fetchWBAdvertising(article: string, token: string): Promise<WBAdvertising | null> {
  if (!token) return null;

  try {
    const { from, to } = getLast7Days();
    const nmId = parseInt(article, 10);
    const BASE = 'https://advert-api.wildberries.ru';
    const emptyResult = (note: string): WBAdvertising =>
      ({ totalSpend: 0, totalOrders: 0, avgCtr: 0, avgCpc: 0, drr: 0, campaigns: [], note });

    // Шаг 1: GET /adv/v1/promotion/count
    // Ответ: { adverts: [{ type, status, count, advert_list: [{ advertId, changeTime }] }], all: N }
    const countRes = await fetch(`${BASE}/adv/v1/promotion/count`, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(12000),
    });
    if (!countRes.ok) {
      const body = await countRes.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[WB Adv] count API HTTP ${countRes.status}: ${body.slice(0, 200)}`);
      return emptyResult(`count API: HTTP ${countRes.status}`);
    }

    const countJson = await countRes.json();
    // eslint-disable-next-line no-console
    console.log('[WB Adv count]:', JSON.stringify(countJson).slice(0, 600));

    // Извлекаем все advertId из advert_list каждой группы
    const allIds: number[] = [];
    for (const group of (countJson?.adverts ?? [])) {
      for (const item of (group?.advert_list ?? [])) {
        if (item?.advertId) allIds.push(Number(item.advertId));
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[WB Adv] Всего ID из count: ${allIds.length}`);

    if (allIds.length === 0) return emptyResult('Нет рекламных кампаний');

    // Шаг 2: GET /api/advert/v2/adverts?ids=... — батчи по 50
    // Ответ: { adverts: [{ id, status, nm_settings: [{ nm_id }] }] }
    const filteredIds: number[] = [];
    for (let i = 0; i < allIds.length && filteredIds.length < 50; i += 50) {
      const batch = allIds.slice(i, i + 50);
      try {
        const r = await fetch(`${BASE}/api/advert/v2/adverts?ids=${batch.join(',')}`, {
          headers: { Authorization: token },
          signal: AbortSignal.timeout(12000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        // Ответ обёрнут в { adverts: [...] }
        const adverts: Record<string, unknown>[] = Array.isArray(data?.adverts)
          ? data.adverts
          : (Array.isArray(data) ? data : []);

        for (const a of adverts) {
          const nmSettings = a.nm_settings as { nm_id?: number }[] | undefined;
          if (nmSettings?.some((s) => s.nm_id === nmId)) {
            // ID кампании — поле "id", не "advertId"
            filteredIds.push(Number(a.id ?? a.advertId ?? 0));
          }
        }
      } catch { continue; }
    }

    // eslint-disable-next-line no-console
    console.log(`[WB Adv] Кампании для nmId=${nmId}: ${filteredIds.length} шт.`);

    if (filteredIds.length === 0) {
      // nm_settings не нашёл кампании для артикула — возможно другая структура API.
      // Fallback: берём ВСЕ кампании продавца (не более 50), ИИ сам разберёт.
      // eslint-disable-next-line no-console
      console.warn(`[WB Adv] nm_settings filter вернул 0 для nmId=${nmId}, используем все ${allIds.length} кампаний`);
      filteredIds.push(...allIds.slice(0, 50));
    }
    if (filteredIds.length === 0) return emptyResult('Нет рекламных кампаний');

    // Шаг 3: GET /adv/v3/fullstats?ids=...&beginDate=...&endDate=... (макс. 50 ID, лимит 3 req/min)
    const statsRes = await fetch(
      `${BASE}/adv/v3/fullstats?ids=${filteredIds.slice(0, 50).join(',')}&beginDate=${from}&endDate=${to}`,
      { headers: { Authorization: token }, signal: AbortSignal.timeout(20000) }
    );

    if (statsRes.status === 429) return emptyResult('Превышен лимит запросов (429). Повторите через минуту.');
    if (!statsRes.ok) return emptyResult(`Статистика недоступна: HTTP ${statsRes.status}`);

    const statsRaw = await statsRes.json();
    // eslint-disable-next-line no-console
    console.log('[WB Adv fullstats sample]:', JSON.stringify(Array.isArray(statsRaw) ? statsRaw[0] : statsRaw).slice(0, 400));

    const statsArr: unknown[] = Array.isArray(statsRaw) ? statsRaw
      : Array.isArray(statsRaw?.adverts) ? statsRaw.adverts : [];

    const campaigns: WBAdCampaign[] = statsArr.map((c) => {
      const camp = c as Record<string, unknown>;
      // v3 fullstats может вернуть плоскую структуру ИЛИ days[]
      const days = Array.isArray(camp.days) ? (camp.days as Record<string, unknown>[]) : [];
      const sumDays = (key: string) => days.reduce((a, d) => a + Number(d[key] ?? 0), 0);

      // Приоритет: плоские значения на уровне кампании, fallback — сумма по дням
      const views     = Number(camp.views     ?? 0) || sumDays('views');
      const clicks    = Number(camp.clicks    ?? 0) || sumDays('clicks');
      const orders    = Number(camp.orders    ?? camp.booked_sum ?? 0) || sumDays('orders');
      const sum       = Number(camp.sum       ?? 0) || sumDays('sum');
      const atbs      = Number(camp.atbs      ?? 0) || sumDays('atbs');
      const shks      = Number(camp.shks      ?? 0) || sumDays('shks');
      const sum_price = Number(camp.sum_price ?? 0) || sumDays('sum_price');
      // ctr/cpc/cr — берём готовые из ответа если есть
      const ctr = Number(camp.ctr ?? (views  > 0 ? (clicks / views)  * 100 : 0));
      const cpc = Number(camp.cpc ?? (clicks > 0 ? sum / clicks            : 0));
      const cr  = Number(camp.cr  ?? (clicks > 0 ? (orders / clicks) * 100 : 0));

      return {
        advertId: Number(camp.advertId ?? camp.id ?? 0),
        name:     String(camp.name ?? ''),
        type:     Number(camp.type ?? 0),
        status:   Number(camp.status ?? 0),
        views, clicks, ctr, cpc, sum, atbs, orders, cr, shks, sum_price,
      };
    });

    // Выбираем одну основную кампанию — ту, что имела расход в периоде (последняя активная).
    // Суммировать несколько кампаний нельзя: CTR, CPC, ДРР теряют смысл при агрегации.
    const withSpend = campaigns.filter((c) => c.sum > 0);
    const primary = withSpend.length > 0
      ? withSpend.reduce((best, c) => c.sum > best.sum ? c : best)   // наибольший расход за период
      : campaigns.reduce((best, c) => c.sum > best.sum ? c : best, campaigns[0]); // архивная — берём с max расходом

    const totalSpend  = primary?.sum       ?? 0;
    const totalOrders = primary?.orders    ?? 0;
    const avgCtr      = primary?.ctr       ?? 0;
    const avgCpc      = primary?.cpc       ?? 0;
    const revenue     = primary?.sum_price ?? 0;
    const drr         = revenue > 0 ? (totalSpend / revenue) * 100 : 0;

    // eslint-disable-next-line no-console
    console.log(`[WB Adv] Основная кампания: [${primary?.advertId}] "${primary?.name}" sum=${primary?.sum} orders=${primary?.orders} ctr=${primary?.ctr}`);

    // Извлекаем имя товара из days основной кампании
    let productName: string | undefined;
    const primaryRaw = statsArr.find((c) => {
      const camp = c as Record<string, unknown>;
      return Number(camp.advertId ?? camp.id) === primary?.advertId;
    }) as Record<string, unknown> | undefined;

    if (primaryRaw) {
      outer: for (const day of (Array.isArray(primaryRaw.days) ? primaryRaw.days as Record<string, unknown>[] : [])) {
        for (const app of (Array.isArray(day.apps) ? day.apps as Record<string, unknown>[] : [])) {
          for (const nm of (Array.isArray(app.nms) ? app.nms as Record<string, unknown>[] : [])) {
            if (nm.name && typeof nm.name === 'string' && nm.name.trim()) {
              productName = nm.name.trim();
              break outer;
            }
          }
        }
      }
    }

    return { totalSpend, totalOrders, avgCtr, avgCpc, drr, campaigns: primary ? [primary] : [], note: '', productName };
  } catch (err) {
    throw new Error(`fetchWBAdvertising: ${err}`);
  }
}

// ─── Fallback-продукт из рекламных данных ────────────────────────────────────

export async function fetchWBProductFallback(article: string, name: string, token: string): Promise<WBProduct> {
  const priceInfo = await fetchWBPrices(article, token).catch(() => null);
  return {
    article,
    name,
    brand: '',
    supplierId: 0,
    imtId: 0,
    subjectName: '',
    subjectParentName: '',
    pics: 0,
    rating: 0,
    feedbacks: 0,
    priceBasic: priceInfo?.priceBasic ?? 0,
    priceSale: priceInfo?.priceSale ?? 0,
    salePercent: priceInfo?.discount ?? 0,
    totalStock: 0,
    stocks: [],
    colors: [],
  };
}
