'use client';

import { useState, useMemo } from 'react';
import {
  ArrowLeft, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown, BarChart2,
} from 'lucide-react';
import { formatRub, getWBImageUrl } from '@/lib/utils';
import type { DashboardData, DashboardProduct } from '@/types';

interface DashboardPanelProps {
  data: DashboardData;
  onBack: () => void;
  onAnalyze: (article: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

type SortKey = 'name' | 'priceSale' | 'totalStock' | 'buyoutPercent' | 'ordersCount' | 'addToCartCount';
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

export function DashboardPanel({ data, onBack, onAnalyze, onRefresh, isRefreshing }: DashboardPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('ordersCount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  return (
    <div className="w-full mt-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
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
          <span className="hidden sm:inline text-xs">обновлено {data.fetchedAt}</span>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 hover:text-slate-300 transition-colors disabled:opacity-40"
            title="Обновить"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Summary chips ── */}
      <div className="flex flex-wrap gap-2.5 mb-5">
        {[
          { label: 'Товаров', value: String(data.products.length) },
          { label: 'Заказов / 7д', value: String(totalOrders) },
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

      {/* ── Table — breaks out to full viewport width ── */}
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
                    <Th label="Выкуп 7д" col="buyoutPercent" {...thProps} />
                    <Th label="Заказы 7д" col="ordersCount" {...thProps} />
                    <Th label="Корзины 7д" col="addToCartCount" {...thProps} />
                    <Th label="Запас" {...thProps} />
                    <th className="px-3 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sorted.map((p) => {
                    const weeklyBuyouts = p.ordersCount > 0 && p.buyoutPercent > 0
                      ? p.ordersCount * (p.buyoutPercent / 100)
                      : 0;
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

                        {/* Buyout % */}
                        <td className="px-3 py-3">
                          <span className={`text-sm ${buyoutClass(p.buyoutPercent)}`}>
                            {p.buyoutPercent > 0 ? `${p.buyoutPercent.toFixed(1)}%` : '—'}
                          </span>
                        </td>

                        {/* Orders */}
                        <td className="px-3 py-3">
                          <span className="text-sm text-white tabular-nums">
                            {p.ordersCount > 0 ? p.ordersCount : <span className="text-slate-600">—</span>}
                          </span>
                        </td>

                        {/* Cart */}
                        <td className="px-3 py-3">
                          <span className="text-sm text-slate-400 tabular-nums">
                            {p.addToCartCount > 0 ? p.addToCartCount : <span className="text-slate-600">—</span>}
                          </span>
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
    </div>
  );
}
