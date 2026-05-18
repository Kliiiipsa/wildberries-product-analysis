'use client';

import { useState, useCallback } from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/LoadingState';
import { AnalysisResult } from '@/components/AnalysisResult';
import type { AnalysisData, StreamEvent } from '@/types';

type Phase = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export function AnalyzeForm() {
  const [article, setArticle] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [rawData, setRawData] = useState<AnalysisData | null>(null);
  const [assembledPrompt, setAssembledPrompt] = useState('');
  const [error, setError] = useState('');
  const [currentArticle, setCurrentArticle] = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = article.trim();
    if (!trimmed || !/^\d{6,12}$/.test(trimmed)) {
      setError('Введите корректный артикул WB (только цифры, 6–12 знаков)');
      return;
    }

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
            } else if (event.type === 'token' && event.content) {
              // Парсим имя модели из первого токена
              if (event.content.includes('Анализирует:')) {
                const match = event.content.match(/Анализирует:\s*(.+?)\*/);
                if (match) setStatusMsg(`🤖 ${match[1]}`);
              }
              setAnalysis((prev) => prev + event.content);
            } else if (event.type === 'done') {
              setPhase('done');
            } else if (event.type === 'error' && event.error) {
              setError(event.error);
              setPhase('error');
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      if (phase !== 'error') setPhase('done');
    } catch (err) {
      setError(String(err));
      setPhase('error');
    }
  }, [article, phase]);

  const reset = () => {
    setPhase('idle');
    setAnalysis('');
    setRawData(null);
    setAssembledPrompt('');
    setError('');
    setCurrentArticle('');
    setArticle('');
  };

  return (
    <div className="w-full">
      {/* Форма ввода */}
      {(phase === 'idle' || phase === 'error') && (
        <div className="w-full max-w-md mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Артикул WB, например 770632673"
                value={article}
                onChange={(e) => setArticle(e.target.value.replace(/\D/g, ''))}
                className="pl-10 h-12 text-base bg-slate-800/60 border-slate-700/60 placeholder:text-slate-600 focus:border-blue-500/50 rounded-xl"
                autoFocus
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-5 font-semibold rounded-xl shrink-0">
              Анализировать
            </Button>
          </form>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Загрузка */}
      {phase === 'loading' && <LoadingState message={statusMsg} />}

      {/* Результат */}
      {(phase === 'streaming' || phase === 'done') && (
        <div className="w-full">
          <div className="flex items-center gap-3 mb-6">
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
              <Button type="submit" variant="outline" size="sm" className="h-9 rounded-lg" disabled={phase === 'streaming'}>
                {phase === 'streaming' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Найти'}
              </Button>
            </form>

            {phase === 'streaming' && (
              <div className="flex items-center gap-2 text-sm text-blue-400 ml-auto">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="truncate max-w-[180px]">{statusMsg}</span>
              </div>
            )}
            {phase === 'done' && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 ml-auto">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Готово
              </div>
            )}
          </div>

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
