'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function FakeBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Fake header */}
      <div className="px-6 py-4 flex items-center gap-3 border-b border-slate-800">
        <div className="h-8 w-8 rounded-lg bg-blue-600/80" />
        <div className="h-4 w-48 rounded bg-slate-700" />
        <div className="ml-auto flex gap-2">
          <div className="h-8 w-24 rounded-lg bg-slate-700" />
          <div className="h-8 w-20 rounded-lg bg-slate-800" />
        </div>
      </div>

      {/* Fake main content */}
      <div className="px-6 pt-10 max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="h-8 w-72 rounded-lg bg-slate-700 mx-auto" />
          <div className="h-4 w-96 rounded bg-slate-800 mx-auto" />
        </div>

        {/* Fake search bar */}
        <div className="flex gap-2">
          <div className="flex-1 h-12 rounded-xl bg-slate-800 border border-slate-700" />
          <div className="h-12 w-32 rounded-xl bg-blue-700/60" />
        </div>

        {/* Fake result card */}
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4 space-y-4">
          <div className="flex gap-4">
            <div className="w-20 h-20 rounded-xl bg-slate-700 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-slate-700" />
              <div className="h-3 w-1/2 rounded bg-slate-800" />
              <div className="flex gap-3 mt-3">
                <div className="h-5 w-20 rounded-full bg-emerald-700/40" />
                <div className="h-5 w-16 rounded-full bg-slate-700" />
                <div className="h-5 w-14 rounded-full bg-slate-700" />
              </div>
            </div>
          </div>

          {/* Fake tabs */}
          <div className="flex gap-1 bg-slate-900/60 rounded-xl p-1 w-fit">
            <div className="h-8 w-24 rounded-lg bg-slate-700" />
            <div className="h-8 w-24 rounded-lg" />
            <div className="h-8 w-20 rounded-lg" />
          </div>

          {/* Fake text content */}
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-slate-800" />
            <div className="h-3 w-5/6 rounded bg-slate-800" />
            <div className="h-3 w-4/6 rounded bg-slate-800" />
            <div className="h-3 w-full rounded bg-slate-800" />
            <div className="h-3 w-3/4 rounded bg-slate-800" />
          </div>
        </div>

        {/* Second fake card */}
        <div className="rounded-2xl border border-slate-700/40 bg-slate-800/20 p-4 space-y-3">
          <div className="h-4 w-40 rounded bg-slate-700" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-800/60 border border-slate-700/40" />
            ))}
          </div>
        </div>
      </div>

      {/* Decorative orbs */}
      <div className="absolute top-20 -right-32 w-96 h-96 rounded-full bg-blue-600/5 blur-3xl" />
      <div className="absolute bottom-20 -left-32 w-96 h-96 rounded-full bg-violet-600/5 blur-3xl" />
    </div>
  );
}

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || 'Неверный ключ');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-950 overflow-hidden">
      {/* Blurred site background */}
      <div className="absolute inset-0 blur-md opacity-60">
        <FakeBackground />
      </div>

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />

      {/* Login modal */}
      <div className="relative flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 backdrop-blur-xl p-8 shadow-2xl shadow-black/40">
            {/* Icon */}
            <div className="flex justify-center mb-5">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-white text-center text-lg font-semibold mb-1">
              Введите универсальный ключ для входа
            </h1>
            <p className="text-slate-500 text-center text-sm mb-6">WB Analyzer · Закрытый доступ</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-600 outline-none focus:border-blue-500/60 focus:bg-slate-800 transition-all text-center tracking-widest text-lg"
                  autoFocus
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-all shadow-lg shadow-blue-600/20"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Проверка...
                  </span>
                ) : 'Войти'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
