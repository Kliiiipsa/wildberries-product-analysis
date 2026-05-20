import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const token = process.env.MPSTATS_API_KEY || '';
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 500 });

  const nmId = Number(req.nextUrl.searchParams.get('nmId') || '558069949');
  // d2 = вчера (строго до сегодня), d1 = вчера - 6 = 7 дней
  const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
  const weekAgo   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const to   = fmt(yesterday);
  const from = fmt(weekAgo);

  const hdrs = { 'X-Mpstats-TOKEN': token, Accept: 'application/json' };

  const res = await fetch(
    `https://mpstats.io/api/analytics/v1/wb/items/${nmId}/full?d1=${from}&d2=${to}`,
    { headers: hdrs },
  ).catch(e => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) } as unknown as Response));

  const data = await (res as Response).json() as Record<string, unknown>;
  const ps = data.period_stats as Record<string, unknown> | undefined;

  return NextResponse.json({
    nmId, period: { from, to },
    status: (res as Response).status,
    period_stats: ps ?? null,
    sales7d: Number(ps?.sales ?? 0),
    revenue7d: Number(ps?.revenue ?? 0),
  });
}
