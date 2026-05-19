import { NextRequest, NextResponse } from 'next/server';
import type { DashboardProduct, DashboardData } from '@/types';

export const runtime = 'edge';
export const maxDuration = 30;

const SELLER_LABEL = process.env.SELLER_LABEL || 'Кирилл';

type StatEntry = {
  ordersCount: number;
  buyoutsCount: number;
  buyoutPercent: number; // cartToOrderPercent для сегодня (buyout всегда 0 для дневного периода)
  addToCartCount: number;
  views: number;
};

type FunnelDual = { today: StatEntry; yesterday: StatEntry };

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function bearer(token: string) {
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

function fmtMsk(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:00:00`;
}

// Парсит один период из реального ответа воронки (поля: orderCount, cartCount, openCount, buyoutCount)
function parseFunnelPeriod(p: Record<string, unknown> | undefined): StatEntry {
  if (!p) return { ordersCount: 0, buyoutsCount: 0, buyoutPercent: 0, addToCartCount: 0, views: 0 };

  const ordersCount = Number(p.orderCount ?? 0);
  const buyoutsCount = Number(p.buyoutCount ?? 0);
  const conv = p.conversions as Record<string, unknown> | undefined;
  // buyoutPercent для дневного периода = 0, поэтому берём cartToOrderPercent
  const buyoutPct = Number(conv?.buyoutPercent ?? 0);
  const cartToOrder = Number(conv?.cartToOrderPercent ?? 0);

  return {
    ordersCount,
    buyoutsCount,
    buyoutPercent: buyoutPct > 0 ? buyoutPct : cartToOrder,
    addToCartCount: Number(p.cartCount ?? 0),
    views: Number(p.openCount ?? 0),
  };
}

export async function GET(_req: NextRequest) {
  const token = process.env.WB_API_TOKEN || '';
  if (!token) {
    return NextResponse.json({ error: 'WB_API_TOKEN не настроен' }, { status: 500 });
  }

  try {
    // Step 1: ярлыки
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
        error: `Ярлык "${SELLER_LABEL}" не найден. Доступные: ${available || 'нет'}`,
      }, { status: 404 });
    }

    // Step 2: карточки с пагинацией
    const allCards: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      if (offset > 0) await delay(200);
      const r = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: { cursor: { limit: 100, offset }, filter: { tagIDs: [tag.id], withPhoto: -1 } },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) break;
      const cards: Record<string, unknown>[] = (await r.json())?.cards ?? [];
      allCards.push(...cards);
      if (cards.length < 100) break;
    }

    // Дата МСК
    const MSK = 3 * 60 * 60 * 1000;
    const nowMsk = new Date(Date.now() + MSK);
    const beginMsk = new Date(nowMsk.getTime()); beginMsk.setUTCHours(0, 0, 0, 0);
    const endMsk = new Date(nowMsk.getTime()); endMsk.setUTCMinutes(0, 0, 0);
    if (endMsk <= beginMsk) endMsk.setUTCHours(1, 0, 0, 0);
    const beginStr = fmtMsk(beginMsk);
    const endStr = fmtMsk(endMsk);
    const pp = (n: number) => String(n).padStart(2, '0');
    const todayDate = `${beginMsk.getUTCFullYear()}-${pp(beginMsk.getUTCMonth() + 1)}-${pp(beginMsk.getUTCDate())}`;

    if (allCards.length === 0) {
      return NextResponse.json({
        products: [], sellerLabel: SELLER_LABEL, tagId: tag.id,
        fetchedAt: new Date().toLocaleString('ru-RU'),
        periodFrom: beginStr, periodTo: endStr,
      } as DashboardData);
    }

    const nmIds = allCards.map((c) => Number(c.nmID));

    // Step 3: цены + остатки параллельно, воронка — последовательно (global rate limit)
    const [pricesResult, stocksResult, funnelResult] = await Promise.allSettled([
      fetchAllPrices(token),
      fetchBatchStocks(nmIds, token),
      fetchFunnelSequential(nmIds, token, todayDate),
    ]);

    const pricesMap = pricesResult.status === 'fulfilled' ? pricesResult.value : new Map<number, { priceSale: number; priceBasic: number; salePercent: number }>();
    const stocksMap = stocksResult.status === 'fulfilled' ? stocksResult.value : new Map<number, number>();
    const funnelMap = funnelResult.status === 'fulfilled' ? funnelResult.value : new Map<number, FunnelDual>();

    const products: DashboardProduct[] = allCards.map((card) => {
      const nmId = Number(card.nmID);
      const prices = pricesMap.get(nmId);
      const dual = funnelMap.get(nmId);
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
        ordersCount: dual?.today.ordersCount ?? 0,
        buyoutsCount: dual?.today.buyoutsCount ?? 0,
        buyoutPercent: dual?.today.buyoutPercent ?? 0,
        addToCartCount: dual?.today.addToCartCount ?? 0,
        views: dual?.today.views ?? 0,
        ordersYesterday: dual?.yesterday.ordersCount ?? 0,
        addToCartYesterday: dual?.yesterday.addToCartCount ?? 0,
        buyoutPercentYesterday: dual?.yesterday.buyoutPercent ?? 0,
        hasYesterdayData: dual !== undefined,
      };
    });

    return NextResponse.json({
      products, sellerLabel: SELLER_LABEL, tagId: tag.id,
      fetchedAt: new Date().toLocaleString('ru-RU'),
      periodFrom: beginStr, periodTo: endStr,
    } as DashboardData, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── Воронка: строго по одному запросу, задержка 1.1с между вызовами ──
// Запрос и задержка стартуют одновременно → ждём дольшего (delay 1.1с).
// Итого на 26 товаров: 25 × 1.1с + ~0.3с = ~28с — укладывается в 30с лимит Vercel.
async function fetchFunnelSequential(nmIds: number[], token: string, todayDate: string) {
  const map = new Map<number, FunnelDual>();

  for (let i = 0; i < nmIds.length; i++) {
    const nmId = nmIds[i];
    const isLast = i === nmIds.length - 1;

    const [dual] = await Promise.all([
      // Запрос к воронке
      (async (): Promise<FunnelDual | null> => {
        try {
          const res = await fetch(
            'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products',
            {
              method: 'POST',
              headers: { Authorization: bearer(token), 'Content-Type': 'application/json' },
              body: JSON.stringify({
                selectedPeriod: { start: todayDate, end: todayDate },
                nmIds: [nmId],
                limit: 10,
                offset: 0,
              }),
              signal: AbortSignal.timeout(5000),
            }
          );
          if (!res.ok) return null;
          const json = await res.json();
          const prod = json?.data?.products?.[0];
          if (!prod) return null;
          const stat = prod.statistic as Record<string, unknown> | undefined;
          if (!stat) return null;
          return {
            today: parseFunnelPeriod(stat.selected as Record<string, unknown> | undefined),
            yesterday: parseFunnelPeriod(stat.past as Record<string, unknown> | undefined),
          };
        } catch { return null; }
      })(),
      // Пауза 1.1с (кроме последнего товара) — обходим global rate limit WB
      isLast ? Promise.resolve(null) : delay(1100),
    ]);

    if (dual) map.set(nmId, dual);
  }

  return map;
}

async function fetchAllPrices(token: string) {
  const map = new Map<number, { priceSale: number; priceBasic: number; salePercent: number }>();
  const BASE = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter';

  for (let offset = 0; offset < 10000; offset += 1000) {
    if (offset > 0) await delay(200);
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

async function fetchBatchStocks(nmIds: number[], token: string) {
  const map = new Map<number, number>();
  const bearerToken = bearer(token);

  for (let i = 0; i < nmIds.length; i += 100) {
    if (i > 0) await delay(250);
    try {
      const res = await fetch(
        'https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses',
        {
          method: 'POST',
          headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nmIds: nmIds.slice(i, i + 100), limit: 10000, offset: 0 }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!res.ok) continue;
      const json = await res.json();
      for (const item of (json?.data?.items ?? []) as Record<string, unknown>[]) {
        const nmId = Number(item.nmId);
        if (nmId) map.set(nmId, (map.get(nmId) ?? 0) + Number(item.quantity ?? 0));
      }
    } catch { continue; }
  }
  return map;
}
