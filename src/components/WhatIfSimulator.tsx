'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Loader2, Bot, TrendingUp, TrendingDown, Minus,
  Search, AlertCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { WhatIfBaseData, WhatIfParams, WhatIfForecast } from '@/types';

// ─── Константы модели ────────────────────────────────────────────────────────

const PRICE_ELASTICITY = -1.5; // 1% снижения цены → +1.5% заказов

const AD_DEFAULT_CPC: Record<string, number> = { ARK: 35, CPC: 25, PRK: 12 };
const AD_CONVERSION:  Record<string, number> = { ARK: 0.055, CPC: 0.065, PRK: 0.030 };

// ─── Расчётная модель ────────────────────────────────────────────────────────

function calcForecast(base: WhatIfBaseData, params: WhatIfParams, days: number): WhatIfForecast {
  // Влияние цены (эластичность)
  const priceRatio = base.priceSale > 0 ? (params.newPrice - base.priceSale) / base.priceSale : 0;
  const priceMult  = Math.max(0.2, Math.min(4.0, 1 + PRICE_ELASTICITY * priceRatio));

  // Рекламные заказы
  const effectiveCpc = params.cpcBid > 0 ? params.cpcBid : (AD_DEFAULT_CPC[params.adType] ?? 30);
  const adClicks     = params.dailyAdBudget > 0 ? params.dailyAdBudget / effectiveCpc : 0;
  const adOrdersDay  = adClicks * (AD_CONVERSION[params.adType] ?? 0.05);

  // Итоговые заказы с ограничением по остатку
  const projectedDay = base.dailySales * priceMult + adOrdersDay;
  const cappedDay    = params.newStock > 0 ? Math.min(projectedDay, params.newStock / days) : projectedDay;

  const orders  = cappedDay * days;
  const buyouts = orders * (base.buyoutRate / 100);
  const revenue = buyouts * params.newPrice;

  // Юнит-стоимость при новой цене
  const uc = base.unitCost;
  const nds         = uc.ndsRub > 0 ? uc.ndsRub : params.newPrice * uc.ndsPercent / 100;
  const ekv         = params.newPrice * uc.ekvairingPercent / 100;
  const hrDays      = Math.min(30, days);
  const unitCostTotal = uc.zakupka + uc.kargo + uc.logistika + uc.komissiyaRub + ekv + nds + uc.hranenie * hrDays;
  const marginPerUnit = params.newPrice - unitCostTotal;

  const adSpend = params.dailyAdBudget * days;
  const marginWithoutAd = buyouts * marginPerUnit;
  const marginWithAd    = marginWithoutAd - adSpend;
  const roi = adSpend > 0 ? Math.round((marginWithAd / adSpend) * 100) : 0;

  return {
    orders:          Math.round(orders),
    buyouts:         Math.round(buyouts),
    revenue:         Math.round(revenue),
    marginPerUnit:   Math.round(marginPerUnit),
    marginWithoutAd: Math.round(marginWithoutAd),
    marginWithAd:    Math.round(marginWithAd),
    adSpend:         Math.round(adSpend),
    roi,
  };
}

// ─── Вспомогательные UI-компоненты ──────────────────────────────────────────

function SliderRow({
  label, value, min, max, step = 1, unit = '',
  format, onChange,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const display = format ? format(value) : `${value.toLocaleString('ru-RU')}${unit}`;
  const pct = max > min ? Math.round(((value - min) / (max - min)) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-white">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500
          [&::-moz-range-thumb]:border-0"
        style={{ background: `linear-gradient(to right, #3b82f6 ${pct}%, #334155 ${pct}%)` }}
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{format ? format(min) : `${min.toLocaleString('ru-RU')}${unit}`}</span>
        <span>{format ? format(max) : `${max.toLocaleString('ru-RU')}${unit}`}</span>
      </div>
    </div>
  );
}

function fmtRub(n: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}

function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-slate-500 flex items-center gap-0.5"><Minus className="h-3 w-3" />0{suffix}</span>;
  const isPos = value > 0;
  return (
    <span className={`flex items-center gap-0.5 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPos ? '+' : ''}{value.toLocaleString('ru-RU')}{suffix}
    </span>
  );
}

function MetricRow({
  label, current, f7, f30, fmt: fmtFn = (v: number) => v.toLocaleString('ru-RU'),
  isRub = false, showDelta = false,
}: {
  label: string;
  current: number | null;
  f7: number;
  f30: number;
  fmt?: (v: number) => string;
  isRub?: boolean;
  showDelta?: boolean;
}) {
  const display = isRub ? fmtRub : fmtFn;
  return (
    <tr className="border-t border-slate-800/60">
      <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">{label}</td>
      <td className="py-2 px-2 text-xs text-slate-300 text-right font-mono">
        {current !== null ? display(current) : '—'}
      </td>
      <td className="py-2 px-2 text-xs text-right font-mono">
        {showDelta && current !== null
          ? <Delta value={f7 - current} suffix={isRub ? ' ₽' : ''} />
          : <span className="text-white">{display(f7)}</span>}
      </td>
      <td className="py-2 pl-2 text-xs text-right font-mono">
        {showDelta && current !== null
          ? <Delta value={f30 - current} suffix={isRub ? ' ₽' : ''} />
          : <span className="text-white">{display(f30)}</span>}
      </td>
    </tr>
  );
}

// ─── Главный компонент ───────────────────────────────────────────────────────

interface Props {
  initialNmId?: string;
  onBack: () => void;
}

export function WhatIfSimulator({ initialNmId, onBack }: Props) {
  const [articleInput, setArticleInput] = useState(initialNmId ?? '');
  const [loadPhase, setLoadPhase]       = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [loadError, setLoadError]       = useState('');
  const [base, setBase]                 = useState<WhatIfBaseData | null>(null);

  const [params, setParams] = useState<WhatIfParams>({
    newPrice: 0, dailyAdBudget: 0, cpcBid: 0, adType: 'CPC', newStock: 0,
  });

  const [aiPhase, setAiPhase]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [aiText, setAiText]     = useState('');
  const [aiError, setAiError]   = useState('');

  // Загрузка данных по артикулу
  const loadData = useCallback(async (nmId: string) => {
    setLoadPhase('loading');
    setLoadError('');
    setBase(null);
    setAiText('');
    setAiPhase('idle');
    try {
      const res = await fetch(`/api/what-if/data?nmId=${nmId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const data = json as WhatIfBaseData;
      setBase(data);
      setParams({
        newPrice:       data.priceSale,
        dailyAdBudget:  0,
        cpcBid:         0,
        adType:         'CPC',
        newStock:       data.stock,
      });
      setLoadPhase('loaded');
    } catch (e) {
      setLoadError(String(e));
      setLoadPhase('error');
    }
  }, []);

  // Авто-загрузка если передан initialNmId
  useEffect(() => {
    if (initialNmId && /^\d{6,12}$/.test(initialNmId)) loadData(initialNmId);
  }, [initialNmId, loadData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const t = articleInput.trim();
    if (/^\d{6,12}$/.test(t)) loadData(t);
  };

  // Прогнозы — пересчитываются при любом изменении параметров
  const forecast7d  = useMemo(() => base ? calcForecast(base, params, 7)  : null, [base, params]);
  const forecast30d = useMemo(() => base ? calcForecast(base, params, 30) : null, [base, params]);

  // Текущие значения (при текущей цене без новой рекламы)
  const current7d  = useMemo(() => base ? calcForecast(base, { ...params, newPrice: base.priceSale, dailyAdBudget: 0, newStock: base.stock }, 7) : null, [base, params]);

  // Синхронизация цены ↔ скидки
  const discountFromPrice = base && base.priceBasic > 0
    ? Math.max(0, Math.round((1 - params.newPrice / base.priceBasic) * 100))
    : 0;

  const setPrice    = (v: number) => setParams((p) => ({ ...p, newPrice: v }));
  const setDiscount = (pct: number) => {
    if (!base) return;
    setParams((p) => ({ ...p, newPrice: Math.round(base.priceBasic * (1 - pct / 100)) }));
  };

  // AI-анализ
  const runAi = useCallback(async () => {
    if (!base || !forecast7d || !forecast30d) return;
    setAiPhase('loading');
    setAiText('');
    setAiError('');
    try {
      const res = await fetch('/api/what-if/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base, params, forecast7d, forecast30d }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'token') setAiText((t) => t + ev.content);
            else if (ev.type === 'done') setAiPhase('done');
            else if (ev.type === 'error') { setAiError(ev.error); setAiPhase('error'); }
          } catch { /* skip */ }
        }
      }
      setAiPhase('done');
    } catch (e) {
      setAiError(String(e));
      setAiPhase('error');
    }
  }, [base, params, forecast7d, forecast30d]);

  const priceMin = base ? Math.max(1, Math.round(base.priceBasic * 0.3)) : 100;
  const priceMax = base ? Math.round(base.priceBasic * 1.5) : 10000;

  // ── RENDER: ввод артикула ────────────────────────────────────────────────────
  return (
    <div className="w-full">
      {/* Шапка */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 px-2 text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Назад
        </Button>
        <h2 className="text-sm font-medium text-white">AI Симулятор сценариев</h2>
      </div>

      {/* Поиск артикула */}
      {(loadPhase === 'idle' || loadPhase === 'error') && (
        <div className="max-w-md mx-auto">
          <form onSubmit={handleSearch} className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                type="text" inputMode="numeric" placeholder="Артикул WB, например 770632673"
                value={articleInput}
                onChange={(e) => setArticleInput(e.target.value.replace(/\D/g, ''))}
                className="pl-10 h-11 bg-slate-800/60 border-slate-700/60 placeholder:text-slate-600 rounded-xl"
                autoFocus
              />
            </div>
            <Button type="submit" className="h-11 px-5 rounded-xl shrink-0">Загрузить</Button>
          </form>
          {loadError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{loadError}</span>
            </div>
          )}
        </div>
      )}

      {/* Загрузка */}
      {loadPhase === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
          <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
          <span className="text-sm">Загружаю данные товара...</span>
        </div>
      )}

      {/* Симулятор */}
      {loadPhase === 'loaded' && base && forecast7d && forecast30d && (
        <div className="space-y-5">

          {/* Карточка товара */}
          <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/30 px-4 py-3">
            {base.photoUrl && (
              <img src={base.photoUrl} alt="" className="h-12 w-10 object-cover rounded-lg shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-white truncate">{base.productName || `Арт. ${base.nmId}`}</div>
              <div className="text-xs text-slate-500">{base.brand} · {base.nmId}</div>
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={() => loadData(String(base.nmId))}
              className="ml-auto shrink-0 h-7 w-7 p-0 text-slate-500 hover:text-white"
              title="Обновить данные"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Основная сетка */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Левая колонка — текущие данные */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Текущие данные</div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {[
                  ['Цена со скидкой', fmtRub(base.priceSale)],
                  ['Цена до скидки',  fmtRub(base.priceBasic)],
                  ['Скидка',          `${base.salePercent}%`],
                  ['Остаток',         `${base.stock.toLocaleString('ru-RU')} шт.`],
                  ['Продажи/день',    `~${base.dailySales.toFixed(1)} зак.`],
                  ['% выкупа',        `${base.buyoutRate.toFixed(1)}%`],
                  ...(base.weeklyOrders > 0 ? [
                    ['Заказы 7д (факт)',  base.weeklyOrders.toLocaleString('ru-RU')],
                    ['Выкупы 7д (факт)', base.weeklyBuyouts.toLocaleString('ru-RU')],
                  ] : []),
                  ...(base.conversions.cardToCart > 0 ? [
                    ['Карт.→Корзина', `${base.conversions.cardToCart.toFixed(1)}%`],
                    ['Корзина→Заказ', `${base.conversions.cartToOrder.toFixed(1)}%`],
                  ] : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-slate-500">{k}</span>
                    <span className="text-slate-200 font-mono">{v}</span>
                  </div>
                ))}
              </div>

              {base.unitCost.hasData && (
                <>
                  <div className="border-t border-slate-700/40 pt-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Юнит-экономика</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {[
                        ['Закупка',    base.unitCost.zakupka],
                        ['Карго',      base.unitCost.kargo],
                        ['Логистика',  base.unitCost.logistika],
                        ['Комиссия WB',base.unitCost.komissiyaRub],
                        ['Хранение/д', base.unitCost.hranenie],
                        ['Эквайринг',  `${base.unitCost.ekvairingPercent}%`],
                      ].map(([k, v]) => (
                        <div key={k as string} className="flex justify-between">
                          <span className="text-slate-500">{k}</span>
                          <span className="text-slate-300 font-mono">
                            {typeof v === 'number' ? fmtRub(v) : v}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900/60 px-3 py-2 flex justify-between text-xs">
                    <span className="text-slate-400">Маржа/шт (тек. цена)</span>
                    <span className={`font-mono font-semibold ${current7d && current7d.marginPerUnit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {current7d ? fmtRub(current7d.marginPerUnit) : '—'}
                    </span>
                  </div>
                </>
              )}
              {!base.unitCost.hasData && (
                <div className="text-xs text-slate-600 italic">
                  Юнит-экономика не найдена в Google Sheets — расчёт маржи недоступен
                </div>
              )}
            </div>

            {/* Правая колонка — параметры сценария */}
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Параметры сценария</div>

              <SliderRow
                label="Цена со скидкой" value={params.newPrice}
                min={priceMin} max={priceMax} step={10} unit=" ₽"
                format={(v) => fmtRub(v)}
                onChange={setPrice}
              />

              <SliderRow
                label={`Скидка от цены до скидки (${fmtRub(base.priceBasic)})`}
                value={discountFromPrice}
                min={0} max={90} step={1} unit="%"
                onChange={setDiscount}
              />

              <div className="space-y-2">
                <div className="text-xs text-slate-400">Бюджет рекламы в день</div>
                <div className="flex gap-2">
                  <Input
                    type="number" min={0} step={100} placeholder="0"
                    value={params.dailyAdBudget || ''}
                    onChange={(e) => setParams((p) => ({ ...p, dailyAdBudget: Math.max(0, Number(e.target.value)) }))}
                    className="h-9 text-sm bg-slate-900/60 border-slate-700/60 w-32 font-mono"
                  />
                  <span className="text-xs text-slate-500 self-center">₽/день</span>
                </div>
                <SliderRow
                  label="" value={params.dailyAdBudget}
                  min={0} max={20000} step={100} unit=" ₽"
                  format={(v) => fmtRub(v)}
                  onChange={(v) => setParams((p) => ({ ...p, dailyAdBudget: v }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-xs text-slate-400">Ставка CPC / АРК</div>
                  <div className="flex gap-1.5 items-center">
                    <Input
                      type="number" min={0} step={1} placeholder="авто"
                      value={params.cpcBid || ''}
                      onChange={(e) => setParams((p) => ({ ...p, cpcBid: Math.max(0, Number(e.target.value)) }))}
                      className="h-9 text-sm bg-slate-900/60 border-slate-700/60 font-mono"
                    />
                    <span className="text-xs text-slate-500 shrink-0">₽</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs text-slate-400">Тип рекламы</div>
                  <select
                    value={params.adType}
                    onChange={(e) => setParams((p) => ({ ...p, adType: e.target.value as WhatIfParams['adType'] }))}
                    className="h-9 w-full rounded-lg border border-slate-700/60 bg-slate-900/60 px-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="CPC">Поиск (CPC)</option>
                    <option value="ARK">АРК (авто)</option>
                    <option value="PRK">Каталог (ПРК)</option>
                  </select>
                </div>
              </div>

              <SliderRow
                label="Остаток на складах"
                value={params.newStock}
                min={0} max={Math.max(1000, base.stock * 3)} step={1} unit=" шт."
                onChange={(v) => setParams((p) => ({ ...p, newStock: v }))}
              />
            </div>
          </div>

          {/* Таблица прогноза */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Прогноз изменений</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-500 uppercase">
                    <th className="text-left font-medium pb-2 pr-3">Метрика</th>
                    <th className="text-right font-medium pb-2 px-2">Сейчас (7д)</th>
                    <th className="text-right font-medium pb-2 px-2 text-blue-400">Сценарий 7д</th>
                    <th className="text-right font-medium pb-2 pl-2 text-blue-400">Сценарий 30д</th>
                  </tr>
                </thead>
                <tbody>
                  <MetricRow label="Заказы"  current={current7d?.orders  ?? null} f7={forecast7d.orders}  f30={forecast30d.orders}  />
                  <MetricRow label="Выкупы"  current={current7d?.buyouts ?? null} f7={forecast7d.buyouts} f30={forecast30d.buyouts} />
                  <MetricRow label="Выручка" current={current7d?.revenue ?? null} f7={forecast7d.revenue} f30={forecast30d.revenue} isRub />
                  {base.unitCost.hasData && (
                    <>
                      <MetricRow label="Маржа без рекл." current={current7d?.marginWithoutAd ?? null} f7={forecast7d.marginWithoutAd} f30={forecast30d.marginWithoutAd} isRub showDelta />
                      <MetricRow label="Маржа с рекл."   current={current7d?.marginWithAd    ?? null} f7={forecast7d.marginWithAd}    f30={forecast30d.marginWithAd}    isRub showDelta />
                      <MetricRow label="Расход рекл."    current={0}                                  f7={forecast7d.adSpend}         f30={forecast30d.adSpend}         isRub />
                      <MetricRow
                        label="ROI рекламы"
                        current={null}
                        f7={forecast7d.roi}
                        f30={forecast30d.roi}
                        fmt={(v) => `${v}%`}
                      />
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Пояснение модели */}
            <div className="mt-3 rounded-lg bg-slate-900/50 px-3 py-2 text-[10px] text-slate-600">
              Модель: эластичность цены −1.5 · CPC/конверсия по типу рекламы · ограничение по остатку. Только прогноз, не гарантия.
            </div>
          </div>

          {/* AI-анализ */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="h-3.5 w-3.5 text-blue-400" />
                AI-анализ сценария
              </div>
              <Button
                size="sm"
                onClick={runAi}
                disabled={aiPhase === 'loading'}
                className="h-8 px-3 text-xs rounded-lg"
              >
                {aiPhase === 'loading'
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Анализирую...</>
                  : aiPhase === 'done' || aiText
                  ? <><RefreshCw className="h-3 w-3 mr-1.5" />Пересчитать</>
                  : <>Запросить AI-комментарий</>
                }
              </Button>
            </div>

            {aiPhase === 'idle' && !aiText && (
              <p className="text-xs text-slate-600">
                Нажмите кнопку — AI объяснит изменения, выделит риски и даст конкретные рекомендации по сценарию.
              </p>
            )}

            {(aiText || aiPhase === 'loading') && (
              <div className="prose prose-invert prose-sm max-w-none text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
                {aiText}
                {aiPhase === 'loading' && (
                  <span className="inline-block ml-0.5 animate-pulse text-blue-400">▌</span>
                )}
              </div>
            )}

            {aiPhase === 'error' && (
              <div className="flex items-start gap-2 text-xs text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {aiError}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
