'use client';

import { useState, useCallback, useRef } from 'react';
import { Search, Loader2, AlertCircle, LayoutDashboard, Users, Zap, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/LoadingState';
import { AnalysisResult } from '@/components/AnalysisResult';
import { DashboardPanel } from '@/components/DashboardPanel';
import { ComparisonView } from '@/components/ComparisonView';
import { WhatIfSimulator } from '@/components/WhatIfSimulator';
import { PhotoFunnelPanel } from '@/components/PhotoFunnelPanel';
import type { AnalysisData, StreamEvent, DashboardData } from '@/types';

type AnalysisPhase = 'idle' | 'loading' | 'streaming' | 'done' | 'error';
type DashboardPhase = 'idle' | 'loading' | 'loaded' | 'error';
type Mode = 'analysis' | 'dashboard' | 'comparison' | 'simulator' | 'photo';

export function AnalyzeForm() {
  // ── Analysis state ──
  const [article, setArticle] = useState('');
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [rawData, setRawData] = useState<AnalysisData | null>(null);
  const [assembledPrompt, setAssembledPrompt] = useState('');
  const [error, setError] = useState('');
  const [currentArticle, setCurrentArticle] = useState('');
  const [aiProgress, setAiProgress] = useState(0);
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Dashboard state ──
  const [mode, setMode] = useState<Mode>('analysis');
  const [dashboardPhase, setDashboardPhase] = useState<DashboardPhase>('idle');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardProgress, setDashboardProgress] = useState(0);
  const [dashboardStep, setDashboardStep] = useState('');

  // ── Core analysis function ──
  const startAnalysis = useCallback(async (trimmed: string) => {
    if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
    setAiProgress(0);
    setError('');
    setPhase('loading');
    setAnalysis('');
    setRawData(null);
    setAssembledPrompt('');
    setCurrentArticle(trimmed);
    setStatusMsg('Инициализация...');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article: trimmed }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasError = false;

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
            const event: StreamEvent = JSON.parse(jsonStr);

            if (event.type === 'status' && event.message) {
              setStatusMsg(event.message);
            } else if (event.type === 'prompt' && event.prompt) {
              setAssembledPrompt(event.prompt);
            } else if (event.type === 'data' && event.payload) {
              setRawData(event.payload);
              setPhase('streaming');
              setAiProgress(0);
              if (aiTimerRef.current) clearInterval(aiTimerRef.current);
              aiTimerRef.current = setInterval(() => {
                setAiProgress((p) => Math.min(p + 2, 90));
              }, 1000);
            } else if (event.type === 'token' && event.content) {
              if (aiTimerRef.current) {
                clearInterval(aiTimerRef.current);
                aiTimerRef.current = null;
                setAiProgress(100);
              }
              if (event.content.includes('Анализирует:')) {
                const match = event.content.match(/Анализирует:\s*(.+?)\*/);
                if (match) setStatusMsg(`🤖 ${match[1]}`);
              }
              setAnalysis((prev) => prev + event.content);
            } else if (event.type === 'done') {
              if (!hasError) setPhase('done');
            } else if (event.type === 'error' && event.error) {
              setError(event.error);
              setPhase('error');
              hasError = true;
            }
          } catch { /* skip malformed JSON */ }
        }
      }

      if (!hasError) setPhase('done');
    } catch (err) {
      setError(String(err));
      setPhase('error');
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = article.trim();
    if (!trimmed || !/^\d{6,12}$/.test(trimmed)) {
      setError('Введите корректный артикул WB (только цифры, 6–12 знаков)');
      return;
    }
    await startAnalysis(trimmed);
  }, [article, startAnalysis]);

  // ── Dashboard functions ──
  const loadDashboard = useCallback(async (force = false) => {
    if (dashboardData && !force) {
      setMode('dashboard');
      return;
    }
    setMode('dashboard');
    setDashboardPhase('loading');
    setDashboardError('');
    setDashboardProgress(0);
    setDashboardStep('');

    try {
      const res = await fetch('/api/dashboard', force ? { cache: 'no-store' } : {});
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
              setDashboardProgress(event.percent);
              setDashboardStep(event.step);
            } else if (event.type === 'done') {
              setDashboardProgress(100);
              setDashboardData(event.data as DashboardData);
              setDashboardPhase('loaded');
            } else if (event.type === 'error') {
              setDashboardError(event.error);
              setDashboardPhase('error');
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch (err) {
      setDashboardError(String(err));
      setDashboardPhase('error');
    }
  }, [dashboardData]);

  const handleDashboardAnalyze = useCallback((articleStr: string) => {
    setMode('analysis');
    setArticle(articleStr);
    startAnalysis(articleStr);
  }, [startAnalysis]);

  // ══════════════════════════════════════════════════════
  // RENDER: Dashboard mode
  // ══════════════════════════════════════════════════════
  if (mode === 'dashboard') {
    return (
      <div className="w-full">
        {/* First load: no data yet */}
        {!dashboardData && dashboardPhase === 'loading' && (
          <div className="w-full max-w-sm mx-auto mt-20">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-slate-300 truncate pr-3">
                {dashboardStep || 'Инициализация...'}
              </span>
              <span className="text-xs font-mono text-blue-400 shrink-0">{dashboardProgress}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
                style={{ width: `${dashboardProgress}%` }}
              />
            </div>
          </div>
        )}

        {!dashboardData && dashboardPhase === 'error' && (
          <div className="w-full max-w-lg mx-auto mt-14">
            <div className="flex items-start gap-2.5 rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{dashboardError}</span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setMode('analysis')} className="border-slate-700">
                Назад
              </Button>
              <Button onClick={() => loadDashboard(true)}>
                Повторить
              </Button>
            </div>
          </div>
        )}

        {/* Data available — keep showing even while refreshing */}
        {dashboardData && (
          <DashboardPanel
            data={dashboardData}
            onBack={() => setMode('analysis')}
            onAnalyze={handleDashboardAnalyze}
            onRefresh={() => loadDashboard(true)}
            isRefreshing={dashboardPhase === 'loading'}
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // RENDER: Comparison mode
  // ══════════════════════════════════════════════════════
  if (mode === 'comparison') {
    return (
      <ComparisonView
        dashboardProducts={dashboardData?.products ?? []}
        onBack={() => setMode('analysis')}
      />
    );
  }

  // ══════════════════════════════════════════════════════
  // RENDER: Simulator mode
  // ══════════════════════════════════════════════════════
  if (mode === 'simulator') {
    return (
      <WhatIfSimulator
        initialNmId={currentArticle || undefined}
        onBack={() => setMode('analysis')}
      />
    );
  }

  // ══════════════════════════════════════════════════════
  // RENDER: Photo funnel mode
  // ══════════════════════════════════════════════════════
  if (mode === 'photo') {
    return <PhotoFunnelPanel onBack={() => setMode('analysis')} />;
  }

  // ══════════════════════════════════════════════════════
  // RENDER: Analysis mode
  // ══════════════════════════════════════════════════════
  return (
    <div className="w-full">

      {/* ── Idle / Error: main form ── */}
      {(phase === 'idle' || phase === 'error') && (
        <div className="w-full max-w-2xl mx-auto">

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-500" />
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Введите артикул WB, например 770632673"
                value={article}
                onChange={(e) => setArticle(e.target.value.replace(/\D/g, ''))}
                className="pl-14 h-[68px] text-lg bg-slate-800/50 border-slate-700/50 placeholder:text-slate-600 focus:border-blue-500/60 rounded-2xl backdrop-blur-sm"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="h-[68px] px-7 font-bold text-base rounded-2xl shrink-0 bg-gradient-to-r from-blue-500 to-violet-600 text-white btn-glow transition-all"
            >
              Анализ
            </button>
          </form>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="group flex items-center gap-4 rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm px-5 py-4 text-left hover:border-blue-500/40 hover:bg-slate-800/50 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <LayoutDashboard className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <div className="font-semibold text-white text-sm leading-tight">Дашборд товаров</div>
                <div className="text-xs text-slate-500 mt-0.5">Все артикулы разом</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('comparison')}
              className="group flex items-center gap-4 rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm px-5 py-4 text-left hover:border-violet-500/40 hover:bg-slate-800/50 hover:shadow-lg hover:shadow-violet-500/10 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="h-12 w-12 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <Users className="h-6 w-6 text-violet-400" />
              </div>
              <div>
                <div className="font-semibold text-white text-sm leading-tight">Конкуренты</div>
                <div className="text-xs text-slate-500 mt-0.5">Сравнение и анализ</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('simulator')}
              className="group flex items-center gap-4 rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm px-5 py-4 text-left hover:border-purple-500/40 hover:bg-slate-800/50 hover:shadow-lg hover:shadow-purple-500/10 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                <Zap className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <div className="font-semibold text-white text-sm leading-tight">Симулятор</div>
                <div className="text-xs text-slate-500 mt-0.5">Сценарии и прогнозы</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('photo')}
              className="group flex items-center gap-4 rounded-2xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm px-5 py-4 text-left hover:border-rose-500/40 hover:bg-slate-800/50 hover:shadow-lg hover:shadow-rose-500/10 hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="h-12 w-12 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                <Camera className="h-6 w-6 text-rose-400" />
              </div>
              <div>
                <div className="font-semibold text-white text-sm leading-tight">Фото</div>
                <div className="text-xs text-slate-500 mt-0.5">Улучшение карточки</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {phase === 'loading' && <LoadingState message={statusMsg} />}

      {/* ── Result ── */}
      {(phase === 'streaming' || phase === 'done') && (
        <div className="w-full">
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <form onSubmit={handleSubmit} className="flex gap-2 flex-1 max-w-xs">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600" />
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Другой артикул..."
                  value={article}
                  onChange={(e) => setArticle(e.target.value.replace(/\D/g, ''))}
                  className="pl-8 h-9 text-sm bg-slate-800/60 border-slate-700/60 rounded-lg"
                />
              </div>
              <Button type="submit" variant="outline" size="sm" className="h-9 rounded-lg shrink-0" disabled={phase === 'streaming'}>
                {phase === 'streaming' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Найти'}
              </Button>
            </form>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadDashboard()}
              className="h-9 gap-1.5 rounded-lg border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 shrink-0"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Дашборд
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode('simulator')}
              className="h-9 gap-1.5 rounded-lg border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 shrink-0"
            >
              <Zap className="h-3.5 w-3.5" />
              Симулятор
            </Button>

            {phase === 'streaming' && (
              <div className="flex items-center gap-2 text-sm text-blue-400 ml-auto">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="truncate max-w-[150px]">{statusMsg}</span>
              </div>
            )}
            {phase === 'done' && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 ml-auto">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Готово
              </div>
            )}
          </div>

          {phase === 'streaming' && analysis.length === 0 && (
            <div className="w-full max-w-xs mx-auto my-16">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">AI анализирует...</span>
                <span className="text-sm font-mono text-blue-400">{aiProgress}%</span>
              </div>
              <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-1000 ease-linear"
                  style={{ width: `${aiProgress}%` }}
                />
              </div>
            </div>
          )}

          <AnalysisResult
            article={currentArticle}
            analysis={analysis}
            isStreaming={phase === 'streaming'}
            rawData={rawData}
            assembledPrompt={assembledPrompt}
          />
        </div>
      )}
    </div>
  );
}
