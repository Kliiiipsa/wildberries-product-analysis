import { NextRequest, NextResponse } from 'next/server';
import type { CompetitorStats, ComparisonData } from '@/types';

// Node.js runtime — Edge Runtime блокируется MPSTATS CORS на by_date
export const maxDuration = 30;

function getLast7Days() {
  const to   = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fmt  = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(to) };
}

async function fetchOneItem(
  nmId: number,
  token: string,
  from: string,
  to: string,
  myNmId: number,
): Promise<CompetitorStats> {
  const hdrs = { 'X-Mpstats-TOKEN': token, Accept: 'application/json' };

  // Параллельно: метаданные + 7-дневные данные по дням
  const [fullRes, byDateRes] = await Promise.allSettled([
    fetch(`https://mpstats.io/api/analytics/v1/wb/items/${nmId}/full`, {
      headers: hdrs,
      signal: AbortSignal.timeout(22000),
    }),
    fetch(`https://mpstats.io/api/wb/get/item/${nmId}/by_date?d1=${from}&d2=${to}`, {
      method: 'POST',
      headers: { ...hdrs, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(22000),
    }),
  ]);

  if (fullRes.status === 'rejected' || !fullRes.value.ok) {
    const err = fullRes.status === 'rejected'
      ? String(fullRes.reason)
      : `MPSTATS /full HTTP ${fullRes.value.status}`;
    return {
      nmId, name: '', brand: '', price: 0, priceSale: 0, discount: 0,
      sales7d: 0, revenue7d: 0, stockTotal: 0, rating: 0, reviewCount: 0,
      isMine: nmId === myNmId, dataError: err,
    };
  }

  const f = await fullRes.value.json() as Record<string, unknown>;

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

  // 7-дневные продажи из by_date (массив дневных записей)
  // Поля подтверждены в mpstats.ts: r.sales, r.proceeds || r.sum
  let sales7d   = 0;
  let revenue7d = 0;
  if (byDateRes.status === 'fulfilled' && byDateRes.value.ok) {
    const data = await byDateRes.value.json();
    const arr: Record<string, unknown>[] = Array.isArray(data) ? data : [];
    sales7d   = arr.reduce((s, r) => s + Number(r.sales   || r.revenue  || 0), 0);
    revenue7d = arr.reduce((s, r) => s + Number(r.proceeds || r.sum     || 0), 0);
  }

  return {
    nmId,
    name:        String(f.full_name ?? f.name ?? ''),
    brand:       String(f.brand ?? ''),
    price, priceSale, discount,
    sales7d, revenue7d,
    stockTotal:  Number(f.balance ?? 0),
    rating:      Number(f.rating ?? 0),
    reviewCount: Number(f.comments ?? 0),
    photoUrl,
    isMine:      nmId === myNmId,
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
