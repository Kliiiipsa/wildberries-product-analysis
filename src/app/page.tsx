import { AnalyzeForm } from '@/components/AnalyzeForm';
import { SellerBadge } from '@/components/SellerBadge';
import { TrendingUp, Zap, Database, Bot } from 'lucide-react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { findAccountBySession } from '@/lib/accounts';

const FEATURES = [
  {
    icon: Database,
    label: 'Unit-экономика',
    desc: 'Google Sheets',
    iconBg: 'bg-blue-500/12',
    iconColor: 'text-blue-400',
    borderHover: 'hover:border-blue-500/35',
    glowHover: 'hover:shadow-blue-500/15',
  },
  {
    icon: TrendingUp,
    label: 'WB Статистика',
    desc: 'Воронка + Реклама',
    iconBg: 'bg-cyan-500/12',
    iconColor: 'text-cyan-400',
    borderHover: 'hover:border-cyan-500/35',
    glowHover: 'hover:shadow-cyan-500/15',
  },
  {
    icon: Zap,
    label: 'Mpstats',
    desc: 'Конкуренты + SEO',
    iconBg: 'bg-violet-500/12',
    iconColor: 'text-violet-400',
    borderHover: 'hover:border-violet-500/35',
    glowHover: 'hover:shadow-violet-500/15',
  },
  {
    icon: Bot,
    label: 'Groq AI',
    desc: 'Анализ 9 разделов',
    iconBg: 'bg-purple-500/12',
    iconColor: 'text-purple-400',
    borderHover: 'hover:border-purple-500/35',
    glowHover: 'hover:shadow-purple-500/15',
  },
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value || '';
  const account = findAccountBySession(session);
  if (!account) redirect('/login');
  const sellerLabel = account.label;

  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      <SellerBadge label={sellerLabel} />

      {/* Background layers */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(hsl(216 34% 17% / 0.45) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute -top-48 -left-48 w-[700px] h-[700px] rounded-full bg-blue-600/[0.055] blur-[130px]" />
        <div className="absolute -top-32 -right-48 w-[600px] h-[600px] rounded-full bg-violet-600/[0.055] blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[400px] rounded-full bg-indigo-600/[0.04] blur-[100px]" />
      </div>

      <div className="relative container mx-auto px-4 pt-20 pb-16 max-w-4xl">

        {/* Hero */}
        <div className="text-center mb-12 animate-fade-up">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-blue-500/20 bg-blue-500/[0.07] px-5 py-2 text-sm text-blue-400 mb-8 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
            AI-аналитика для Wildberries
          </div>

          <h1 className="text-[72px] sm:text-[92px] lg:text-[110px] font-black leading-none tracking-tight mb-5">
            <span className="text-gradient-hero">WB Analyzer</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-lg mx-auto leading-relaxed mb-2 font-medium">
            Введите артикул — получите полный анализ с конкретными рекомендациями от AI-менеджера.
          </p>
          <p className="text-sm text-slate-600">
            WB API · Google Sheets · Mpstats → Groq AI
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12 animate-fade-up-1">
          {FEATURES.map(({ icon: Icon, label, desc, iconBg, iconColor, borderHover, glowHover }) => (
            <div
              key={label}
              className={`group flex flex-col items-center text-center gap-3.5 rounded-2xl border border-slate-700/40 bg-slate-800/25 backdrop-blur-sm px-4 py-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg ${glowHover} ${borderHover}`}
            >
              <div className={`h-13 w-13 rounded-xl ${iconBg} flex items-center justify-center p-3`}>
                <Icon className={`h-7 w-7 ${iconColor}`} />
              </div>
              <div>
                <div className="font-semibold text-white text-sm leading-tight mb-1">{label}</div>
                <div className="text-xs text-slate-500 leading-tight">{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Main form */}
        <div className="animate-fade-up-2">
          <AnalyzeForm />
        </div>

        <p className="mt-16 text-center text-xs text-slate-700">
          Внутренний инструмент · Read-only · Данные только для анализа
        </p>
      </div>
    </main>
  );
}
