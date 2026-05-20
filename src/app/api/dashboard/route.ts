import { NextRequest, NextResponse } from 'next/server';
import type { DashboardProduct, DashboardData } from '@/types';
import { findAccountBySession } from '@/lib/accounts';

export const runtime = 'edge';
export const maxDuration = 30;

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

function datePart(s: string): string {
  return String(s || '').substring(0, 10);
}

type EmitPayload =
  | { type: 'progress'; percent: number; step: string }
  | { type: 'done'; data: DashboardData }
  | { type: 'error'; error: string };

export async function GET(req: NextRequest) {
  const token = process.env.WB_API_TOKEN || '';
  if (!token) return NextResponse.json({ error: 'WB_API_TOKEN не настроен' }, { status: 500 });

  const sessionCookie = req.cookies.get('session')?.value || '';
  const account = findAccountBySession(sessionCookie);
  const SELLER_LABEL = account?.label || process.env.SELLER_LABEL || 'Кирилл';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: EmitPayload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        emit({ type: 'progress', percent: 5, step: 'Подключаюсь к Wildberries...' });

        // Step 1: ярлыки
        const tagsRes = await fetch('https://content-api.wildberries.ru/content/v2/tags', {
          headers: { Authorization: token }, signal: AbortSignal.timeout(8000),
        });
        if (!tagsRes.ok) {
          emit({ type: 'error', error: `Tags API: HTTP ${tagsRes.status}` });
          return;
        }
        const tagsJson = await tagsRes.json();
        const tags: { id: number; name: string }[] = tagsJson?.data ?? [];
        const tag = tags.find((t) => t.name === SELLER_LABEL);
        if (!tag) {
          const available = tags.map((t) => `"${t.name}"`).join(', ');
          emit({ type: 'error', error: `Ярлык "${SELLER_LABEL}" не найден. Доступные: ${available || 'нет'}` });
          return;
        }

        emit({ type: 'progress', percent: 18, step: 'Загружаю карточки товаров...' });

        // Step 2: карточки с пагинацией
        const allCards: Record<string, unknown>[] = [];
        for (let offset = 0; offset < 2000; offset += 100) {
          if (offset > 0) await delay(200);
          const r = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
            method: 'POST',
            headers: { Authorization: token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings: { cursor: { limit: 100, offset }, filter: { tagIDs: [tag.id], withPhoto: -1 } } }),
            signal: AbortSignal.timeout(8000),
          });
          if (!r.ok) break;
          const cards: Record<string, unknown>[] = (await r.json())?.cards ?? [];
          allCards.push(...cards);
          if (cards.length < 100) break;
        }

        // Даты МСК
        const MSK = 3 * 60 * 60 * 1000;
        const nowMsk = new Date(Date.now() + MSK);
        const beginMsk = new Date(nowMsk.getTime()); beginMsk.setUTCHours(0, 0, 0, 0);
        const endMsk = new Date(nowMsk.getTime()); endMsk.setUTCMinutes(0, 0, 0);
        if (endMsk <= beginMsk) endMsk.setUTCHours(1, 0, 0, 0);
        const beginStr = fmtMsk(beginMsk);
        const endStr = fmtMsk(endMsk);
        const pp = (n: number) => String(n).padStart(2, '0');
        const todayDate = `${beginMsk.getUTCFullYear()}-${pp(beginMsk.getUTCMonth() + 1)}-${pp(beginMsk.getUTCDate())}`;
        const yestMsk = new Date(beginMsk.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayDate = `${yestMsk.getUTCFullYear()}-${pp(yestMsk.getUTCMonth() + 1)}-${pp(yestMsk.getUTCDate())}`;
        const begin30 = new Date(beginMsk.getTime() - 31 * 24 * 60 * 60 * 1000);
        const begin30Date = `${begin30.getUTCFullYear()}-${pp(begin30.getUTCMonth() + 1)}-${pp(begin30.getUTCDate())}`;

        if (allCards.length === 0) {
          emit({ type: 'done', data: {
            products: [], sellerLabel: SELLER_LABEL, tagId: tag.id,
            fetchedAt: new Date().toLocaleString('ru-RU'), periodFrom: beginStr, periodTo: endStr,
          } });
          return;
        }

        const nmIds = allCards.map((c) => Number(c.nmID));
        const nmIdSet = new Set(nmIds);

        emit({ type: 'progress', percent: 35, step: `Найдено ${allCards.length} товаров. Загружаю цены...` });

        // Step 3: цены (последовательно — чтобы показать прогресс)
        const pricesMap = await fetchAllPrices(token);

        emit({ type: 'progress', percent: 58, step: 'Загружаю остатки на складах...' });

        // Step 4: остатки
        const stocksMap = await fetchBatchStocks(nmIds, token);

        emit({ type: 'progress', percent: 72, step: 'Загружаю статистику заказов и выкупов...' });

        // Step 5: заказы + продажи параллельно
        const [ordersResult, salesResult] = await Promise.allSettled([
          fetchStatisticsData(`https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${begin30Date}T00:00:00`, token),
          fetchStatisticsData(`https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${begin30Date}T00:00:00`, token),
        ]);

        emit({ type: 'progress', percent: 92, step: 'Формирую отчёт...' });

        const allOrders: Record<string, unknown>[] = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
        const allSales: Record<string, unknown>[] = salesResult.status === 'fulfilled' ? salesResult.value : [];

        // Агрегируем заказы
        const ordersToday = new Map<number, number>();
        const ordersYesterday = new Map<number, number>();
        const orders30d = new Map<number, number>();

        for (const o of allOrders) {
          const nmId = Number(o.nmId ?? 0);
          if (!nmIdSet.has(nmId)) continue;
          const d = datePart(String(o.date ?? ''));
          orders30d.set(nmId, (orders30d.get(nmId) ?? 0) + 1);
          if (d === todayDate) ordersToday.set(nmId, (ordersToday.get(nmId) ?? 0) + 1);
          if (d === yesterdayDate) ordersYesterday.set(nmId, (ordersYesterday.get(nmId) ?? 0) + 1);
        }

        // Агрегируем выкупы
        const sales30d = new Map<number, number>();
        for (const s of allSales) {
          const nmId = Number(s.nmId ?? 0);
          if (!nmIdSet.has(nmId)) continue;
          sales30d.set(nmId, (sales30d.get(nmId) ?? 0) + 1);
        }

        const buyoutMap = new Map<number, number>();
        for (const [nmId, salesCnt] of sales30d) {
          const ordersCnt = orders30d.get(nmId) ?? 0;
          if (ordersCnt > 0) buyoutMap.set(nmId, Math.round((salesCnt / ordersCnt) * 100));
        }

        const products: DashboardProduct[] = allCards.map((card) => {
          const nmId = Number(card.nmID);
          const prices = pricesMap.get(nmId);
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
            ordersCount: ordersToday.get(nmId) ?? 0,
            buyoutsCount: sales30d.get(nmId) ?? 0,
            buyoutPercent: buyoutMap.get(nmId) ?? 0,
            addToCartCount: 0,
            views: 0,
            ordersYesterday: ordersYesterday.get(nmId) ?? 0,
            addToCartYesterday: 0,
            buyoutPercentYesterday: 0,
            hasYesterdayData: true,
          };
        });

        emit({ type: 'done', data: {
          products, sellerLabel: SELLER_LABEL, tagId: tag.id,
          fetchedAt: new Date().toLocaleString('ru-RU'), periodFrom: beginStr, periodTo: endStr,
        } });

      } catch (err) {
        emit({ type: 'error', error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
    },
  });
}

async function fetchStatisticsData(url: string, token: string): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(url, { headers: { Authorization: token }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

async function fetchAllPrices(token: string) {
  const map = new Map<number, { priceSale: number; priceBasic: number; salePercent: number }>();
  const BASE = 'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter';
  for (let offset = 0; offset < 10000; offset += 1000) {
    if (offset > 0) await delay(200);
    const res = await fetch(`${BASE}?limit=1000&offset=${offset}`, {
      headers: { Authorization: token }, signal: AbortSignal.timeout(10000),
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
      const priceSale = discountedRaw > 0 ? discountedRaw : (discount > 0 ? Math.round(priceBasic * (1 - discount / 100)) : priceBasic);
      const salePercent = priceBasic > 0 && priceSale < priceBasic ? Math.round((1 - priceSale / priceBasic) * 100) : discount;
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
