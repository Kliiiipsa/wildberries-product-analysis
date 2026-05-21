import { NextRequest, NextResponse } from 'next/server';
import { fetchUnitCosts } from '@/lib/google-sheets';

export const runtime = 'edge';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const nmId = req.nextUrl.searchParams.get('nmId') || '';
  if (!nmId || !/^\d{6,12}$/.test(nmId)) {
    return NextResponse.json({ error: 'Некорректный артикул' }, { status: 400 });
  }
  try {
    const unit = await fetchUnitCosts(nmId);
    return NextResponse.json(unit);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
