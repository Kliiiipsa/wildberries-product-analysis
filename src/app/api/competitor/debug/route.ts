import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;

// Временный debug-роут — удалить после выяснения структуры MPSTATS ответа
export async function GET(req: NextRequest) {
  const token = process.env.MPSTATS_API_KEY || '';
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 500 });

  const nmId = req.nextUrl.searchParams.get('nmId') || '558069949';
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const hdrs = { 'X-Mpstats-TOKEN': token, Accept: 'application/json' };

  const [byDate, full, summary] = await Promise.allSettled([
    fetch(`https://mpstats.io/api/wb/get/item/${nmId}/by_date?d1=${from}&d2=${to}`, { headers: hdrs }),
    fetch(`https://mpstats.io/api/analytics/v1/wb/items/${nmId}/full`, { headers: hdrs }),
    fetch(`https://mpstats.io/api/wb/get/item/${nmId}/summary`, { headers: hdrs }),
  ]);

  const parse = async (r: PromiseSettledResult<Response>) => {
    if (r.status === 'rejected') return { error: String(r.reason) };
    const text = await r.value.text();
    try {
      const json = JSON.parse(text);
      // Если массив — возвращаем только первые 2 элемента + ключи
      if (Array.isArray(json)) {
        return {
          status: r.value.status,
          isArray: true,
          length: json.length,
          firstItem: json[0] ?? null,
          keys: json[0] ? Object.keys(json[0]) : [],
        };
      }
      return { status: r.value.status, data: json, keys: Object.keys(json) };
    } catch {
      return { status: r.value.status, rawText: text.slice(0, 500) };
    }
  };

  return NextResponse.json({
    nmId,
    period: { from, to },
    byDate: await parse(byDate),
    full: await parse(full),
    summary: await parse(summary),
  });
}
