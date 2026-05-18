'use client';

import { useState } from 'react';
import { TrendingUp, Search, Loader2 } from 'lucide-react';

interface SeasonalityResult {
  articul: string;
  keyword: string;
  productName: string;
  category: string;
  seasonality: Record<string, number>;
}

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function coeffColor(c: number) {
  if (c >= 1.2)  return { bar: 'bg-emerald-500', text: 'text-emerald-400' };
  if (c >= 1.05) return { bar: 'bg-blue-500',    text: 'text-blue-400' };
  if (c >= 0.9)  return { bar: 'bg-slate-500',   text: 'text-slate-400' };
  if (c >= 0.75) return { bar: 'bg-amber-500',   text: 'text-amber-400' };
  return             { bar: 'bg-red-500',     text: 'text-red-400' };
}

function coeffLabel(c: number) {
  if (c >= 1.2)  return 'Высокий сезон';
  if (c >= 1.05) return 'Выше нормы';
  if (c >= 0.9)  return 'Норма';
  if (c >= 0.75) return 'Ниже нормы';
  return 'Низкий сезон';
}

export function SeasonalityWidget() {
  const [article, setArticle] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeasonalityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentMonth = new Date().getMonth() + 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!article.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/seasonality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article: article.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const chartData = result
    ? Array.from({ length: 12 }, (_, i) => ({
        label: MONTHS[i],
        num: i + 1,
        coeff: result.seasonality[String(i + 1)] ?? null,
      }))
    : [];

  const maxCoeff = chartData.length > 0
    ? Math.max(...chartData.map((d) => d.coeff ?? 0), 1.0)
    : 1.0;

  const currentCoeff = result?.seasonality[String(currentMonth)] ?? null;

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/60">
        <TrendingUp className="h-4 w-4 text-blue-400 shrink-0" />
        <span className="font-semibold text-slate-200 text-sm">Коэффициент сезонности</span>
        <span className="ml-auto text-xs text-slate-600 hidden sm:block">Mpstats · частота ключевых запросов</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Form */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={article}
            onChange={(e) => setArticle(e.target.value.replace(/\D/g, ''))}
            placeholder="Артикул WB (например 12345678)"
            className="flex-1 rounded-xl border border-slate-700/60 bg-slate-800/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !article.trim()}
            className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-white transition-colors shrink-0"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Search className="h-4 w-4" />
            }
            {loading ? 'Считаю…' : 'Рассчитать'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-800/40 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-3">
            {/* Product info */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-800/30 px-4 py-3">
              <div className="text-xs text-slate-500 mb-0.5">Товар</div>
              <div className="text-sm text-slate-200 font-medium leading-snug">
                {result.productName || result.keyword}
              </div>
              {result.category && (
                <div className="text-xs text-slate-500 mt-0.5">{result.category}</div>
              )}
              <div className="text-xs text-slate-700 mt-1">Ключевое слово: «{result.keyword}»</div>
            </div>

            {/* Current month highlight */}
            {currentCoeff !== null && (() => {
              const { text } = coeffColor(currentCoeff);
              return (
                <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-4 py-3 flex items-center gap-4">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">
                      Сейчас — {MONTHS[currentMonth - 1]}
                    </div>
                    <div className={`text-3xl font-bold tabular-nums ${text}`}>
                      ×{currentCoeff}
                    </div>
                  </div>
                  <div className={`ml-auto text-sm font-medium ${text}`}>
                    {coeffLabel(currentCoeff)}
                  </div>
                </div>
              );
            })()}

            {/* Bar chart */}
            <div className="rounded-xl border border-slate-800/60 bg-slate-800/20 p-4">
              <div className="text-xs text-slate-500 mb-3 font-medium">Все 12 месяцев</div>
              <div className="flex items-end gap-1" style={{ height: '96px' }}>
                {chartData.map(({ label, num, coeff }) => {
                  if (coeff === null) {
                    return (
                      <div key={label} className="flex-1 flex flex-col items-center gap-1">
                        <div className="flex-1" />
                        <div className="w-full bg-slate-800/60 rounded-sm" style={{ height: '4px' }} />
                        <div className="text-[10px] text-slate-700">{label}</div>
                      </div>
                    );
                  }
                  const { bar, text } = coeffColor(coeff);
                  const barH = Math.max(4, Math.round((coeff / maxCoeff) * 64));
                  const isCurrent = num === currentMonth;
                  return (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                      <div className={`text-[9px] font-semibold tabular-nums ${text}`}>
                        {coeff}
                      </div>
                      <div className="w-full flex items-end" style={{ height: '64px' }}>
                        <div
                          className={`w-full rounded-sm ${bar} ${isCurrent ? 'ring-1 ring-white/40' : 'opacity-80'}`}
                          style={{ height: `${barH}px` }}
                        />
                      </div>
                      <div className={`text-[10px] ${isCurrent ? 'text-white font-semibold' : 'text-slate-600'}`}>
                        {label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] text-slate-500 px-1">
              {[
                { bar: 'bg-emerald-500', label: '≥1.2 — высокий сезон' },
                { bar: 'bg-blue-500',    label: '1.05–1.2 — выше нормы' },
                { bar: 'bg-slate-500',   label: '0.9–1.05 — норма' },
                { bar: 'bg-amber-500',   label: '0.75–0.9 — ниже нормы' },
                { bar: 'bg-red-500',     label: '<0.75 — низкий сезон' },
              ].map(({ bar, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-sm inline-block ${bar}`} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
