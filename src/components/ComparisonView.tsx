'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, X, RefreshCw, AlertCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatRub, getWBImageUrl } from '@/lib/utils';
import type { DashboardProduct, CompetitorEntry, CompetitorStats, ComparisonData } from '@/types';

const LS_KEY = 'wb-comparison-v1';

interface StoredState {
  myNmId: number | null;
  competitors: CompetitorEntry[];
}

interface ComparisonViewProps {
  dashboardProducts: DashboardProduct[];
  onBack: () => void;
}

// ── Утилиты ─────────────────────────────────────────────────────────────────

function loadFromLS(): StoredState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as StoredState;
  } catch { /* ignore */ }
  return { myNmId: null, competitors: [] };
}

function saveToLS(state: StoredState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function deltaClass(myVal: number, theirVal: number, higherIsBetter = true) {
  if (!myVal || !theirVal) return 'text-slate-500';
  const better = higherIsBetter ? myVal >= theirVal : myVal <= theirVal;
  return better ? 'text-emerald-400' : 'text-rose-400';
}

function Metric({ label, value, best, worst }: { label: string; value: number; best: number; worst: number }) {
  const pct = best > worst && best > 0
    ? Math.max(4, Math.round(((value - worst) / (best - worst)) * 100))
    : 0;
  return (
    <div>
      <div className="text-xs text-slate-500 mb-0.5">{label}</div>
      <div className="flex items-center gap-1.5">
        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-semibold text-white tabular-nums">{value.toLocaleString('ru-RU')}</span>
      </div>
    </div>
  );
}

// ── Карточка товара в сравнении ───────────────────────────────────────────────
function ProductCard({
  product, isMe, maxSales, minSales, maxRevenue,
}: {
  product: CompetitorStats;
  isMe: boolean;
  maxSales: number; minSales: number; maxRevenue: number;
}) {
  const nmStr = String(product.nmId);

  return (
    <div className={`relative flex flex-col rounded-2xl border p-4 backdrop-blur transition-all ${
      isMe
        ? 'border-blue-500/40 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.08)]'
        : 'border-slate-700/60 bg-slate-900/60'
    }`}>
      {isMe && (
        <span className="absolute -top-2.5 left-4 text-[10px] font-semibold tracking-wider text-blue-400 bg-slate-950 px-2">
          МОЙ ТОВАР
        </span>
      )}

      {/* Фото + название */}
      <div className="flex items-start gap-3 mb-4">
        <img
          src={product.photoUrl || getWBImageUrl(nmStr)}
          alt=""
          className="h-16 w-16 rounded-xl object-cover bg-slate-800 shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white truncate" title={product.name}>
            {product.name || `Артикул ${product.nmId}`}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{product.brand}</div>
          <div className="text-xs font-mono text-slate-600 mt-1">{nmStr}</div>
        </div>
      </div>

      {/* Ошибка */}
      {product.dataError && (
        <div className="text-xs text-rose-400/80 mb-3 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {product.dataError}
        </div>
      )}

      {/* Цена */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-xl font-bold text-white">{formatRub(product.priceSale)}</span>
        {product.discount > 0 && (
          <>
            <span className="text-sm text-slate-600 line-through">{formatRub(product.price)}</span>
            <span className="text-xs font-semibold text-rose-400">−{product.discount}%</span>
          </>
        )}
      </div>

      {/* Метрики */}
      <div className="space-y-3">
        <Metric label="Продажи 7 дн (оценка)" value={product.sales7d} best={maxSales} worst={minSales} />
        <Metric label="Выручка 7 дн (оценка)" value={product.revenue7d} best={maxRevenue} worst={0} />
        <div>
          <div className="text-xs text-slate-500 mb-0.5">Остатки</div>
          <span className={`text-sm font-semibold tabular-nums ${
            product.stockTotal === 0 ? 'text-rose-400' : product.stockTotal < 50 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {product.stockTotal.toLocaleString('ru-RU')} шт
          </span>
        </div>
        {product.rating > 0 && (
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Рейтинг / Отзывы</div>
            <span className="text-sm text-white">
              ★ {product.rating.toFixed(1)}
              {product.reviewCount > 0 && (
                <span className="text-slate-500 ml-1.5">{product.reviewCount.toLocaleString('ru-RU')} отз.</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Таблица сравнения (компактный режим для многих конкурентов) ───────────────
function ComparisonTable({ products, myNmId }: { products: CompetitorStats[]; myNmId: number }) {
  const maxSales = Math.max(...products.map(p => p.sales7d), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead className="border-b border-slate-700/60 bg-slate-800/40">
          <tr>
            <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Товар</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Цена</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Продажи 7 дн</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Выручка 7 дн</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Остатки</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-medium text-slate-500">Рейтинг</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {products.map((p) => {
            const isMe = p.nmId === myNmId;
            const barWidth = maxSales > 0 ? Math.max(4, Math.round((p.sales7d / maxSales) * 100)) : 0;
            return (
              <tr key={p.nmId} className={`hover:bg-slate-800/25 transition-colors ${isMe ? 'bg-blue-500/5' : ''}`}>
                {/* Товар */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={p.photoUrl || getWBImageUrl(String(p.nmId))}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover bg-slate-800 shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-white font-medium truncate max-w-[180px]">
                          {p.name || `Артикул ${p.nmId}`}
                        </span>
                        {isMe && (
                          <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded shrink-0">
                            Мой
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{p.brand} · {p.nmId}</div>
                    </div>
                  </div>
                </td>

                {/* Цена */}
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="text-sm font-semibold text-white">{formatRub(p.priceSale)}</span>
                  {p.discount > 0 && (
                    <span className="ml-1.5 text-xs text-rose-400">−{p.discount}%</span>
                  )}
                </td>

                {/* Продажи */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${isMe ? 'bg-blue-500' : 'bg-slate-600'}`}
                        style={{ width: `${barWidth}%` }} />
                    </div>
                    <span className={`text-sm tabular-nums font-semibold ${deltaClass(
                      products.find(x => x.nmId === myNmId)?.sales7d ?? 0, p.sales7d
                    )}`}>
                      {p.sales7d > 0 ? p.sales7d.toLocaleString('ru-RU') : '—'}
                    </span>
                  </div>
                </td>

                {/* Выручка */}
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="text-sm text-slate-300">
                    {p.revenue7d > 0 ? formatRub(p.revenue7d) : '—'}
                  </span>
                </td>

                {/* Остатки */}
                <td className="px-3 py-3">
                  <span className={`text-sm font-medium tabular-nums ${
                    p.stockTotal === 0 ? 'text-rose-400' : p.stockTotal < 50 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {p.stockTotal > 0 ? `${p.stockTotal.toLocaleString('ru-RU')} шт` : '—'}
                  </span>
                </td>

                {/* Рейтинг */}
                <td className="px-3 py-3">
                  {p.rating > 0 ? (
                    <span className="text-sm text-slate-300">
                      ★ {p.rating.toFixed(1)}
                      {p.reviewCount > 0 && (
                        <span className="text-slate-600 ml-1">/{p.reviewCount.toLocaleString('ru-RU')}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Основной компонент ────────────────────────────────────────────────────────
export function ComparisonView({ dashboardProducts, onBack }: ComparisonViewProps) {
  const [myNmId, setMyNmId] = useState<number | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);
  const [newNmId, setNewNmId] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ComparisonData | null>(null);
  const [error, setError] = useState('');

  // Загружаем сохранённое состояние
  useEffect(() => {
    const saved = loadFromLS();
    if (saved.myNmId) setMyNmId(saved.myNmId);
    if (saved.competitors.length) setCompetitors(saved.competitors);
  }, []);

  // Сохраняем при изменении
  useEffect(() => {
    saveToLS({ myNmId, competitors });
  }, [myNmId, competitors]);

  const addCompetitor = useCallback(() => {
    const id = parseInt(newNmId.trim(), 10);
    if (!id || isNaN(id)) return;
    if (competitors.some(c => c.nmId === id)) return; // дубликат
    setCompetitors(prev => [...prev, { nmId: id }]);
    setNewNmId('');
  }, [newNmId, competitors]);

  const removeCompetitor = useCallback((nmId: number) => {
    setCompetitors(prev => prev.filter(c => c.nmId !== nmId));
  }, []);

  const runComparison = useCallback(async () => {
    if (!myNmId) return;
    setPhase('loading');
    setError('');

    const allNmIds = [myNmId, ...competitors.map(c => c.nmId)];

    try {
      const res = await fetch('/api/competitor/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nmIds: allNmIds, myNmId }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      setResult(json as ComparisonData);
      setPhase('done');
    } catch (err) {
      setError(String(err));
      setPhase('error');
    }
  }, [myNmId, competitors]);

  const canRun = myNmId && competitors.length > 0;
  const useCards = (result?.products.length ?? 0) <= 4;

  const maxSales  = result ? Math.max(...result.products.map(p => p.sales7d), 1) : 1;
  const minSales  = result ? Math.min(...result.products.map(p => p.sales7d), 0) : 0;
  const maxRevenue = result ? Math.max(...result.products.map(p => p.revenue7d), 1) : 1;

  return (
    <div className="w-full mt-6">

      {/* ── Хедер ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-400" />
          <span className="font-semibold text-white">Сравнение с конкурентами</span>
        </div>
        {result && (
          <span className="text-xs text-slate-500 ml-auto">
            {result.period.from} — {result.period.to} · обновлено {result.fetchedAt}
          </span>
        )}
      </div>

      {/* ── Настройка ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

        {/* Мой товар */}
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 backdrop-blur">
          <div className="text-sm font-medium text-slate-300 mb-3">Мой товар</div>

          {dashboardProducts.length > 0 ? (
            <select
              value={myNmId ?? ''}
              onChange={e => setMyNmId(Number(e.target.value) || null)}
              className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
            >
              <option value="">— Выберите товар —</option>
              {dashboardProducts.map(p => (
                <option key={p.article} value={p.article}>
                  {p.name || p.article} — {p.article}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="nmID вашего товара"
                value={myNmId ? String(myNmId) : ''}
                onChange={e => setMyNmId(parseInt(e.target.value.replace(/\D/g, ''), 10) || null)}
                className="bg-slate-800/60 border-slate-700/60 rounded-xl"
              />
            </div>
          )}

          {myNmId && (
            <div className="mt-2 text-xs text-slate-500">nmID: {myNmId}</div>
          )}
        </div>

        {/* Конкуренты */}
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4 backdrop-blur">
          <div className="text-sm font-medium text-slate-300 mb-3">
            Конкуренты
            {competitors.length > 0 && (
              <span className="ml-2 text-xs text-slate-500">({competitors.length})</span>
            )}
          </div>

          {/* Список добавленных */}
          {competitors.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {competitors.map(c => (
                <div key={c.nmId} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-slate-300 flex-1">{c.nmId}</span>
                  <button
                    onClick={() => removeCompetitor(c.nmId)}
                    className="text-slate-700 hover:text-rose-400 transition-colors shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Форма добавления */}
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Артикул конкурента"
              value={newNmId}
              onChange={e => setNewNmId(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && addCompetitor()}
              className="bg-slate-800/60 border-slate-700/60 rounded-xl text-sm flex-1 h-9"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addCompetitor}
              disabled={!newNmId}
              className="h-9 w-9 p-0 border-slate-700 shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Кнопка запуска ── */}
      <div className="flex items-center gap-3 mb-8">
        <Button
          onClick={runComparison}
          disabled={!canRun || phase === 'loading'}
          className="h-11 px-6 font-semibold rounded-xl"
        >
          {phase === 'loading' ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Загружаю данные...
            </>
          ) : 'Запустить сравнение'}
        </Button>
        {result && (
          <button
            onClick={runComparison}
            disabled={phase === 'loading'}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </button>
        )}
        {!canRun && phase === 'idle' && (
          <span className="text-xs text-slate-600">
            {!myNmId ? 'Выберите свой товар' : 'Добавьте хотя бы одного конкурента'}
          </span>
        )}
      </div>

      {/* ── Ошибка ── */}
      {phase === 'error' && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400 mb-6">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Результаты ── */}
      {result && phase === 'done' && (
        <>
          {useCards ? (
            /* Карточный режим для ≤4 товаров */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {result.products.map(p => (
                <ProductCard
                  key={p.nmId}
                  product={p}
                  isMe={p.nmId === myNmId!}
                  maxSales={maxSales}
                  minSales={minSales}
                  maxRevenue={maxRevenue}
                />
              ))}
            </div>
          ) : (
            /* Табличный режим для >4 товаров */
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden backdrop-blur">
              <ComparisonTable products={result.products} myNmId={myNmId!} />
            </div>
          )}

          {/* Итоговая аналитика */}
          {result.products.length > 1 && (() => {
            const me = result.products.find(p => p.nmId === myNmId);
            if (!me) return null;
            const competitors = result.products.filter(p => p.nmId !== myNmId);
            const avgCompSales = competitors.length > 0
              ? competitors.reduce((s, p) => s + p.sales7d, 0) / competitors.length : 0;
            const avgCompPrice = competitors.length > 0
              ? competitors.reduce((s, p) => s + p.priceSale, 0) / competitors.length : 0;

            return (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    label: 'Продажи 7 дн vs конкуренты (среднее)',
                    mine: me.sales7d,
                    avg: avgCompSales,
                    fmt: (v: number) => v.toLocaleString('ru-RU'),
                    higherBetter: true,
                  },
                  {
                    label: 'Моя цена vs конкуренты (среднее)',
                    mine: me.priceSale,
                    avg: avgCompPrice,
                    fmt: formatRub,
                    higherBetter: false,
                  },
                ].map(({ label, mine, avg, fmt, higherBetter }) => {
                  const diff = avg > 0 ? ((mine - avg) / avg) * 100 : 0;
                  const positive = higherBetter ? diff >= 0 : diff <= 0;
                  return (
                    <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
                      <div className="text-xs text-slate-500 mb-1">{label}</div>
                      <div className="text-base font-semibold text-white">{fmt(mine)}</div>
                      <div className={`text-xs font-medium mt-0.5 ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs ср. конкурентов ({fmt(Math.round(avg))})
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-3">
                  <div className="text-xs text-slate-500 mb-1">Лидер по продажам</div>
                  {(() => {
                    const leader = [...result.products].sort((a, b) => b.sales7d - a.sales7d)[0];
                    return (
                      <>
                        <div className="text-sm font-semibold text-white truncate">
                          {leader.nmId === myNmId ? '🏆 Мой товар' : leader.name || `Арт. ${leader.nmId}`}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {leader.sales7d.toLocaleString('ru-RU')} продаж · {formatRub(leader.priceSale)}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
