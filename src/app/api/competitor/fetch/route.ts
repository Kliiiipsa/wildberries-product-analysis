import { NextRequest, NextResponse } from 'next/server';
import type { CompetitorStats, ComparisonData } from '@/types';

export const runtime = 'edge';
export const maxDuration = 30;

function getLast7Days() {
  const to   = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fmt  = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(to) };
}

// ── Батч-запрос к MPSTATS: заказы + выручка за 7 дней ────────────────────────
async function fetchSalesData(
  nmIds: number[],
  token: string,
  from: string,
  to: string,
): Promise<Map<number, { orders: number; revenue: number }>> {
  try {
    const res = await fetch('https://mpstats.io/api/v2/nm-report/detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mpstats-TOKEN': token,
      },
      body: JSON.stringify({ nmIds, period: { begin: from, end: to } }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) return new Map();

    const data = await res.json();

    // Ответ может быть массивом или объектом с data/results/items
    const items: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)    ? data.data
      : Array.isArray(data?.results) ? data.results
      : Array.isArray(data?.items)   ? data.items
      : [];

    const map = new Map<number, { orders: number; revenue: number }>();
    for (const item of items) {
      const id = Number(item.nmId ?? item.nm_id ?? item.id ?? 0);
      if (!id) continue;
      map.set(id, {
        orders:  Number(item.orders      ?? item.orderCount  ?? item.totalOrders  ?? 0),
        revenue: Number(item.revenue     ?? item.sum         ?? item.totalRevenue  ?? 0),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── Метаданные одного товара из MPSTATS /full ────────────────────────────────
async function fetchMeta(
  nmId: number,
  token: string,
  myNmId: number,
): Promise<CompetitorStats> {
  const res = await fetch(
    `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/full`,
    { headers: { 'X-Mpstats-TOKEN': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(22000) },
  );

  if (!res.ok) {
    return {
      nmId, name: '', brand: '', price: 0, priceSale: 0, discount: 0,
      sales7d: 0, revenue7d: 0, stockTotal: 0, rating: 0, reviewCount: 0,
      isMine: nmId === myNmId, dataError: `MPSTATS /full HTTP ${res.status}`,
    };
  }

  const f = await res.json() as Record<string, unknown>;

  const priceObj  = (f.price && typeof f.price === 'object') ? (f.price as Record<string, unknown>) : null;
  const price     = Number(priceObj?.price ?? 0);
  const priceSale = Number(priceObj?.final_price ?? priceObj?.price ?? price);
  const discount  = price > 0 && priceSale < price
    ? Math.round((1 - priceSale / price) * 100)
    : Number(f.discount ?? 0);

  let photoUrl: string | undefined;
  try {
    const allColors = (f.color as Record<string, unknown>)?.['все_цвета'] as Array<Record<string, unknown>> | undefined;
    const thumb = allColors?.[0]?.['фото'];
    if (typeof thumb === 'string' && thumb) photoUrl = thumb;
  } catch { /* ignore */ }

  return {
    nmId,
    name:        String(f.full_name ?? f.name ?? ''),
    brand:       String(f.brand ?? ''),
    price, priceSale, discount,
    sales7d:     0,   // заполняется из fetchSalesData
    revenue7d:   0,
    stockTotal:  Number(f.balance ?? 0),
    rating:      Number(f.rating ?? 0),
    reviewCount: Number(f.comments ?? 0),
    photoUrl,
    isMine: nmId === myNmId,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const token = process.env.MPSTATS_API_KEY || '';
  if (!token) return NextResponse.json({ error: 'MPSTATS_API_KEY не настроен' }, { status: 500 });

  let body: { nmIds?: number[]; myNmId?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const nmIds: number[] = Array.isArray(body?.nmIds) ? body.nmIds.map(Number).filter(Boolean) : [];
  const myNmId: number  = Number(body?.myNmId ?? 0);
  if (nmIds.length === 0) return NextResponse.json({ error: 'nmIds обязателен' }, { status: 400 });

  const { from, to } = getLast7Days();

  // Параллельно: батч-продажи + метаданные каждого товара
  const [salesResult, ...metaResults] = await Promise.allSettled([
    fetchSalesData(nmIds, token, from, to),
    ...nmIds.map(id => fetchMeta(id, token, myNmId)),
  ]);

  const salesMap = salesResult.status === 'fulfilled' ? salesResult.value : new Map();

  const products: CompetitorStats[] = metaResults.map((r, i) => {
    const nmId = nmIds[i];
    const meta = r.status === 'fulfilled'
      ? r.value
      : { nmId, name: '', brand: '', price: 0, priceSale: 0, discount: 0,
          sales7d: 0, revenue7d: 0, stockTotal: 0, rating: 0, reviewCount: 0,
          isMine: nmId === myNmId, dataError: String(r.reason) };
    const sd = salesMap.get(nmId);
    return { ...meta, sales7d: sd?.orders ?? meta.sales7d, revenue7d: sd?.revenue ?? meta.revenue7d };
  });

  return NextResponse.json({
    products, period: { from, to },
    fetchedAt: new Date().toLocaleString('ru-RU'),
  } satisfies ComparisonData, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
}
