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

async function fetchOneItem(
  nmId: number,
  token: string,
  from: string,
  to: string,
  myNmId: number,
): Promise<CompetitorStats> {
  const hdrs = { 'X-Mpstats-TOKEN': token, Accept: 'application/json' };

  const [byDateRes, fullRes] = await Promise.allSettled([
    fetch(
      `https://mpstats.io/api/wb/get/item/${nmId}/by_date?d1=${from}&d2=${to}`,
      { headers: hdrs, signal: AbortSignal.timeout(22000) },
    ),
    fetch(
      `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/full`,
      { headers: hdrs, signal: AbortSignal.timeout(22000) },
    ),
  ]);

  let name = '', brand = '', photoUrl: string | undefined;
  let price = 0, priceSale = 0, discount = 0;
  let rating = 0, reviewCount = 0, stockTotal = 0;
  let sales30d = 0, revenue30d = 0;
  let dataError: string | undefined;

  if (fullRes.status === 'fulfilled' && fullRes.value.ok) {
    const f = await fullRes.value.json() as Record<string, unknown>;
    name = String(f.full_name || f.name || '');
    brand = String(f.brand || f.brand_name || '');
    price = Number(f.price || f.basic_price || 0);
    priceSale = Number(f.final_price || f.sale_price || f.price_u || price);
    discount = price > 0 && priceSale < price
      ? Math.round((1 - priceSale / price) * 100)
      : Number(f.discount || 0);
    rating = Number(f.rating || 0);
    reviewCount = Number(f.comments || f.feedbacks || f.reviews_count || 0);
    stockTotal = Number(f.balance || f.stock || f.quantity || 0);
    const thumb = f.thumb || f.image || f.photo;
    if (typeof thumb === 'string' && thumb) photoUrl = thumb;
  } else if (fullRes.status === 'fulfilled') {
    dataError = `MPSTATS /full: HTTP ${fullRes.value.status}`;
  } else {
    dataError = `MPSTATS: ${fullRes.reason}`;
  }

  if (byDateRes.status === 'fulfilled' && byDateRes.value.ok) {
    const data = await byDateRes.value.json();
    const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    if (arr.length > 0) {
      sales30d = arr.reduce((s, r) => s + Number(r.sales || r.ordered || 0), 0);
      revenue30d = arr.reduce((s, r) => s + Number(r.proceeds || r.revenue || r.sum || 0), 0);
      if (!price) {
        const avg = arr.reduce((s, r) => s + Number(r.price || 0), 0) / arr.length;
        if (avg > 0) { price = avg; priceSale = avg; }
      }
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      const d = data as Record<string, unknown>;
      sales30d = Number(d.sales || d.ordered || 0);
      revenue30d = Number(d.revenue || d.proceeds || d.sum || 0);
    }
  }

  return {
    nmId, name, brand, price, priceSale, discount,
    sales30d, revenue30d, stockTotal, rating, reviewCount,
    photoUrl, isMine: nmId === myNmId,
    ...(dataError ? { dataError } : {}),
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
  const myNmId: number = Number(body?.myNmId ?? 0);

  if (nmIds.length === 0) {
    return NextResponse.json({ error: 'nmIds обязателен' }, { status: 400 });
  }

  const { from, to } = getLast30Days();

  try {
    const results = await Promise.allSettled(
      nmIds.map(nmId => fetchOneItem(nmId, token, from, to, myNmId)),
    );

    const products: CompetitorStats[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        nmId: nmIds[i],
        name: '', brand: '', price: 0, priceSale: 0, discount: 0,
        sales30d: 0, revenue30d: 0, stockTotal: 0, rating: 0, reviewCount: 0,
        isMine: nmIds[i] === myNmId,
        dataError: String(r.reason),
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
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
