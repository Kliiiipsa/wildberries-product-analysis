import { NextRequest } from 'next/server';
import { whatIfGroqStream } from '@/lib/groq-client';
import type { WhatIfBaseData, WhatIfParams, WhatIfForecast } from '@/types';

export const maxDuration = 30;

const AD_LABELS: Record<string, string> = {
  CPC:       'Поиск (CPC) — целевой трафик, % выкупа ×1.0',
  ARK_MANUAL:'АРК ручная — умеренный трафик, % выкупа ×0.90',
  ARK_AUTO:  'АРК единая/авто — широкий трафик, % выкупа ×0.82',
  PRK:       'Каталог (ПРК) — % выкупа ×0.87',
  ARK:       'АРК (авто)',
};

const MONTHS_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function fmt(n: number) { return n.toLocaleString('ru-RU'); }
function fmtR(n: number) { return `${fmt(Math.round(n))} ₽`; }
function fmtPct(n: number) { return n > 0 ? `${n.toFixed(1)}%` : '❌ нет данных'; }

function getCurrentReality(base: WhatIfBaseData) {
  const orders  = base.weeklyOrders  > 0 ? base.weeklyOrders  : Math.round(base.dailySales * 7);
  const buyouts = base.weeklyBuyouts > 0 ? base.weeklyBuyouts : Math.round(orders * (base.buyoutRate / 100));
  const revenue = base.weeklyRevenue > 0 ? base.weeklyRevenue : Math.round(buyouts * base.priceSale);
  const uc = base.unitCost;
  const ekv           = base.priceSale * uc.ekvairingPercent / 100;
  const nds           = uc.ndsRub > 0 ? uc.ndsRub : base.priceSale * uc.ndsPercent / 100;
  const unitCostTotal = uc.zakupka + uc.kargo + uc.logistika + uc.komissiyaRub + ekv + nds + uc.hranenie * 7;
  const marginPerUnit = base.priceSale - unitCostTotal;
  return { orders, buyouts, revenue, marginPerUnit, marginWithoutAd: buyouts * marginPerUnit };
}

function buildSeasonBlock(base: WhatIfBaseData, params: WhatIfParams): string {
  const s = base.seasonalityData;
  const lines: string[] = [];

  // Выбранный коэффициент сценария
  const chosen = params.seasonCoeff;
  const chosenDesc = chosen > 1 ? 'сезонный рост' : chosen < 1 ? 'сезонный спад' : 'нейтральный';
  lines.push(`Коэффициент сценария: ×${chosen.toFixed(2)} (${chosenDesc})`);

  if (s?.seasonality) {
    // Показываем все 12 месяцев
    const monthLine = Object.entries(s.seasonality)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([m, v]) => `${MONTHS_RU[Number(m) - 1]}: ×${v.toFixed(2)}`)
      .join(' | ');
    lines.push(`Сезонность по месяцам (ключ: «${s.keyword}»): ${monthLine}`);

    // Текущий и следующий месяц
    const now  = new Date();
    const cur  = now.getMonth() + 1;
    const next = cur === 12 ? 1 : cur + 1;
    const cCoeff = s.seasonality[String(cur)];
    const nCoeff = s.seasonality[String(next)];
    if (cCoeff !== undefined) lines.push(`Текущий месяц (${MONTHS_RU[cur - 1]}): ×${cCoeff.toFixed(2)}`);
    if (nCoeff !== undefined) lines.push(`Следующий месяц (${MONTHS_RU[next - 1]}): ×${nCoeff.toFixed(2)}`);
  } else {
    lines.push('Исторические данные сезонности MPStats: не загружены');
  }

  return lines.join('\n');
}

function buildPrompt(
  base: WhatIfBaseData,
  params: WhatIfParams,
  f7: WhatIfForecast,
  f30: WhatIfForecast,
): string {
  const cur = getCurrentReality(base);

  const priceChange = base.priceSale > 0
    ? Math.round(((params.newPrice - base.priceSale) / base.priceSale) * 100)
    : 0;
  const sign = priceChange >= 0 ? '+' : '';

  const adDesc = params.dailyAdBudget > 0
    ? `${fmtR(params.dailyAdBudget)}/день | ${AD_LABELS[params.adType] ?? params.adType}${params.cpcBid > 0 ? ` | ставка ${fmtR(params.cpcBid)}` : ''}`
    : 'без рекламы';

  // Unit-экономика: используем rawText (как в "Анализ артикула") если есть, иначе числа
  const unitBlock = base.unitRawText
    ? base.unitRawText
    : base.unitCost.hasData
      ? [
          `  Закупка:        ${fmtR(base.unitCost.zakupka)}`,
          `  Карго:          ${fmtR(base.unitCost.kargo)}`,
          `  Логистика МП:   ${fmtR(base.unitCost.logistika)}`,
          `  Комиссия WB:    ${fmtR(base.unitCost.komissiyaRub)}`,
          `  Эквайринг:      ${base.unitCost.ekvairingPercent}% от цены`,
          `  Хранение/день:  ${fmtR(base.unitCost.hranenie)}`,
          ...(base.unitCost.ndsRub > 0   ? [`  НДС:             ${fmtR(base.unitCost.ndsRub)}`]       : []),
          ...(base.unitCost.ndsPercent > 0 ? [`  НДС:             ${base.unitCost.ndsPercent}%`] : []),
          `  Маржа/шт (тек.): ${fmtR(cur.marginPerUnit)}`,
        ].join('\n')
      : '  ❌ нет данных';

  const delta  = (a: number, b: number) => { const d = Math.round(b - a); return d >= 0 ? `+${fmt(d)}`  : fmt(d);  };
  const deltaR = (a: number, b: number) => { const d = Math.round(b - a); return d >= 0 ? `+${fmtR(d)}` : fmtR(d); };

  return `СИМУЛЯТОР СЦЕНАРИЕВ — WILDBERRIES

Товар: ${base.productName || 'Без названия'} (арт. ${base.nmId})
Бренд: ${base.brand}

━━━ ТЕКУЩАЯ СИТУАЦИЯ (факт 7д) ━━━
Цена: ${fmtR(base.priceSale)} | Скидка: ${base.salePercent}% | Базовая: ${fmtR(base.priceBasic)}
${(base.marketAvgPrice ?? 0) > 0 ? `Медиана рынка (MPStats конкуренты): ${fmtR(base.marketAvgPrice as number)}` : 'Медиана рынка: нет данных'}
Заказы: ${fmt(cur.orders)} шт | Выкупы: ${fmt(cur.buyouts)} шт | % выкупа: ${base.buyoutRate.toFixed(1)}%
Выручка: ${fmtR(cur.revenue)}
Продажи/день (среднее): ~${base.dailySales.toFixed(1)} зак.
Конверсия карточка→корзина: ${fmtPct(base.conversions.cardToCart)}
Конверсия корзина→заказ:    ${fmtPct(base.conversions.cartToOrder)}
Остаток: ${fmt(base.stock)} шт

━━━ ЮНИТ-ЭКОНОМИКА (Google Таблица) ━━━
${unitBlock}

━━━ СЕЗОННОСТЬ ━━━
${buildSeasonBlock(base, params)}

━━━ СИМУЛИРУЕМЫЙ СЦЕНАРИЙ ━━━
Цена: ${fmtR(base.priceSale)} → ${fmtR(params.newPrice)} (${sign}${priceChange}%)${(base.marketAvgPrice ?? 0) > 0 ? ` | vs рынок: ${params.newPrice > (base.marketAvgPrice as number) ? `+${Math.round((params.newPrice / (base.marketAvgPrice as number) - 1) * 100)}% выше медианы` : params.newPrice < (base.marketAvgPrice as number) ? `-${Math.round((1 - params.newPrice / (base.marketAvgPrice as number)) * 100)}% ниже медианы` : 'на уровне медианы'}` : ''}
Остаток: ${fmt(base.stock)} → ${fmt(params.newStock)} шт
Реклама: ${adDesc}

━━━ ПРОГНОЗ СЦЕНАРИЯ ━━━
              │ СЕЙЧАС (7д) │ СЦЕНАРИЙ 7д │ ΔЕЛЬТА │ СЦЕНАРИЙ 30д
Заказы        │ ${fmt(cur.orders).padStart(11)} │ ${fmt(f7.orders).padStart(11)} │ ${delta(cur.orders,f7.orders).padStart(6)} │ ${fmt(f30.orders)}
Выкупы        │ ${fmt(cur.buyouts).padStart(11)} │ ${fmt(f7.buyouts).padStart(11)} │ ${delta(cur.buyouts,f7.buyouts).padStart(6)} │ ${fmt(f30.buyouts)}
Выручка       │ ${fmtR(cur.revenue).padStart(11)} │ ${fmtR(f7.revenue).padStart(11)} │ ${deltaR(cur.revenue,f7.revenue).padStart(6)} │ ${fmtR(f30.revenue)}
${base.unitCost.hasData ? `Маржа без рекл│ ${fmtR(cur.marginWithoutAd).padStart(11)} │ ${fmtR(f7.marginWithoutAd).padStart(11)} │ ${deltaR(cur.marginWithoutAd,f7.marginWithoutAd).padStart(6)} │ ${fmtR(f30.marginWithoutAd)}
Маржа с рекл. │         — │ ${fmtR(f7.marginWithAd).padStart(11)} │       — │ ${fmtR(f30.marginWithAd)}
Расход рекл.  │       0 ₽ │ ${fmtR(f7.adSpend).padStart(11)} │       — │ ${fmtR(f30.adSpend)}
ROI рекламы   │         — │ ${String(f7.roi + '%').padStart(11)} │       — │ ${f30.roi}%` : '(юнит-экономика отсутствует — маржа недоступна)'}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    base: WhatIfBaseData;
    params: WhatIfParams;
    forecast7d: WhatIfForecast;
    forecast30d: WhatIfForecast;
  };

  const { base, params, forecast7d, forecast30d } = body;
  if (!base?.nmId || !params || !forecast7d || !forecast30d) {
    return new Response(JSON.stringify({ error: 'Некорректные данные' }), { status: 400 });
  }

  const prompt = buildPrompt(base, params, forecast7d, forecast30d);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const token of whatIfGroqStream(prompt)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
  });
}
