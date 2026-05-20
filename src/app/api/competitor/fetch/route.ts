import { NextRequest, NextResponse } from 'next/server';
import type { CompetitorStats, ComparisonData } from '@/types';

export const maxDuration = 30;

// d2 должен быть строго ДО сегодня (validated by MPSTATS)
// Берём вчера как d2, вчера-6дней как d1 → ровно 7 дней
function getLast7Days() {
  const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  const weekAgo   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(weekAgo), to: fmt(yesterday) };
}

async function fetchOneItem(
  nmId: number,
  token: string,
  from: string,
  to: string,
  myNmId: number,
): Promise<CompetitorStats> {
  // /full?d1=...&d2=... возвращает и метаданные, и period_stats за выбранный период
  const res = await fetch(
    `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/full?d1=${from}&d2=${to}`,
    {
      headers: { 'X-Mpstats-TOKEN': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(22000),
    },
  );

  if (!res.ok) {
    return {
      nmId, name: '', brand: '', price: 0, priceSale: 0, discount: 0,
      sales7d: 0, revenue7d: 0, stockTotal: 0, rating: 0, reviewCount: 0,
      isMine: nmId === myNmId,
      dataError: `MPSTATS HTTP ${res.status}`,
    };
  }

  const f = await res.json() as Record<string, unknown>;

  // Цена — объект {price, final_price}
  const priceObj  = (f.price && typeof f.price === 'object') ? (f.price as Record<string, unknown>) : null;
  const price     = Number(priceObj?.price ?? 0);
  const priceSale = Number(priceObj?.final_price ?? priceObj?.price ?? price);
  const discount  = price > 0 && priceSale < price
    ? Math.round((1 - priceSale / price) * 100)
    : Number(f.discount ?? 0);

  // Фото
  let photoUrl: string | undefined;
  try {
    const allColors = (f.color as Record<string, unknown>)?.['все_цвета'] as Array<Record<string, unknown>> | undefined;
    const thumb = allColors?.[0]?.['фото'];
    if (typeof thumb === 'string' && thumb) photoUrl = thumb;
  } catch { /* ignore */ }

  // period_stats за запрошенный d1–d2 период (7 дней)
  const ps = (f.period_stats && typeof f.period_stats === 'object')
    ? (f.period_stats as Record<string, unknown>)
    : null;

  return {
    nmId,
    name:        String(f.full_name ?? f.name ?? ''),
    brand:       String(f.brand ?? ''),
    price, priceSale, discount,
    sales7d:     Number(ps?.sales   ?? 0),
    revenue7d:   Number(ps?.revenue ?? 0),
    stockTotal:  Number(f.balance ?? 0),
    rating:      Number(f.rating ?? 0),
    reviewCount: Number(f.comments ?? 0),
    photoUrl,
    isMine: nmId === myNmId,
  };
}

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

  const results = await Promise.allSettled(
    nmIds.map(id => fetchOneItem(id, token, from, to, myNmId)),
  );

  const products: CompetitorStats[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      nmId: nmIds[i], name: '', brand: '', price: 0, priceSale: 0, discount: 0,
      sales7d: 0, revenue7d: 0, stockTotal: 0, rating: 0, reviewCount: 0,
      isMine: nmIds[i] === myNmId, dataError: String(r.reason),
    };
  });

  return NextResponse.json({
    products, period: { from, to },
    fetchedAt: new Date().toLocaleString('ru-RU'),
  } satisfies ComparisonData, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
}
