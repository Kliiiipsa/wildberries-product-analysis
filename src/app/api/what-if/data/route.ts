import { NextRequest, NextResponse } from 'next/server';
import { fetchWBProduct, fetchWBStats } from '@/lib/wildberries';
import { fetchUnitCosts } from '@/lib/google-sheets';
import { fetchMpstatsData } from '@/lib/mpstats';
import type { WhatIfBaseData, WhatIfUnitCost } from '@/types';

export const runtime = 'edge';
export const maxDuration = 30;

// Надёжный способ получить цены — перебираем все товары продавца с пагинацией
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
        headers: { Authorization: token }, signal: AbortSignal.timeout(10000),
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

// Ограничивает время выполнения промиса: если не успел — возвращает fallback
function cap<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<T>((res) => { t = setTimeout(() => res(fallback), ms); }),
  ]).finally(() => clearTimeout(t));
}

export async function GET(req: NextRequest) {
  try {
    const nmIdStr = req.nextUrl.searchParams.get('nmId') || '';

    if (!nmIdStr || !/^\d{6,12}$/.test(nmIdStr)) {
      return NextResponse.json({ error: 'Укажите корректный артикул (nmId)' }, { status: 400 });
    }

    const nmId    = parseInt(nmIdStr, 10);
    const wbToken = process.env.WB_API_TOKEN || '';
    const mpToken = process.env.MPSTATS_API_KEY || '';

    // Каждый вызов ограничен по времени, чтобы сумма не превышала Edge-лимит 30с
    const [productResult, statsResult, unitResult, mpResult, priceResult] = await Promise.allSettled([
      cap(fetchWBProduct(nmIdStr, wbToken || undefined),          9000, null),
      cap(wbToken ? fetchWBStats(nmIdStr, wbToken) : Promise.resolve(null), 9000, null),
      cap(fetchUnitCosts(nmIdStr),                               11000, { zakupka:0, kargo:0, logistika:0, hranenie:0, komissiyaRub:0, ekvairingPercent:0, ndsRub:0, ndsPercent:0, found:false }),
      cap(mpToken ? fetchMpstatsData(nmIdStr, mpToken) : Promise.resolve(null), 11000, null),
      cap(wbToken ? fetchSellerPrice(nmId, wbToken) : Promise.resolve(null),    9000, null),
    ]);

    const product  = productResult.status === 'fulfilled' ? productResult.value : null;
    if (!product) {
      const err = productResult.status === 'rejected' ? String(productResult.reason) : 'Товар не найден';
      return NextResponse.json({ error: err }, { status: 404 });
    }

    const stats    = statsResult.status  === 'fulfilled' ? statsResult.value?.stats ?? null : null;
    const unitRaw  = unitResult.status   === 'fulfilled' ? unitResult.value : null;
    const mp       = mpResult.status     === 'fulfilled' ? mpResult.value  : null;
    const sellerPr = priceResult.status  === 'fulfilled' ? priceResult.value : null;

    const priceSale   = sellerPr?.priceSale   || product.priceSale   || 0;
    const priceBasic  = sellerPr?.priceBasic  || product.priceBasic  || 0;
    const salePercent = sellerPr?.salePercent ?? product.salePercent ?? 0;

    const mp30       = mp?.productInfo?.sales30 ?? 0;
    const wb7        = stats?.ordersCount ?? 0;
    const dailySales = Math.max(0.1, mp30 > 0 ? mp30 / 30 : wb7 / 7);
    const buyoutRate = stats?.buyoutPercent ?? 50;

    const weeklyOrders  = stats?.ordersCount      ?? 0;
    const weeklyBuyouts = stats?.buyoutsCount     ?? 0;
    const weeklyRevenue = stats?.ordersSumRub     ?? 0;
    const conversions = {
      cardToCart:  stats?.conversions?.addToCartPercent   ?? 0,
      cartToOrder: stats?.conversions?.cartToOrderPercent ?? 0,
    };

    // Средняя цена рынка (медиана цен похожих товаров из MPStats)
    let marketAvgPrice = 0;
    if (mp?.competitors && mp.competitors.length > 0) {
      const prices = mp.competitors
        .map((c) => c.price)
        .filter((p) => p > 0)
        .sort((a, b) => a - b);
      if (prices.length > 0) {
        const mid = Math.floor(prices.length / 2);
        marketAvgPrice = prices.length % 2 === 0
          ? Math.round((prices[mid - 1] + prices[mid]) / 2)
          : prices[mid];
      }
    }

    const uc = unitRaw ?? { zakupka: 0, kargo: 0, logistika: 0, hranenie: 0, komissiyaRub: 0, ekvairingPercent: 0, ndsRub: 0, ndsPercent: 0, found: false };
    const unitCost: WhatIfUnitCost = {
      zakupka:          uc.zakupka,
      kargo:            uc.kargo,
      logistika:        uc.logistika,
      hranenie:         uc.hranenie,
      komissiyaRub:     uc.komissiyaRub,
      ekvairingPercent: uc.ekvairingPercent,
      ndsRub:           uc.ndsRub,
      ndsPercent:       uc.ndsPercent,
      hasData:          uc.found,
    };

    const result: WhatIfBaseData = {
      nmId,
      productName: product.name,
      brand:       product.brand,
      photoUrl:    product.photoUrl,
      priceSale,
      priceBasic,
      salePercent,
      stock:       product.totalStock,
      dailySales,
      buyoutRate,
      unitCost,
      weeklyOrders,
      weeklyBuyouts,
      weeklyRevenue,
      conversions,
      marketAvgPrice,
      unitRawText: uc.rawText,
    };

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
