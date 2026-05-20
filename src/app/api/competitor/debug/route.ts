import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const token = process.env.MPSTATS_API_KEY || '';
  if (!token) return NextResponse.json({ error: 'no token' }, { status: 500 });

  const nmId  = Number(req.nextUrl.searchParams.get('nmId') || '558069949');
  const to    = new Date().toISOString().split('T')[0];
  const from  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const hdrs = { 'X-Mpstats-TOKEN': token, Accept: 'application/json', 'Content-Type': 'application/json' };

  // Test 1: POST /api/v2/nm-report/detail (batch)
  const r1 = await fetch('https://mpstats.io/api/v2/nm-report/detail', {
    method: 'POST', headers: hdrs,
    body: JSON.stringify({ nmIds: [nmId], period: { begin: from, end: to } }),
  }).catch(e => ({ ok: false, status: 0, text: async () => String(e) } as Response));

  // Test 2: POST /api/wb/get/item/{nmId}/by_date (per-item, POST)
  const r2 = await fetch(
    `https://mpstats.io/api/wb/get/item/${nmId}/by_date?d1=${from}&d2=${to}`,
    { method: 'POST', headers: hdrs, body: '{}' },
  ).catch(e => ({ ok: false, status: 0, text: async () => String(e) } as Response));

  const parse = async (r: Response) => {
    const text = await r.text().catch(() => '');
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json)) return { status: r.status, isArray: true, length: json.length, firstItem: json[0] ?? null, keys: json[0] ? Object.keys(json[0]) : [] };
      return { status: r.status, keys: Object.keys(json), data: json };
    } catch {
      return { status: r.status, rawText: text.slice(0, 500) };
    }
  };

  return NextResponse.json({
    nmId, period: { from, to },
    test1_batch_v2: await parse(r1),
    test2_bydate_post: await parse(r2),
  });
}
