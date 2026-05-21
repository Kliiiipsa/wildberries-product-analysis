import { AnalyzeForm } from '@/components/AnalyzeForm';
import { SellerBadge } from '@/components/SellerBadge';
import { TrendingUp, Zap, Database, Bot } from 'lucide-react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { findAccountBySession } from '@/lib/accounts';

const TAGS = [
  { icon: Database,   label: 'Unit-экономика' },
  { icon: TrendingUp, label: 'WB Статистика' },
  { icon: Zap,        label: 'Mpstats' },
  { icon: Bot,        label: 'Groq AI' },
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

      {/* Subtle background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(hsl(216 34% 17% / 0.4) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="absolute -top-64 -left-32 w-[600px] h-[600px] rounded-full bg-blue-600/[0.05] blur-[120px]" />
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-violet-600/[0.05] blur-[110px]" />
      </div>

      <div className="relative container mx-auto px-6 pt-24 pb-16 max-w-5xl">

        {/* Hero */}
        <div className="text-center mb-10 animate-fade-up">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-4 leading-tight">
            <span className="text-gradient-hero">WB Analyzer</span>
          </h1>
          <p className="text-base text-slate-400 max-w-sm mx-auto leading-relaxed">
            Введите артикул — AI-менеджер даст полный анализ и рекомендации.
          </p>
        </div>

        {/* Search + actions */}
        <div className="animate-fade-up-1">
          <AnalyzeForm />
        </div>

        {/* Data sources — small tags at bottom */}
        <div className="mt-14 flex flex-wrap justify-center gap-2 animate-fade-up-2">
          {TAGS.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/50 px-3 py-1 text-xs text-slate-600"
            >
              <Icon className="h-3 w-3" />
              {label}
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-slate-800">
          Внутренний инструмент · Read-only
        </p>
      </div>
    </main>
  );
}
