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
    results.tags = { status: r.status, body };
  } catch (e) {
    results.tags = { error: String(e) };
  }

  // Достаём tagId
  const tags = (results.tags as { body?: { data?: { id: number; name: string }[] } })?.body?.data ?? [];
  const tag = tags.find((t: { id: number; name: string }) => t.name === SELLER_LABEL);
  results.tag = tag ?? null;
  if (!tag) return NextResponse.json(results);

  // 2. Карточки (первые 100)
  try {
    const r = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { cursor: { limit: 100, offset: 0 }, filter: { tagIDs: [tag.id], withPhoto: -1 } } }),
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.json();
    const cards = body?.cards ?? [];
    results.cards = { status: r.status, count: cards.length, nmIds: cards.map((c: { nmID: number }) => c.nmID) };
  } catch (e) {
    results.cards = { error: String(e) };
  }

  const nmIds: number[] = (results.cards as { nmIds?: number[] })?.nmIds ?? [];
  if (nmIds.length === 0) return NextResponse.json(results);

  // 3. NM Report сегодня
  const MSK = 3 * 60 * 60 * 1000;
  const nowMsk = new Date(Date.now() + MSK);
  const beginMsk = new Date(nowMsk); beginMsk.setUTCHours(0, 0, 0, 0);
  const endMsk = new Date(nowMsk); endMsk.setUTCMinutes(0, 0, 0);
  if (endMsk <= beginMsk) endMsk.setUTCHours(1, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:00:00`;
  const beginStr = fmt(beginMsk);
  const endStr = fmt(endMsk);
  const begin30Str = fmt(new Date(beginMsk.getTime() - 30 * 24 * 60 * 60 * 1000));

  try {
    const r = await fetch('https://seller-analytics-api.wildberries.ru/api/v2/nm-report/detail', {
      method: 'POST',
      headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nmIds, period: { begin: beginStr, end: endStr }, timezone: 'Europe/Moscow', page: 1, limit: 100 }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await r.json();
    const cards = body?.data?.cards ?? [];
    results.nmReport_today = {
      status: r.status,
      period: { begin: beginStr, end: endStr },
      requestedNmIds: nmIds.length,
      returnedCount: cards.length,
      returnedNmIds: cards.map((c: { nmID: number }) => c.nmID),
      isNextPage: body?.data?.isNextPage,
      rawError: body?.error ?? null,
      // первые 2 карточки целиком для диагностики
      sample: cards.slice(0, 2),
    };
  } catch (e) {
    results.nmReport_today = { error: String(e) };
  }

  // 4. NM Report 30 дней
  try {
    const r = await fetch('https://seller-analytics-api.wildberries.ru/api/v2/nm-report/detail', {
      method: 'POST',
      headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nmIds, period: { begin: begin30Str, end: endStr }, timezone: 'Europe/Moscow', page: 1, limit: 100 }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await r.json();
    const cards = body?.data?.cards ?? [];
    results.nmReport_30d = {
      status: r.status,
      period: { begin: begin30Str, end: endStr },
      requestedNmIds: nmIds.length,
      returnedCount: cards.length,
      returnedNmIds: cards.map((c: { nmID: number }) => c.nmID),
      isNextPage: body?.data?.isNextPage,
      rawError: body?.error ?? null,
      sample: cards.slice(0, 2),
    };
  } catch (e) {
    results.nmReport_30d = { error: String(e) };
  }

  // 5. Остатки (первые 10 nmId)
  try {
    const r = await fetch('https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses', {
      method: 'POST',
      headers: { Authorization: bearerToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nmIds: nmIds.slice(0, 10), limit: 100, offset: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await r.json();
    results.stocks = { status: r.status, itemsCount: body?.data?.items?.length ?? 0, rawError: body?.error ?? null };
  } catch (e) {
    results.stocks = { error: String(e) };
  }

  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
