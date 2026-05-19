import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;

const SELLER_LABEL = process.env.SELLER_LABEL || 'Кирилл';

export async function GET() {
  const token = process.env.WB_API_TOKEN || '';
  if (!token) return NextResponse.json({ error: 'WB_API_TOKEN не настроен' }, { status: 500 });

  const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  const results: Record<string, unknown> = {};

  // Даты
  const MSK = 3 * 60 * 60 * 1000;
  const nowMsk = new Date(Date.now() + MSK);
  const beginMsk = new Date(nowMsk); beginMsk.setUTCHours(0, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  const todayDate = `${beginMsk.getUTCFullYear()}-${p(beginMsk.getUTCMonth()+1)}-${p(beginMsk.getUTCDate())}`;
  const begin30 = new Date(beginMsk.getTime() - 30 * 24 * 60 * 60 * 1000);
  const begin30Date = `${begin30.getUTCFullYear()}-${p(begin30.getUTCMonth()+1)}-${p(begin30.getUTCDate())}`;
  results.dates = { today: todayDate, begin30: begin30Date };

  // 1. Теги + карточки
  try {
    const r = await fetch('https://content-api.wildberries.ru/content/v2/tags', {
      headers: { Authorization: token }, signal: AbortSignal.timeout(8000),
    });
    const body = await r.json();
    results.tags = { status: r.status };
    const tags = body?.data ?? [];
    const tag = tags.find((t: { name: string }) => t.name === SELLER_LABEL);
    results.tag = tag ?? null;
    if (!tag) return NextResponse.json(results);

    const r2 = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { cursor: { limit: 100, offset: 0 }, filter: { tagIDs: [(tag as { id: number }).id], withPhoto: -1 } } }),
      signal: AbortSignal.timeout(8000),
    });
    const b2 = await r2.json();
    const cards = b2?.cards ?? [];
    const nmIds: number[] = cards.map((c: { nmID: number }) => Number(c.nmID));
    results.cards = { status: r2.status, count: cards.length };

    // 2. statistics-api: orders сегодня
    try {
      const ro = await fetch(
        `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${todayDate}T00:00:00`,
        { headers: { Authorization: token }, signal: AbortSignal.timeout(15000) }
      );
      const orders: Record<string, unknown>[] = ro.ok ? await ro.json() : [];
      const sampleOrder = orders[0] ?? null;
      const nmIdSet = new Set(nmIds);
      const countByNm: Record<number, number> = {};
      for (const o of orders) {
        const id = Number(o.nmId ?? o.nmID ?? 0);
        if (nmIdSet.has(id)) countByNm[id] = (countByNm[id] ?? 0) + 1;
      }
      results.statistics_orders_today = {
        status: ro.status,
        totalOrders: orders.length,
        ourProductsWithOrders: Object.keys(countByNm).length,
        countByNm,
        sampleOrderFields: sampleOrder ? Object.keys(sampleOrder) : [],
        sampleOrder,
      };
    } catch (e) { results.statistics_orders_today = { error: String(e) }; }

    // 3. statistics-api: orders за 30 дней (для buyout %)
    try {
      const ro = await fetch(
        `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${begin30Date}T00:00:00`,
        { headers: { Authorization: token }, signal: AbortSignal.timeout(15000) }
      );
      const orders: Record<string, unknown>[] = ro.ok ? await ro.json() : [];
      const nmIdSet = new Set(nmIds);
      const countByNm: Record<number, number> = {};
      for (const o of orders) {
        const id = Number(o.nmId ?? o.nmID ?? 0);
        if (nmIdSet.has(id)) countByNm[id] = (countByNm[id] ?? 0) + 1;
      }
      results.statistics_orders_30d = {
        status: ro.status,
        totalOrders: orders.length,
        ourProductsWithOrders: Object.keys(countByNm).length,
        sampleOrderFields: orders[0] ? Object.keys(orders[0]) : [],
      };
    } catch (e) { results.statistics_orders_30d = { error: String(e) }; }

    // 4. statistics-api: sales за 30 дней (для buyout %)
    try {
      const rs = await fetch(
        `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${begin30Date}T00:00:00`,
        { headers: { Authorization: token }, signal: AbortSignal.timeout(15000) }
      );
      const sales: Record<string, unknown>[] = rs.ok ? await rs.json() : [];
      const nmIdSet = new Set(nmIds);
      const countByNm: Record<number, number> = {};
      for (const s of sales) {
        const id = Number(s.nmId ?? s.nmID ?? 0);
        if (nmIdSet.has(id)) countByNm[id] = (countByNm[id] ?? 0) + 1;
      }
      results.statistics_sales_30d = {
        status: rs.status,
        totalSales: sales.length,
        ourProductsWithSales: Object.keys(countByNm).length,
        sampleSaleFields: sales[0] ? Object.keys(sales[0]) : [],
        sampleSale: sales[0] ?? null,
      };
    } catch (e) { results.statistics_sales_30d = { error: String(e) }; }

    // 5. funnel — 1 запрос с Bearer (подтверждаем что работает)
    try {
      const rf = await fetch(
        'https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products',
        {
          method: 'POST',
          headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedPeriod: { start: todayDate, end: todayDate }, nmIds: [nmIds[0]], limit: 10, offset: 0 }),
          signal: AbortSignal.timeout(8000),
        }
      );
      const body = await rf.json();
      results.funnel_one_call = { status: rf.status, hasData: !!(body?.data?.products?.[0]) };
    } catch (e) { results.funnel_one_call = { error: String(e) }; }

  } catch (e) { results.error = String(e); }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
