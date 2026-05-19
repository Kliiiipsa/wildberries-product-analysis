'use client';

import { useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import { formatRub, getWBImageUrl } from '@/lib/utils';
import type { DashboardProduct, DashboardAdCampaign, DashboardAdsResult } from '@/types';

interface AdsDashboardPanelProps {
  products: DashboardProduct[];
  adsResult: DashboardAdsResult;
  onAnalyze: (article: string) => void;
}

// ── Статус кампании ──────────────────────────────────────────────────────────
function statusLabel(status: number): { text: string; cls: string } {
  if (status === 9)  return { text: 'Активна',   cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  if (status === 11) return { text: 'Пауза',      cls: 'text-amber-400   bg-amber-500/10   border-amber-500/20'   };
  if (status === 7)  return { text: 'Завершена',  cls: 'text-slate-400   bg-slate-800/60   border-slate-700/40'   };
  if (status === 4)  return { text: 'Готова',     cls: 'text-blue-400    bg-blue-500/10    border-blue-500/20'    };
  return { text: `Статус ${status}`, cls: 'text-slate-500 bg-slate-800/60 border-slate-700/40' };
}

// ── Тип кампании: payment_type + bid_type, fallback на числовой type ─────────
const NUMERIC_TYPE: Record<number, string> = {
  4: 'Каталог', 5: 'Карточка', 6: 'Поиск', 7: 'Главная', 8: 'Авто', 9: 'Поиск+каталог',
};
function typeName(paymentType: string, bidType: string, numericType: number): string {
  if (paymentType === 'cpc') return 'CPC';
  if (paymentType === 'cpm' && bidType === 'unified') return 'CPM единая';
  if (paymentType === 'cpm' && bidType === 'manual') return 'CPM ручная';
  if (paymentType === 'cpm') return 'CPM';
  // Числовой fallback для кампаний без payment_type
  if (numericType && NUMERIC_TYPE[numericType]) return NUMERIC_TYPE[numericType];
  return '—';
}

// ── Мини-воронка ─────────────────────────────────────────────────────────────
const FUNNEL_STEPS = [
  { key: 'views',  label: 'Показы',  color: 'from-indigo-500  to-indigo-600'  },
  { key: 'clicks', label: 'Клики',   color: 'from-purple-500  to-purple-600'  },
  { key: 'atbs',   label: 'Корзины', color: 'from-violet-500  to-violet-600'  },
  { key: 'orders', label: 'Заказы',  color: 'from-fuchsia-500 to-fuchsia-600' },
] as const;

function InlineFunnel({ campaign }: { campaign: DashboardAdCampaign }) {
  const values: Record<string, number> = {
    views: campaign.views,
    clicks: campaign.clicks,
    atbs: campaign.atbs,
    orders: campaign.orders,
  };
  const max = Math.max(...Object.values(values), 1);

  return (
    <div className="space-y-1.5 py-0.5">
      {FUNNEL_STEPS.map(({ key, label, color }) => {
        const val = values[key];
        const pct = Math.max((val / max) * 100, val > 0 ? 3 : 0);
        return (
          <div key={key} className="flex items-center gap-2">
            <div className="w-24 h-2.5 bg-slate-800 rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-300 w-12 text-right shrink-0">
              {val.toLocaleString('ru-RU')}
            </span>
            <span className="text-xs text-slate-600 shrink-0">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── ДРР бейдж ────────────────────────────────────────────────────────────────
function drrClass(drr: number) {
  if (drr === 0) return 'text-slate-600';
  if (drr < 15) return 'text-emerald-400 font-semibold';
  if (drr < 30) return 'text-amber-400 font-semibold';
  return 'text-rose-400 font-semibold';
}

export function AdsDashboardPanel({ products, adsResult, onAnalyze }: AdsDashboardPanelProps) {
  const { ads, accountBalance, fetchedAt } = adsResult;

  // Сортировка: активные первыми → по расходу убыванием → без рекламы в конце
  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      const adA = ads[a.article];
      const adB = ads[b.article];
      if (!adA && adB) return 1;
      if (adA && !adB) return -1;
      if (!adA && !adB) return 0;
      if (adA!.status === 9 && adB!.status !== 9) return -1;
      if (adB!.status === 9 && adA!.status !== 9) return 1;
      return (adB!.sum7d || 0) - (adA!.sum7d || 0);
    });
  }, [products, ads]);

  const withAds = products.filter(p => ads[p.article] !== null).length;
  const totalSpend = Object.values(ads).reduce((s, a) => s + (a?.sum7d ?? 0), 0);
  const activeCount = Object.values(ads).filter(a => a?.status === 9).length;

  return (
    <div className="w-full mt-4">

      {/* ── Summary chips ── */}
      <div className="flex flex-wrap gap-2.5 mb-5">
        {[
          { label: 'С рекламой',    value: `${withAds} из ${products.length}` },
          { label: 'Активных',      value: String(activeCount) },
          { label: 'Расход 7 дн',   value: formatRub(totalSpend) },
          { label: 'Баланс кабинета', value: accountBalance > 0 ? formatRub(accountBalance) : '—' },
          { label: 'Обновлено',     value: fetchedAt },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 px-3.5 py-2 text-sm backdrop-blur">
            <span className="text-slate-500">{label}:</span>
            <span className="font-semibold text-white">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Таблица ── */}
      <div style={{ width: '100vw', position: 'relative', left: '50%', transform: 'translateX(-50%)' }}>
        <div className="px-3 sm:px-6">
          <div className="max-w-screen-2xl mx-auto rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden backdrop-blur">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="border-b border-slate-700/60 bg-slate-800/40">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Товар</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Артикул</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Кампания</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Воронка (7 дн)</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">Расход</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">CTR</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">ДРР</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500 whitespace-nowrap">Остаток бюджета</th>
                    <th className="px-3 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sorted.map((p) => {
                    const ad: DashboardAdCampaign | null = ads[p.article] ?? null;
                    const st = ad ? statusLabel(ad.status) : null;

                    return (
                      <tr key={p.article} className="hover:bg-slate-800/25 transition-colors group">

                        {/* Товар */}
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
                                className="text-sm text-white font-medium truncate max-w-[200px] group-hover:text-blue-300 transition-colors"
                                title={p.name}
                              >
                                {p.name || '—'}
                              </div>
                              <div className="text-xs text-slate-500 truncate max-w-[200px]">{p.brand}</div>
                            </div>
                          </div>
                        </td>

                        {/* Артикул */}
                        <td className="px-3 py-3">
                          <span className="text-xs font-mono text-slate-400">{p.article}</span>
                        </td>

                        {/* Кампания */}
                        <td className="px-3 py-3">
                          {ad ? (
                            <div className="space-y-1.5">
                              <div className="text-xs text-slate-300 max-w-[180px] truncate" title={ad.name}>
                                {ad.name || `Кампания ${ad.advertId}`}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded border ${st!.cls}`}>
                                  {st!.text}
                                </span>
                                <span className="text-[10px] text-slate-600 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/40">
                                  {typeName(ad.paymentType, ad.bidType, ad.numericType)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-700 italic">Рекламная компания не обнаружена</span>
                          )}
                        </td>

                        {/* Воронка */}
                        <td className="px-3 py-3">
                          {ad ? (
                            <InlineFunnel campaign={ad} />
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>

                        {/* Расход */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {ad ? (
                            <div>
                              <div className="text-sm font-semibold text-white">{formatRub(ad.sum7d)}</div>
                              {ad.orders > 0 && (
                                <div className="text-xs text-slate-500 mt-0.5">{ad.orders} заказов</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>

                        {/* CTR */}
                        <td className="px-3 py-3">
                          {ad ? (
                            <span className="text-sm text-slate-300">
                              {ad.ctr > 0 ? `${ad.ctr.toFixed(2)}%` : '—'}
                            </span>
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>

                        {/* ДРР */}
                        <td className="px-3 py-3">
                          {ad ? (
                            <span className={`text-sm ${drrClass(ad.drr)}`}>
                              {ad.drr > 0 ? `${ad.drr.toFixed(1)}%` : '—'}
                            </span>
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>

                        {/* Остаток бюджета */}
                        <td className="px-3 py-3 whitespace-nowrap">
                          {ad ? (
                            <span className={`text-sm ${ad.budgetRemaining > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                              {ad.budgetRemaining > 0 ? formatRub(ad.budgetRemaining) : '—'}
                            </span>
                          ) : (
                            <span className="text-slate-700 text-xs">—</span>
                          )}
                        </td>

                        {/* Анализ */}
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
              <div className="text-center text-slate-600 py-14 text-sm">Нет товаров</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
