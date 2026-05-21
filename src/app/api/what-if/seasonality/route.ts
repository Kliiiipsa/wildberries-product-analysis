import { NextRequest, NextResponse } from 'next/server';
import { fetchSeasonalityData } from '@/lib/mpstats';

export const runtime = 'edge';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const nmId = req.nextUrl.searchParams.get('nmId') || '';
  if (!nmId || !/^\d{6,12}$/.test(nmId)) {
    return NextResponse.json({ error: 'Некорректный артикул' }, { status: 400 });
  }
  const mpToken = process.env.MPSTATS_API_KEY || '';
  if (!mpToken) {
    return NextResponse.json({ error: 'MPSTATS_API_KEY не задан' }, { status: 400 });
  }
  try {
    const data = await fetchSeasonalityData(nmId, mpToken);
    return NextResponse.json(data ?? { error: 'Нет данных сезонности' });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
