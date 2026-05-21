import { NextRequest } from 'next/server';
import { fetchWBProduct, fetchWBStats } from '@/lib/wildberries';
import { fetchUnitCosts } from '@/lib/google-sheets';
import { fetchMpstatsData, fetchSeasonalityData } from '@/lib/mpstats';
import type { WhatIfBaseData, WhatIfUnitCost } from '@/types';

export const runtime = 'edge';
export const maxDuration = 30;

async function fetchSellerPrice(nmId: number, token: string) {
  const BASE = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter';

  function extractPrices(good: Record<string, unknown>) {
    const sizes = Array.isArray(good.sizes) ? good.sizes as Record<string, unknown>[] : [];
    const size = sizes[0];
    const priceBasic = Number(size?.price ?? good.price ?? 0);
    if (priceBasic === 0) return null;
    const discount = Number(good.discount ?? 0);
    const discountedRaw = Number(size?.discountedPrice ?? good.discountedPrice ?? 0);
    const priceSale = discountedRaw > 0
      ? discountedRaw
      : (discount > 0 ? Math.round(priceBasic * (1 - discount / 100)) : priceBasic);
    const salePercent = priceBasic > 0 && priceSale < priceBasic
      ? Math.round((1 - priceSale / priceBasic) * 100) : discount;
    return { priceSale, priceBasic, salePercent };
  }

  for (const param of ['filterNmIds', 'filterNmId']) {
    try {
      const r = await fetch(`${BASE}?limit=100&${param}=${nmId}`, {
        headers: { Authorization: token }, signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const j = await r.json();
        const goods: Record<string, unknown>[] = j?.data?.listGoods ?? [];
        const g = goods.find((x) => Number(x.nmID ?? x.nmId) === nmId);
        if (g) { const p = extractPrices(g); if (p) return p; }
      }
    } catch { /* следующий вариант */ }
  }

  for (let offset = 0; offset < 10000; offset += 1000) {
    try {
      const r = await fetch(`${BASE}?limit=1000&offset=${offset}`, {
        headers: { Authorization: token }, signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) break;
      const j = await r.json();
      const goods: Record<string, unknown>[] = j?.data?.listGoods ?? [];
      if (!goods.length) break;
      const g = goods.find((x) => Number(x.nmID ?? x.nmId) === nmId);
      if (g) { const p = extractPrices(g); if (p) return p; }
      if (goods.length < 1000) break;
    } catch { break; }
  }
  return null;
}

function cap<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<T>((res) => { t = setTimeout(() => res(fallback), ms); }),
  ]).finally(() => clearTimeout(t));
}

export async function GET(req: NextRequest) {
  const nmIdStr = req.nextUrl.searchParams.get('nmId') || '';

  if (!nmIdStr || !/^\d{6,12}$/.test(nmIdStr)) {
    return new Response(JSON.stringify({ error: 'Укажите корректный артикул (nmId)' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const nmId    = parseInt(nmIdStr, 10);
  const wbToken = process.env.WB_API_TOKEN   || '';
  const mpToken = process.env.MPSTATS_API_KEY || '';
  const encoder = new TextEncoder();

  // Стриминговый ответ — как analyze/route.ts, чтобы обойти 30с лимит Edge
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, payload })}\n\n`));
      };

      try {
        // ── Фаза 1: WB + MPStats (быстрые запросы, ≤11с) ──────────────────────
        const [productResult, statsResult, mpResult, priceResult] = await Promise.allSettled([
          cap(fetchWBProduct(nmIdStr, wbToken || undefined),                         9000, null),
          cap(wbToken ? fetchWBStats(nmIdStr, wbToken) : Promise.resolve(null),      9000, null),
          cap(mpToken ? fetchMpstatsData(nmIdStr, mpToken) : Promise.resolve(null), 11000, null),
          cap(wbToken ? fetchSellerPrice(nmId, wbToken) : Promise.resolve(null),     9000, null),
        ]);

        const product  = productResult.status === 'fulfilled' ? productResult.value : null;
        if (!product) {
          const err = productResult.status === 'rejected' ? String(productResult.reason) : 'Товар не найден';
          send('error', err);
          controller.close();
          return;
        }

        const stats    = statsResult.status === 'fulfilled' ? statsResult.value?.stats ?? null : null;
        const mp       = mpResult.status    === 'fulfilled' ? mpResult.value  : null;
        const sellerPr = priceResult.status === 'fulfilled' ? priceResult.value : null;

        const priceSale   = sellerPr?.priceSale   || product.priceSale   || 0;
        const priceBasic  = sellerPr?.priceBasic  || product.priceBasic  || 0;
        const salePercent = sellerPr?.salePercent ?? product.salePercent ?? 0;
        const mp30        = mp?.productInfo?.sales30 ?? 0;
        const wb7         = stats?.ordersCount ?? 0;
        const dailySales  = Math.max(0.1, mp30 > 0 ? mp30 / 30 : wb7 / 7);

        let marketAvgPrice = 0;
        if (mp?.competitors?.length) {
          const prices = mp.competitors.map((c) => c.price).filter((p) => p > 0).sort((a, b) => a - b);
          if (prices.length) {
            const mid = Math.floor(prices.length / 2);
            marketAvgPrice = prices.length % 2 === 0
              ? Math.round((prices[mid - 1] + prices[mid]) / 2)
              : prices[mid];
          }
        }

        const unitCost: WhatIfUnitCost = {
          zakupka: 0, kargo: 0, logistika: 0, hranenie: 0,
          komissiyaRub: 0, ekvairingPercent: 0, ndsRub: 0, ndsPercent: 0,
          hasData: false,
        };

        const baseData: WhatIfBaseData = {
          nmId,
          productName:  product.name,
          brand:        product.brand,
          photoUrl:     product.photoUrl,
          priceSale,
          priceBasic,
          salePercent,
          stock:        product.totalStock,
          dailySales,
          buyoutRate:   stats?.buyoutPercent ?? 50,
          unitCost,
          weeklyOrders:  stats?.ordersCount      ?? 0,
          weeklyBuyouts: stats?.buyoutsCount     ?? 0,
          weeklyRevenue: stats?.ordersSumRub     ?? 0,
          conversions: {
            cardToCart:  stats?.conversions?.addToCartPercent   ?? 0,
            cartToOrder: stats?.conversions?.cartToOrderPercent ?? 0,
          },
          marketAvgPrice,
        };

        // Отправляем базовые данные — UI отображается сразу
        send('data', baseData);

        // ── Фаза 2: Unit + Сезонность (медленные, те же функции что в анализе) ─
        const [unitResult, seasonResult] = await Promise.allSettled([
          fetchUnitCosts(nmIdStr),
          mpToken ? fetchSeasonalityData(nmIdStr, mpToken) : Promise.resolve(null),
        ]);

        if (unitResult.status === 'fulfilled' && unitResult.value?.found) {
          send('unit', unitResult.value);
        } else {
          send('unit_error', 'Артикул не найден в Google Sheets (Unit)');
        }

        if (seasonResult.status === 'fulfilled' && seasonResult.value) {
          send('seasonality', seasonResult.value);
        }

        send('done', null);
      } catch (e) {
        send('error', String(e));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
  });
}
