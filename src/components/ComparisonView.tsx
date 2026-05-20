'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, X, RefreshCw, AlertCircle, Users, Play } from 'lucide-react';
import { formatRub, getWBImageUrl } from '@/lib/utils';
import type { DashboardProduct, CompetitorStats, ComparisonData } from '@/types';

const LS_KEY = 'wb-comparison-v2';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompGroup {
  id: string;
  myNmId: number | null;
  competitorIds: number[];
  result: ComparisonData | null;
  phase: 'idle' | 'loading' | 'done' | 'error';
  error: string;
}

interface StoredGroup { id: string; myNmId: number | null; competitorIds: number[]; result: ComparisonData | null; }

interface ComparisonViewProps {
  dashboardProducts: DashboardProduct[];
  onBack: () => void;
}

// ── localStorage ──────────────────────────────────────────────────────────────

function loadFromLS(): StoredGroup[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as StoredGroup[];
  } catch { /* ignore */ }
  return [];
}

function saveToLS(groups: CompGroup[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(
      groups.map(g => ({ id: g.id, myNmId: g.myNmId, competitorIds: g.competitorIds, result: g.result }))
    ));
  } catch { /* ignore */ }
}

// ── Relative bar ──────────────────────────────────────────────────────────────

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 5 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Compact product card ──────────────────────────────────────────────────────

function MiniCard({ p, isMe, maxOrders, maxRevenue }: {
  p: CompetitorStats; isMe: boolean; maxOrders: number; maxRevenue: number;
}) {
  return (
    <div className={`flex-shrink-0 w-44 rounded-xl border p-3 flex flex-col gap-2.5 ${
      isMe
        ? 'border-blue-500/40 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.06)]'
        : 'border-slate-700/60 bg-slate-900/60'
    }`}>
      {/* Photo + name */}
      <div className="flex items-start gap-2">
        <img
          src={p.photoUrl || getWBImageUrl(String(p.nmId))}
          alt=""
          className="h-10 w-10 rounded-lg object-cover bg-slate-800 shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="min-w-0 flex-1">
          {isMe && <div className="text-[9px] font-bold tracking-wider text-blue-400 mb-0.5">МОЙ ТОВАР</div>}
          <div className="text-[11px] font-medium text-white leading-tight line-clamp-2" title={p.name}>
            {p.name || `Арт. ${p.nmId}`}
          </div>
          <div className="text-[10px] font-mono text-slate-600 mt-0.5">{p.nmId}</div>
        </div>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold text-white">{p.priceSale > 0 ? formatRub(p.priceSale) : '—'}</span>
        {p.discount > 0 && <span className="text-[10px] font-semibold text-rose-400">−{p.discount}%</span>}
      </div>

      <div className="h-px bg-slate-800" />

      {/* Orders */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-500">Заказы 7 дн</span>
          <span className="text-[11px] font-semibold text-white tabular-nums">
            {p.sales7d > 0 ? p.sales7d.toLocaleString('ru-RU') : '—'}
          </span>
        </div>
        <Bar value={p.sales7d} max={maxOrders} color={isMe ? 'bg-blue-500' : 'bg-slate-600'} />
      </div>

      {/* Revenue */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-500">Сумма 7 дн</span>
          <span className="text-[11px] font-semibold text-white tabular-nums">
            {p.revenue7d > 0 ? formatRub(p.revenue7d) : '—'}
          </span>
        </div>
        <Bar value={p.revenue7d} max={maxRevenue} color={isMe ? 'bg-blue-400' : 'bg-slate-700'} />
      </div>

      <div className="h-px bg-slate-800" />

      {/* Stock + Rating */}
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-[10px] text-slate-500">Остатки</span>
          <span className={`text-[11px] font-medium tabular-nums ${
            p.stockTotal === 0 ? 'text-rose-400' : p.stockTotal < 50 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {p.stockTotal > 0 ? `${p.stockTotal.toLocaleString('ru-RU')} шт` : '—'}
          </span>
        </div>
        {p.rating > 0 && (
          <div className="flex justify-between">
            <span className="text-[10px] text-slate-500">Рейтинг</span>
            <span className="text-[11px] text-slate-300">
              ★{p.rating.toFixed(1)}
              {p.reviewCount > 0 && <span className="text-slate-600 ml-1">{p.reviewCount.toLocaleString('ru-RU')}</span>}
            </span>
          </div>
        )}
      </div>

      {p.dataError && (
        <div className="text-[10px] text-rose-400/70 flex items-center gap-1">
          <AlertCircle className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{p.dataError}</span>
        </div>
      )}
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────

function GroupSection({
  group, dashboardProducts, onSetMyNmId, onAddCompetitor,
  onRemoveCompetitor, onRun, onRemove, canRemove,
}: {
  group: CompGroup;
  dashboardProducts: DashboardProduct[];
  onSetMyNmId: (id: string, nmId: number | null) => void;
  onAddCompetitor: (id: string, nmId: number) => void;
  onRemoveCompetitor: (id: string, nmId: number) => void;
  onRun: (id: string, myNmId: number, competitorIds: number[]) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}) {
  const [inputVal, setInputVal] = useState('');

  const addCompetitor = useCallback(() => {
    const id = parseInt(inputVal.trim(), 10);
    if (!id || group.competitorIds.includes(id)) return;
    onAddCompetitor(group.id, id);
    setInputVal('');
  }, [inputVal, group.id, group.competitorIds, onAddCompetitor]);

  const canRun = (group.myNmId ?? 0) > 0 && group.competitorIds.length > 0;
  const products = group.result?.products ?? [];
  const maxOrders  = Math.max(...products.map(p => p.sales7d), 1);
  const maxRevenue = Math.max(...products.map(p => p.revenue7d), 1);

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/40 backdrop-blur overflow-hidden">

      {/* Setup row */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800/60">

        {/* My product */}
        {dashboardProducts.length > 0 ? (
          <select
            value={group.myNmId ?? ''}
            onChange={e => onSetMyNmId(group.id, Number(e.target.value) || null)}
            className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white max-w-[200px] focus:outline-none focus:border-blue-500/50 cursor-pointer"
          >
            <option value="">— Мой товар —</option>
            {dashboardProducts.map(p => (
              <option key={p.article} value={p.article}>
                {(p.name || p.article).slice(0, 35)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text" inputMode="numeric" placeholder="Мой артикул"
            value={group.myNmId ? String(group.myNmId) : ''}
            onChange={e => onSetMyNmId(group.id, parseInt(e.target.value.replace(/\D/g, ''), 10) || null)}
            className="w-32 bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50"
          />
        )}

        <span className="text-xs text-slate-600 font-medium">vs</span>

        {/* Competitor pills */}
        {group.competitorIds.map(cid => (
          <span key={cid} className="flex items-center gap-1 text-xs font-mono text-slate-300 bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1 shrink-0">
            {cid}
            <button onClick={() => onRemoveCompetitor(group.id, cid)} className="text-slate-600 hover:text-rose-400 transition-colors">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {/* Add competitor */}
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="text" inputMode="numeric"
            placeholder="+ артикул"
            value={inputVal}
            onChange={e => setInputVal(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && addCompetitor()}
            className="w-24 bg-slate-800/60 border border-slate-700/40 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/40"
          />
          {inputVal && (
            <button onClick={addCompetitor} className="text-blue-400 hover:text-blue-300 transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Run */}
        <button
          onClick={() => onRun(group.id, group.myNmId!, group.competitorIds)}
          disabled={!canRun || group.phase === 'loading'}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
            !canRun
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : group.phase === 'loading'
                ? 'bg-blue-700 text-white cursor-wait'
                : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
          }`}
        >
          {group.phase === 'loading'
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : group.phase === 'done'
              ? <RefreshCw className="h-3 w-3" />
              : !canRun
                ? null
                : <Play className="h-3 w-3 fill-current" />
          }
          {group.phase === 'loading'
            ? 'Загрузка...'
            : group.phase === 'done'
              ? 'Обновить'
              : !(group.myNmId ?? 0)
                ? 'Выберите товар'
                : group.competitorIds.length === 0
                  ? 'Добавьте конкурентов'
                  : 'Запустить'}
        </button>

        {/* Remove group */}
        {canRemove && (
          <button onClick={() => onRemove(group.id)} className="ml-auto text-slate-700 hover:text-slate-400 transition-colors" title="Удалить группу">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Error */}
      {group.phase === 'error' && (
        <div className="flex items-start gap-2.5 px-4 py-3 text-sm text-rose-300 bg-rose-900/20 border-b border-rose-800/40">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
          <div>
            <div className="font-medium">Ошибка загрузки</div>
            <div className="text-xs text-rose-400/80 mt-0.5">{group.error}</div>
          </div>
        </div>
      )}

      {/* Results */}
      {group.phase === 'done' && products.length > 0 && (
        <div className="px-4 py-4">
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
            {products.map(p => (
              <MiniCard
                key={p.nmId}
                p={p}
                isMe={p.isMine}
                maxOrders={maxOrders}
                maxRevenue={maxRevenue}
              />
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-slate-700 text-right">
            {group.result!.period.from} — {group.result!.period.to} · {group.result!.fetchedAt}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ComparisonView({ dashboardProducts, onBack }: ComparisonViewProps) {
  const [groups, setGroups]       = useState<CompGroup[]>([]);
  const [initialized, setInit]    = useState(false);

  useEffect(() => {
    const saved = loadFromLS();
    setGroups(
      saved.length > 0
        ? saved.map(g => ({ ...g, result: g.result ?? null, phase: (g.result ? 'done' : 'idle') as CompGroup['phase'], error: '' }))
        : [{ id: '1', myNmId: null, competitorIds: [], result: null, phase: 'idle', error: '' }]
    );
    setInit(true);
  }, []);

  useEffect(() => { if (initialized) saveToLS(groups); }, [groups, initialized]);

  const addGroup = useCallback(() => {
    setGroups(prev => [...prev, {
      id: Date.now().toString(), myNmId: null, competitorIds: [],
      result: null, phase: 'idle', error: '',
    }]);
  }, []);

  const removeGroup      = useCallback((id: string) => setGroups(prev => prev.filter(g => g.id !== id)), []);
  const setMyNmId        = useCallback((id: string, nmId: number | null) =>
    setGroups(prev => prev.map(g => g.id === id ? { ...g, myNmId: nmId, result: null, phase: 'idle' } : g)), []);
  const addCompetitor    = useCallback((id: string, nmId: number) =>
    setGroups(prev => prev.map(g => g.id === id && !g.competitorIds.includes(nmId)
      ? { ...g, competitorIds: [...g.competitorIds, nmId] } : g)), []);
  const removeCompetitor = useCallback((id: string, nmId: number) =>
    setGroups(prev => prev.map(g => g.id === id
      ? { ...g, competitorIds: g.competitorIds.filter(c => c !== nmId) } : g)), []);

  const runGroup = useCallback(async (groupId: string, myNmId: number, competitorIds: number[]) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, phase: 'loading', error: '' } : g));
    try {
      const res = await fetch('/api/competitor/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nmIds: [myNmId, ...competitorIds], myNmId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, phase: 'done', result: json as ComparisonData } : g));
    } catch (err) {
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, phase: 'error', error: String(err) } : g));
    }
  }, []);

  const runAll = useCallback(() => {
    groups.forEach(g => {
      if (g.myNmId && g.competitorIds.length > 0 && g.phase !== 'loading')
        runGroup(g.id, g.myNmId, g.competitorIds);
    });
  }, [groups, runGroup]);

  const isAnyLoading = groups.some(g => g.phase === 'loading');
  const canRunAll    = groups.some(g => g.myNmId && g.competitorIds.length > 0 && g.phase !== 'loading');

  return (
    <div className="w-full mt-6">

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-400" />
          <span className="font-semibold text-white">Сравнение с конкурентами</span>
        </div>
        <button
          onClick={runAll}
          disabled={!canRunAll}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
        >
          {isAnyLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
          Запустить все
        </button>
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {groups.map(g => (
          <GroupSection
            key={g.id}
            group={g}
            dashboardProducts={dashboardProducts}
            onSetMyNmId={setMyNmId}
            onAddCompetitor={addCompetitor}
            onRemoveCompetitor={removeCompetitor}
            onRun={runGroup}
            onRemove={removeGroup}
            canRemove={groups.length > 1}
          />
        ))}
      </div>

      {/* Add group */}
      <button
        onClick={addGroup}
        className="mt-3 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 border border-dashed border-slate-700/60 hover:border-slate-600 rounded-xl px-4 py-3 w-full justify-center transition-colors"
      >
        <Plus className="h-4 w-4" />
        Добавить товар для сравнения
      </button>
    </div>
  );
}
