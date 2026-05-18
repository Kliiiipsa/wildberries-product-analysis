'use client';

import { Progress } from '@/components/ui/progress';
import { Loader2, Check } from 'lucide-react';

const STEPS = [
  { key: 'wb_card',  label: 'Карточка WB',    emoji: '📦' },
  { key: 'sheets',   label: 'Google Таблицы',  emoji: '📊' },
  { key: 'wb_stats', label: 'Статистика WB',   emoji: '📈' },
  { key: 'mpstats',  label: 'Mpstats',          emoji: '🔍' },
  { key: 'groq',     label: 'AI Анализ',        emoji: '🤖' },
];

function getProgress(message: string): number {
  if (message.includes('Загружаю карточку'))  return 12;
  if (message.includes('Читаю Unit'))         return 28;
  if (message.includes('статистику'))         return 50;
  if (message.includes('Mpstats'))            return 70;
  if (message.includes('Анализирую'))         return 87;
  return 5;
}

function isStepDone(key: string, progress: number) {
  if (key === 'wb_card')  return progress >= 28;
  if (key === 'sheets')   return progress >= 50;
  if (key === 'wb_stats') return progress >= 70;
  if (key === 'mpstats')  return progress >= 87;
  return false;
}

function isStepActive(key: string, message: string) {
  if (key === 'wb_card')  return message.includes('Загружаю карточку');
  if (key === 'sheets')   return message.includes('Читаю Unit') || message.includes('Google');
  if (key === 'wb_stats') return message.includes('статистику');
  if (key === 'mpstats')  return message.includes('Mpstats');
  if (key === 'groq')     return message.includes('Анализирую');
  return false;
}

interface LoadingStateProps {
  message: string;
}

export function LoadingState({ message }: LoadingStateProps) {
  const progress = getProgress(message);

  return (
    <div className="w-full max-w-xl mx-auto mt-14">
      {/* Status message */}
      <div className="flex items-center gap-3 mb-5">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400 shrink-0" />
        <span className="text-base text-slate-300">{message}</span>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="mb-7 h-1 bg-slate-800" />

      {/* Steps grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {STEPS.map((step) => {
          const done   = isStepDone(step.key, progress);
          const active = isStepActive(step.key, message);

          return (
            <div
              key={step.key}
              className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-all ${
                done
                  ? 'border-emerald-800/60 bg-emerald-900/15 text-emerald-400'
                  : active
                  ? 'border-blue-500/40 bg-blue-500/8 text-white'
                  : 'border-slate-800 bg-slate-900/40 text-slate-600'
              }`}
            >
              <span className={done || active ? 'opacity-100' : 'opacity-30'}>
                {step.emoji}
              </span>
              <span className="truncate">{step.label}</span>
              {done && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
              {active && <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
