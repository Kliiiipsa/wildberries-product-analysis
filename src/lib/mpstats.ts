import type { MpstatsData, MpstatsCompetitor, MpstatsPosition, MpstatsSemantic, SeasonalityData } from '@/types';
import { getLast30Days } from '@/lib/utils';

// Mpstats поддерживает два базовых пути — пробуем оба
const API_BASES = [
  (process.env.MPSTATS_BASE_URL || 'https://mpstats.io/api/wb').replace(/\/$/, ''),
  'https://mpstats.io/api/wb',
].filter((v, i, arr) => arr.indexOf(v) === i); // dedupe

async function mpGet(path: string, token: string): Promise<unknown> {
  const errors: string[] = [];
  for (const base of API_BASES) {
    const url = `${base}${path}`;
    try {
      const res = await fetch(url, {
        headers: { 'X-Mpstats-TOKEN': token, Accept: 'application/json' },
        next: { revalidate: 0 },
      });
      if (res.status === 405) {
        // Метод не разрешён — пробуем POST
        const res2 = await fetch(url, {
          method: 'POST',
          headers: { 'X-Mpstats-TOKEN': token, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: '{}',
          next: { revalidate: 0 },
        });
        if (res2.ok) return res2.json();
        errors.push(`POST ${url}: ${res2.status}`);
        continue;
      }
      if (!res.ok) { errors.push(`GET ${url}: ${res.status}`); continue; }
      return await res.json();
    } catch (e) {
      errors.push(`${url}: ${e}`);
    }
  }
  throw new Error(errors.join(' | '));
}

function toArr(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const key of ['items', 'data', 'results', 'list', 'products']) {
      if (Array.isArray(d[key])) return d[key] as Record<string, unknown>[];
    }
  }
  return [];
}

export async function fetchMpstatsData(article: string, token: string): Promise<MpstatsData | null> {
  if (!token) return null;

  const nmId = article;
  const { from, to } = getLast30Days();
  const errors: string[] = [];
  let productInfo: MpstatsData['productInfo'] | undefined;
  const competitors: MpstatsCompetitor[] = [];
  const positions: MpstatsPosition[] = [];
  const semantics: MpstatsSemantic[] = [];

  // ─── Product summary / by_date ──────────────────────────────────────────────
  try {
    const data = await mpGet(`/get/item/${nmId}/by_date?d1=${from}&d2=${to}`, token)
      .catch(() => mpGet(`/get/item/${nmId}/summary`, token));

    const arr = toArr(data);
    if (arr.length > 0) {
      const sales30 = arr.reduce((a, r) => a + Number(r.sales || r.revenue || 0), 0);
      const revenue30 = arr.reduce((a, r) => a + Number(r.proceeds || r.sum || 0), 0);
      const avgPrice = arr.length ? arr.reduce((a, r) => a + Number(r.price || 0), 0) / arr.length : 0;
      productInfo = { sales30, revenue30, avgPrice, position: 0 };
    } else if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      productInfo = {
        sales30: Number(d.sales || 0),
        revenue30: Number(d.revenue || d.proceeds || 0),
        avgPrice: Number(d.price || d.avg_price || 0),
        position: Number(d.position || 0),
      };
    }
  } catch (e) { errors.push(`by_date: ${e}`); }

  // ─── Similar / Конкуренты ───────────────────────────────────────────────────
  try {
    const data = await mpGet(`/get/item/${nmId}/similar`, token);
    toArr(data).slice(0, 10).forEach((item) => {
      const colorsRaw = item.colors_count ?? item.colors ?? item.variants_count;
      const colors_count = colorsRaw !== undefined && Number(colorsRaw) > 0
        ? Number(colorsRaw)
        : undefined;
      competitors.push({
        article: String(item.id || item.nmId || item.nm_id || ''),
        name: String(item.name || item.title || ''),
        brand: String(item.brand || ''),
        price: Number(item.price || item.final_price || 0),
        rating: Number(item.rating || 0),
        feedbacks: Number(item.comments || item.feedbacks || item.reviews_count || 0),
        sales30: Number(item.sales || item.sales_count || 0),
        revenue30: Number(item.revenue || item.proceeds || 0),
        balance: Number(item.balance || item.stocks || 0),
        colors_count,
      });
    });
  } catch (e) { errors.push(`similar: ${e}`); }

  // ─── Позиции в поиске ───────────────────────────────────────────────────────
  try {
    const data = await mpGet(`/get/item/${nmId}/positions`, token);
    toArr(data).slice(0, 15).forEach((item) => {
      positions.push({
        keyword: String(item.keyword || item.query || item.search_query || ''),
        position: Number(item.position || item.rank || 0),
        page: Math.ceil(Number(item.position || item.rank || 1) / 100),
        frequency: Number(item.frequency || item.wb_freq || item.search_count || 0),
      });
    });
  } catch (e) { errors.push(`positions: ${e}`); }

  // ─── Семантика / Ключевые слова ──────────────────────────────────────────────
  try {
    const data = await mpGet(`/get/item/${nmId}/keywords`, token);
    toArr(data).slice(0, 20).forEach((item) => {
      semantics.push({
        keyword: String(item.keyword || item.query || item.word || ''),
        frequency: Number(item.frequency || item.wb_freq || item.count || 0),
        ctr: item.ctr ? Number(item.ctr) : undefined,
      });
    });
  } catch (e) { errors.push(`keywords: ${e}`); }

  if (!productInfo && competitors.length === 0 && errors.length > 0) {
    throw new Error(`Mpstats ошибки: ${errors.join('; ')}`);
  }

  return { productInfo, competitors, positions, semantics };
}

// ─── Сезонность ──────────────────────────────────────────────────────────────

export async function fetchSeasonalityData(article: string, token: string): Promise<SeasonalityData | null> {
  if (!token) return null;

  const base = 'https://mpstats.io/api/analytics/v1/wb';
  const headers = { 'X-Mpstats-TOKEN': token, Accept: 'application/json' };

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const fromDate = new Date(yesterday);
  fromDate.setDate(fromDate.getDate() - 30);
  const d1 = fromDate.toISOString().split('T')[0];
  const d2 = yesterday.toISOString().split('T')[0];

  // Step 1: параллельно получаем инфо о товаре и видимость по ключевым запросам
  const [itemResult, kwResult] = await Promise.allSettled([
    fetch(`${base}/items/${article}/full`, {
      headers, next: { revalidate: 0 }, signal: AbortSignal.timeout(15000),
    }),
    fetch(`${base}/items/${article}/keywords`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ d1, d2 }),
      next: { revalidate: 0 }, signal: AbortSignal.timeout(15000),
    }),
  ]);

  // Извлекаем productName и category из /full (для отображения)
  let productName = '';
  let category = '';
  if (itemResult.status === 'fulfilled' && itemResult.value.ok) {
    const item = (await itemResult.value.json()) as Record<string, unknown>;
    productName = String(item.full_name || item.name || '');
    const subj = item.subject as Record<string, unknown> | undefined;
    category = String(subj?.item || '');
  }

  // Step 2: берём топ поисковый запрос по wb_count из видимости
  if (kwResult.status !== 'fulfilled' || !kwResult.value.ok) {
    const status = kwResult.status === 'fulfilled' ? kwResult.value.status : 'network error';
throw new Error(`Mpstats keywords visibility: ${status}`);
  }
  const kwJson = (await kwResult.value.json()) as Record<string, unknown>;
  const words = (
    ((kwJson.data as Record<string, unknown>)?.words) ?? kwJson.words ?? []
  ) as Array<Record<string, unknown>>;

  if (words.length === 0) throw new Error('Mpstats: нет данных видимости по ключевым запросам');

  const topWord = words
    .slice()
    .sort((a, b) => (Number(b.wb_count) || 0) - (Number(a.wb_count) || 0))[0];
  const keyword = String(topWord.query || topWord.keyword || '');
  if (!keyword) throw new Error('Mpstats: не найден поисковый запрос в видимости');

  // Step 3: история частоты по топовому запросу
  const freqRes = await fetch(
    `${base}/keywords/frequency?keyword=${encodeURIComponent(keyword)}`,
    { headers, next: { revalidate: 0 }, signal: AbortSignal.timeout(15000) }
  );
  if (!freqRes.ok) throw new Error(`Mpstats frequency: ${freqRes.status}`);

  let freqData = await freqRes.json();
  if (!Array.isArray(freqData) && freqData && typeof freqData === 'object') {
    const d = freqData as Record<string, unknown>;
    freqData = d.data ?? d.items ?? d.results ?? [];
  }
  if (!Array.isArray(freqData) || freqData.length === 0) {
    throw new Error(`Mpstats frequency: нет данных для «${keyword}»`);
  }

  // Step 4: коэффициент сезонности по месяцам
  const monthly: Record<number, number[]> = {};
  (freqData as Array<{ date: string; frequency: number }>).forEach(({ date, frequency }) => {
    const m = new Date(date).getMonth() + 1;
    if (!monthly[m]) monthly[m] = [];
    monthly[m].push(Number(frequency) || 0);
  });

  const monthAvg: Record<number, number> = {};
  for (const [m, vals] of Object.entries(monthly)) {
    monthAvg[Number(m)] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const totalAvg = Object.values(monthAvg).reduce((a, b) => a + b, 0) / Object.keys(monthAvg).length;

  const seasonality: Record<string, number> = {};
  for (const [m, avg] of Object.entries(monthAvg)) {
    seasonality[m] = +(avg / totalAvg).toFixed(2);
  }

  return { keyword, productName, category, seasonality };
}
