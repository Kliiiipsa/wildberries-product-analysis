import type {
  AnalysisData,
  DecisionEngineResult,
  DecisionScenario,
  DiagnosticMetric,
  RiskSignal,
  DataQualitySignal,
  Confidence,
} from '@/types';

// ─── Number parser ─────────────────────────────────────────────────────────────
// Handles all formats from Google Sheets rawText:
//   р.340   →  340
//   1 191,69 ₽  →  1191.69
//   0,41 ₽  →  0.41
//   2,93%   →  2.93
//   942,68  →  942.68

export function parseRub(raw: unknown): number {
  if (typeof raw === 'number') return isNaN(raw) || raw < 0 ? 0 : raw;
  if (typeof raw !== 'string') return 0;

  // Remove "р." prefix (Russian abbreviation for "руб.")
  let s = raw.replace(/р\s*\./gi, '');
  // Remove currency/percent symbols and "руб"
  s = s.replace(/[₽%]/g, '').replace(/руб/gi, '');
  // Remove spaces (thousands separator)
  s = s.replace(/\s/g, '');

  // Detect decimal separator: if both dot and comma present, last one is decimal
  const dotIdx = s.lastIndexOf('.');
  const commaIdx = s.lastIndexOf(',');
  if (dotIdx >= 0 && commaIdx >= 0) {
    if (commaIdx > dotIdx) {
      // European: dots=thousands, comma=decimal → remove dots, comma→dot
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // dot is decimal, commas are thousands
      s = s.replace(/,/g, '');
    }
  } else {
    // Only one type present
    s = s.replace(',', '.');
  }

  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? 0 : n;
}

export function parsePercent(raw: unknown): number {
  return parseRub(raw);
}

// ─── rawText line extractor ────────────────────────────────────────────────────

function extractLineValue(rawText: string, ...keywords: string[]): string | null {
  const lines = rawText.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (keywords.every((k) => lower.includes(k.toLowerCase()))) {
      const colonIdx = line.indexOf(':');
      if (colonIdx >= 0) {
        const val = line.slice(colonIdx + 1).trim();
        // Skip "не найден*" stubs written by fetchUnitData
        if (val && !/^не найден/i.test(val)) return val;
      }
    }
  }
  return null;
}

function extractNum(rawText: string, ...keywords: string[]): number {
  const val = extractLineValue(rawText, ...keywords);
  return val !== null ? parseRub(val) : 0;
}

// ─── Unit economics ───────────────────────────────────────────────────────────

interface ParsedUnitData {
  zakupka: number;
  kargo: number;
  logistika: number;
  komissiyaRub: number;
  ekvairingPercent: number;
  ndsRub: number;
  hraneniePerDay: number;
}

interface ComputedUE {
  parsed: ParsedUnitData;
  unitCostFixed: number;   // total cost EXCLUDING acquiring (fixed part)
  unitCostTotal: number;   // total cost AT current price
  marginPerUnit: number;   // priceSale - unitCostTotal
  ekvairingRub: number;    // acquiring at current price
  hranenieMonthly: number; // hraneniePerDay × 30
  breakevenPrice: number;  // min price for margin = 0
  marginAtPrice(newPrice: number): number;
}

function parseUnitData(rawText: string): ParsedUnitData {
  return {
    // Закупка / себестоимость
    zakupka:
      extractNum(rawText, 'закупка') ||
      extractNum(rawText, 'себестоимость') ||
      extractNum(rawText, 'sebes'),
    // Карго
    kargo: extractNum(rawText, 'карго') || extractNum(rawText, 'cargo'),
    // Логистика МП
    logistika:
      extractNum(rawText, 'логистика') ||
      extractNum(rawText, 'delivery_mp'),
    // Комиссия WB
    komissiyaRub:
      extractNum(rawText, 'комисс') ||
      extractNum(rawText, 'commission') ||
      extractNum(rawText, 'wb_fee'),
    // Эквайринг — search EITHER keyword (not both)
    ekvairingPercent:
      extractNum(rawText, 'эквайринг') ||
      extractNum(rawText, 'acquiring') ||
      extractNum(rawText, 'ekvairing'),
    // НДС
    ndsRub:
      extractNum(rawText, 'ндс', 'итого') ||
      extractNum(rawText, 'ндс', 'руб') ||
      extractNum(rawText, 'nds_22') ||
      extractNum(rawText, 'nds'),
    // Хранение в день
    hraneniePerDay:
      extractNum(rawText, 'хранение', 'день') ||
      extractNum(rawText, 'хранение', 'финотчет') ||
      extractNum(rawText, 'storage'),
  };
}

function computeUE(rawText: string, priceSale: number): ComputedUE | null {
  if (priceSale <= 0) return null;
  const p = parseUnitData(rawText);
  if (p.zakupka <= 0) return null; // can't trust without purchase cost

  const hranenieMonthly = p.hraneniePerDay * 30;
  const ekvairingRub = priceSale * p.ekvairingPercent / 100;
  // Fixed costs: everything except acquiring (which varies with price)
  const unitCostFixed =
    p.zakupka + p.kargo + p.logistika + p.komissiyaRub + p.ndsRub + hranenieMonthly;
  const unitCostTotal = unitCostFixed + ekvairingRub;
  const marginPerUnit = priceSale - unitCostTotal;

  // Min price where margin = 0:
  // newPrice - (unitCostFixed + newPrice × ekvPct/100) = 0
  // newPrice × (1 - ekvPct/100) = unitCostFixed
  const breakevenPrice = p.ekvairingPercent > 0
    ? unitCostFixed / (1 - p.ekvairingPercent / 100)
    : unitCostFixed;

  return {
    parsed: p,
    unitCostFixed,
    unitCostTotal,
    marginPerUnit,
    ekvairingRub,
    hranenieMonthly,
    breakevenPrice,
    marginAtPrice(newPrice: number): number {
      const newAcq = newPrice * p.ekvairingPercent / 100;
      return newPrice - (unitCostFixed + newAcq);
    },
  };
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}
function fmtRub(n: number): string {
  return `${fmt(n)} ₽`;
}
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ─── Buyout conflict check ────────────────────────────────────────────────────

interface BuyoutInfo {
  orders: number;
  buyouts: number;
  reportedPct: number;
  computedPct: number | null;
  conflict: boolean;
  conflictMsg: string;
  /** Actual buyouts to use in P&L (always use real buyouts, not orders×pct) */
  effectiveBuyouts: number;
}

function checkBuyouts(stats: NonNullable<AnalysisData['stats']>): BuyoutInfo {
  const orders = stats.ordersCount;
  const buyouts = stats.buyoutsCount;
  const reportedPct = stats.buyoutPercent;

  const computedPct = orders > 0 ? (buyouts / orders) * 100 : null;
  const conflict =
    computedPct !== null && Math.abs(computedPct - reportedPct) > 5;

  const conflictMsg = conflict
    ? `reportedBuyoutPercent=${fmtPct(reportedPct)}, но buyouts/orders=${buyouts}/${orders}=${fmtPct(computedPct!)} — разница ${fmtPct(Math.abs(computedPct! - reportedPct))}. Для P&L используем фактические buyouts=${buyouts}`
    : '';

  return {
    orders,
    buyouts,
    reportedPct,
    computedPct,
    conflict,
    conflictMsg,
    effectiveBuyouts: buyouts, // always use actual buyouts for P&L
  };
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

function buildDiagnostics(
  data: AnalysisData,
  ue: ComputedUE | null,
  bo: BuyoutInfo | null,
): DiagnosticMetric[] {
  const diag: DiagnosticMetric[] = [];
  const stats = data.stats;
  const adv = data.advertising;
  const product = data.product;
  if (!stats) return diag;

  const buyoutPct = bo?.computedPct ?? stats.buyoutPercent;

  // % выкупа
  {
    const subj = (product?.subjectName ?? '').toLowerCase();
    const isChild = /детск|ребён/.test(subj);
    const good = isChild ? 55 : 50;
    const norm = isChild ? 45 : 38;
    const status: DiagnosticMetric['status'] = buyoutPct >= good ? 'good' : buyoutPct >= norm ? 'warn' : 'bad';
    const label = bo?.conflict
      ? `${fmtPct(buyoutPct)} (факт, НЕ reported ${fmtPct(stats.buyoutPercent)})`
      : fmtPct(buyoutPct);
    diag.push({
      name: '% выкупа',
      value: label,
      status,
      comment:
        status === 'good' ? 'в норме'
        : status === 'warn' ? `ниже нормы (норма ≥${norm}%)`
        : `плохо (<${norm}%) — высокие возвраты`,
    });
  }

  // Конверсии
  {
    const c = stats.conversions;
    const c2c = c.addToCartPercent;
    const c2o = c.cartToOrderPercent;
    diag.push({
      name: 'Карточка → Корзина',
      value: fmtPct(c2c),
      status: c2c >= 10 ? 'good' : c2c >= 7 ? 'warn' : 'bad',
      comment: c2c >= 10 ? 'хорошо (≥10%)' : c2c >= 7 ? `норма 7–10%` : `плохо (<7%)`,
    });
    const negativeMargineNote = ue && ue.marginPerUnit < 0
      ? ' — при отрицательной марже рост конверсии = рост убытков'
      : '';
    diag.push({
      name: 'Корзина → Заказ',
      value: fmtPct(c2o),
      status: c2o >= 70 ? 'good' : c2o >= 45 ? 'warn' : 'bad',
      comment:
        c2o >= 70 ? `хорошо (>70%)${negativeMargineNote}`
        : c2o >= 45 ? `норма 45–70%${negativeMargineNote}`
        : `плохо (<45%) — масштабировать рекламу нельзя${negativeMargineNote}`,
    });
  }

  // Маржа
  if (ue) {
    const m = ue.marginPerUnit;
    diag.push({
      name: 'Маржа/шт (до рекламы)',
      value: fmtRub(m),
      status: m > 200 ? 'good' : m > 0 ? 'warn' : 'bad',
      comment:
        m <= 0 ? `УБЫТОК ${fmtRub(Math.abs(m))}/шт — каждая продажа в минус`
        : m <= 100 ? 'почти нулевая — хрупкая'
        : 'положительная',
    });
  }

  // ДРР (только если маржа положительна или неизвестна)
  if (adv && (ue === null || ue.marginPerUnit > 0)) {
    const drr = adv.drr;
    diag.push({
      name: 'ДРР',
      value: fmtPct(drr),
      status: drr <= 9 ? 'good' : drr <= 18 ? 'warn' : 'bad',
      comment:
        drr <= 9 ? 'отлично (≤9%)' : drr <= 18 ? 'повышенный (9–18%)' : 'высокий (>18%)',
    });
  } else if (adv && ue && ue.marginPerUnit <= 0) {
    diag.push({
      name: 'ДРР',
      value: fmtPct(adv.drr),
      status: 'bad',
      comment: `ДРР неважен — маржа отрицательная. Реклама убыточна при любом ДРР`,
    });
  }

  // Запас
  if (product && bo && bo.effectiveBuyouts > 0) {
    const stockWeeks = product.totalStock / bo.effectiveBuyouts;
    diag.push({
      name: 'Запас',
      value: `${stockWeeks.toFixed(1)} нед`,
      status:
        stockWeeks < 2 ? 'bad'
        : stockWeeks <= 8 ? 'good'
        : stockWeeks <= 14 ? 'warn'
        : 'bad',
      comment:
        stockWeeks < 2 ? 'КРИТИЧНО — риск out-of-stock'
        : stockWeeks <= 8 ? 'норма'
        : stockWeeks <= 14 ? 'умеренный избыток'
        : 'большой запас — деньги заморожены',
    });
  }

  return diag;
}

// ─── Risks ────────────────────────────────────────────────────────────────────

function buildRisks(
  data: AnalysisData,
  ue: ComputedUE | null,
  bo: BuyoutInfo | null,
  stockWeeks: number | null,
): RiskSignal[] {
  const risks: RiskSignal[] = [];
  const stats = data.stats;
  const adv = data.advertising;
  if (!stats) return risks;

  const buyouts = bo?.effectiveBuyouts ?? stats.buyoutsCount;

  // Отрицательная маржа — главный риск
  if (ue && ue.marginPerUnit <= 0) {
    risks.push({
      description: `Маржа отрицательная (${fmtRub(ue.marginPerUnit)}/шт). Каждый выкуп приносит убыток. Реклама усугубляет потери`,
      estimatedLossRubPerWeek: Math.abs(buyouts * ue.marginPerUnit) + (adv?.totalSpend ?? 0),
      severity: 'critical',
    });
  }

  // Out-of-stock
  if (stockWeeks !== null && stockWeeks < 2) {
    const loss = ue ? buyouts * Math.max(0, ue.marginPerUnit) : undefined;
    risks.push({
      description: `Остаток на ${stockWeeks.toFixed(1)} нед — out-of-stock и падение позиций в поиске`,
      estimatedLossRubPerWeek: loss,
      severity: 'critical',
    });
  }

  // Плохая воронка + реклама
  if (stats.conversions.cartToOrderPercent < 30 && adv && adv.totalSpend > 0) {
    risks.push({
      description: `Конверсия корзина→заказ ${fmtPct(stats.conversions.cartToOrderPercent)} — масштабирование рекламы убыточно`,
      severity: 'high',
    });
  }

  // Высокий ДРР + положительная маржа
  if (adv && adv.drr > 18 && ue && ue.marginPerUnit > 0) {
    risks.push({
      description: `ДРР ${fmtPct(adv.drr)} — реклама ест маржу (норма ≤18%)`,
      severity: 'high',
    });
  }

  // Сезонность + большой запас
  if (stockWeeks !== null && stockWeeks > 10 && data.seasonalityData) {
    const nextMonth = (new Date().getMonth() + 2 > 12) ? 1 : new Date().getMonth() + 2;
    const coeff = data.seasonalityData.seasonality[String(nextMonth)];
    if (coeff !== undefined && coeff < 0.85) {
      risks.push({
        description: `Запас ${stockWeeks.toFixed(0)} нед + сезонность падает (×${coeff} в следующем месяце) — риск неликвида`,
        severity: 'high',
      });
    }
  }

  return risks;
}

// ─── Scenario helpers ─────────────────────────────────────────────────────────

function noDataScenario(id: string, title: string, actionType: DecisionScenario['actionType'], missing: string[]): DecisionScenario {
  return {
    id, title, actionType, isActionable: false,
    recommendation: 'Нет данных для расчёта',
    expectedValueRub: null, optimisticRub: null, neutralRub: null, pessimisticRub: null,
    probabilityPositive: null, probabilityNeutral: null, probabilityNegative: null,
    confidence: 'low', confidenceReason: `нет данных: ${missing.join(', ')}`,
    calculation: 'нет данных', whyThisMatters: '', missingData: missing,
  };
}

// ─── Scenario: DoNothing ──────────────────────────────────────────────────────

function scenarioDoNothing(
  data: AnalysisData,
  ue: ComputedUE | null,
  bo: BuyoutInfo | null,
  baseWeeklyProfit: number | null,
): DecisionScenario {
  const stats = data.stats;
  const adv = data.advertising;
  const missing: string[] = [];

  if (!stats) {
    missing.push('статистика WB');
    return noDataScenario('doNothing', 'Ничего не делать', 'doNothing', missing);
  }

  const buyouts = bo?.effectiveBuyouts ?? stats.buyoutsCount;
  let calc = '';
  let confidence: Confidence = 'low';
  let confidenceReason = '';

  if (ue) {
    confidence = 'high';
    confidenceReason = 'unit-экономика + статистика WB';
    const adsLine = adv ? ` − ${fmtRub(adv.totalSpend)} реклама` : '';
    const lossLine = ue.marginPerUnit <= 0
      ? ` УБЫТОК: каждый выкуп = ${fmtRub(Math.abs(ue.marginPerUnit))} потери`
      : '';
    calc = `${buyouts} выкупов × ${fmtRub(ue.marginPerUnit)} маржа${adsLine} = ${fmtRub(baseWeeklyProfit ?? 0)}/нед${lossLine}`;
  } else {
    confidence = 'medium';
    confidenceReason = 'нет unit-экономики';
    missing.push('unit-экономика (маржа неизвестна)');
    const revenue = buyouts * (data.product?.priceSale ?? 0);
    calc = `Выручка ~${fmtRub(revenue)}/нед. Маржа неизвестна, прибыль не считается`;
  }

  return {
    id: 'doNothing',
    title: 'Ничего не делать',
    actionType: 'doNothing',
    isActionable: false, // baseline, not an action
    recommendation: 'Оставить как есть — эталонный сценарий',
    expectedValueRub: 0, // by definition = baseline, delta = 0
    optimisticRub: 0,
    neutralRub: 0,
    pessimisticRub: 0,
    probabilityPositive: 0.10,
    probabilityNeutral: 0.40,
    probabilityNegative: 0.50,
    confidence,
    confidenceReason,
    calculation: calc,
    whyThisMatters: ue && ue.marginPerUnit <= 0
      ? 'Бездействие означает продолжение потерь каждую неделю'
      : 'Базовый сценарий без изменений',
    missingData: missing,
  };
}

// ─── Scenario: Price ──────────────────────────────────────────────────────────

function scenarioPriceAdjust(
  data: AnalysisData,
  ue: ComputedUE | null,
  bo: BuyoutInfo | null,
  baseWeeklyProfit: number | null,
): DecisionScenario {
  const stats = data.stats;
  const product = data.product;
  const missing: string[] = [];

  if (!stats || !product) {
    return noDataScenario('price', 'Коррекция цены', 'price', ['статистика WB']);
  }

  const priceSale = product.priceSale;
  const buyouts = bo?.effectiveBuyouts ?? stats.buyoutsCount;
  const mpComp = data.mpstatsData?.competitors ?? [];

  let competitorMedian: number | null = null;
  if (mpComp.length >= 2) {
    const prices = mpComp.map((c) => c.price).sort((a, b) => a - b);
    competitorMedian = prices[Math.floor(prices.length / 2)];
  }

  // ── Case 1: Negative margin → must raise price ──────────────────────────────
  if (ue && ue.marginPerUnit <= 0) {
    const breakevenPrice = ue.breakevenPrice;
    // Suggest: breakeven + 15% rounded up to nearest 50
    const suggestRaw = breakevenPrice * 1.15;
    const suggestedPrice = Math.ceil(suggestRaw / 50) * 50;
    const newMargin = ue.marginAtPrice(suggestedPrice);
    const adSpend = data.advertising?.totalSpend ?? 0;

    // EV: even at reduced volume, delta should be positive
    const pPos = 0.25; // buyouts stay at 80%
    const pNeu = 0.45; // buyouts fall 30%
    const pNeg = 0.30; // buyouts fall 50%

    const profitAtVol = (volMult: number) =>
      buyouts * volMult * newMargin - adSpend;

    const rPos = profitAtVol(0.80) - (baseWeeklyProfit ?? 0);
    const rNeu = profitAtVol(0.70) - (baseWeeklyProfit ?? 0);
    const rNeg = profitAtVol(0.50) - (baseWeeklyProfit ?? 0);
    const ev = pPos * rPos + pNeu * rNeu + pNeg * rNeg;

    const confidence: Confidence = ue ? 'high' : 'medium';
    const reason = ue
      ? 'маржа отрицательная — повышение цены даёт положительный delta даже при снижении объёма'
      : 'нет unit-экономики, но маржа оценочно отрицательная';

    return {
      id: 'price',
      title: `Поднять цену до ${fmtRub(suggestedPrice)} (мин. безубыточность ${fmtRub(breakevenPrice)})`,
      actionType: 'price',
      isActionable: true,
      recommendation: `Поднять цену с ${fmtRub(priceSale)} до ${fmtRub(suggestedPrice)}. Цена безубыточности: ${fmtRub(breakevenPrice)}`,
      expectedValueRub: ev,
      optimisticRub: rPos,
      neutralRub: rNeu,
      pessimisticRub: rNeg,
      probabilityPositive: pPos,
      probabilityNeutral: pNeu,
      probabilityNegative: pNeg,
      confidence,
      confidenceReason: reason,
      calculation:
        `Себестоимость полная: ${fmtRub(ue.unitCostTotal)}/шт. Цена безубыточности: ${fmtRub(breakevenPrice)}.\n` +
        `  При цене ${fmtRub(suggestedPrice)}: новая маржа ${fmtRub(newMargin)}/шт.\n` +
        `  Оптим. (объём ×0.80, P=${(pPos*100).toFixed(0)}%): delta ${fmtRub(rPos)}/нед\n` +
        `  Нейтр. (объём ×0.70, P=${(pNeu*100).toFixed(0)}%): delta ${fmtRub(rNeu)}/нед\n` +
        `  Пессим. (объём ×0.50, P=${(pNeg*100).toFixed(0)}%): delta ${fmtRub(rNeg)}/нед\n` +
        `  EV = ${fmtRub(ev)}/нед (vs базового убытка)`,
      whyThisMatters: 'При отрицательной марже каждый выкуп = убыток. Цена — единственный способ сделать товар прибыльным без смены поставщика',
      missingData: missing,
    };
  }

  // ── Case 2: Margin positive → test small adjustment ─────────────────────────
  if (!ue) {
    missing.push('unit-экономика (нет маржи)');
    const priceHint = competitorMedian
      ? `Цена ${fmtRub(priceSale)}, медиана конкурентов ${fmtRub(competitorMedian)}`
      : `Цена ${fmtRub(priceSale)}`;
    return {
      id: 'price',
      title: 'Коррекция цены — тест',
      actionType: 'price',
      isActionable: true,
      recommendation: `Тест ±5% цены на 7 дней. ${priceHint}`,
      expectedValueRub: null,
      optimisticRub: null, neutralRub: null, pessimisticRub: null,
      probabilityPositive: null, probabilityNeutral: null, probabilityNegative: null,
      confidence: 'low',
      confidenceReason: 'нет unit-экономики — EV не считается',
      calculation: `${priceHint}. Без маржи расчёт delta невозможен`,
      whyThisMatters: 'Цена влияет на конверсию и маржу',
      missingData: missing,
    };
  }

  // Has positive margin: check vs competitors
  const priceVsComp = competitorMedian !== null ? priceSale / competitorMedian : null;
  const shouldReduce = priceVsComp !== null
    ? priceVsComp > 1.10
    : stats.conversions.addToCartPercent < 5;

  const deltaPct = shouldReduce ? -0.05 : 0.05;
  const newPrice = priceSale * (1 + deltaPct);
  const newMargin = ue.marginAtPrice(newPrice);
  const adSpend = data.advertising?.totalSpend ?? 0;

  // Block reduction if new margin goes negative
  if (shouldReduce && newMargin <= 0) {
    return {
      id: 'price',
      title: `Снижение цены ЗАПРЕЩЕНО — маржа станет отрицательной`,
      actionType: 'price',
      isActionable: false,
      recommendation: `НЕ снижать цену: маржа ${fmtRub(ue.marginPerUnit)}/шт, снижение на 5% → ${fmtRub(newMargin)}/шт (убыток)`,
      expectedValueRub: null,
      optimisticRub: null, neutralRub: null, pessimisticRub: null,
      probabilityPositive: null, probabilityNeutral: null, probabilityNegative: null,
      confidence: 'high',
      confidenceReason: 'маржа слишком мала для снижения цены',
      calculation: `Цена ${fmtRub(priceSale)}, маржа ${fmtRub(ue.marginPerUnit)}/шт. При −5% → цена ${fmtRub(newPrice)}, маржа ${fmtRub(newMargin)} — УБЫТОК`,
      whyThisMatters: 'Снижение цены при малой марже убивает прибыль',
      missingData: [],
    };
  }

  // Calculate EV for adjustment
  const pPos = shouldReduce
    ? (priceVsComp !== null && priceVsComp > 1.15 ? 0.40 : 0.25)
    : 0.30;
  const pNeu = 0.40;
  const pNeg = 1 - pPos - pNeu;

  const multipliers = shouldReduce ? [1.20, 1.07, 1.00] : [0.90, 1.00, 1.05];

  const profits = multipliers.map(
    (m) => buyouts * m * newMargin - adSpend - (baseWeeklyProfit ?? 0),
  );
  const ev = pPos * profits[0] + pNeu * profits[1] + pNeg * profits[2];

  return {
    id: 'price',
    title: `Тест цены: ${shouldReduce ? 'снизить' : 'поднять'} на 5% (${fmtRub(priceSale)} → ${fmtRub(newPrice)})`,
    actionType: 'price',
    isActionable: true,
    recommendation: `Тест ${shouldReduce ? 'снижения' : 'повышения'} цены с ${fmtRub(priceSale)} до ${fmtRub(newPrice)} на 7 дней`,
    expectedValueRub: ev,
    optimisticRub: profits[0],
    neutralRub: profits[1],
    pessimisticRub: profits[2],
    probabilityPositive: pPos,
    probabilityNeutral: pNeu,
    probabilityNegative: pNeg,
    confidence: competitorMedian ? 'medium' : 'low',
    confidenceReason: competitorMedian
      ? `медиана конкурентов ${fmtRub(competitorMedian)}, unit-экономика`
      : 'unit-экономика есть, данных конкурентов нет',
    calculation:
      `Новая маржа при ${fmtRub(newPrice)}: ${fmtRub(newMargin)}/шт.\n` +
      `  Оптим. (объём ×${multipliers[0]}, P=${(pPos*100).toFixed(0)}%): delta ${fmtRub(profits[0])}/нед\n` +
      `  Нейтр. (объём ×${multipliers[1]}, P=${(pNeu*100).toFixed(0)}%): delta ${fmtRub(profits[1])}/нед\n` +
      `  Пессим. (объём ×${multipliers[2]}, P=${(pNeg*100).toFixed(0)}%): delta ${fmtRub(profits[2])}/нед\n` +
      `  EV = ${fmtRub(ev)}/нед`,
    whyThisMatters: 'Цена — прямой рычаг конверсии и маржи',
    missingData: [...missing, ...(competitorMedian ? [] : ['цены конкурентов (MPStats)'])],
  };
}

// ─── Scenario: Ads ────────────────────────────────────────────────────────────

function scenarioAds(
  data: AnalysisData,
  ue: ComputedUE | null,
  bo: BuyoutInfo | null,
  baseWeeklyProfit: number | null,
): DecisionScenario {
  const stats = data.stats;
  const adv = data.advertising;
  const missing: string[] = [];

  if (!adv || !stats) {
    return noDataScenario('ads', 'Коррекция рекламы', 'ads',
      [...(!adv ? ['данные рекламы WB'] : []), ...(!stats ? ['статистика WB'] : [])]);
  }

  const adSpend = adv.totalSpend;
  const drr = adv.drr;
  const buyouts = bo?.effectiveBuyouts ?? stats.buyoutsCount;
  const cartToOrder = stats.conversions.cartToOrderPercent;

  // ── Case 1: Negative margin → stop ads ──────────────────────────────────────
  if (ue && ue.marginPerUnit <= 0) {
    // Use actual ad orders × factual buyout rate (NOT ad orders as ad buyouts)
    const adOrders = adv.totalOrders;
    const factualBuyoutRate = bo && bo.orders > 0
      ? bo.buyouts / bo.orders
      : stats.buyoutPercent / 100;
    const estimatedAdBuyouts = adOrders > 0 && factualBuyoutRate > 0
      ? Math.round(adOrders * factualBuyoutRate)
      : Math.round(buyouts * 0.30); // fallback
    const isEstimated = adOrders > 0 && bo && bo.orders > 0;

    const estimatedOrganicBuyouts = Math.max(0, buyouts - estimatedAdBuyouts);
    // After stopping ads: only organic sales remain (still losing per unit, but no ad spend)
    const profitAfterStop = estimatedOrganicBuyouts * ue.marginPerUnit;
    const delta = profitAfterStop - (baseWeeklyProfit ?? 0);

    return {
      id: 'ads',
      title: 'Остановить рекламу (маржа отрицательная)',
      actionType: 'ads',
      isActionable: true,
      recommendation: `Остановить ВСЮ рекламу (расход ${fmtRub(adSpend)}/нед). При отрицательной марже реклама наращивает убытки`,
      expectedValueRub: delta,
      optimisticRub: delta + Math.abs(delta) * 0.20,
      neutralRub: delta,
      pessimisticRub: delta - Math.abs(delta) * 0.30,
      probabilityPositive: 0.60,
      probabilityNeutral: 0.30,
      probabilityNegative: 0.10,
      confidence: 'high',
      confidenceReason: 'маржа ≤0 → реклама убыточна при любом ДРР',
      calculation:
        `Маржа ${fmtRub(ue.marginPerUnit)}/шт ≤ 0.\n` +
        `  Рекламные заказы (API): ${adOrders}\n` +
        `  Факт. buyout rate: ${fmtPct(factualBuyoutRate * 100)}\n` +
        `  Оценочные рекламные выкупы: ~${estimatedAdBuyouts} шт${isEstimated ? ' (оценка = adOrders × factBuyoutRate)' : ' (оценка)'}\n` +
        `  Органических выкупов: ~${estimatedOrganicBuyouts} шт\n` +
        `  P&L после остановки: ${estimatedOrganicBuyouts} × ${fmtRub(ue.marginPerUnit)} = ${fmtRub(profitAfterStop)}\n` +
        `  delta = ${fmtRub(profitAfterStop)} − (${fmtRub(baseWeeklyProfit ?? 0)}) = ${fmtRub(delta)}/нед`,
      whyThisMatters: 'ДРР считается от выручки, а не от маржи. При марже ≤0 хороший ДРР — иллюзия',
      missingData: missing,
    };
  }

  // ── Case 2: Funnel broken → don't scale ─────────────────────────────────────
  if (cartToOrder < 30) {
    const adIncrease = adSpend * 0.30;
    const additionalOrders = adv.totalOrders * 0.30 * (cartToOrder / 100);
    const additionalBuyouts = additionalOrders * (stats.buyoutPercent / 100);
    const adEffect = ue ? additionalBuyouts * ue.marginPerUnit - adIncrease : null;

    return {
      id: 'ads',
      title: `Не масштабировать рекламу (конверсия корзина→заказ ${fmtPct(cartToOrder)})`,
      actionType: 'ads',
      isActionable: true,
      recommendation: `Не увеличивать бюджет, пока конверсия корзина→заказ не достигнет ≥45%`,
      expectedValueRub: adEffect,
      optimisticRub: null, neutralRub: adEffect, pessimisticRub: null,
      probabilityPositive: 0.15, probabilityNeutral: 0.35, probabilityNegative: 0.50,
      confidence: 'high',
      confidenceReason: 'низкая конверсия корзина→заказ напрямую блокирует эффективность рекламы',
      calculation:
        `Тест +30% бюджета: +${fmtRub(adIncrease)}/нед, доп. выкупов: ~${additionalBuyouts.toFixed(1)} шт` +
        (adEffect !== null ? `, чистый эффект ${fmtRub(adEffect)} — УБЫТОЧНО` : ''),
      whyThisMatters: 'Реклама приводит трафик в корзину, но воронка не конвертирует',
      missingData: ue ? [] : ['unit-экономика'],
    };
  }

  // ── Case 3: DRR > 18% → cut budget ──────────────────────────────────────────
  if (drr > 18) {
    const adSavings = adSpend * 0.30;
    const adFrac = stats.ordersCount > 0 ? Math.min(adv.totalOrders / stats.ordersCount, 1) : 0.5;
    const orderLoss = stats.ordersCount * adFrac * 0.30 * 0.55;
    const buyoutLoss = orderLoss * (stats.buyoutPercent / 100);

    if (ue) {
      const delta = adSavings - buyoutLoss * ue.marginPerUnit;
      return {
        id: 'ads',
        title: `Сократить рекламу на 30% (ДРР ${fmtPct(drr)})`,
        actionType: 'ads',
        isActionable: true,
        recommendation: `Снизить общий бюджет с ${fmtRub(adSpend)}/нед до ${fmtRub(adSpend * 0.70)}/нед. Тест 7 дней`,
        expectedValueRub: delta,
        optimisticRub: adSavings - buyoutLoss * ue.marginPerUnit * 0.7,
        neutralRub: delta,
        pessimisticRub: adSavings * 0.5 - buyoutLoss * ue.marginPerUnit * 1.3,
        probabilityPositive: 0.50, probabilityNeutral: 0.35, probabilityNegative: 0.15,
        confidence: 'high',
        confidenceReason: 'есть ДРР, unit-экономика и статистика',
        calculation: `Экономия ${fmtRub(adSavings)}/нед − потеря ~${buyoutLoss.toFixed(1)} выкупов × ${fmtRub(ue.marginPerUnit)} = delta ${fmtRub(delta)}/нед`,
        whyThisMatters: 'ДРР >18% — каждый рубль рекламы приносит <1 рубля маржи',
        missingData: [],
      };
    }

    return {
      id: 'ads', title: `Сократить рекламу на 30% (ДРР ${fmtPct(drr)})`,
      actionType: 'ads', isActionable: true,
      recommendation: `Снизить бюджет на 30%. ДРР ${fmtPct(drr)} — выше нормы (18%)`,
      expectedValueRub: null, optimisticRub: null, neutralRub: null, pessimisticRub: null,
      probabilityPositive: 0.50, probabilityNeutral: 0.35, probabilityNegative: 0.15,
      confidence: 'medium', confidenceReason: 'нет unit-экономики',
      calculation: `Экономия ${fmtRub(adSpend * 0.30)}/нед. Delta в ₽ без маржи не считается`,
      whyThisMatters: 'ДРР >18% указывает на неэффективную рекламу',
      missingData: ['unit-экономика'],
    };
  }

  // ── Case 4: DRR ≤ 9%, margin > 0 → can scale ────────────────────────────────
  if (drr <= 9 && ue && ue.marginPerUnit > 0) {
    const adIncrease = adSpend * 0.30;
    const buyoutGain = stats.ordersCount * 0.18 * (stats.buyoutPercent / 100);
    const delta = buyoutGain * ue.marginPerUnit - adIncrease;

    return {
      id: 'ads',
      title: `Масштабировать рекламу (ДРР ${fmtPct(drr)}, маржа ${fmtRub(ue.marginPerUnit)}/шт)`,
      actionType: 'ads',
      isActionable: true,
      recommendation: `Увеличить бюджет с ${fmtRub(adSpend)}/нед до ${fmtRub(adSpend * 1.30)}/нед. Тест 7 дней`,
      expectedValueRub: delta,
      optimisticRub: buyoutGain * ue.marginPerUnit * 1.2 - adIncrease,
      neutralRub: delta,
      pessimisticRub: buyoutGain * ue.marginPerUnit * 0.5 - adIncrease,
      probabilityPositive: 0.40, probabilityNeutral: 0.40, probabilityNegative: 0.20,
      confidence: 'high',
      confidenceReason: `ДРР ≤9% + положительная маржа — реклама окупается`,
      calculation: `+${fmtRub(adIncrease)}/нед → ~${buyoutGain.toFixed(1)} доп. выкупов × ${fmtRub(ue.marginPerUnit)} → delta ${fmtRub(delta)}/нед`,
      whyThisMatters: 'ДРР ≤9% с положительной маржей — реклама окупается, можно масштабировать',
      missingData: [],
    };
  }

  // Default: maintain
  return {
    id: 'ads', title: `Реклама в норме (ДРР ${fmtPct(drr)})`,
    actionType: 'ads', isActionable: false,
    recommendation: 'Сохранить бюджет. Оптимизировать ставки по CPC',
    expectedValueRub: 0, optimisticRub: 0, neutralRub: 0, pessimisticRub: 0,
    probabilityPositive: 0.40, probabilityNeutral: 0.40, probabilityNegative: 0.20,
    confidence: 'medium', confidenceReason: 'ДРР в норме',
    calculation: `ДРР ${fmtPct(drr)} в диапазоне 9–18%. Расход ${fmtRub(adSpend)}/нед`,
    whyThisMatters: 'Реклама не требует срочного вмешательства',
    missingData: ue ? [] : ['unit-экономика'],
  };
}

// ─── Scenario: Stock ──────────────────────────────────────────────────────────

function scenarioStock(
  data: AnalysisData,
  ue: ComputedUE | null,
  bo: BuyoutInfo | null,
  stockWeeks: number | null,
): DecisionScenario {
  const stats = data.stats;
  const product = data.product;
  const missing: string[] = [];

  if (!product || !stats || stockWeeks === null) {
    return noDataScenario('stock', 'Управление остатками', 'stock',
      [...(!product ? ['карточка WB'] : []), ...(!stats ? ['статистика WB'] : [])]);
  }

  const buyouts = bo?.effectiveBuyouts ?? stats.buyoutsCount;
  const hranenieDay = ue?.parsed.hraneniePerDay ?? 0;

  if (stockWeeks < 2) {
    const lostSalesWeeks = 4;
    const lostRevenue = ue && ue.marginPerUnit > 0
      ? buyouts * ue.marginPerUnit * lostSalesWeeks
      : buyouts * (product.priceSale * 0.10) * lostSalesWeeks;

    return {
      id: 'stock', title: `СРОЧНО: пополнить склад (${stockWeeks.toFixed(1)} нед)`,
      actionType: 'stock', isActionable: true,
      recommendation: `Срочная поставка. Остаток закончится через ~${(stockWeeks * 7).toFixed(0)} дней`,
      expectedValueRub: lostRevenue,
      optimisticRub: lostRevenue * 1.2, neutralRub: lostRevenue, pessimisticRub: lostRevenue * 0.7,
      probabilityPositive: 0.60, probabilityNeutral: 0.30, probabilityNegative: 0.10,
      confidence: 'high', confidenceReason: 'прямые данные остатков',
      calculation: `Без поставки: ~${buyouts} выкупов/нед × 4 нед × ${ue?.marginPerUnit !== undefined && ue.marginPerUnit > 0 ? fmtRub(ue.marginPerUnit) : '~10% цены'} ≈ ${fmtRub(lostRevenue)} потерь`,
      whyThisMatters: 'Out-of-stock → WB понижает позиции в поиске, восстановление долгое',
      missingData: missing,
    };
  }

  if (stockWeeks > 14) {
    const monthlyStorage = hranenieDay > 0
      ? product.totalStock * hranenieDay * 30
      : product.totalStock * 3 * 30;
    const dataSource = hranenieDay > 0 ? 'из unit-экономики' : 'оценка 3₽/день/шт';

    return {
      id: 'stock', title: `Излишек: ${stockWeeks.toFixed(0)} нед — рассмотреть снижение цены`,
      actionType: 'stock', isActionable: ue ? ue.marginPerUnit > 0 : true,
      recommendation: ue && ue.marginPerUnit > 0
        ? `Рассмотреть умеренную скидку для ускорения оборота. Хранение: ${fmtRub(monthlyStorage)}/мес`
        : `Хранение ${fmtRub(monthlyStorage)}/мес. НЕ снижать цену при отрицательной марже`,
      expectedValueRub: ue && ue.marginPerUnit > 0 ? buyouts * ue.marginPerUnit * 0.3 - monthlyStorage / 4 : null,
      optimisticRub: null, neutralRub: null, pessimisticRub: null,
      probabilityPositive: 0.40, probabilityNeutral: 0.40, probabilityNegative: 0.20,
      confidence: hranenieDay > 0 ? 'high' : 'medium',
      confidenceReason: hranenieDay > 0 ? 'данные хранения из unit-экономики' : 'оценочная стоимость хранения',
      calculation: `${product.totalStock} шт ÷ ${buyouts} выкупов/нед = ${stockWeeks.toFixed(1)} нед. Хранение ~${fmtRub(monthlyStorage)}/мес (${dataSource})`,
      whyThisMatters: 'Избыток замораживает деньги и копит расходы на хранение',
      missingData: hranenieDay > 0 ? missing : [...missing, 'стоимость хранения (unit-экономика)'],
    };
  }

  // Normal stock — NOT actionable
  return {
    id: 'stock', title: `Запас в норме: ${stockWeeks.toFixed(1)} нед`,
    actionType: 'stock', isActionable: false,
    recommendation: 'Текущий запас достаточен',
    expectedValueRub: null, optimisticRub: null, neutralRub: null, pessimisticRub: null,
    probabilityPositive: null, probabilityNeutral: null, probabilityNegative: null,
    confidence: 'high', confidenceReason: 'прямые данные',
    calculation: `${product.totalStock} шт ÷ ${buyouts} выкупов/нед = ${stockWeeks.toFixed(1)} нед (норма 2–14 нед)`,
    whyThisMatters: 'Запас в норме — не требует действий',
    missingData: missing,
  };
}

// ─── Scenario: Test ───────────────────────────────────────────────────────────

function scenarioTest(
  data: AnalysisData,
  ue: ComputedUE | null,
  bo: BuyoutInfo | null,
): DecisionScenario {
  const stats = data.stats;
  const product = data.product;
  const cartToOrder = stats?.conversions.cartToOrderPercent ?? 100;
  const buyouts = bo?.effectiveBuyouts ?? stats?.buyoutsCount ?? 0;

  let testAction = '';
  let metric = '';
  let criteria = '';

  if (ue && ue.marginPerUnit <= 0) {
    const suggested = Math.ceil(ue.breakevenPrice * 1.10 / 50) * 50;
    testAction = `Поднять цену до ${fmtRub(suggested)} на 7 дней`;
    metric = `выкупы шт/нед и маржа в ₽/нед`;
    criteria = `успех: маржа ≥0 при выкупах ≥50% от текущих`;
  } else if (cartToOrder < 40 && stats) {
    testAction = `Снизить цену на 3% на 5 дней`;
    metric = `конверсия корзина→заказ (сейчас ${fmtPct(cartToOrder)})`;
    criteria = `успех: конверсия ≥45%, маржа в ₽/нед не снизилась`;
  } else if (!ue && product) {
    testAction = `Тест цены ±5% по 7 дней каждый вариант`;
    metric = `выкупы шт/нед и выручка`;
    criteria = `успех: при снижении — заказы +10%+; при повышении — выручка не падает`;
  } else {
    testAction = `Снизить CPC-ставку на 15% на 5 дней`;
    metric = `ДРР и заказы`;
    criteria = `успех: ДРР снизился, заказы упали менее чем на 10%`;
  }

  const evEst = ue && buyouts > 0 ? buyouts * Math.abs(ue.marginPerUnit) * 0.1 : null;

  return {
    id: 'test',
    title: `Тест: ${testAction}`,
    actionType: 'test',
    isActionable: true,
    recommendation: `${testAction}. Метрика: ${metric}. Критерий: ${criteria}. Срок: 5–7 дней`,
    expectedValueRub: evEst,
    optimisticRub: evEst !== null ? evEst * 3 : null,
    neutralRub: evEst,
    pessimisticRub: evEst !== null ? -evEst * 0.3 : null,
    probabilityPositive: 0.40, probabilityNeutral: 0.35, probabilityNegative: 0.25,
    confidence: 'medium',
    confidenceReason: 'тест нужен для проверки гипотезы с минимальным риском',
    calculation: `Тест 5–7 дней, метрика: ${metric}`,
    whyThisMatters: 'Тест ограничивает риск и даёт данные для уверенного решения',
    missingData: [],
  };
}

// ─── selectBestAction ─────────────────────────────────────────────────────────

function selectBestAction(
  scenarios: DecisionScenario[],
  ue: ComputedUE | null,
): DecisionScenario | null {
  // Only consider truly actionable scenarios (excludes doNothing, stock-normal, ads-normal)
  const actionable = scenarios.filter(
    (s) => s.isActionable && s.actionType !== 'doNothing' && s.actionType !== 'test',
  );

  if (actionable.length === 0) {
    // Fall back to test
    return scenarios.find((s) => s.actionType === 'test') ?? null;
  }

  const confScore = (c: Confidence) => (c === 'high' ? 2 : c === 'medium' ? 1 : 0);

  // When margin is negative, price fix is highest priority regardless of EV ranking
  if (ue && ue.marginPerUnit <= 0) {
    const priceScenario = actionable.find((s) => s.actionType === 'price');
    if (priceScenario) return priceScenario;
  }

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
    { field: 'Карточка WB', available: data.product !== null },
    { field: 'Статистика WB (7 дней)', available: data.stats !== null },
    { field: 'Реклама WB', available: data.advertising !== null },
    {
      field: 'Unit-экономика (Google Sheets)',
      available: data.unitData?.found ?? false,
      note: data.unitData?.found ? undefined : (data.unitData?.rawText ?? undefined),
    },
    { field: 'MPStats', available: data.mpstatsData !== null },
    { field: 'Сезонность', available: data.seasonalityData !== null },
  ];
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function runDecisionEngine(data: AnalysisData): DecisionEngineResult {
  const priceSale = data.product?.priceSale ?? 0;

  // Unit economics
  const ue = data.unitData?.found && data.unitData.rawText
    ? computeUE(data.unitData.rawText, priceSale)
    : null;

  const marginPerUnit = ue?.marginPerUnit ?? null;
  const unitCostRub = ue?.unitCostTotal ?? null;
  const hasMarginData = marginPerUnit !== null;

  // Buyout consistency check
  const bo = data.stats ? checkBuyouts(data.stats) : null;
  const dataConflicts: string[] = [];
  if (bo?.conflict) dataConflicts.push(bo.conflictMsg);

  const weeklyBuyouts = bo?.effectiveBuyouts ?? data.stats?.buyoutsCount ?? 0;
  const stockWeeks =
    data.product && weeklyBuyouts > 0
      ? data.product.totalStock / weeklyBuyouts
      : null;

  // Ad cost per buyout
  const adCostPerBuyoutRub =
    data.advertising && weeklyBuyouts > 0
      ? data.advertising.totalSpend / weeklyBuyouts
      : null;

  const marginAfterAdsRub =
    marginPerUnit !== null && adCostPerBuyoutRub !== null
      ? marginPerUnit - adCostPerBuyoutRub
      : null;

  // Base weekly P&L
  const baseWeeklyProfitRub =
    ue !== null && data.stats !== null
      ? weeklyBuyouts * marginPerUnit! - (data.advertising?.totalSpend ?? 0)
      : null;

  // Ad orders vs estimated ad buyouts
  const factualBuyoutRate = bo && bo.orders > 0 ? bo.buyouts / bo.orders : null;
  const adOrdersCount = data.advertising?.totalOrders ?? null;
  const estimatedAdBuyouts =
    adOrdersCount !== null && factualBuyoutRate !== null
      ? Math.round(adOrdersCount * factualBuyoutRate)
      : null;
  const adBuyoutIsEstimated = adOrdersCount !== null && factualBuyoutRate !== null;

  // Safe price bounds (only relevant when margin < 0)
  const minSafePriceRub = ue ? Math.ceil(ue.breakevenPrice * 1.05 / 50) * 50 : null;
  const recommendedPriceRub = ue ? Math.ceil(ue.breakevenPrice * 1.15 / 50) * 50 : null;

  const diagnostics = buildDiagnostics(data, ue, bo);
  const risks = buildRisks(data, ue, bo, stockWeeks);
  const dataQuality = buildDataQuality(data);

  const scenarios: DecisionScenario[] = [
    scenarioDoNothing(data, ue, bo, baseWeeklyProfitRub),
    scenarioPriceAdjust(data, ue, bo, baseWeeklyProfitRub),
    scenarioAds(data, ue, bo, baseWeeklyProfitRub),
    scenarioStock(data, ue, bo, stockWeeks),
  ];
  scenarios.push(scenarioTest(data, ue, bo));

  const bestAction = selectBestAction(scenarios, ue);

  return {
    diagnostics,
    scenarios,
    bestAction,
    risks,
    dataQuality,
    dataConflicts,
    hasMarginData,
    marginPerUnit,
    unitCostRub,
    baseWeeklyProfitRub,
    adCostPerBuyoutRub,
    marginAfterAdsRub,
    computedBuyoutPercent: bo?.computedPct ?? null,
    buyoutConflict: bo?.conflict ?? false,
    adOrdersCount,
    estimatedAdBuyouts,
    factualBuyoutRate,
    adBuyoutIsEstimated,
    minSafePriceRub,
    recommendedPriceRub,
  };
}

// ─── Text formatter for prompt ────────────────────────────────────────────────

export function formatDecisionEngineForPrompt(result: DecisionEngineResult): string {
  const L: string[] = [
    '=== РАСЧЁТНЫЙ БЛОК DECISION ENGINE (ИНТЕРПРЕТИРУЙ ПЕРВЫМ) ===',
    'Используй этот блок как основу. Не пересчитывай то, что здесь уже есть. Интерпретируй.',
    '',
  ];

  // Unit economics summary
  if (result.hasMarginData) {
    L.push('UNIT-ЭКОНОМИКА:');
    L.push(`  Маржа/шт до рекламы:    ${result.marginPerUnit !== null ? fmtRub(result.marginPerUnit) : '—'}`);
    if (result.adCostPerBuyoutRub !== null)
      L.push(`  Реклама на выкуп:       ${fmtRub(result.adCostPerBuyoutRub)}`);
    if (result.marginAfterAdsRub !== null)
      L.push(`  Маржа/шт после рекламы: ${fmtRub(result.marginAfterAdsRub)}`);
    if (result.baseWeeklyProfitRub !== null) {
      const sign = result.baseWeeklyProfitRub >= 0 ? '(прибыль)' : '(УБЫТОК)';
      L.push(`  Базовый P&L:            ${fmtRub(result.baseWeeklyProfitRub)}/нед ${sign}`);
    }
    // Price bounds (only when margin is negative)
    if (result.marginPerUnit !== null && result.marginPerUnit < 0) {
      if (result.minSafePriceRub !== null)
        L.push(`  Мин. безопасная цена:   ${fmtRub(result.minSafePriceRub)} (breakeven × 1.05)`);
      if (result.recommendedPriceRub !== null)
        L.push(`  Рекомендуемая цена:     ${fmtRub(result.recommendedPriceRub)} (breakeven × 1.15)`);
      L.push(`  ⚠️ Откат к текущей цене ЗАПРЕЩЁН — она ниже точки безубыточности`);
    }
    L.push('');
  }

  // Ad orders vs estimated ad buyouts
  if (result.adOrdersCount !== null) {
    L.push('РЕКЛАМА — ЗАКАЗЫ VS ВЫКУПЫ:');
    L.push(`  Рекламные заказы (API):          ${result.adOrdersCount}`);
    if (result.factualBuyoutRate !== null)
      L.push(`  Факт. buyout rate:               ${fmtPct(result.factualBuyoutRate * 100)} (buyouts ÷ orders)`);
    if (result.estimatedAdBuyouts !== null) {
      const est = result.adBuyoutIsEstimated ? ' (ОЦЕНКА = adOrders × factBuyoutRate)' : ' (оценка)';
      L.push(`  Оценочные рекламные выкупы:      ~${result.estimatedAdBuyouts} шт${est}`);
      L.push(`  ⚠️ Прямых рекламных выкупов в API нет — используй только это число, не adOrders`);
    }
    L.push('');
  }

  // Conflicts
  if (result.dataConflicts.length > 0) {
    L.push('⚠️ КОНФЛИКТЫ ДАННЫХ:');
    for (const c of result.dataConflicts) L.push(`  ${c}`);
    L.push('');
  }

  // Diagnostics
  L.push('ДИАГНОСТИКА:');
  for (const d of result.diagnostics) {
    const icon = d.status === 'good' ? '✅' : d.status === 'warn' ? '⚠️' : d.status === 'bad' ? '❌' : '—';
    L.push(`  ${icon} ${d.name}: ${d.value} — ${d.comment}`);
  }
  L.push('');

  // Scenarios
  L.push(`БАЗОВЫЙ P&L: ${result.baseWeeklyProfitRub !== null ? `${fmtRub(result.baseWeeklyProfitRub)}/нед` : 'неизвестен (нет unit-экономики)'}`);
  L.push('СЦЕНАРИИ (delta ₽/нед vs базового P&L):');
  for (const s of result.scenarios) {
    const ev = s.expectedValueRub !== null
      ? (s.actionType === 'doNothing' ? 'delta = 0 (потери продолжаются)'
         : `delta = ${s.expectedValueRub >= 0 ? '+' : ''}${fmtRub(s.expectedValueRub)}/нед`)
      : 'delta = нет данных';
    const conf = s.confidence === 'high' ? 'высокая' : s.confidence === 'medium' ? 'средняя' : 'низкая';
    const flag = s.isActionable ? '' : ' [не является действием]';
    L.push(`  ${s.title}${flag}`);
    L.push(`    ${ev} [уверенность: ${conf}]`);
    L.push(`    Расчёт: ${s.calculation.split('\n').join('\n      ')}`);
    if (s.missingData.length > 0) L.push(`    Не хватает: ${s.missingData.join(', ')}`);
    L.push('');
  }

  // Best action
  if (result.bestAction) {
    const ba = result.bestAction;
    const evStr = ba.expectedValueRub !== null
      ? `, delta = ${ba.expectedValueRub >= 0 ? '+' : ''}${fmtRub(ba.expectedValueRub)}/нед`
      : '';
    L.push(`ЛУЧШЕЕ ДЕЙСТВИЕ: ${ba.title}${evStr}`);
    L.push(`  Рекомендация: ${ba.recommendation}`);
    L.push(`  Уверенность: ${ba.confidence === 'high' ? 'высокая' : 'средняя'} — ${ba.confidenceReason}`);
    L.push('');
  } else {
    L.push('ЛУЧШЕЕ ДЕЙСТВИЕ: не определено — рекомендуется тест');
    L.push('');
  }

  // Risks
  if (result.risks.length > 0) {
    L.push('РИСКИ:');
    for (const r of result.risks) {
      const sev = r.severity === 'critical' ? '🔴' : r.severity === 'high' ? '🟠' : '🟡';
      const loss = r.estimatedLossRubPerWeek !== undefined ? ` (~${fmtRub(r.estimatedLossRubPerWeek)}/нед)` : '';
      L.push(`  ${sev} ${r.description}${loss}`);
    }
    L.push('');
  }

  // Data quality
  const available = result.dataQuality.filter((d) => d.available).map((d) => d.field);
  const missing = result.dataQuality.filter((d) => !d.available);
  L.push(`ДАННЫЕ: ${available.join(', ') || 'нет'}`);
  if (missing.length > 0) {
    L.push('ОТСУТСТВУЮТ:');
    for (const d of missing) L.push(`  — ${d.field}${d.note ? ': ' + d.note.slice(0, 100) : ''}`);
  }

  return L.join('\n');
}
