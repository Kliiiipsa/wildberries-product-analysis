'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown, BarChart2,
  Megaphone, AlertCircle, Loader2,
} from 'lucide-react';
import { formatRub, getWBImageUrl } from '@/lib/utils';
import { AdsDashboardPanel } from '@/components/AdsDashboardPanel';
import type { DashboardData, DashboardProduct, DashboardAdsResult } from '@/types';

interface DashboardPanelProps {
  data: DashboardData;
  onBack: () => void;
  onAnalyze: (article: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

type SortKey = 'name' | 'priceSale' | 'totalStock' | 'buyoutPercent' | 'ordersCount';
type SortDir = 'asc' | 'desc';

function stockBadge(stock: number) {
  if (stock === 0) return 'text-slate-600 bg-slate-800/60 border-slate-700/40';
  if (stock < 50) return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  if (stock < 200) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
}

function buyoutClass(pct: number) {
  if (pct === 0) return 'text-slate-600';
  if (pct < 45) return 'text-rose-400 font-semibold';
  if (pct < 68) return 'text-amber-400 font-semibold';
  return 'text-emerald-400 font-semibold';
}

function stockWeeksClass(weeks: number) {
  if (weeks < 3) return 'text-rose-400';
  if (weeks < 6) return 'text-amber-400';
  return 'text-slate-400';
}

function formatPeriodTime(isoDatetime: string) {
  // "2026-05-19 15:00:00" → "15:00"
  const timePart = isoDatetime.split(' ')[1];
  return timePart ? timePart.substring(0, 5) : '';
}

function SortIcon({ col, active, dir }: { col: SortKey; active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-slate-700 ml-0.5 shrink-0" />;
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-blue-400 ml-0.5 shrink-0" />
    : <ChevronDown className="h-3 w-3 text-blue-400 ml-0.5 shrink-0" />;
}

function Th({
  label, col, sortKey, sortDir, onSort,
}: {
  label: string;
  col?: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap select-none ${col ? 'cursor-pointer hover:text-slate-300 transition-colors' : ''}`}
      onClick={() => col && onSort(col)}
    >
      <span className="flex items-center">
        {label}
        {col && <SortIcon col={col} active={sortKey === col} dir={sortDir} />}
      </span>
    </th>
  );
}

type Tab = 'products' | 'ads';
type AdsPhase = 'idle' | 'loading' | 'loaded' | 'error';

export function DashboardPanel({ data, onBack, onAnalyze, onRefresh, isRefreshing }: DashboardPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('ordersCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ── Вкладки ──
  const [tab, setTab] = useState<Tab>('products');
  const [adsPhase, setAdsPhase] = useState<AdsPhase>('idle');
  const [adsData, setAdsData] = useState<DashboardAdsResult | null>(null);
  const [adsError, setAdsError] = useState('');
  const [adsProgress, setAdsProgress] = useState(0);
  const [adsStep, setAdsStep] = useState('');

  const loadAds = useCallback(async (force = false) => {
    if (adsData && !force) return;
    setAdsPhase('loading');
    setAdsProgress(0);
    setAdsStep('');
    setAdsError('');

    try {
      const nmIds = data.products.map(p => Number(p.article));
      const res = await fetch('/api/dashboard/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nmIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'progress') {
              setAdsProgress(event.percent);
              setAdsStep(event.step);
            } else if (event.type === 'done') {
              setAdsProgress(100);
              setAdsData(event.data as DashboardAdsResult);
              setAdsPhase('loaded');
            } else if (event.type === 'error') {
              setAdsError(event.error);
              setAdsPhase('error');
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setAdsError(String(err));
      setAdsPhase('error');
    }
  }, [data.products, adsData]);

  const handleTabAds = () => {
    setTab('ads');
    if (adsPhase === 'idle') loadAds();
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    return [...data.products].sort((a, b) => {
      const av = a[sortKey as keyof DashboardProduct] as number | string;
      const bv = b[sortKey as keyof DashboardProduct] as number | string;
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string, 'ru') : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data.products, sortKey, sortDir]);

  const totalOrders = data.products.reduce((s, p) => s + p.ordersCount, 0);
  const totalStock = data.products.reduce((s, p) => s + p.totalStock, 0);
  const activeBuyout = data.products.filter((p) => p.buyoutPercent > 0);
  const avgBuyout = activeBuyout.length
    ? activeBuyout.reduce((s, p) => s + p.buyoutPercent, 0) / activeBuyout.length
    : 0;

  const thProps = { sortKey, sortDir, onSort: handleSort };

  const endTime = formatPeriodTime(data.periodTo);
  const periodLabel = endTime ? `сегодня 00:00–${endTime} МСК` : 'сегодня';

  return (
    <div className="w-full mt-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Анализ артикула
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-400" />
          <span className="font-semibold text-white">Дашборд менеджера</span>
          <span className="text-slate-500 text-sm">— {data.sellerLabel}</span>
        </div>
        <div className="flex items-center gap-4 ml-auto text-sm text-slate-500">
          <span className="hidden sm:inline text-xs">{periodLabel} · обновлено {data.fetchedAt}</span>
          <button
            onClick={tab === 'products' ? onRefresh : () => loadAds(true)}
            disabled={isRefreshing || adsPhase === 'loading'}
            className="flex items-center gap-1.5 hover:text-slate-300 transition-colors disabled:opacity-40"
            title="Обновить"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${(isRefreshing || adsPhase === 'loading') ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Вкладки ── */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-slate-800/40 border border-slate-700/40 w-fit">
        <button
          onClick={() => setTab('products')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'products'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Товары
        </button>
        <button
          onClick={handleTabAds}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'ads'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Megaphone className="h-3.5 w-3.5" />
          Реклама
          {adsPhase === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
        </button>
      </div>

      {/* ── Summary chips — только для товаров ── */}
      <div className={`flex flex-wrap gap-2.5 mb-5 ${tab !== 'products' ? 'hidden' : ''}`}>
        {[
          { label: 'Товаров', value: String(data.products.length) },
          { label: 'Заказов сегодня', value: String(totalOrders) },
          { label: 'Остаток', value: `${totalStock.toLocaleString('ru-RU')} шт` },
          { label: 'Ср. выкуп', value: avgBuyout > 0 ? `${avgBuyout.toFixed(1)}%` : '—' },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 px-3.5 py-2 text-sm backdrop-blur"
          >
            <span className="text-slate-500">{label}:</span>
            <span className="font-semibold text-white">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Реклама таб ── */}
      {tab === 'ads' && (
        <>
          {adsPhase === 'loading' && (
            <div className="w-full max-w-sm mx-auto mt-16">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-slate-300 truncate pr-3">{adsStep || 'Загружаю данные...'}</span>
                <span className="text-xs font-mono text-blue-400 shrink-0">{adsProgress}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
                  style={{ width: `${adsProgress}%` }}
                />
              </div>
            </div>
          )}

          {adsPhase === 'error' && (
            <div className="w-full max-w-lg mx-auto mt-10">
              <div className="flex items-start gap-2.5 rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400 mb-4">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{adsError}</span>
              </div>
              <button
                onClick={() => loadAds(true)}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                Повторить
              </button>
            </div>
          )}

          {adsPhase === 'loaded' && adsData && (
            <AdsDashboardPanel
              products={data.products}
              adsResult={adsData}
              onAnalyze={onAnalyze}
            />
          )}
        </>
      )}

      {/* ── Таблица товаров ── */}
      {tab === 'products' && (
      <div style={{ width: '100vw', position: 'relative', left: '50%', transform: 'translateX(-50%)' }}>
        <div className="px-3 sm:px-6">
          <div className="max-w-screen-2xl mx-auto rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden backdrop-blur">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px]">
                <thead className="border-b border-slate-700/60 bg-slate-800/40">
                  <tr>
                    <Th label="Товар" {...thProps} />
                    <Th label="Артикул" {...thProps} />
                    <Th label="Цена" col="priceSale" {...thProps} />
                    <Th label="Остаток" col="totalStock" {...thProps} />
                    <Th label="Выкуп 30 дн" col="buyoutPercent" {...thProps} />
                    <Th label="Заказы сегодня" col="ordersCount" {...thProps} />
                    <Th label="Запас" {...thProps} />
                    <th className="px-3 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sorted.map((p) => {
                    // Запас: дневные выкупы → недельный темп (×7)
                    const dailyBuyouts = p.ordersCount > 0 && p.buyoutPercent > 0
                      ? p.ordersCount * (p.buyoutPercent / 100)
                      : 0;
                    const weeklyBuyouts = dailyBuyouts * 7;
                    const stockWeeks = weeklyBuyouts > 0 ? Math.round(p.totalStock / weeklyBuyouts) : null;

                    return (
                      <tr key={p.article} className="hover:bg-slate-800/25 transition-colors group">
                        {/* Product */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={p.photoUrl || getWBImageUrl(p.article)}
                              alt=""
                              className="h-10 w-10 rounded-lg object-cover bg-slate-800 shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="min-w-0">
                              <div
                                className="text-sm text-white font-medium truncate max-w-[220px] group-hover:text-blue-300 transition-colors"
                                title={p.name}
                              >
                                {p.name || '—'}
                              </div>
                              <div className="text-xs text-slate-500 truncate max-w-[220px]">{p.brand}</div>
                            </div>
                          </div>
                        </td>

                        {/* Article */}
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono text-slate-400">{p.article}</span>
                        </td>

                        {/* Price */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="text-sm font-semibold text-white">{formatRub(p.priceSale)}</span>
                          {p.salePercent > 0 && (
                            <span className="ml-1.5 text-xs font-medium text-rose-400">−{p.salePercent}%</span>
                          )}
                        </td>

                        {/* Stock */}
                        <td className="px-3 py-3">
                          <span className={`inline-flex text-xs font-medium px-1.5 py-0.5 rounded border ${stockBadge(p.totalStock)}`}>
                            {p.totalStock.toLocaleString('ru-RU')} шт
                          </span>
                        </td>

                        {/* Конверсия корзина→заказ */}
                        <td className="px-3 py-3">
                          <div>
                            <div className={`text-sm ${buyoutClass(p.buyoutPercent)}`}>
                              {p.buyoutPercent > 0 ? `${p.buyoutPercent.toFixed(1)}%` : '—'}
                            </div>
                            {p.hasYesterdayData && (
                              <div className="text-xs text-slate-600 mt-0.5">
                                {p.buyoutPercentYesterday > 0 ? `${p.buyoutPercentYesterday.toFixed(1)}% вчера` : '— вчера'}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Orders */}
                        <td className="px-3 py-3">
                          <div className="tabular-nums">
                            <div className="text-sm text-white">
                              {p.ordersCount > 0 ? p.ordersCount : <span className="text-slate-600">—</span>}
                            </div>
                            {p.hasYesterdayData && (
                              <div className="text-xs text-slate-600 mt-0.5">
                                {p.ordersYesterday > 0 ? `${p.ordersYesterday} вчера` : '— вчера'}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Stock weeks */}
                        <td className="px-3 py-3">
                          {stockWeeks !== null ? (
                            <span className={`text-xs font-medium ${stockWeeksClass(stockWeeks)}`}>
                              ~{stockWeeks} нед
                            </span>
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>

                        {/* Analyze button */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => onAnalyze(p.article)}
                            className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-400 transition-colors whitespace-nowrap group-hover:text-slate-400"
                          >
                            <BarChart2 className="h-3.5 w-3.5 shrink-0" />
                            Анализ
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sorted.length === 0 && (
              <div className="text-center text-slate-600 py-14 text-sm">
                Нет товаров с ярлыком &quot;{data.sellerLabel}&quot;
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
