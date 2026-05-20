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

// Парсим один элемент ответа MPSTATS в CompetitorStats
function parseItem(raw: Record<string, unknown>, nmId: number, isMine: boolean): CompetitorStats {
  // MPSTATS может возвращать данные в разных форматах — обрабатываем оба
  const price     = Number(raw.price      ?? raw.priceU    ?? raw.basic_sale  ?? 0);
  const priceSale = Number(raw.price_u    ?? raw.priceSale ?? raw.sale_price  ?? price);
  const discount  = price > 0 && priceSale < price
    ? Math.round((1 - priceSale / price) * 100)
    : Number(raw.discount ?? 0);

  const sales30d  = Number(raw.sales      ?? raw.ordered   ?? raw.orders      ?? 0);
  const revenue30d = Number(raw.revenue   ?? raw.sum       ?? (sales30d * priceSale));
  const stockTotal = Number(raw.balance   ?? raw.stock     ?? raw.quantity     ?? 0);

  const name      = String(raw.name       ?? raw.title     ?? '');
  const brand     = String(raw.brand      ?? raw.brandName ?? '');
  const rating    = Number(raw.rating     ?? raw.feedbackRating ?? 0);
  const reviewCount = Number(raw.comments ?? raw.feedbacks ?? raw.reviewCount  ?? 0);

  // Фото: пробуем разные поля
  const thumb = raw.thumb ?? raw.image ?? raw.photo ?? raw.pic;
  const photoUrl = typeof thumb === 'string' && thumb ? thumb : undefined;

  return {
    nmId,
    name,
    brand,
    price,
    priceSale,
    discount,
    sales30d,
    revenue30d,
    stockTotal,
    rating,
    reviewCount,
    photoUrl,
    isMine,
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
    const res = await fetch('https://mpstats.io/api/v2/nm-report/detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mpstats-TOKEN': token,
      },
      body: JSON.stringify({
        nmIds,
        period: { begin: from, end: to },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `MPSTATS: HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}` },
        { status: 502 }
      );
    }

    const json = await res.json();

    // Ответ может быть массивом или объектом с полем data/items/results
    const rawItems: Record<string, unknown>[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.data)   ? json.data
      : Array.isArray(json?.items)  ? json.items
      : Array.isArray(json?.result) ? json.result
      : [];

    // Строим индекс по nmId из ответа
    const rawByNmId = new Map<number, Record<string, unknown>>();
    for (const item of rawItems) {
      const id = Number(item.id ?? item.nmId ?? item.nm_id ?? 0);
      if (id) rawByNmId.set(id, item);
    }

    const products: CompetitorStats[] = nmIds.map((nmId) => {
      const raw = rawByNmId.get(nmId);
      if (!raw) {
        return {
          nmId,
          name: '',
          brand: '',
          price: 0,
          priceSale: 0,
          discount: 0,
          sales30d: 0,
          revenue30d: 0,
          stockTotal: 0,
          rating: 0,
          reviewCount: 0,
          isMine: nmId === myNmId,
          dataError: 'Данные MPSTATS не найдены',
        };
      }
      return parseItem(raw, nmId, nmId === myNmId);
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
