import type {
  AnalysisData,
  DecisionEngineResult,
  DecisionScenario,
  DiagnosticMetric,
  RiskSignal,
  DataQualitySignal,
  Confidence,
} from '@/types';

// ─── Unit cost parser ─────────────────────────────────────────────────────────
// Parses the structured rawText produced by fetchUnitData in google-sheets.ts.
// Format: "Закупка (себестоимость): 500\nКарго: 50\n..."

interface ParsedUnit {
  zakupka: number;
  kargo: number;
  logistika: number;
  komissiyaRub: number;
  ekvairingPercent: number;
  ndsRub: number;
  hranenieDayRub: number;
}

function extractLineNumber(rawText: string, ...keywords: string[]): number {
  const lines = rawText.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.every((k) => lower.includes(k.toLowerCase()))) {
      const m = line.match(/:\s*([\d\s,.]+)/);
      if (m) {
        const n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(n) && n >= 0) return n;
      }
    }
  }
  return 0;
}

function parseUnitRawText(rawText: string): ParsedUnit {
  return {
    zakupka: extractLineNumber(rawText, 'закупка') || extractLineNumber(rawText, 'себестоимость'),
    kargo: extractLineNumber(rawText, 'карго'),
    logistika: extractLineNumber(rawText, 'логистика'),
    komissiyaRub: extractLineNumber(rawText, 'комисс'),
    ekvairingPercent: extractLineNumber(rawText, 'эквайринг', 'acquiring'),
    ndsRub: extractLineNumber(rawText, 'ндс', 'итого') || extractLineNumber(rawText, 'nds'),
    hranenieDayRub: extractLineNumber(rawText, 'хранение', 'день') || extractLineNumber(rawText, 'хранение', 'финотчет'),
  };
}

function calcMarginPerUnit(unit: ParsedUnit, priceSale: number): number | null {
  if (priceSale <= 0) return null;
  const totalCost =
    unit.zakupka +
    unit.kargo +
    unit.logistika +
    unit.komissiyaRub +
    (unit.ekvairingPercent > 0 ? (priceSale * unit.ekvairingPercent) / 100 : 0) +
    unit.ndsRub;
  // Need at least purchase price (zakupka) to trust the calc
  if (unit.zakupka <= 0) return null;
  return priceSale - totalCost;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

function fmtRub(n: number): string {
  return `${fmt(n)} ₽`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

function buildDiagnostics(data: AnalysisData, marginPerUnit: number | null): DiagnosticMetric[] {
  const diag: DiagnosticMetric[] = [];
  const stats = data.stats;
  const adv = data.advertising;
  const product = data.product;

  if (!stats) return diag;

  const { conversions, buyoutPercent } = stats;

  // % выкупа
  {
    const subj = (product?.subjectName ?? '').toLowerCase();
    const isClothing = subj.includes('одежд') || subj.includes('обувь') || subj.includes('платье') || subj.includes('куртк') || subj.includes('брюк') || subj.includes('костюм');
    const isChild = subj.includes('детск') || subj.includes('ребён') || subj.includes('дет ');
    let good = 50, norm = 38, bad = 25;
    if (isChild) { good = 55; norm = 45; bad = 30; }
    else if (isClothing) { good = 50; norm = 38; bad = 25; }
    const status = buyoutPercent >= good ? 'good' : buyoutPercent >= norm ? 'warn' : 'bad';
    const benchmark = `хорошо ≥${good}%, норма ${norm}–${good}%, плохо <${norm}%`;
    let comment = '';
    if (status === 'bad' && marginPerUnit !== null && stats.ordersCount > 0) {
      const weeklyReturns = stats.ordersCount * (1 - buyoutPercent / 100);
      comment = `возвращают ~${Math.round(weeklyReturns)} шт/нед — прямая потеря логистики и товара`;
    } else if (status === 'warn') {
      comment = 'ниже нормы — проверить ценовое позиционирование и качество описания';
    } else {
      comment = 'в норме';
    }
    diag.push({ name: '% выкупа', value: fmtPct(buyoutPercent), status, comment });
  }

  // Конверсия карточка→корзина
  {
    const v = conversions.addToCartPercent;
    const status = v >= 10 ? 'good' : v >= 7 ? 'warn' : 'bad';
    diag.push({
      name: 'Карточка → Корзина',
      value: fmtPct(v),
      status,
      comment: status === 'good' ? 'хорошо (≥10%)' : status === 'warn' ? `норма 7–10%, у вас ${fmtPct(v)}` : `плохо (<7%) — низкая привлекательность карточки`,
    });
  }

  // Конверсия корзина→заказ
  {
    const v = conversions.cartToOrderPercent;
    const status = v >= 70 ? 'good' : v >= 45 ? 'warn' : 'bad';
    diag.push({
      name: 'Корзина → Заказ',
      value: fmtPct(v),
      status,
      comment: status === 'good' ? 'хорошо (>70%)' : status === 'warn' ? `норма 45–70%, у вас ${fmtPct(v)}` : `плохо (<45%) — покупатели кладут, но не оформляют. Масштабировать рекламу при этом убыточно`,
    });
  }

  // ДРР
  if (adv) {
    const drr = adv.drr;
    const status = drr <= 9 ? 'good' : drr <= 18 ? 'warn' : 'bad';
    diag.push({
      name: 'ДРР',
      value: fmtPct(drr),
      status,
      comment: status === 'good' ? 'отлично (≤9%) — реклама окупается' : status === 'warn' ? `повышенный (9–18%) — следить` : `высокий (>18%) — реклама убыточна`,
    });
  }

  // Запас
  if (product && stats.buyoutsCount > 0) {
    const stockWeeks = product.totalStock / stats.buyoutsCount;
    const status = stockWeeks < 2 ? 'bad' : stockWeeks <= 8 ? 'good' : stockWeeks <= 14 ? 'warn' : 'bad';
    const comment =
      stockWeeks < 2
        ? `КРИТИЧНО: остаток кончится через ${stockWeeks.toFixed(1)} нед — риск потери позиций`
        : stockWeeks <= 8
        ? `норма (${stockWeeks.toFixed(1)} нед)`
        : stockWeeks <= 14
        ? `умеренный избыток (${stockWeeks.toFixed(1)} нед) — следить за хранением`
        : `большой запас (${stockWeeks.toFixed(1)} нед) — деньги заморожены, риск неликвида`;
    diag.push({
      name: 'Запас (недель)',
      value: `${stockWeeks.toFixed(1)} нед`,
      status,
      comment,
    });
  }

  // Маржа на единицу
  if (marginPerUnit !== null) {
    const status = marginPerUnit > 200 ? 'good' : marginPerUnit > 50 ? 'warn' : 'bad';
    diag.push({
      name: 'Маржа/шт',
      value: fmtRub(marginPerUnit),
      status,
      comment: marginPerUnit <= 0 ? 'УБЫТОК на единицу товара' : marginPerUnit <= 50 ? 'почти нулевая — любой рост расходов уйдёт в минус' : `чистая прибыль с единицы`,
    });
  }

  return diag;
}

// ─── Risks ────────────────────────────────────────────────────────────────────

function buildRisks(data: AnalysisData, marginPerUnit: number | null): RiskSignal[] {
  const risks: RiskSignal[] = [];
  const stats = data.stats;
  const product = data.product;

  if (!stats) return risks;

  // Риск out-of-stock
  if (product && stats.buyoutsCount > 0) {
    const stockWeeks = product.totalStock / stats.buyoutsCount;
    if (stockWeeks < 2) {
      const lossPerWeek = marginPerUnit !== null ? stats.buyoutsCount * marginPerUnit : undefined;
      risks.push({
        description: `Остаток на ${stockWeeks.toFixed(1)} нед — риск out-of-stock и потери позиций в поиске`,
        estimatedLossRubPerWeek: lossPerWeek,
        severity: 'critical',
      });
    }
  }

  // Риск плохой конверсии при масштабировании рекламы
  if (stats.conversions.cartToOrderPercent < 30 && data.advertising && data.advertising.totalSpend > 0) {
    risks.push({
      description: `Конверсия корзина→заказ ${fmtPct(stats.conversions.cartToOrderPercent)} — масштабирование рекламы при такой воронке убыточно. Сначала диагноз причины низкой конверсии`,
      severity: 'high',
    });
  }

  // Риск неликвида при большом запасе + сезонность вниз
  if (product && stats.buyoutsCount > 0 && data.seasonalityData) {
    const stockWeeks = product.totalStock / stats.buyoutsCount;
    const currentMonth = new Date().getMonth() + 1;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextCoeff = data.seasonalityData.seasonality[String(nextMonth)];
    if (stockWeeks > 10 && nextCoeff !== undefined && nextCoeff < 0.85) {
      risks.push({
        description: `Запас ${stockWeeks.toFixed(0)} нед + сезонность падает в следующем месяце (×${nextCoeff}) — риск неликвида`,
        severity: 'high',
      });
    }
  }

  // Риск убыточной рекламы
  if (data.advertising && data.advertising.drr > 18) {
    const lossPerWeek = marginPerUnit !== null
      ? Math.max(0, data.advertising.totalSpend - stats.buyoutsCount * marginPerUnit)
      : undefined;
    risks.push({
      description: `ДРР ${fmtPct(data.advertising.drr)} — реклама работает в убыток (норма ≤18%)`,
      estimatedLossRubPerWeek: lossPerWeek,
      severity: 'high',
    });
  }

  // Низкий выкуп
  if (stats.buyoutPercent < 30) {
    risks.push({
      description: `% выкупа критично низкий (${fmtPct(stats.buyoutPercent)}) — каждые ${Math.round(100 / (100 - stats.buyoutPercent))} заказов дают 1 возврат`,
      severity: 'high',
    });
  }

  return risks;
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

function scenarioDoNothing(
  data: AnalysisData,
  marginPerUnit: number | null,
  stockWeeks: number | null,
): DecisionScenario {
  const stats = data.stats;
  const adv = data.advertising;

  let evRub: number | null = null;
  let calc = '';
  let confidence: Confidence = 'low';
  let confidenceReason = 'нет данных для расчёта текущих потерь';
  const missing: string[] = [];

  if (stats && marginPerUnit !== null) {
    confidence = 'high';
    confidenceReason = 'есть статистика WB и unit-экономика';
    const weeklyProfit = stats.buyoutsCount * marginPerUnit - (adv?.totalSpend ?? 0);
    evRub = weeklyProfit;
    const adsLine = adv ? ` − ${fmtRub(adv.totalSpend)} реклама` : '';
    calc = `${stats.buyoutsCount} выкупов × ${fmtRub(marginPerUnit)} маржа${adsLine} = ${fmtRub(weeklyProfit)}/нед`;

    // Добавляем потери от отмен если выкуп плохой
    if (stats.buyoutPercent < 38) {
      const logisticsCost = stats.ordersCount * (1 - stats.buyoutPercent / 100) * 80;
      calc += `. Плюс ~${fmtRub(logisticsCost)}/нед теряем на логистике возвратов`;
      evRub -= logisticsCost;
    }
  } else if (stats) {
    confidence = 'medium';
    confidenceReason = 'нет unit-экономики, расчёт через выручку';
    missing.push('unit-экономика (нет маржи/шт)');
    const revenue = stats.buyoutsCount * (data.product?.priceSale ?? 0);
    const adCost = adv?.totalSpend ?? 0;
    calc = `Выручка ${fmtRub(revenue)}/нед − реклама ${fmtRub(adCost)}/нед (без себестоимости, точная маржа неизвестна)`;
  } else {
    missing.push('статистика WB');
    missing.push('unit-экономика');
    calc = 'нет данных для расчёта';
  }

  return {
    id: 'doNothing',
    title: 'Ничего не делать',
    actionType: 'doNothing',
    recommendation: 'Оставить всё как есть и наблюдать',
    expectedValueRub: evRub,
    optimisticRub: evRub !== null ? evRub * 1.05 : null,
    neutralRub: evRub,
    pessimisticRub: evRub !== null ? evRub * 0.85 : null,
    probabilityPositive: 0.10,
    probabilityNeutral: 0.40,
    probabilityNegative: 0.50,
    confidence,
    confidenceReason,
    calculation: calc,
    whyThisMatters: stockWeeks !== null && stockWeeks < 2
      ? 'Критично: при бездействии товар выйдет из наличия, позиции в поиске упадут'
      : 'Базовый сценарий — текущее состояние без изменений',
    missingData: missing,
  };
}

function scenarioPriceAdjust(
  data: AnalysisData,
  marginPerUnit: number | null,
): DecisionScenario {
  const stats = data.stats;
  const product = data.product;
  const mpComp = data.mpstatsData?.competitors ?? [];

  const missing: string[] = [];
  let confidence: Confidence = 'low';
  let confidenceReason = 'нет данных о марже или конкурентах';
  let evRub: number | null = null;
  let optimistic: number | null = null;
  let neutral: number | null = null;
  let pessimistic: number | null = null;
  let calc = '';
  let recommendation = '';

  const priceSale = product?.priceSale ?? 0;
  const weeklyBuyouts = stats?.buyoutsCount ?? 0;

  if (!stats) {
    missing.push('статистика WB');
    return {
      id: 'price',
      title: 'Коррекция цены',
      actionType: 'price',
      recommendation: 'Недостаточно данных для оценки',
      expectedValueRub: null,
      optimisticRub: null,
      neutralRub: null,
      pessimisticRub: null,
      probabilityPositive: null,
      probabilityNeutral: null,
      probabilityNegative: null,
      confidence: 'low',
      confidenceReason: 'нет статистики WB',
      calculation: 'нет данных',
      whyThisMatters: 'Цена — ключевой рычаг конверсии',
      missingData: ['статистика WB', 'unit-экономика'],
    };
  }

  // Проверяем конкурентов для ориентира
  let competitorMedianPrice: number | null = null;
  if (mpComp.length >= 2) {
    const prices = mpComp.map((c) => c.price).sort((a, b) => a - b);
    competitorMedianPrice = prices[Math.floor(prices.length / 2)];
  }

  const priceVsComp = competitorMedianPrice !== null
    ? priceSale / competitorMedianPrice
    : null;

  // Решаем: снижать или нет
  const shouldReduce = priceVsComp !== null ? priceVsComp > 1.1 : stats.conversions.addToCartPercent < 5;
  const priceChangePct = shouldReduce ? -0.05 : 0.05;
  const newPrice = priceSale * (1 + priceChangePct);
  const action = shouldReduce ? `снизить на 5% (${fmtRub(priceSale)} → ${fmtRub(newPrice)})` : `поднять на 5% (${fmtRub(priceSale)} → ${fmtRub(newPrice)})`;

  recommendation = shouldReduce
    ? `Тест: снизить цену с ${fmtRub(priceSale)} до ${fmtRub(newPrice)} на 5–7 дней`
    : `Тест: поднять цену с ${fmtRub(priceSale)} до ${fmtRub(newPrice)} на 5–7 дней`;

  if (marginPerUnit !== null && weeklyBuyouts > 0) {
    confidence = competitorMedianPrice !== null ? 'medium' : 'low';
    confidenceReason = competitorMedianPrice !== null
      ? `есть данные конкурентов (медиана цены ${fmtRub(competitorMedianPrice)}), unit-экономика`
      : 'unit-экономика есть, данных конкурентов нет — вероятности приблизительные';
    if (!competitorMedianPrice) missing.push('цены конкурентов (MPStats)');

    const newMargin = marginPerUnit + (newPrice - priceSale);

    if (newMargin <= 0 && shouldReduce) {
      confidence = 'low';
      confidenceReason = 'снижение цены уведёт маржу в минус';
      calc = `Снижение на 5%: маржа ${fmtRub(marginPerUnit)}/шт → ${fmtRub(newMargin)}/шт. СТОП: маржа станет отрицательной`;
      recommendation = `НЕ снижать цену: маржа и так ${fmtRub(marginPerUnit)}/шт, снижение на 5% даст убыток ${fmtRub(Math.abs(newMargin))}/шт`;
      evRub = weeklyBuyouts * newMargin - weeklyBuyouts * marginPerUnit;
    } else {
      // P: положительный — заказы вырастут на 15-25%
      // P: нейтральный — вырастут на 5%
      // P: негативный — не изменятся
      const pPos = shouldReduce ? (priceVsComp !== null && priceVsComp > 1.15 ? 0.40 : 0.25) : 0.30;
      const pNeu = 0.40;
      const pNeg = 1 - pPos - pNeu;

      const rPos = weeklyBuyouts * (shouldReduce ? 1.20 : 0.90) * newMargin - weeklyBuyouts * marginPerUnit;
      const rNeu = weeklyBuyouts * (shouldReduce ? 1.07 : 1.00) * newMargin - weeklyBuyouts * marginPerUnit;
      const rNeg = weeklyBuyouts * (shouldReduce ? 1.00 : 1.05) * newMargin - weeklyBuyouts * marginPerUnit;

      evRub = pPos * rPos + pNeu * rNeu + pNeg * rNeg;
      optimistic = rPos;
      neutral = rNeu;
      pessimistic = rNeg;

      calc = `${action}. Новая маржа ${fmtRub(newMargin)}/шт.\n` +
        `  Оптимистично (P=${(pPos * 100).toFixed(0)}%): заказы ×${shouldReduce ? '1.20' : '0.90'} → ${fmtRub(rPos)}/нед\n` +
        `  Нейтрально (P=${(pNeu * 100).toFixed(0)}%): заказы ×${shouldReduce ? '1.07' : '1.00'} → ${fmtRub(rNeu)}/нед\n` +
        `  Негативно (P=${(pNeg * 100).toFixed(0)}%): заказы без изменений → ${fmtRub(rNeg)}/нед\n` +
        `  EV = ${fmtRub(evRub)}/нед`;
    }
  } else {
    if (!marginPerUnit) missing.push('unit-экономика (нет маржи)');
    if (weeklyBuyouts === 0) missing.push('статистика выкупов');
    calc = `Цена ${fmtRub(priceSale)}.${competitorMedianPrice ? ` Медиана конкурентов: ${fmtRub(competitorMedianPrice)}.` : ''} Расчёт EV невозможен без маржи`;
    confidence = 'low';
    confidenceReason = 'нет unit-экономики — точный расчёт невозможен';
  }

  return {
    id: 'price',
    title: `Коррекция цены: ${action}`,
    actionType: 'price',
    recommendation,
    expectedValueRub: evRub,
    optimisticRub: optimistic,
    neutralRub: neutral,
    pessimisticRub: pessimistic,
    probabilityPositive: evRub !== null ? (shouldReduce ? 0.30 : 0.30) : null,
    probabilityNeutral: evRub !== null ? 0.40 : null,
    probabilityNegative: evRub !== null ? 0.30 : null,
    confidence,
    confidenceReason,
    calculation: calc,
    whyThisMatters: 'Цена прямо влияет на конверсию и маржу. Снижение без расчёта может обнулить прибыль',
    missingData: missing,
  };
}

function scenarioAds(
  data: AnalysisData,
  marginPerUnit: number | null,
): DecisionScenario {
  const stats = data.stats;
  const adv = data.advertising;

  const missing: string[] = [];
  if (!adv) missing.push('данные рекламы WB');
  if (!stats) missing.push('статистика WB');

  if (!adv || !stats) {
    return {
      id: 'ads',
      title: 'Коррекция рекламы',
      actionType: 'ads',
      recommendation: 'Нет данных о рекламе',
      expectedValueRub: null,
      optimisticRub: null,
      neutralRub: null,
      pessimisticRub: null,
      probabilityPositive: null,
      probabilityNeutral: null,
      probabilityNegative: null,
      confidence: 'low',
      confidenceReason: 'нет данных рекламы',
      calculation: 'нет данных',
      whyThisMatters: 'Реклама — основной управляемый рычаг трафика',
      missingData: missing,
    };
  }

  const drr = adv.drr;
  const adSpend = adv.totalSpend;
  const cartToOrder = stats.conversions.cartToOrderPercent;

  // Флаг: воронка сломана — не масштабировать
  const funnelBroken = cartToOrder < 30;

  let title = '';
  let recommendation = '';
  let evRub: number | null = null;
  let optimistic: number | null = null;
  let neutral: number | null = null;
  let pessimistic: number | null = null;
  let confidence: Confidence = 'medium';
  let confidenceReason = '';
  let calc = '';

  if (funnelBroken) {
    // Не масштабировать — конверсия сломана
    title = 'Остановить рост рекламы (воронка сломана)';
    recommendation = `Не увеличивать рекламный бюджет, пока конверсия корзина→заказ (${fmtPct(cartToOrder)}) не достигнет ≥45%`;
    confidence = 'high';
    confidenceReason = 'прямая зависимость: при низкой конверсии корзина→заказ каждый дополнительный клик в рекламе не даёт заказов';
    // EV масштабирования = плохой
    if (marginPerUnit !== null) {
      const additionalSpend = adSpend * 0.30;
      const additionalOrders = adv.totalOrders * 0.30;
      const additionalBuyouts = additionalOrders * (stats.buyoutPercent / 100) * (cartToOrder / 100);
      const adEffect = additionalBuyouts * marginPerUnit - additionalSpend;
      evRub = adEffect;
      calc = `Тест масштабирования +30% бюджета: +${fmtRub(additionalSpend)}/нед расходов, ~${additionalBuyouts.toFixed(1)} доп. выкупов × ${fmtRub(marginPerUnit)} = ${fmtRub(additionalBuyouts * marginPerUnit)} выручки → чистый эффект ${fmtRub(adEffect)}/нед. УБЫТОЧНО из-за низкой конверсии`;
    } else {
      missing.push('unit-экономика');
      calc = `Конверсия корзина→заказ ${fmtPct(cartToOrder)} — при масштабировании рекламы большинство кликов не конвертируются`;
    }
  } else if (drr > 18) {
    // Реклама убыточна — сокращать
    title = `Сократить рекламный бюджет на 30% (ДРР ${fmtPct(drr)})`;
    recommendation = `Снизить общий рекламный бюджет с ${fmtRub(adSpend)}/нед до ${fmtRub(adSpend * 0.70)}/нед. Тест 7 дней`;
    confidence = marginPerUnit !== null ? 'high' : 'medium';
    confidenceReason = marginPerUnit !== null
      ? 'есть ДРР, unit-экономика и статистика — высокая уверенность'
      : 'есть ДРР и статистика, нет unit-экономики';
    if (!marginPerUnit) missing.push('unit-экономика');

    const adSavings = adSpend * 0.30;
    // Оцениваем потерю заказов: считаем что 40% заказов — от рекламы, и из них 60% инкрементальны
    const adOrdersFraction = stats.ordersCount > 0 ? Math.min(adv.totalOrders / stats.ordersCount, 1) : 0.5;
    const orderLoss = stats.ordersCount * adOrdersFraction * 0.30 * 0.55;
    const buyoutLoss = orderLoss * (stats.buyoutPercent / 100);

    if (marginPerUnit !== null) {
      const rPos = adSavings - buyoutLoss * marginPerUnit * 0.7;
      const rNeu = adSavings - buyoutLoss * marginPerUnit;
      const rNeg = adSavings * 0.5 - buyoutLoss * marginPerUnit * 1.3;

      evRub = 0.50 * rPos + 0.35 * rNeu + 0.15 * rNeg;
      optimistic = rPos;
      neutral = rNeu;
      pessimistic = rNeg;

      calc = `Экономия ${fmtRub(adSavings)}/нед − потеря ~${buyoutLoss.toFixed(1)} выкупов × ${fmtRub(marginPerUnit)} = EV ${fmtRub(evRub)}/нед`;
    } else {
      calc = `Экономия ${fmtRub(adSavings)}/нед. Точный эффект без маржи неизвестен, но ДРР ${fmtPct(drr)} указывает на убыточность`;
      evRub = null;
    }
  } else if (drr <= 9) {
    // Реклама хорошая — можно масштабировать
    title = `Масштабировать рекламу (ДРР ${fmtPct(drr)} — отлично)`;
    recommendation = `Увеличить бюджет на 30%: ${fmtRub(adSpend)}/нед → ${fmtRub(adSpend * 1.30)}/нед. Тест 7 дней`;
    confidence = marginPerUnit !== null ? 'high' : 'medium';
    confidenceReason = `ДРР ${fmtPct(drr)} ≤ 9% — реклама окупается с запасом`;
    if (!marginPerUnit) missing.push('unit-экономика');

    const adIncrease = adSpend * 0.30;
    const orderGain = stats.ordersCount * 0.18; // ~60% масштабирования
    const buyoutGain = orderGain * (stats.buyoutPercent / 100);

    if (marginPerUnit !== null) {
      const rPos = buyoutGain * marginPerUnit * 1.2 - adIncrease;
      const rNeu = buyoutGain * marginPerUnit - adIncrease;
      const rNeg = buyoutGain * marginPerUnit * 0.5 - adIncrease;

      evRub = 0.40 * rPos + 0.40 * rNeu + 0.20 * rNeg;
      optimistic = rPos;
      neutral = rNeu;
      pessimistic = rNeg;

      calc = `+${fmtRub(adIncrease)}/нед бюджет → ~${buyoutGain.toFixed(1)} доп. выкупов × ${fmtRub(marginPerUnit)} маржа → EV ${fmtRub(evRub)}/нед`;
    } else {
      calc = `ДРР ${fmtPct(drr)} — реклама окупается. При +30% бюджета ожидаем ~+18% заказов. Точный ₽-эффект без маржи неизвестен`;
    }
  } else {
    // ДРР 9-18% — норма, держим
    title = `Реклама в норме (ДРР ${fmtPct(drr)})`;
    recommendation = 'Сохранить текущий бюджет. Оптимизировать ставки по кампаниям с высоким CPC';
    confidence = 'medium';
    confidenceReason = 'ДРР в допустимом диапазоне';
    calc = `ДРР ${fmtPct(drr)}: норма (9–18%). Расход ${fmtRub(adSpend)}/нед. Изменений не требует`;
    evRub = 0;
  }

  return {
    id: 'ads',
    title,
    actionType: 'ads',
    recommendation,
    expectedValueRub: evRub,
    optimisticRub: optimistic,
    neutralRub: neutral,
    pessimisticRub: pessimistic,
    probabilityPositive: evRub !== null ? 0.40 : null,
    probabilityNeutral: evRub !== null ? 0.40 : null,
    probabilityNegative: evRub !== null ? 0.20 : null,
    confidence,
    confidenceReason,
    calculation: calc,
    whyThisMatters: funnelBroken
      ? 'Реклама приводит трафик, но низкая конверсия воронки не позволяет его монетизировать'
      : drr > 18
      ? 'Каждый рубль рекламы сейчас приносит меньше рубля прибыли'
      : 'Реклама — управляемый рычаг, который можно масштабировать при хорошем ДРР',
    missingData: missing,
  };
}

function scenarioStock(
  data: AnalysisData,
  marginPerUnit: number | null,
  stockWeeks: number | null,
): DecisionScenario {
  const stats = data.stats;
  const product = data.product;
  const unitData = data.unitData;

  const missing: string[] = [];
  if (!product) missing.push('карточка товара WB');
  if (!stats) missing.push('статистика WB');

  if (!product || !stats || stockWeeks === null) {
    return {
      id: 'stock',
      title: 'Управление остатками',
      actionType: 'stock',
      recommendation: 'Нет данных об остатках или продажах',
      expectedValueRub: null,
      optimisticRub: null,
      neutralRub: null,
      pessimisticRub: null,
      probabilityPositive: null,
      probabilityNeutral: null,
      probabilityNegative: null,
      confidence: 'low',
      confidenceReason: 'нет данных',
      calculation: 'нет данных',
      whyThisMatters: 'Остатки влияют на позиции в поиске WB',
      missingData: missing,
    };
  }

  const weeklyBuyouts = stats.buyoutsCount;
  let title = '';
  let recommendation = '';
  let evRub: number | null = null;
  let confidence: Confidence = 'high';
  let confidenceReason = 'прямые данные остатков и продаж';
  let calc = '';

  if (stockWeeks < 2) {
    // Критично — срочно пополнить
    const weeksToOut = stockWeeks;
    const lostSalesWeeks = 4; // прогноз потерь без поставки
    const lostRevenue = marginPerUnit !== null
      ? weeklyBuyouts * marginPerUnit * lostSalesWeeks
      : weeklyBuyouts * (product.priceSale * 0.15) * lostSalesWeeks;

    title = `СРОЧНО: пополнить склад (остаток ${stockWeeks.toFixed(1)} нед)`;
    recommendation = `Срочная поставка. При текущих продажах остаток кончится через ${(weeksToOut * 7).toFixed(0)} дней`;
    evRub = lostRevenue;
    calc = `Без поставки: потеря ~${weeklyBuyouts} выкупов/нед × 4 нед × ${marginPerUnit !== null ? fmtRub(marginPerUnit) : '~15% цены'} = ~${fmtRub(lostRevenue)} потенциальной прибыли + падение позиций в поиске`;
    confidence = 'high';
    confidenceReason = 'критически малый остаток — расчёт прямой';
  } else if (stockWeeks > 14) {
    // Излишек — риск заморозки денег
    // Считаем стоимость хранения
    let hraneniePerDay = 0;
    if (unitData?.rawText) {
      const parsed = parseUnitRawText(unitData.rawText);
      hraneniePerDay = parsed.hranenieDayRub;
    }

    const monthlyStorage = hraneniePerDay > 0
      ? product.totalStock * hraneniePerDay * 30
      : product.totalStock * 3 * 30; // ~3₽/день оценка если нет данных

    const dataSource = hraneniePerDay > 0 ? 'из unit-экономики' : 'оценка ~3₽/день/шт';

    title = `Излишек: ${stockWeeks.toFixed(0)} нед запаса — рассмотреть распродажу`;
    recommendation = `Оценить целесообразность скидки для ускорения оборота. Текущее хранение ${fmtRub(monthlyStorage)}/мес (${dataSource})`;
    evRub = marginPerUnit !== null
      ? weeklyBuyouts * marginPerUnit * 1.3 - monthlyStorage / 4 // если +30% продаж = экономия на хранении
      : null;
    calc = `Остаток ${product.totalStock} шт ÷ ${weeklyBuyouts} выкупов/нед = ${stockWeeks.toFixed(1)} нед. Хранение ~${fmtRub(monthlyStorage)}/мес (${dataSource})`;
    if (!hraneniePerDay) missing.push('стоимость хранения (unit-экономика)');
    confidence = hraneniePerDay > 0 ? 'high' : 'medium';
    confidenceReason = hraneniePerDay > 0 ? 'данные хранения из unit-экономики' : 'стоимость хранения оценочная';
  } else {
    // Норма
    title = `Запас в норме: ${stockWeeks.toFixed(1)} нед`;
    recommendation = 'Текущий запас достаточен. Следить за динамикой продаж';
    evRub = 0;
    calc = `${product.totalStock} шт ÷ ${weeklyBuyouts} выкупов/нед = ${stockWeeks.toFixed(1)} нед`;
    confidence = 'high';
    confidenceReason = 'прямые данные';
  }

  return {
    id: 'stock',
    title,
    actionType: 'stock',
    recommendation,
    expectedValueRub: evRub,
    optimisticRub: evRub !== null ? evRub * 1.2 : null,
    neutralRub: evRub,
    pessimisticRub: evRub !== null ? evRub * 0.7 : null,
    probabilityPositive: 0.50,
    probabilityNeutral: 0.35,
    probabilityNegative: 0.15,
    confidence,
    confidenceReason,
    calculation: calc,
    whyThisMatters: stockWeeks < 2
      ? 'Out-of-stock не просто теряет продажи — WB понижает товар в выдаче, потери трудно восстановить'
      : 'Избыток замораживает деньги и накапливает расходы на хранение',
    missingData: missing,
  };
}

function scenarioTest(
  scenarios: DecisionScenario[],
  data: AnalysisData,
  marginPerUnit: number | null,
): DecisionScenario {
  const stats = data.stats;
  const product = data.product;

  // Определяем тип теста на основе диагностики
  const cartToOrder = stats?.conversions.cartToOrderPercent ?? 100;
  const cardToCart = stats?.conversions.addToCartPercent ?? 100;
  const priceSale = product?.priceSale ?? 0;

  let testAction = '';
  let metric = '';
  let successCriteria = '';

  if (cartToOrder < 40 && stats) {
    testAction = 'Снизить цену на 3% на 5 дней для проверки влияния на конверсию корзина→заказ';
    metric = `cartToOrderPercent за 5 дней (сейчас ${fmtPct(cartToOrder)})`;
    successCriteria = `успех: конверсия корзина→заказ вырастет с ${fmtPct(cartToOrder)} до ≥45%, при этом маржа в ₽/нед не снизится`;
  } else if (cardToCart < 7 && stats) {
    testAction = `Тест цены ${fmtRub(priceSale * 0.95)} vs ${fmtRub(priceSale)} по 7 дней`;
    metric = `конверсия карточка→корзина и выкупы шт/нед`;
    successCriteria = `успех: конверсия карточка→корзина вырастет с ${fmtPct(cardToCart)} до ≥7%`;
  } else if (marginPerUnit !== null && stats) {
    testAction = `Пробное снижение CPC-ставки на 15% для снижения ДРР при удержании объёма`;
    metric = `ДРР за 5 дней`;
    successCriteria = `успех: ДРР снизится, заказы не упадут более чем на 10%`;
  } else {
    testAction = 'Тест цены ±5% на 5–7 дней для понимания эластичности спроса';
    metric = 'выкупы шт/нед за период теста';
    successCriteria = 'успех: при снижении на 5% заказы выросли более чем на 10% — иначе вернуть цену';
  }

  const evLow = marginPerUnit !== null && stats ? stats.buyoutsCount * marginPerUnit * 0.05 : null;

  return {
    id: 'test',
    title: `Тест: ${testAction}`,
    actionType: 'test',
    recommendation: `${testAction}. Метрика успеха: ${successCriteria}. Период: 5–7 дней`,
    expectedValueRub: evLow,
    optimisticRub: evLow !== null ? evLow * 3 : null,
    neutralRub: evLow,
    pessimisticRub: evLow !== null ? -Math.abs(evLow) * 0.5 : null,
    probabilityPositive: 0.40,
    probabilityNeutral: 0.35,
    probabilityNegative: 0.25,
    confidence: 'medium',
    confidenceReason: 'тест нужен когда другие сценарии имеют среднюю или низкую уверенность',
    calculation: `Тест на 5–7 дней. Отслеживать: ${metric}`,
    whyThisMatters: 'Тест позволяет проверить гипотезу с минимальным риском перед масштабным изменением',
    missingData: [],
  };
}

// ─── Select best action ───────────────────────────────────────────────────────

function selectBestAction(scenarios: DecisionScenario[]): DecisionScenario | null {
  const actionable = scenarios.filter(
    (s) => s.actionType !== 'doNothing' && s.actionType !== 'test' && s.confidence !== 'low',
  );

  if (actionable.length === 0) return null;

  // Сортируем по: уверенность (high > medium), затем по EV (выше = лучше)
  const confScore = (c: Confidence) => (c === 'high' ? 2 : c === 'medium' ? 1 : 0);

  return [...actionable].sort((a, b) => {
    const confDiff = confScore(b.confidence) - confScore(a.confidence);
    if (confDiff !== 0) return confDiff;
    const evA = a.expectedValueRub ?? -Infinity;
    const evB = b.expectedValueRub ?? -Infinity;
    return evB - evA;
  })[0];
}

// ─── Data quality ─────────────────────────────────────────────────────────────

function buildDataQuality(data: AnalysisData): DataQualitySignal[] {
  return [
    { field: 'Карточка WB', available: data.product !== null, note: data.product ? undefined : 'Нет WB API токена или ошибка' },
    { field: 'Статистика WB (7 дней)', available: data.stats !== null },
    { field: 'Реклама WB', available: data.advertising !== null },
    { field: 'Unit-экономика (Google Sheets)', available: (data.unitData?.found ?? false), note: data.unitData?.found ? undefined : data.unitData?.rawText },
    { field: 'MPStats', available: data.mpstatsData !== null },
    { field: 'Сезонность', available: data.seasonalityData !== null },
  ];
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function runDecisionEngine(data: AnalysisData): DecisionEngineResult {
  const priceSale = data.product?.priceSale ?? 0;

  // Парсим unit-экономику
  let parsedUnit: ParsedUnit | null = null;
  if (data.unitData?.found && data.unitData.rawText) {
    parsedUnit = parseUnitRawText(data.unitData.rawText);
  }

  const marginPerUnit = parsedUnit && priceSale > 0 ? calcMarginPerUnit(parsedUnit, priceSale) : null;
  const hasMarginData = marginPerUnit !== null;

  const weeklyBuyouts = data.stats?.buyoutsCount ?? 0;
  const stockWeeks =
    data.product && weeklyBuyouts > 0 ? data.product.totalStock / weeklyBuyouts : null;

  const diagnostics = buildDiagnostics(data, marginPerUnit);
  const risks = buildRisks(data, marginPerUnit);
  const dataQuality = buildDataQuality(data);

  const doNothingScenario = scenarioDoNothing(data, marginPerUnit, stockWeeks);
  const priceScenario = scenarioPriceAdjust(data, marginPerUnit);
  const adsScenario = scenarioAds(data, marginPerUnit);
  const stockScenario = scenarioStock(data, marginPerUnit, stockWeeks);

  const scenarios: DecisionScenario[] = [
    doNothingScenario,
    priceScenario,
    adsScenario,
    stockScenario,
  ];

  const testScenario = scenarioTest(scenarios, data, marginPerUnit);
  scenarios.push(testScenario);

  const bestAction = selectBestAction(scenarios);

  return {
    diagnostics,
    scenarios,
    bestAction,
    risks,
    dataQuality,
    hasMarginData,
    marginPerUnit,
  };
}

// ─── Text formatter for prompt ────────────────────────────────────────────────

export function formatDecisionEngineForPrompt(result: DecisionEngineResult): string {
  const lines: string[] = [
    '=== РАСЧЁТНЫЙ БЛОК DECISION ENGINE (ИНТЕРПРЕТИРУЙ ПЕРВЫМ) ===',
    'AI: используй этот блок как основу анализа. Данные проверены, расчёты готовы.',
    '',
  ];

  // Диагностика
  lines.push('ДИАГНОСТИКА:');
  for (const d of result.diagnostics) {
    const icon = d.status === 'good' ? '✅' : d.status === 'warn' ? '⚠️' : d.status === 'bad' ? '❌' : '—';
    lines.push(`  ${icon} ${d.name}: ${d.value} — ${d.comment}`);
  }
  lines.push('');

  // Сценарии
  lines.push('СЦЕНАРИИ И МАТОЖИДАНИЕ:');
  for (const s of result.scenarios) {
    const ev = s.expectedValueRub !== null
      ? `EV = ${fmtRub(s.expectedValueRub)}/нед`
      : 'EV = нет данных';
    const confLabel = s.confidence === 'high' ? 'высокая' : s.confidence === 'medium' ? 'средняя' : 'низкая';
    lines.push(`  ${s.title}`);
    lines.push(`    ${ev} [уверенность: ${confLabel}]`);
    lines.push(`    Расчёт: ${s.calculation.split('\n').join('\n      ')}`);
    if (s.missingData.length > 0) {
      lines.push(`    Не хватает данных: ${s.missingData.join(', ')}`);
    }
    lines.push('');
  }

  // Лучшее действие
  if (result.bestAction) {
    const ba = result.bestAction;
    const evStr = ba.expectedValueRub !== null ? ` EV = ${fmtRub(ba.expectedValueRub)}/нед` : '';
    lines.push(`ЛУЧШЕЕ ДЕЙСТВИЕ: ${ba.title}`);
    lines.push(`  Рекомендация: ${ba.recommendation}`);
    lines.push(`  ${evStr}`);
    lines.push(`  Уверенность: ${ba.confidence === 'high' ? 'высокая' : ba.confidence === 'medium' ? 'средняя' : 'низкая'} — ${ba.confidenceReason}`);
    lines.push('');
  } else {
    lines.push('ЛУЧШЕЕ ДЕЙСТВИЕ: не определено однозначно — см. сценарии выше');
    lines.push('');
  }

  // Риски
  if (result.risks.length > 0) {
    lines.push('РИСКИ:');
    for (const r of result.risks) {
      const sev = r.severity === 'critical' ? '🔴' : r.severity === 'high' ? '🟠' : '🟡';
      const loss = r.estimatedLossRubPerWeek !== undefined ? ` (~${fmtRub(r.estimatedLossRubPerWeek)}/нед)` : '';
      lines.push(`  ${sev} ${r.description}${loss}`);
    }
    lines.push('');
  }

  // Данные
  const available = result.dataQuality.filter((d) => d.available).map((d) => d.field);
  const unavailable = result.dataQuality.filter((d) => !d.available);
  if (available.length > 0) {
    lines.push(`ДАННЫЕ ИСПОЛЬЗОВАНЫ: ${available.join(', ')}`);
  }
  if (unavailable.length > 0) {
    lines.push('ДАННЫЕ НЕДОСТУПНЫ (расчёты ограничены):');
    for (const d of unavailable) {
      lines.push(`  — ${d.field}${d.note ? ': ' + d.note : ''}`);
    }
  }

  return lines.join('\n');
}
