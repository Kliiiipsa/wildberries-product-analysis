'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, RotateCcw, Copy, Check, PowerOff, Power, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Manager {
  id: string;
  label: string;
  wbTagName: string;
  role: 'manager';
  accessKeyPreview: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  notes: string;
}

function KeyBanner({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-400">Новый ключ доступа</span>
        <span className="text-xs text-slate-500">Показывается только один раз!</span>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-emerald-300 break-all">
          {rawKey}
        </code>
        <button
          onClick={copy}
          className="shrink-0 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Скопировать"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <button
        onClick={onClose}
        className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
      >
        Я скопировал ключ — закрыть
      </button>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (manager: Manager, rawKey: string) => void }) {
  const [label, setLabel] = useState('');
  const [wbTagName, setWbTagName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/managers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, wbTagName, notes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Ошибка'); return; }
      onCreated(data.manager, data.rawKey);
      setLabel(''); setWbTagName(''); setNotes('');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <Plus className="h-4 w-4 text-blue-400" />
        Добавить менеджера
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Имя</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Иван Иванов"
            required
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/60 transition-colors"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">WB-тег (название ярлыка)</label>
          <input
            value={wbTagName}
            onChange={e => setWbTagName(e.target.value)}
            placeholder="илья"
            required
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/60 transition-colors"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-slate-500">Заметки (необязательно)</label>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Менеджер по продажам..."
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/60 transition-colors"
        />
      </div>

      {error && (
        <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !label || !wbTagName}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {loading ? 'Создание...' : 'Создать менеджера'}
      </button>
    </form>
  );
}

function ManagerRow({
  manager,
  onToggle,
  onRotate,
}: {
  manager: Manager;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
  onRotate: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

  const toggle = async () => {
    setBusy(true);
    try { await onToggle(manager.id, !manager.isActive); }
    finally { setBusy(false); }
  };

  const rotate = async () => {
    if (!confirm(`Сгенерировать новый ключ для «${manager.label}»? Старый ключ перестанет работать.`)) return;
    setBusy(true);
    try { await onRotate(manager.id); }
    finally { setBusy(false); }
  };

  return (
    <div className={`rounded-xl border p-4 space-y-2 transition-colors ${manager.isActive ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-800/40 bg-slate-950/40 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">{manager.label}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            WB-тег: <span className="text-slate-400 font-mono">{manager.wbTagName}</span>
          </div>
          {manager.notes && <div className="text-xs text-slate-600 mt-0.5">{manager.notes}</div>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={rotate}
            disabled={busy}
            title="Сменить ключ"
            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-900/20 disabled:opacity-40 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={toggle}
            disabled={busy}
            title={manager.isActive ? 'Отключить' : 'Включить'}
            className={`p-1.5 rounded-lg disabled:opacity-40 transition-colors ${
              manager.isActive
                ? 'text-slate-500 hover:text-rose-400 hover:bg-rose-900/20'
                : 'text-slate-600 hover:text-emerald-400 hover:bg-emerald-900/20'
            }`}
          >
            {manager.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-600">
        <span>Ключ: <span className="font-mono text-slate-500">{manager.accessKeyPreview}</span></span>
        <span>Создан: {fmt(manager.createdAt)}</span>
        <span>Последний вход: {fmt(manager.lastUsedAt)}</span>
      </div>
    </div>
  );
}

export function AdminConsole() {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeys, setNewKeys] = useState<{ id: string; rawKey: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/managers');
      if (res.ok) {
        const data = await res.json();
        setManagers(data.managers ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (manager: Manager, rawKey: string) => {
    setManagers(prev => [manager, ...prev]);
    setNewKeys(prev => [{ id: manager.id, rawKey }, ...prev]);
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/admin/managers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    if (res.ok) {
      const data = await res.json();
      setManagers(prev => prev.map(m => m.id === id ? data.manager : m));
    }
  };

  const handleRotate = async (id: string) => {
    const res = await fetch(`/api/admin/managers/${id}/rotate-key`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setManagers(prev => prev.map(m => m.id === id ? data.manager : m));
      setNewKeys(prev => [{ id, rawKey: data.rawKey }, ...prev.filter(k => k.id !== id)]);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" />
            <h1 className="text-lg font-bold">Управление доступом</h1>
          </div>
        </div>

        {/* New key banners */}
        {newKeys.map(({ id, rawKey }) => (
          <KeyBanner
            key={id}
            rawKey={rawKey}
            onClose={() => setNewKeys(prev => prev.filter(k => k.id !== id))}
          />
        ))}

        {/* Create form */}
        <CreateForm onCreated={handleCreated} />

        {/* Manager list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-400">
              Менеджеры {managers.length > 0 && `(${managers.length})`}
            </h2>
            <button
              onClick={load}
              disabled={loading}
              className="text-xs text-slate-600 hover:text-slate-400 disabled:opacity-40 transition-colors"
            >
              {loading ? 'Загрузка...' : 'Обновить'}
            </button>
          </div>

          {loading && managers.length === 0 && (
            <div className="text-center text-sm text-slate-600 py-8">Загрузка...</div>
          )}

          {!loading && managers.length === 0 && (
            <div className="text-center text-sm text-slate-600 py-8">Менеджеров нет. Создайте первого выше.</div>
          )}

          {managers.map(m => (
            <ManagerRow
              key={m.id}
              manager={m}
              onToggle={handleToggle}
              onRotate={handleRotate}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
