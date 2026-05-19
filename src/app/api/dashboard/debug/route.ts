import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;

const SELLER_LABEL = process.env.SELLER_LABEL || 'Кирилл';

export async function GET() {
  const token = process.env.WB_API_TOKEN || '';
  if (!token) return NextResponse.json({ error: 'WB_API_TOKEN не настроен' }, { status: 500 });

  const bearerToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  const results: Record<string, unknown> = {};

  // 1. Теги
  try {
    const r = await fetch('https://content-api.wildberries.ru/content/v2/tags', {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.json();
    results.tags = { status: r.status };
    const tags = body?.data ?? [];
    const tag = tags.find((t: { name: string }) => t.name === SELLER_LABEL);
    results.tag = tag ?? null;
  } catch (e) {
    results.tags = { error: String(e) };
  }

  const tag = results.tag as { id: number } | null;
  if (!tag) return NextResponse.json(results);

  // 2. Карточки (первые 100)
  let nmIds: number[] = [];
  try {
    const r = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { cursor: { limit: 100, offset: 0 }, filter: { tagIDs: [tag.id], withPhoto: -1 } } }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.json();
    const cards = body?.cards ?? [];
    nmIds = cards.map((c: { nmID: number }) => Number(c.nmID));
    results.cards = { status: r.status, count: cards.length, nmIds };
  } catch (e) {
    results.cards = { error: String(e) };
  }

  if (nmIds.length === 0) return NextResponse.json(results);

  // Даты
  const MSK = 3 * 60 * 60 * 1000;
  const nowMsk = new Date(Date.now() + MSK);
  const beginMsk = new Date(nowMsk); beginMsk.setUTCHours(0, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  const todayDate = `${beginMsk.getUTCFullYear()}-${p(beginMsk.getUTCMonth()+1)}-${p(beginMsk.getUTCDate())}`;
  const begin30 = new Date(beginMsk.getTime() - 30 * 24 * 60 * 60 * 1000);
  const begin30Date = `${begin30.getUTCFullYear()}-${p(begin30.getUTCMonth()+1)}-${p(begin30.getUTCDate())}`;

  // 3. Воронка — первый товар, сегодня (сырой ответ целиком)
  const firstNmId = nmIds[0];
  try {
    const r = await fetch('https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products', {
      method: 'POST',
      headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedPeriod: { start: todayDate, end: todayDate }, nmIds: [firstNmId], limit: 10, offset: 0 }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.json();
    results.funnel_today_first = {
      status: r.status,
      nmId: firstNmId,
      period: { start: todayDate, end: todayDate },
      rawBody: body,
    };
  } catch (e) {
    results.funnel_today_first = { error: String(e) };
  }

  // 4. Воронка — первый товар, 30 дней (сырой ответ целиком)
  try {
    const r = await fetch('https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products', {
      method: 'POST',
      headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedPeriod: { start: begin30Date, end: todayDate }, nmIds: [firstNmId], limit: 10, offset: 0 }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.json();
    results.funnel_30d_first = {
      status: r.status,
      nmId: firstNmId,
      period: { start: begin30Date, end: todayDate },
      rawBody: body,
    };
  } catch (e) {
    results.funnel_30d_first = { error: String(e) };
  }

  // 5. Воронка — второй товар, 30 дней (чтобы увидеть паттерн)
  if (nmIds.length > 1) {
    const secondNmId = nmIds[1];
    try {
      const r = await fetch('https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products', {
        method: 'POST',
        headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedPeriod: { start: begin30Date, end: todayDate }, nmIds: [secondNmId], limit: 10, offset: 0 }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await r.json();
      results.funnel_30d_second = {
        status: r.status,
        nmId: secondNmId,
        period: { start: begin30Date, end: todayDate },
        rawBody: body,
      };
    } catch (e) {
      results.funnel_30d_second = { error: String(e) };
    }
  }

  // 6. Воронка без Bearer (вдруг этот эндпоинт не требует Bearer)
  try {
    const r = await fetch('https://seller-analytics-api.wildberries.ru/api/analytics/v3/sales-funnel/products', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedPeriod: { start: begin30Date, end: todayDate }, nmIds: [firstNmId], limit: 10, offset: 0 }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.json();
    results.funnel_30d_no_bearer = {
      status: r.status,
      rawBody: body,
    };
  } catch (e) {
    results.funnel_30d_no_bearer = { error: String(e) };
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
