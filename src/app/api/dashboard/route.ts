import { NextRequest, NextResponse } from 'next/server';
import type { DashboardProduct, DashboardData } from '@/types';

export const runtime = 'edge';
export const maxDuration = 30;

const SELLER_LABEL = process.env.SELLER_LABEL || 'Кирилл';

type StatEntry = {
  ordersCount: number;
  buyoutsCount: number;
  buyoutPercent: number;
  addToCartCount: number;
  views: number;
};

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function wbFetch(url: string, opts: RequestInit, timeoutMs = 10000): Promise<Response> {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 429) {
    await delay(5000);
    return fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
  }
  return res;
}

// /api/analytics/... требует Bearer-префикс
function bearer(token: string) {
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

// Форматирует Date (UTC-поля = МСК время) → "YYYY-MM-DD HH:00:00"
function fmtMsk(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:00:00`;
}

// Парсит ответ воронки продаж
function parseFunnelEntry(prod: Record<string, unknown>): StatEntry {
  const selected = ((prod.statistic as Record<string, unknown>)?.selected ?? prod) as Record<string, unknown>;
  const metrics = (selected.metrics as Record<string, unknown>) ?? selected;
  const convObj = selected.conversions as Record<string, unknown> | null | undefined;

  const g = (...keys: string[]): number => {
    for (const k of keys) {
      if (metrics[k] != null) return Number(metrics[k]);
      if (selected[k] != null) return Number(selected[k]);
    }
    return 0;
  };

  const ordersCount = g('orderCount', 'ordersCount');
  const buyoutPct = Number(convObj?.buyoutPercent ?? convObj?.buyoutsPercent ?? 0);
  const rawBuyouts = g('buyoutCount', 'buyoutsCount');
  const buyoutsCount = rawBuyouts > 0 ? rawBuyouts : (buyoutPct > 0 ? Math.round(ordersCount * buyoutPct / 100) : 0);

  return {
    ordersCount,
    buyoutsCount,
    buyoutPercent: buyoutPct > 0 ? buyoutPct : (ordersCount > 0 ? (buyoutsCount / ordersCount) * 100 : 0),
    addToCartCount: g('cartCount', 'addToCartCount'),
    views: g('views', 'viewsCount'),
  };
}

export async function GET(_req: NextRequest) {
  const token = process.env.WB_API_TOKEN || '';
  if (!token) {
    return NextResponse.json({ error: 'WB_API_TOKEN не настроен' }, { status: 500 });
  }

  try {
    // Step 1: ярлыки
    const tagsRes = await wbFetch('https://content-api.wildberries.ru/content/v2/tags', {
      headers: { Authorization: token },
    }, 8000);

    if (!tagsRes.ok) {
      return NextResponse.json({ error: `Tags API: HTTP ${tagsRes.status}` }, { status: 500 });
    }

    const tagsJson = await tagsRes.json();
    const tags: { id: number; name: string }[] = tagsJson?.data ?? [];
    const tag = tags.find((t) => t.name === SELLER_LABEL);

    if (!tag) {
      const available = tags.map((t) => `"${t.name}"`).join(', ');
      return NextResponse.json({
        error: `Ярлык "${SELLER_LABEL}" не найден. Доступные: ${available || 'нет'}`,
      }, { status: 404 });
    }

    // Step 2: карточки с пагинацией
    const allCards: Record<string, unknown>[] = [];

    for (let offset = 0; offset < 2000; offset += 100) {
      if (offset > 0) await delay(200);

      const cardsRes = await wbFetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            cursor: { limit: 100, offset },
            filter: { tagIDs: [tag.id], withPhoto: -1 },
          },
        }),
      });

      if (!cardsRes.ok) break;
      const cards: Record<string, unknown>[] = (await cardsRes.json())?.cards ?? [];
      allCards.push(...cards);
      if (cards.length < 100) break;
    }

    // Временные метки МСК
    const MSK = 3 * 60 * 60 * 1000;
    const nowMsk = new Date(Date.now() + MSK);
    const beginMsk = new Date(nowMsk.getTime());
    beginMsk.setUTCHours(0, 0, 0, 0);
    const endMsk = new Date(nowMsk.getTime());
    endMsk.setUTCMinutes(0, 0, 0);
    if (endMsk <= beginMsk) endMsk.setUTCHours(1, 0, 0, 0);

    const beginStr = fmtMsk(beginMsk);
    const endStr = fmtMsk(endMsk);

    const todayDate = beginStr.split(' ')[0]; // "2026-05-19"
    const begin30Msk = new Date(beginMsk.getTime() - 30 * 24 * 60 * 60 * 1000);
    const begin30Date = fmtMsk(begin30Msk).split(' ')[0]; // "2026-04-19"

    if (allCards.length === 0) {
      return NextResponse.json({
        products: [], sellerLabel: SELLER_LABEL, tagId: tag.id,
        fetchedAt: new Date().toLocaleString('ru-RU'),
        periodFrom: beginStr, periodTo: endStr,
      } as DashboardData);
    }

    const nmIds = allCards.map((c) => Number(c.nmID));

    // Step 3: цены + остатки + статистика сегодня + выкуп 30д — параллельно
    const [pricesResult, stocksResult, statsTodayResult, buyout30Result] = await Promise.allSettled([
      fetchAllPrices(token),
      fetchBatchStocks(nmIds, token),
      fetchFunnelAll(nmIds, token, todayDate, todayDate),
      fetchFunnelAll(nmIds, token, begin30Date, todayDate),
    ]);

    const pricesMap = pricesResult.status === 'fulfilled' ? pricesResult.value : new Map<number, { priceSale: number; priceBasic: number; salePercent: number }>();
    const stocksMap = stocksResult.status === 'fulfilled' ? stocksResult.value : new Map<number, number>();
    const statsTodayMap = statsTodayResult.status === 'fulfilled' ? statsTodayResult.value : new Map<number, StatEntry>();
    const buyout30Map = buyout30Result.status === 'fulfilled' ? buyout30Result.value : new Map<number, StatEntry>();

    const products: DashboardProduct[] = allCards.map((card) => {
      const nmId = Number(card.nmID);
      const prices = pricesMap.get(nmId);
      const statsToday = statsTodayMap.get(nmId);
      const stats30 = buyout30Map.get(nmId);
      const stock = stocksMap.get(nmId) ?? 0;

      const photos = Array.isArray(card.photos) ? card.photos as Record<string, string>[] : [];
      const photoUrl = photos[0]?.c246x328 || photos[0]?.big || '';

      return {
        article: String(nmId),
        name: String(card.title || ''),
        brand: String(card.brand || ''),
        priceSale: prices?.priceSale ?? 0,
        priceBasic: prices?.priceBasic ?? 0,
        salePercent: prices?.salePercent ?? 0,
        totalStock: stock,
        photoUrl: photoUrl || undefined,
        ordersCount: statsToday?.ordersCount ?? 0,
        buyoutsCount: statsToday?.buyoutsCount ?? 0,
        buyoutPercent: stats30?.buyoutPercent ?? statsToday?.buyoutPercent ?? 0,
        addToCartCount: statsToday?.addToCartCount ?? 0,
        views: statsToday?.views ?? 0,
        ordersYesterday: 0,
        addToCartYesterday: 0,
        buyoutPercentYesterday: 0,
        hasYesterdayData: false,
      };
    });

    return NextResponse.json({
      products, sellerLabel: SELLER_LABEL, tagId: tag.id,
      fetchedAt: new Date().toLocaleString('ru-RU'),
      periodFrom: beginStr,
      periodTo: endStr,
    } as DashboardData, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── Воронка продаж для всех товаров ──
// Вызывает /api/analytics/v3/sales-funnel/products по 1 nmId за раз (ограничение WB API)
async function fetchFunnelAll(nmIds: number[], token: string, startDate: string, endDate: string) {
  const map = new Map<number, StatEntry>();
  const CONCURRENCY = 10;

  for (let i = 0; i < nmIds.length; i += CONCURRENCY) {
    if (i > 0) await delay(150);
    await Promise.all(nmIds.slice(i, i + CONCURRENCY).map(async (nmId) => {
      try {
        const res = await wbFetch(
          'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products',
          {
            method: 'POST',
            headers: { Authorization: bearer(token), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              selectedPeriod: { start: startDate, end: endDate },
              nmIds: [nmId],
              limit: 10,
              offset: 0,
            }),
          },
          5000
        );
        if (!res.ok) return;
        const json = await res.json();
        const prod = json?.data?.products?.[0] as Record<string, unknown> | undefined;
        if (!prod) return;
        map.set(nmId, parseFunnelEntry(prod));
      } catch { /* skip */ }
    }));
  }

  // Последний резерв: statistics-api orders (только для сегодняшней даты)
  if (map.size === 0 && startDate === endDate) {
    try {
      const res = await wbFetch(
        `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${startDate}T00:00:00`,
        { headers: { Authorization: token } },
        15000
      );
      if (res.ok) {
        const orders: Record<string, unknown>[] = await res.json();
        const nmIdSet = new Set(nmIds);
        const fromDate = new Date(`${startDate}T00:00:00`);
        const toDate = new Date(`${startDate}T23:59:59`);
        const byNm = new Map<number, number>();
        for (const order of orders) {
          const id = Number(order.nmId ?? order.nmID ?? 0);
          if (!nmIdSet.has(id)) continue;
          const d = new Date(String(order.date ?? order.lastChangeDate ?? ''));
          if (d < fromDate || d > toDate) continue;
          byNm.set(id, (byNm.get(id) ?? 0) + 1);
        }
        for (const [id, cnt] of byNm) {
          map.set(id, { ordersCount: cnt, buyoutsCount: 0, buyoutPercent: 0, addToCartCount: 0, views: 0 });
        }
      }
    } catch { /* ignore */ }
  }

  return map;
}

async function fetchAllPrices(token: string) {
  const map = new Map<number, { priceSale: number; priceBasic: number; salePercent: number }>();
  const BASE = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter';

  for (let offset = 0; offset < 10000; offset += 1000) {
    if (offset > 0) await delay(200);

    const res = await wbFetch(`${BASE}?limit=1000&offset=${offset}`, {
      headers: { Authorization: token },
    });
    if (!res.ok) break;
    const json = await res.json();
    const listGoods: Record<string, unknown>[] = json?.data?.listGoods ?? [];
    if (listGoods.length === 0) break;

    for (const good of listGoods) {
      const nmId = Number(good.nmID ?? good.nmId ?? 0);
      if (!nmId) continue;
      const sizes = Array.isArray(good.sizes) ? good.sizes as Record<string, unknown>[] : [];
      const size = sizes[0];
      const priceBasic = Number(size?.price ?? good.price ?? 0);
      const discount = Number(good.discount ?? 0);
      const discountedRaw = Number(size?.discountedPrice ?? good.discountedPrice ?? 0);
      const priceSale = discountedRaw > 0
        ? discountedRaw
        : (discount > 0 ? Math.round(priceBasic * (1 - discount / 100)) : priceBasic);
      const salePercent = priceBasic > 0 && priceSale < priceBasic
        ? Math.round((1 - priceSale / priceBasic) * 100)
        : discount;
      map.set(nmId, { priceSale, priceBasic, salePercent });
    }

    if (listGoods.length < 1000) break;
  }
  return map;
}

async function fetchBatchStocks(nmIds: number[], token: string) {
  const map = new Map<number, number>();
  const bearerToken = bearer(token);

  for (let i = 0; i < nmIds.length; i += 100) {
    if (i > 0) await delay(250);

    const batch = nmIds.slice(i, i + 100);
    try {
      const res = await wbFetch(
        'https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses',
        {
          method: 'POST',
          headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nmIds: batch, limit: 10000, offset: 0 }),
        },
        15000
      );
      if (!res.ok) continue;
      const json = await res.json();
      const items: Record<string, unknown>[] = json?.data?.items ?? [];
      for (const item of items) {
        const nmId = Number(item.nmId);
        if (!nmId) continue;
        map.set(nmId, (map.get(nmId) ?? 0) + Number(item.quantity ?? 0));
      }
    } catch { continue; }
  }
  return map;
}
