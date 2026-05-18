import { NextRequest } from 'next/server';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { article } = await req.json();

    if (!article || !/^\d{6,12}$/.test(String(article).trim())) {
      return Response.json({ error: 'Введите корректный артикул WB (6–12 цифр)' }, { status: 400 });
    }

    const token = process.env.MPSTATS_API_KEY || '';
    if (!token) {
      return Response.json({ error: 'MPSTATS_API_KEY не задан в .env.local' }, { status: 400 });
    }

    const art = String(article).trim();
    const headers = { 'X-Mpstats-TOKEN': token, Accept: 'application/json' };

    // Step 1: Get product info
    const itemRes = await fetch(
      `https://mpstats.io/api/analytics/v1/wb/items/${art}/full`,
      { headers, next: { revalidate: 0 }, signal: AbortSignal.timeout(15000) }
    );
    if (!itemRes.ok) {
      return Response.json(
        { error: `Mpstats: товар не найден (${itemRes.status})` },
        { status: 502 }
      );
    }
    const item = (await itemRes.json()) as Record<string, unknown>;

    const keyword = String(item.name || '');
    const productName = String(item.full_name || item.name || '');
    const subj = item.subject as Record<string, unknown> | undefined;
    const category = String(subj?.item || '');

    if (!keyword) {
      return Response.json({ error: 'Товар не найден в Mpstats' }, { status: 404 });
    }

    // Step 2: Get keyword frequency history
    const freqRes = await fetch(
      `https://mpstats.io/api/analytics/v1/wb/keywords/frequency?keyword=${encodeURIComponent(keyword)}`,
      { headers, next: { revalidate: 0 }, signal: AbortSignal.timeout(15000) }
    );
    if (!freqRes.ok) {
      return Response.json(
        { error: `Mpstats frequency API: ${freqRes.status}` },
        { status: 502 }
      );
    }

    let freqData = await freqRes.json();
    if (!Array.isArray(freqData) && freqData && typeof freqData === 'object') {
      const d = freqData as Record<string, unknown>;
      freqData = d.data ?? d.items ?? d.results ?? [];
    }
    if (!Array.isArray(freqData) || freqData.length === 0) {
      return Response.json({ error: 'Нет данных по частоте ключевого слова' }, { status: 404 });
    }

    // Step 3: Calculate seasonality coefficients
    const monthlyData: Record<number, number[]> = {};
    (freqData as Array<{ date: string; frequency: number }>).forEach(({ date, frequency }) => {
      const month = new Date(date).getMonth() + 1;
      if (!monthlyData[month]) monthlyData[month] = [];
      monthlyData[month].push(Number(frequency) || 0);
    });

    const monthAvg: Record<number, number> = {};
    for (const [month, freqs] of Object.entries(monthlyData)) {
      monthAvg[Number(month)] = freqs.reduce((a, b) => a + b, 0) / freqs.length;
    }

    const totalAvg =
      Object.values(monthAvg).reduce((a, b) => a + b, 0) / Object.keys(monthAvg).length;

    const seasonality: Record<string, number> = {};
    for (const [month, avg] of Object.entries(monthAvg)) {
      seasonality[month] = +(avg / totalAvg).toFixed(2);
    }

    return Response.json({ articul: art, keyword, productName, category, seasonality });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
