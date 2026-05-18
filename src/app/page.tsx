import { AnalyzeForm } from '@/components/AnalyzeForm';
import { TrendingUp, Zap, Database, Bot } from 'lucide-react';

const FEATURES = [
  { icon: Database,    label: 'Unit-экономика',  desc: 'Google Sheets' },
  { icon: TrendingUp,  label: 'WB Статистика',   desc: 'Воронка + Реклама' },
  { icon: Zap,         label: 'Mpstats',          desc: 'Конкуренты + SEO' },
  { icon: Bot,         label: 'Groq AI',          desc: 'Анализ 9 разделов' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(hsl(216 34% 17% / 0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative container mx-auto px-4 py-14 max-w-4xl">

        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/8 px-4 py-1.5 text-sm text-blue-400 mb-8 backdrop-blur">
            <Bot className="h-3.5 w-3.5" />
            AI-аналитика для Wildberries
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold mb-4 tracking-tight">
            <span className="text-gradient">WB Analyzer</span>
          </h1>

          <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed mb-1">
            Введите артикул — получите полный анализ с конкретными рекомендациями от AI-менеджера.
          </p>
          <p className="text-sm text-slate-600">
            WB API · Google Sheets · Mpstats → Groq AI
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2.5 mb-10">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-2.5 text-sm backdrop-blur hover:border-slate-600 transition-colors"
            >
              <Icon className="h-4 w-4 text-blue-400 shrink-0" />
              <div>
                <div className="font-medium text-white leading-none mb-0.5">{label}</div>
                <div className="text-xs text-slate-500">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        <AnalyzeForm />

        {/* Footer */}
        <p className="mt-14 text-center text-xs text-slate-700">
          Внутренний инструмент · Read-only · Данные только для анализа
        </p>
      </div>
    </main>
  );
}
