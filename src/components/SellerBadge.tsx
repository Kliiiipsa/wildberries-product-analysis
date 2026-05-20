'use client';

import { useState, useRef, useEffect } from 'react';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SellerBadge({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <div ref={ref} className="fixed top-4 right-4 z-50">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-900/80 backdrop-blur px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
      >
        <User className="h-3 w-3 text-slate-500" />
        <span>{label}</span>
        <ChevronDown className={`h-3 w-3 text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-36 rounded-xl border border-slate-700/60 bg-slate-900/95 backdrop-blur shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800">
            <div className="text-[10px] text-slate-600">Аккаунт</div>
            <div className="text-xs font-medium text-white">{label}</div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-rose-400 hover:bg-rose-900/20 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}
