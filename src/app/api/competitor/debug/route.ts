import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const token = process.env.MPSTATS_API_KEY || '';
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 500 });

  const nmId = Number(req.nextUrl.searchParams.get('nmId') || '558069949');
  const to   = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const base = { 'X-Mpstats-TOKEN': token, Accept: 'application/json' };
  const json = { ...base, 'Content-Type': 'application/json' };

  const tests: Record<string, Promise<Response>> = {
    // analytics API с датами в query
    'A_full_with_dates_GET': fetch(
      `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/full?d1=${from}&d2=${to}`,
      { headers: base }
    ),
    // analytics by_date POST с телом
    'B_analytics_bydate_POST': fetch(
      `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/by_date`,
      { method: 'POST', headers: json, body: JSON.stringify({ d1: from, d2: to }) }
    ),
    // analytics by_date GET
    'C_analytics_bydate_GET': fetch(
      `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/by_date?d1=${from}&d2=${to}`,
      { headers: base }
    ),
    // wb by_date GET (в Node.js runtime, без Edge)
    'D_wb_bydate_GET': fetch(
      `https://mpstats.io/api/wb/get/item/${nmId}/by_date?d1=${from}&d2=${to}`,
      { headers: base }
    ),
    // analytics stats
    'E_analytics_stats_GET': fetch(
      `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/stats?d1=${from}&d2=${to}`,
      { headers: base }
    ),
    // analytics sales
    'F_analytics_sales_GET': fetch(
      `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/sales?d1=${from}&d2=${to}`,
      { headers: base }
    ),
  };

  const parse = async (r: Response) => {
    const text = await r.text().catch(() => '');
    try {
      const d = JSON.parse(text);
      if (Array.isArray(d)) return { status: r.status, isArray: true, length: d.length, first: d[0] ?? null, keys: d[0] ? Object.keys(d[0]) : [] };
      return { status: r.status, keys: Object.keys(d).slice(0, 20), data: d };
    } catch {
      return { status: r.status, raw: text.slice(0, 200) };
    }
  };

  const settled = await Promise.allSettled(Object.values(tests));
  const keys = Object.keys(tests);
  const results: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const r = settled[i];
    results[keys[i]] = r.status === 'fulfilled' ? await parse(r.value) : { error: String(r.reason) };
  }

  return NextResponse.json({ nmId, period: { from, to }, results });
}
