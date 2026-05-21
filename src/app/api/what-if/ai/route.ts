import { NextRequest } from 'next/server';
import { whatIfGroqStream } from '@/lib/groq-client';
import type { WhatIfBaseData, WhatIfParams, WhatIfForecast } from '@/types';

export const maxDuration = 30;

const AD_LABEL: Record<string, string> = { ARK: 'АРК (авто)', CPC: 'Поиск (CPC)', PRK: 'Каталог (ПРК)' };

function fmt(n: number) { return n.toLocaleString('ru-RU'); }
function fmtR(n: number) { return `${fmt(Math.round(n))} ₽`; }
function fmtPct(n: number) { return n > 0 ? `${n.toFixed(1)}%` : '❌ нет данных'; }

// Упрощённая калькуляция текущего сценария (без рекламы, текущая цена)
function calcCurrentForecast(base: WhatIfBaseData, days: number): WhatIfForecast {
  const orders  = base.dailySales * days;
  const buyouts = orders * (base.buyoutRate / 100);
  const revenue = buyouts * base.priceSale;
  const uc = base.unitCost;
  const nds = uc.ndsRub > 0 ? uc.ndsRub : base.priceSale * uc.ndsPercent / 100;
  const ekv = base.priceSale * uc.ekvairingPercent / 100;
  const hrDays = Math.min(30, days);
  const unitCostTotal = uc.zakupka + uc.kargo + uc.logistika + uc.komissiyaRub + ekv + nds + uc.hranenie * hrDays;
  const marginPerUnit = base.priceSale - unitCostTotal;
  const marginWithoutAd = buyouts * marginPerUnit;
  return {
    orders: Math.round(orders), buyouts: Math.round(buyouts), revenue: Math.round(revenue),
    marginPerUnit: Math.round(marginPerUnit), marginWithoutAd: Math.round(marginWithoutAd),
    marginWithAd: Math.round(marginWithoutAd), adSpend: 0, roi: 0,
  };
}

function buildPrompt(
  base: WhatIfBaseData,
  params: WhatIfParams,
  f7: WhatIfForecast,
  f30: WhatIfForecast,
): string {
  const cur7  = calcCurrentForecast(base, 7);
  const cur30 = calcCurrentForecast(base, 30);

  const priceChange = base.priceSale > 0
    ? Math.round(((params.newPrice - base.priceSale) / base.priceSale) * 100)
    : 0;
  const sign = priceChange >= 0 ? '+' : '';

  const adDesc = params.dailyAdBudget > 0
    ? `${fmtR(params.dailyAdBudget)}/день (${AD_LABEL[params.adType] ?? params.adType}${params.cpcBid > 0 ? `, ставка ${fmtR(params.cpcBid)}` : ''})`
    : 'без рекламы';

  const unitBlock = base.unitCost.hasData ? [
    `  Закупка:       ${fmtR(base.unitCost.zakupka)}`,
    `  Карго:         ${fmtR(base.unitCost.kargo)}`,
    `  Логистика МП:  ${fmtR(base.unitCost.logistika)}`,
    `  Комиссия WB:   ${fmtR(base.unitCost.komissiyaRub)}`,
    `  Эквайринг:     ${base.unitCost.ekvairingPercent}% (от цены)`,
    `  Хранение/день: ${fmtR(base.unitCost.hranenie)}`,
    ...(base.unitCost.ndsRub > 0 ? [`  НДС:            ${fmtR(base.unitCost.ndsRub)}`] : base.unitCost.ndsPercent > 0 ? [`  НДС:            ${base.unitCost.ndsPercent}%`] : []),
    `  Маржа/шт (тек. цена): ${fmtR(cur7.marginPerUnit)}`,
  ].join('\n') : '  ❌ нет данных из Google Sheets Unit';

  return `СИМУЛЯТОР СЦЕНАРИЯ — WILDBERRIES

Товар: ${base.productName || 'Без названия'} (арт. ${base.nmId})
Бренд: ${base.brand}

═══ ТЕКУЩАЯ СИТУАЦИЯ (факт за 7 дней) ═══
Цена: ${fmtR(base.priceSale)} | Скидка: ${base.salePercent}% | Базовая: ${fmtR(base.priceBasic)}
Заказы: ${fmt(base.weeklyOrders)} шт | Выкупы: ${fmt(base.weeklyBuyouts)} шт | % выкупа: ${base.buyoutRate.toFixed(1)}%
Выручка: ${fmtR(base.weeklyRevenue)}
Продажи/день (среднее): ~${base.dailySales.toFixed(1)} зак.
Конверсия карточка→корзина: ${fmtPct(base.conversions.cardToCart)}
Конверсия корзина→заказ:    ${fmtPct(base.conversions.cartToOrder)}
Остаток: ${fmt(base.stock)} шт

Юнит-экономика:
${unitBlock}

Прогноз при текущих параметрах:
  7д:  заказы ${fmt(cur7.orders)}, выкупы ${fmt(cur7.buyouts)}, выручка ${fmtR(cur7.revenue)}, маржа ${fmtR(cur7.marginWithoutAd)}
  30д: заказы ${fmt(cur30.orders)}, выкупы ${fmt(cur30.buyouts)}, выручка ${fmtR(cur30.revenue)}, маржа ${fmtR(cur30.marginWithoutAd)}

═══ СИМУЛИРУЕМЫЙ СЦЕНАРИЙ ═══
Цена: ${fmtR(base.priceSale)} → ${fmtR(params.newPrice)} (${sign}${priceChange}%)
Остаток: ${fmt(base.stock)} → ${fmt(params.newStock)} шт.
Реклама: ${adDesc}

Прогноз сценария:
  7д:  заказы ${fmt(f7.orders)}, выкупы ${fmt(f7.buyouts)}, выручка ${fmtR(f7.revenue)}
       маржа без рекл. ${fmtR(f7.marginWithoutAd)}, с рекл. ${fmtR(f7.marginWithAd)}
       расход рекл. ${fmtR(f7.adSpend)}, ROI ${f7.roi}%
  30д: заказы ${fmt(f30.orders)}, выкупы ${fmt(f30.buyouts)}, выручка ${fmtR(f30.revenue)}
       маржа без рекл. ${fmtR(f30.marginWithoutAd)}, с рекл. ${fmtR(f30.marginWithAd)}
       расход рекл. ${fmtR(f30.adSpend)}, ROI ${f30.roi}%

═══ СРАВНЕНИЕ (текущий vs сценарий, 7 дней) ═══
Заказы:  ${fmt(cur7.orders)} → ${fmt(f7.orders)} (${f7.orders >= cur7.orders ? '+' : ''}${fmt(f7.orders - cur7.orders)} шт)
Выкупы:  ${fmt(cur7.buyouts)} → ${fmt(f7.buyouts)} (${f7.buyouts >= cur7.buyouts ? '+' : ''}${fmt(f7.buyouts - cur7.buyouts)} шт)
Выручка: ${fmtR(cur7.revenue)} → ${fmtR(f7.revenue)}
${base.unitCost.hasData ? `Маржа:   ${fmtR(cur7.marginWithoutAd)} → ${fmtR(f7.marginWithAd)} (с рекламой)` : ''}`;
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
