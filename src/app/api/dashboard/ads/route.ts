import { NextRequest, NextResponse } from 'next/server';
import type { DashboardAdCampaign, DashboardAdsResult } from '@/types';

export const runtime = 'edge';
export const maxDuration = 30;

const BASE = 'https://advert-api.wildberries.ru';

type EmitPayload =
  | { type: 'progress'; percent: number; step: string }
  | { type: 'done'; data: DashboardAdsResult }
  | { type: 'error'; error: string };

function last7Days() {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(to) };
}

// Суммируем показатели по конкретному nmId из структуры days→apps→nms
function extractNmStats(campRaw: Record<string, unknown>, targetNmId: number) {
  let views = 0, clicks = 0, atbs = 0, orders = 0, sum = 0, sum_price = 0;

  const days = Array.isArray(campRaw.days) ? campRaw.days as Record<string, unknown>[] : [];
  for (const day of days) {
    const apps = Array.isArray(day.apps) ? day.apps as Record<string, unknown>[] : [];
    for (const app of apps) {
      const nms = Array.isArray(app.nms) ? app.nms as Record<string, unknown>[] : [];
      for (const nm of nms) {
        if (Number(nm.nm) === targetNmId) {
          views     += Number(nm.views     ?? 0);
          clicks    += Number(nm.clicks    ?? 0);
          atbs      += Number(nm.atbs      ?? 0);
          orders    += Number(nm.orders    ?? 0);
          sum       += Number(nm.sum       ?? 0);
          sum_price += Number(nm.sum_price ?? 0);
        }
      }
    }
  }

  // Если nmId не найден в days→nms — берём агрегат кампании целиком (fallback)
  if (views === 0 && clicks === 0 && orders === 0) {
    const sumDays = (key: string) =>
      days.reduce((acc, d) => acc + Number((d as Record<string, unknown>)[key] ?? 0), 0);
    views     = Number(campRaw.views     ?? 0) || sumDays('views');
    clicks    = Number(campRaw.clicks    ?? 0) || sumDays('clicks');
    atbs      = Number(campRaw.atbs      ?? 0) || sumDays('atbs');
    orders    = Number(campRaw.orders    ?? 0) || sumDays('orders');
    sum       = Number(campRaw.sum       ?? 0) || sumDays('sum');
    sum_price = Number(campRaw.sum_price ?? 0) || sumDays('sum_price');
  }

  return { views, clicks, atbs, orders, sum, sum_price };
}

export async function POST(req: NextRequest) {
  const token = process.env.WB_API_TOKEN || '';
  if (!token) return NextResponse.json({ error: 'WB_API_TOKEN не настроен' }, { status: 500 });

  let body: { nmIds?: number[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const nmIds: number[] = Array.isArray(body?.nmIds) ? body.nmIds.map(Number) : [];
  if (nmIds.length === 0) return NextResponse.json({ error: 'nmIds обязателен' }, { status: 400 });

  const nmIdSet = new Set(nmIds);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (payload: EmitPayload) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        emit({ type: 'progress', percent: 5, step: 'Получаю список рекламных кампаний...' });

        // ── Step 1: Общий баланс кабинета ───────────────────────────────────────
        let accountBalance = 0;
        try {
          const balRes = await fetch(`${BASE}/adv/v1/balance`, {
            headers: { Authorization: token },
            signal: AbortSignal.timeout(8000),
          });
          if (balRes.ok) {
            const balJson = await balRes.json();
            accountBalance = Number(balJson?.balance ?? balJson?.total ?? 0);
          }
        } catch { /* не критично */ }

        // ── Step 2: Все кампании со статусами и changeTime ───────────────────────
        const countRes = await fetch(`${BASE}/adv/v1/promotion/count`, {
          headers: { Authorization: token },
          signal: AbortSignal.timeout(10000),
        });
        if (!countRes.ok) {
          emit({ type: 'error', error: `Advert count API: HTTP ${countRes.status}` });
          return;
        }
        const countJson = await countRes.json();

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        type AdvertEntry = { advertId?: number; changeTime?: string };
        // candidateIds: сначала активные (status=9), потом недавние
        const activeIds: number[]  = [];
        const recentIds: number[]  = [];
        const changeTimes = new Map<number, string>();
        const statusFromCount = new Map<number, number>();

        for (const group of (countJson?.adverts ?? [])) {
          const groupStatus = Number(group.status ?? 0);
          if (groupStatus === -1 || groupStatus === 8) continue; // удалённые и отклонённые

          for (const item of (group?.advert_list ?? []) as AdvertEntry[]) {
            const advertId = Number(item.advertId ?? 0);
            if (!advertId) continue;
            const changeTime = item.changeTime ?? '';
            if (changeTime) changeTimes.set(advertId, changeTime);
            statusFromCount.set(advertId, groupStatus);

            if (groupStatus === 9) {
              activeIds.push(advertId);
            } else {
              const changedDate = changeTime ? new Date(changeTime) : null;
              if (changedDate && !isNaN(changedDate.getTime()) && changedDate >= sevenDaysAgo) {
                recentIds.push(advertId);
              }
            }
          }
        }

        // Активные первыми — так мы быстро находим нужные кампании
        const candidateIds = [...activeIds, ...recentIds];

        if (candidateIds.length === 0) {
          emit({ type: 'done', data: {
            ads: Object.fromEntries(nmIds.map(id => [String(id), null])),
            accountBalance,
            fetchedAt: new Date().toLocaleString('ru-RU'),
          } });
          return;
        }

        emit({ type: 'progress', percent: 22, step: `Найдено ${candidateIds.length} кампаний. Проверяю привязку к товарам...` });

        // ── Step 3: Детали кампаний — nm_settings ────────────────────────────────
        type AdvertInfo = {
          advertId: number; name: string; status: number;
          paymentType: string; bidType: string; numericType: number; changeTime: string;
        };
        const nmIdToAdverts = new Map<number, AdvertInfo[]>();
        const advertIdToNmId = new Map<number, number>(); // обратная карта

        // Обрабатываем батчами по 50; останавливаемся как только нашли для всех nmId
        for (let i = 0; i < Math.min(candidateIds.length, 200); i += 50) {
          const batch = candidateIds.slice(i, i + 50);
          try {
            const r = await fetch(`${BASE}/api/advert/v2/adverts?ids=${batch.join(',')}`, {
              headers: { Authorization: token },
              signal: AbortSignal.timeout(10000),
            });
            if (!r.ok) continue;
            const data = await r.json();
            const adverts: Record<string, unknown>[] = Array.isArray(data?.adverts)
              ? data.adverts : (Array.isArray(data) ? data : []);

            for (const a of adverts) {
              const aId = Number(a.id ?? a.advertId ?? 0);
              if (!aId) continue;

              // Тип кампании: payment_type из settings + bid_type на верхнем уровне
              const settings = (a.settings ?? {}) as Record<string, unknown>;
              const paymentType = String(settings.payment_type ?? a.payment_type ?? '');
              const bidType = String(a.bid_type ?? '');

              const info: AdvertInfo = {
                advertId: aId,
                name: String(a.name ?? ''),
                status: statusFromCount.get(aId) ?? Number(a.status ?? 0),
                paymentType,
                bidType,
                numericType: Number(a.type ?? 0),
                changeTime: changeTimes.get(aId) ?? '',
              };

              const nmSettings = a.nm_settings as { nm_id?: number }[] | undefined;
              if (nmSettings) {
                for (const s of nmSettings) {
                  const sNmId = Number(s.nm_id ?? 0);
                  if (nmIdSet.has(sNmId)) {
                    const existing = nmIdToAdverts.get(sNmId) ?? [];
                    existing.push(info);
                    nmIdToAdverts.set(sNmId, existing);
                  }
                }
              }
            }
          } catch { continue; }

          // Если уже нашли кампании для всех nmId — можно остановиться
          if ([...nmIdSet].every(id => (nmIdToAdverts.get(id)?.length ?? 0) > 0)) break;
        }

        emit({ type: 'progress', percent: 50, step: 'Загружаю статистику кампаний...' });

        // ── Step 4: Выбираем лучшую кампанию для каждого nmId ───────────────────
        const pickedAdverts = new Map<number, AdvertInfo>(); // nmId → best campaign

        for (const nmId of nmIds) {
          const adverts = nmIdToAdverts.get(nmId) ?? [];
          if (adverts.length === 0) continue;

          // Приоритет: активные (status=9) → самая свежая changeTime
          const active = adverts.filter(a => a.status === 9);
          const pool = active.length > 0 ? active : adverts;
          const best = pool.reduce((prev, curr) =>
            curr.changeTime > prev.changeTime ? curr : prev, pool[0]);
          pickedAdverts.set(nmId, best);
          advertIdToNmId.set(best.advertId, nmId);
        }

        // Уникальные advertId для fullstats
        const uniqueAdvertIds = [...new Set([...pickedAdverts.values()].map(a => a.advertId))].slice(0, 50);

        // ── Step 5: Fullstats (1 запрос, лимит 3 req/min — укладываемся в 1) ─────
        const { from, to } = last7Days();
        const statsRawMap = new Map<number, Record<string, unknown>>();

        if (uniqueAdvertIds.length > 0) {
          try {
            const statsRes = await fetch(
              `${BASE}/adv/v3/fullstats?ids=${uniqueAdvertIds.join(',')}&beginDate=${from}&endDate=${to}`,
              { headers: { Authorization: token }, signal: AbortSignal.timeout(20000) }
            );
            if (statsRes.ok) {
              const statsRaw = await statsRes.json();
              const statsArr: unknown[] = Array.isArray(statsRaw) ? statsRaw
                : Array.isArray(statsRaw?.adverts) ? statsRaw.adverts : [];
              for (const c of statsArr) {
                const camp = c as Record<string, unknown>;
                const aId = Number(camp.advertId ?? camp.id ?? 0);
                if (aId) statsRawMap.set(aId, camp);
              }
            }
          } catch { /* статистика недоступна — покажем без цифр */ }
        }

        emit({ type: 'progress', percent: 78, step: 'Загружаю остатки бюджетов кампаний...' });

        // ── Step 6: Остатки бюджетов параллельно ─────────────────────────────────
        const budgetMap = new Map<number, number>(); // advertId → остаток ₽
        await Promise.allSettled(uniqueAdvertIds.map(async (aId) => {
          try {
            const r = await fetch(`${BASE}/adv/v1/budget?id=${aId}`, {
              headers: { Authorization: token },
              signal: AbortSignal.timeout(6000),
            });
            if (r.ok) {
              const j = await r.json();
              const remaining = Number(j?.total ?? j?.balance ?? j?.amount ?? 0);
              budgetMap.set(aId, remaining);
            }
          } catch { /* ignored */ }
        }));

        emit({ type: 'progress', percent: 92, step: 'Формирую отчёт...' });

        // ── Step 7: Собираем результат ────────────────────────────────────────────
        const ads: Record<string, DashboardAdCampaign | null> = {};

        for (const nmId of nmIds) {
          const best = pickedAdverts.get(nmId);
          if (!best) {
            ads[String(nmId)] = null;
            continue;
          }

          const campRaw = statsRawMap.get(best.advertId) ?? {};
          const { views, clicks, atbs, orders, sum, sum_price } = extractNmStats(campRaw, nmId);

          const ctr = views > 0 ? (clicks / views) * 100 : 0;
          const cpc = clicks > 0 ? sum / clicks : 0;
          const drr = sum_price > 0 ? (sum / sum_price) * 100 : 0;

          ads[String(nmId)] = {
            advertId: best.advertId,
            name: best.name,
            status: best.status,
            paymentType: best.paymentType,
            bidType: best.bidType,
            numericType: best.numericType,
            views,
            clicks,
            atbs,
            orders,
            sum7d: sum,
            sum_price,
            ctr,
            cpc,
            drr,
            budgetRemaining: budgetMap.get(best.advertId) ?? 0,
          };
        }

        emit({ type: 'done', data: { ads, accountBalance, fetchedAt: new Date().toLocaleString('ru-RU') } });

      } catch (err) {
        emit({ type: 'error', error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
  });
}
