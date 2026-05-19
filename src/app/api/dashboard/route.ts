import { NextRequest, NextResponse } from 'next/server';
import { getLast7Days } from '@/lib/utils';
import type { DashboardProduct, DashboardData } from '@/types';

export const runtime = 'edge';
export const maxDuration = 30;

// Mapping: session password → WB label name
// ns2026 → Кирилл (configured via SELLER_LABEL env var)
const SELLER_LABEL = process.env.SELLER_LABEL || 'Кирилл';

export async function GET(_req: NextRequest) {
  const token = process.env.WB_API_TOKEN || '';
  if (!token) {
    return NextResponse.json({ error: 'WB_API_TOKEN не настроен' }, { status: 500 });
  }

  try {
    // Step 1: Get all WB tags → find the tag matching SELLER_LABEL
    const tagsRes = await fetch('https://content-api.wildberries.ru/content/v2/tags', {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(8000),
    });

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

    // Step 2: Get all product cards with this tag (paginate 100 per page)
    const allCards: Record<string, unknown>[] = [];
    let cursor: { updatedAt?: string; nmID?: number } | null = null;

    for (let page = 0; page < 20; page++) {
      const body: Record<string, unknown> = {
        settings: {
          cursor: { limit: 100, ...(cursor ?? {}) },
          filter: { tagIDs: [tag.id] },
        },
      };

      const cardsRes = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (!cardsRes.ok) break;
      const cardsJson = await cardsRes.json();
      const cards: Record<string, unknown>[] = cardsJson?.cards ?? [];
      allCards.push(...cards);

      const newCursor = cardsJson?.cursor as { updatedAt?: string; nmID?: number } | null;
      if (!newCursor || cards.length < 100) break;
      cursor = { updatedAt: newCursor.updatedAt, nmID: newCursor.nmID };
    }

    if (allCards.length === 0) {
      const data: DashboardData = {
        products: [],
        sellerLabel: SELLER_LABEL,
        tagId: tag.id,
        fetchedAt: new Date().toLocaleString('ru-RU'),
      };
      return NextResponse.json(data);
    }

    const nmIds = allCards.map((c) => Number(c.nmID));
    const { from, to } = getLast7Days();

    // Step 3: Fetch prices + stats + stocks in parallel
    const [pricesResult, statsResult, stocksResult] = await Promise.allSettled([
      fetchAllPrices(token),
      fetchBatchStats(nmIds, token, from, to),
      fetchBatchStocks(nmIds, token),
    ]);

    const pricesMap = pricesResult.status === 'fulfilled' ? pricesResult.value : new Map();
    const statsMap = statsResult.status === 'fulfilled' ? statsResult.value : new Map();
    const stocksMap = stocksResult.status === 'fulfilled' ? stocksResult.value : new Map();

    const products: DashboardProduct[] = allCards.map((card) => {
      const nmId = Number(card.nmID);
      const prices = pricesMap.get(nmId) as { priceSale: number; priceBasic: number; salePercent: number } | undefined;
      const stats = statsMap.get(nmId) as {
        ordersCount: number; buyoutsCount: number; buyoutPercent: number;
        addToCartCount: number; views: number;
      } | undefined;
      const stock = (stocksMap.get(nmId) as number) ?? 0;

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
      };
    });

    const data: DashboardData = {
      products,
      sellerLabel: SELLER_LABEL,
      tagId: tag.id,
      fetchedAt: new Date().toLocaleString('ru-RU'),
    };

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=1500' },
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function fetchAllPrices(token: string) {
  const map = new Map<number, { priceSale: number; priceBasic: number; salePercent: number }>();
  const BASE = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter';

  for (let offset = 0; offset < 10000; offset += 1000) {
    const res = await fetch(`${BASE}?limit=1000&offset=${offset}`, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(10000),
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

async function fetchBatchStats(nmIds: number[], token: string, from: string, to: string) {
  const map = new Map<number, {
    ordersCount: number; buyoutsCount: number; buyoutPercent: number;
    addToCartCount: number; views: number;
  }>();

  for (let i = 0; i < nmIds.length; i += 100) {
    const batch = nmIds.slice(i, i + 100);
    try {
      const res = await fetch(
        'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products',
        {
          method: 'POST',
          headers: { Authorization: token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedPeriod: { start: from, end: to }, nmIds: batch, limit: 100, offset: 0 }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const products: Record<string, unknown>[] = json?.data?.products ?? [];

      for (const prod of products) {
        const prodR = prod as Record<string, unknown>;
        const nmId = Number(prodR.nmID ?? prodR.id ?? 0);
        if (!nmId) continue;

        const selected = ((prodR.statistic as Record<string, unknown>)?.selected ?? prodR) as Record<string, unknown>;
        const metrics = (selected.metrics as Record<string, unknown>) ?? selected;
        const convObj = selected.conversions as Record<string, unknown> | null | undefined;

        const g = (...keys: string[]) => {
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
      }
    } catch { continue; }
  }
  return map;
}

async function fetchBatchStocks(nmIds: number[], token: string) {
  const map = new Map<number, number>();
  const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

  for (let i = 0; i < nmIds.length; i += 100) {
    const batch = nmIds.slice(i, i + 100);
    try {
      const res = await fetch(
        'https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses',
        {
          method: 'POST',
          headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nmIds: batch, limit: 10000, offset: 0 }),
          signal: AbortSignal.timeout(15000),
        }
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
