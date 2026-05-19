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

export async function GET(_req: NextRequest) {
  const token = process.env.WB_API_TOKEN || '';
  if (!token) {
    return NextResponse.json({ error: 'WB_API_TOKEN не настроен' }, { status: 500 });
  }

  try {
    // Step 1: Get all WB tags → find the tag matching SELLER_LABEL
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
        error: `Ярлык "${SELLER_LABEL}" не найден в WB кабинете. Доступные ярлыки: ${available || 'нет'}`,
      }, { status: 404 });
    }

    // Step 2: Get cards with tagIDs filter + offset-based pagination
    const allCards: Record<string, unknown>[] = [];

    for (let offset = 0; offset < 2000; offset += 100) {
      if (offset > 0) await delay(200);

      const body: Record<string, unknown> = {
        settings: {
          cursor: { limit: 100, offset },
          filter: { tagIDs: [tag.id], withPhoto: -1 },
        },
      };

      const cardsRes = await wbFetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!cardsRes.ok) break;
      const cardsJson = await cardsRes.json();
      const cards: Record<string, unknown>[] = cardsJson?.cards ?? [];
      allCards.push(...cards);

      if (cards.length < 100) break;
    }

    // Сегодня и вчера (московское время UTC+3)
    const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const today = nowMsk.toISOString().split('T')[0];
    const ydMsk = new Date(nowMsk);
    ydMsk.setDate(ydMsk.getDate() - 1);
    const yesterday = ydMsk.toISOString().split('T')[0];

    if (allCards.length === 0) {
      const data: DashboardData = {
        products: [],
        sellerLabel: SELLER_LABEL,
        tagId: tag.id,
        fetchedAt: new Date().toLocaleString('ru-RU'),
        periodFrom: today,
        periodTo: today,
      };
      return NextResponse.json(data);
    }

    const nmIds = allCards.map((c) => Number(c.nmID));

    // Step 3: prices + stats(сегодня) + stocks + stats(вчера) в параллель
    const [pricesResult, statsResult, stocksResult, statsYestResult] = await Promise.allSettled([
      fetchAllPrices(token),
      fetchBatchStats(nmIds, token, today, today),
      fetchBatchStocks(nmIds, token),
      fetchNMReport(nmIds, token, yesterday, yesterday),
    ]);

    const pricesMap = pricesResult.status === 'fulfilled' ? pricesResult.value : new Map<number, { priceSale: number; priceBasic: number; salePercent: number }>();
    const statsMap = statsResult.status === 'fulfilled' ? statsResult.value : new Map<number, StatEntry>();
    const stocksMap = stocksResult.status === 'fulfilled' ? stocksResult.value : new Map<number, number>();
    const statsYestMap = statsYestResult.status === 'fulfilled' ? statsYestResult.value : new Map<number, StatEntry>();

    const products: DashboardProduct[] = allCards.map((card) => {
      const nmId = Number(card.nmID);
      const prices = pricesMap.get(nmId);
      const stats = statsMap.get(nmId);
      const statsYest = statsYestMap.get(nmId);
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
        ordersCount: stats?.ordersCount ?? 0,
        buyoutsCount: stats?.buyoutsCount ?? 0,
        buyoutPercent: stats?.buyoutPercent ?? 0,
        addToCartCount: stats?.addToCartCount ?? 0,
        views: stats?.views ?? 0,
        ordersYesterday: statsYest?.ordersCount ?? 0,
        addToCartYesterday: statsYest?.addToCartCount ?? 0,
        buyoutPercentYesterday: statsYest?.buyoutPercent ?? 0,
      };
    });

    const data: DashboardData = {
      products,
      sellerLabel: SELLER_LABEL,
      tagId: tag.id,
      fetchedAt: new Date().toLocaleString('ru-RU'),
      periodFrom: today,
      periodTo: today,
    };

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=1500' },
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── NM Report v2: batch stats endpoint designed for multiple nmIDs ─────────────

async function fetchNMReport(nmIds: number[], token: string, from: string, to: string) {
  const map = new Map<number, StatEntry>();

  for (let page = 1; page <= 20; page++) {
    if (page > 1) await delay(300);

    try {
      const res = await wbFetch(
        'https://seller-analytics-api.wildberries.ru/api/v2/nm-report/detail',
        {
          method: 'POST',
          headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nmIds,
            period: { begin: from, end: to },
            page,
            limit: 100,
          }),
        },
        5000
      );

      if (!res.ok) break;
      const json = await res.json();
      if (json?.error) break;

      const cards: Record<string, unknown>[] = json?.data?.cards ?? [];

      for (const card of cards) {
        const nmId = Number(card.nmID);
        if (!nmId) continue;

        const selected = (
          (card.statistics as Record<string, unknown>)?.selectedPeriod
        ) as Record<string, unknown> | undefined;

        if (!selected) continue;

        const ordersCount = Number(selected.ordersCount ?? 0);
        const buyoutsCount = Number(selected.buyoutsCount ?? 0);
        const conversions = selected.conversions as Record<string, unknown> | undefined;
        const buyoutsPercent = Number(conversions?.buyoutsPercent ?? 0);
        const buyoutPercent = buyoutsPercent > 0
          ? buyoutsPercent
          : (ordersCount > 0 ? (buyoutsCount / ordersCount) * 100 : 0);

        map.set(nmId, {
          ordersCount,
          buyoutsCount,
          buyoutPercent,
          addToCartCount: Number(selected.addToCartCount ?? 0),
          views: Number(selected.openCardCount ?? 0),
        });
      }

      if (!json?.data?.isNextPage || cards.length === 0) break;
    } catch { break; }
  }

  return map;
}

// ── Batch stats: NM Report → individual funnel → orders API ──────────────────

async function fetchBatchStats(nmIds: number[], token: string, from: string, to: string) {
  // Strategy 1: NM Report v2 (batch endpoint, fastest path)
  const nmMap = await fetchNMReport(nmIds, token, from, to);
  if (nmMap.size > 0) return nmMap;

  const map = new Map<number, StatEntry>();

  // Strategy 2: individual funnel calls (proven to work for single nmId in wildberries.ts)
  const CONCURRENCY = 12;
  for (let i = 0; i < nmIds.length; i += CONCURRENCY) {
    if (i > 0) await delay(100);
    const batch = nmIds.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async (nmId) => {
      try {
        const res = await wbFetch(
          'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products',
          {
            method: 'POST',
            headers: { Authorization: token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              selectedPeriod: { start: from, end: to },
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

        const selected = (
          (prod.statistic as Record<string, unknown>)?.selected ?? prod
        ) as Record<string, unknown>;
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
        const buyoutPercent = buyoutPct > 0 ? buyoutPct : (ordersCount > 0 ? (buyoutsCount / ordersCount) * 100 : 0);

        map.set(nmId, {
          ordersCount,
          buyoutsCount,
          buyoutPercent,
          addToCartCount: g('cartCount', 'addToCartCount'),
          views: g('views', 'viewsCount'),
        });
      } catch { /* skip */ }
    }));
  }

  if (map.size > 0) return map;

  // Strategy 3: orders API (counts only, no buyout/cart data)
  try {
    const res = await wbFetch(
      `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${from}T00:00:00`,
      { headers: { Authorization: token } },
      20000
    );
    if (res.ok) {
      const orders: Record<string, unknown>[] = await res.json();
      const nmIdSet = new Set(nmIds);
      const fromDate = new Date(`${from}T00:00:00`);
      const toDate = new Date(`${to}T23:59:59`);
      const byNm = new Map<number, number>();

      for (const order of orders) {
        const nmId = Number(order.nmId ?? order.nmID ?? 0);
        if (!nmIdSet.has(nmId)) continue;
        const d = new Date(String(order.date ?? order.lastChangeDate ?? ''));
        if (d < fromDate || d > toDate) continue;
        byNm.set(nmId, (byNm.get(nmId) ?? 0) + 1);
      }

      for (const [nmId, ordersCount] of byNm) {
        map.set(nmId, { ordersCount, buyoutsCount: 0, buyoutPercent: 0, addToCartCount: 0, views: 0 });
      }
    }
  } catch { /* ignore */ }

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
  const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

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
