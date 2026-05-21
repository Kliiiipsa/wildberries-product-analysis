import { NextRequest } from 'next/server';
import { whatIfGroqStream } from '@/lib/groq-client';
import type { WhatIfBaseData, WhatIfParams, WhatIfForecast } from '@/types';

export const maxDuration = 30;

const AD_LABEL: Record<string, string> = { ARK: 'АРК (авто)', CPC: 'Поиск (CPC)', PRK: 'Каталог (ПРК)' };

function fmt(n: number) { return n.toLocaleString('ru-RU'); }
function fmtR(n: number) { return `${fmt(Math.round(n))} ₽`; }

function buildPrompt(
  base: WhatIfBaseData,
  params: WhatIfParams,
  f7: WhatIfForecast,
  f30: WhatIfForecast,
): string {
  const priceChange = base.priceSale > 0
    ? Math.round(((params.newPrice - base.priceSale) / base.priceSale) * 100)
    : 0;
  const sign = priceChange >= 0 ? '+' : '';

  return `СИМУЛЯТОР СЦЕНАРИЯ — WILDBERRIES

Товар: ${base.productName || 'Без названия'} (арт. ${base.nmId})
Бренд: ${base.brand}

ИЗМЕНЕНИЯ В СЦЕНАРИИ:
- Цена: ${fmtR(base.priceSale)} → ${fmtR(params.newPrice)} (${sign}${priceChange}%)
- Остаток: ${fmt(base.stock)} → ${fmt(params.newStock)} шт.
- Бюджет рекламы: ${fmtR(params.dailyAdBudget)}/день (тип: ${AD_LABEL[params.adType] ?? params.adType}${params.cpcBid > 0 ? `, ставка ${fmtR(params.cpcBid)}` : ''})

БАЗОВЫЕ ПОКАЗАТЕЛИ:
- Текущие продажи: ~${base.dailySales.toFixed(1)} заказов/день
- % выкупа: ${base.buyoutRate.toFixed(1)}%
- Маржа на ед. (текущая цена): ${base.unitCost.hasData ? fmtR(f7.marginPerUnit) : 'н/д (нет юнит-экономики)'}

ПРОГНОЗ (новый сценарий):
7 дней:
  Заказы: ${fmt(f7.orders)} шт. | Выкупы: ${fmt(f7.buyouts)} шт.
  Выручка: ${fmtR(f7.revenue)}
  Маржа без рекламы: ${fmtR(f7.marginWithoutAd)} | С рекламой: ${fmtR(f7.marginWithAd)}
  Расход рекламы: ${fmtR(f7.adSpend)} | ROI: ${f7.roi}%

30 дней:
  Заказы: ${fmt(f30.orders)} шт. | Выкупы: ${fmt(f30.buyouts)} шт.
  Выручка: ${fmtR(f30.revenue)}
  Маржа без рекламы: ${fmtR(f30.marginWithoutAd)} | С рекламой: ${fmtR(f30.marginWithAd)}
  Расход рекламы: ${fmtR(f30.adSpend)} | ROI: ${f30.roi}%

Дай краткий анализ сценария: оценку изменений, главный риск, 2-3 конкретных улучшения с цифрами.`;
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
