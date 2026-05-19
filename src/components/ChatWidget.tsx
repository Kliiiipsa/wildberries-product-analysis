'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, AlertCircle } from 'lucide-react';

const RATE_KEY = 'wb_chat_rate';
const MAX_MSGS = 2;
const WINDOW_MS = 30 * 60 * 1000;
const MAX_INPUT = 400;

interface RateData { count: number; windowStart: number }

function getRateData(): RateData {
  if (typeof window === 'undefined') return { count: 0, windowStart: Date.now() };
  try {
    const raw = localStorage.getItem(RATE_KEY);
    return raw ? JSON.parse(raw) : { count: 0, windowStart: Date.now() };
  } catch { return { count: 0, windowStart: Date.now() }; }
}

function checkRate(): { allowed: boolean; remaining: number; resetInMin: number } {
  const data = getRateData();
  const now = Date.now();
  if (now - data.windowStart > WINDOW_MS) {
    localStorage.setItem(RATE_KEY, JSON.stringify({ count: 0, windowStart: now }));
    return { allowed: true, remaining: MAX_MSGS, resetInMin: 0 };
  }
  const remaining = MAX_MSGS - data.count;
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, resetInMin: Math.ceil((WINDOW_MS - (now - data.windowStart)) / 60000) };
  }
  return { allowed: true, remaining, resetInMin: 0 };
}

function consumeRate() {
  const data = getRateData();
  const now = Date.now();
  const base = now - data.windowStart > WINDOW_MS ? { count: 0, windowStart: now } : data;
  localStorage.setItem(RATE_KEY, JSON.stringify({ count: base.count + 1, windowStart: base.windowStart }));
}

interface Message { role: 'user' | 'assistant'; text: string }

interface ChatWidgetProps {
  analysis: string;
  article: string;
  isStreaming: boolean;
}

export function ChatWidget({ analysis, article, isStreaming }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateInfo, setRateInfo] = useState(() => checkRate());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setRateInfo(checkRate());
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!analysis || isStreaming) return null;

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    const rate = checkRate();
    setRateInfo(rate);
    if (!rate.allowed) return;

    consumeRate();
    setRateInfo(checkRate());
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    const assistantIndex = messages.length + 1;
    setMessages(prev => [...prev, { role: 'assistant', text: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, context: analysis, article }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream');

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              setMessages(prev => {
                const updated = [...prev];
                updated[assistantIndex] = { role: 'assistant', text: (updated[assistantIndex]?.text || '') + parsed.content };
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantIndex] = { role: 'assistant', text: `Ошибка: ${err}` };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {open ? (
        <div className="w-80 rounded-2xl border border-slate-700/60 bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
          style={{ height: '420px' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 bg-slate-800/60 shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white text-sm font-medium">Спросить ИИ</span>
              <span className="text-slate-500 text-xs">· арт. {article}</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {messages.length === 0 && (
              <div className="text-center text-slate-600 text-xs pt-6 px-2 leading-relaxed">
                Задай вопрос по анализу.<br />
                Например: <span className="text-slate-500">"Объясни этап 2.1"</span> или <span className="text-slate-500">"Почему такой вердикт в 3.2?"</span>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600/80 text-white'
                    : 'bg-slate-800 text-slate-200 border border-slate-700/60'
                }`}>
                  {m.text || (m.role === 'assistant' && loading ? <span className="animate-pulse">...</span> : '')}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Rate limit warning */}
          {!rateInfo.allowed && (
            <div className="mx-3 mb-2 flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 shrink-0">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Лимит: доступно через {rateInfo.resetInMin} мин
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-slate-700/60 shrink-0">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value.slice(0, MAX_INPUT))}
                  onKeyDown={handleKey}
                  placeholder="Задай вопрос по анализу..."
                  disabled={!rateInfo.allowed || loading}
                  rows={1}
                  className="w-full resize-none bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-slate-500 transition-colors disabled:opacity-40"
                  style={{ maxHeight: '80px' }}
                />
                <span className="absolute bottom-1.5 right-2 text-slate-700 text-[10px]">
                  {input.length}/{MAX_INPUT}
                </span>
              </div>
              <button
                onClick={send}
                disabled={!input.trim() || !rateInfo.allowed || loading}
                className="h-8 w-8 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Send className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
            <div className="flex justify-between mt-1.5 px-0.5">
              <span className="text-slate-700 text-[10px]">Enter — отправить</span>
              <span className={`text-[10px] ${rateInfo.remaining <= 1 ? 'text-amber-500' : 'text-slate-600'}`}>
                {rateInfo.remaining}/{MAX_MSGS} сообщ. / 30 мин
              </span>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 backdrop-blur-xl shadow-lg hover:border-slate-500 transition-all group"
        >
          <MessageCircle className="h-4 w-4 text-blue-400 group-hover:text-blue-300" />
          <span className="text-sm text-slate-300 group-hover:text-white">Спросить ИИ</span>
          {rateInfo.remaining < MAX_MSGS && (
            <span className="text-[10px] text-slate-600">{rateInfo.remaining}/{MAX_MSGS}</span>
          )}
        </button>
      )}
    </div>
  );
}
