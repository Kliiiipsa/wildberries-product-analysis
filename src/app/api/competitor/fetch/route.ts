import { NextRequest, NextResponse } from 'next/server';
import type { CompetitorStats, ComparisonData } from '@/types';

export const runtime = 'edge';
export const maxDuration = 30;

function getLast30Days() {
  const to = new Date();
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(to) };
}

// MPSTATS /analytics/v1/wb/items/{nmId}/full response structure (confirmed May 2026):
// f.name / f.full_name           — название
// f.brand                        — бренд
// f.price.price                  — базовая цена (объект, не число!)
// f.price.final_price            — цена со скидкой
// f.discount                     — скидка %
// f.balance                      — остатки (доступно к покупке)
// f.rating                       — рейтинг
// f.comments                     — кол-во отзывов
// f.period_stats.sales           — продажи за период (30 дн)
// f.period_stats.revenue         — выручка за период (руб)
// f.color.все_цвета[0].фото      — URL фото (thumbnail)
async function fetchOneItem(nmId: number, token: string, myNmId: number): Promise<CompetitorStats> {
  const hdrs = { 'X-Mpstats-TOKEN': token, Accept: 'application/json' };

  const res = await fetch(
    `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/full`,
    { headers: hdrs, signal: AbortSignal.timeout(22000) },
  );

  if (!res.ok) {
    return {
      nmId, name: '', brand: '', price: 0, priceSale: 0, discount: 0,
      sales30d: 0, revenue30d: 0, stockTotal: 0, rating: 0, reviewCount: 0,
      isMine: nmId === myNmId,
      dataError: `MPSTATS HTTP ${res.status}`,
    };
  }

  const f = await res.json() as Record<string, unknown>;

  // price — объект {price, final_price, wallet_price}
  const priceObj = (f.price && typeof f.price === 'object')
    ? (f.price as Record<string, unknown>)
    : null;
  const price     = Number(priceObj?.price ?? 0);
  const priceSale = Number(priceObj?.final_price ?? priceObj?.price ?? price);
  const discount  = price > 0 && priceSale < price
    ? Math.round((1 - priceSale / price) * 100)
    : Number(f.discount ?? 0);

  // period_stats — объект с агрегатами за ~30 дней
  const ps = (f.period_stats && typeof f.period_stats === 'object')
    ? (f.period_stats as Record<string, unknown>)
    : null;
  const sales30d   = Number(ps?.sales   ?? 0);
  const revenue30d = Number(ps?.revenue ?? 0);

  // stock
  const stockTotal = Number(f.balance ?? 0);

  // photo — f.color.все_цвета[0].фото (thumbnail)
  let photoUrl: string | undefined;
  try {
    const colorObj  = f.color as Record<string, unknown> | undefined;
    const allColors = colorObj?.['все_цвета'] as Array<Record<string, unknown>> | undefined;
    const thumb     = allColors?.[0]?.['фото'];
    if (typeof thumb === 'string' && thumb) photoUrl = thumb;
  } catch { /* ignore */ }

  return {
    nmId,
    name:        String(f.full_name ?? f.name ?? ''),
    brand:       String(f.brand ?? ''),
    price,
    priceSale,
    discount,
    sales30d,
    revenue30d,
    stockTotal,
    rating:      Number(f.rating ?? 0),
    reviewCount: Number(f.comments ?? 0),
    photoUrl,
    isMine:      nmId === myNmId,
  };
}

export async function POST(req: NextRequest) {
  const token = process.env.MPSTATS_API_KEY || '';
  if (!token) {
    return NextResponse.json({ error: 'MPSTATS_API_KEY не настроен' }, { status: 500 });
  }

  let body: { nmIds?: number[]; myNmId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const nmIds: number[] = Array.isArray(body?.nmIds) ? body.nmIds.map(Number).filter(Boolean) : [];
  const myNmId: number  = Number(body?.myNmId ?? 0);

  if (nmIds.length === 0) {
    return NextResponse.json({ error: 'nmIds обязателен' }, { status: 400 });
  }

  const { from, to } = getLast30Days();

  const results = await Promise.allSettled(
    nmIds.map(nmId => fetchOneItem(nmId, token, myNmId)),
  );

  const products: CompetitorStats[] = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      nmId: nmIds[i], name: '', brand: '', price: 0, priceSale: 0, discount: 0,
      sales30d: 0, revenue30d: 0, stockTotal: 0, rating: 0, reviewCount: 0,
      isMine: nmIds[i] === myNmId, dataError: String(r.reason),
    };
  });

  const result: ComparisonData = {
    products,
    period: { from, to },
    fetchedAt: new Date().toLocaleString('ru-RU'),
  };

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, max-age=300' },
  });
}
