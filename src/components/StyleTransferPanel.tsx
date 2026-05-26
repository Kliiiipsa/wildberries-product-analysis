'use client';

import { useState, useRef, useCallback, RefObject } from 'react';
import { ArrowLeft, Upload, Loader2, Wand2, ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onBack: () => void;
}

/** Resize file to max 1024px and return JPEG base64 data URL */
function resizeToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

export function StyleTransferPanel({ onBack }: Props) {
  const [sourceImage, setSourceImage] = useState('');
  const [styleImage, setStyleImage] = useState('');
  const [result, setResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [sourceClothing, setSourceClothing] = useState('');
  const [styleEnvironment, setStyleEnvironment] = useState('');

  const sourceRef = useRef<HTMLInputElement>(null);
  const styleRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File, target: 'source' | 'style') => {
    if (!file.type.startsWith('image/')) return;
    try {
      const b64 = await resizeToBase64(file);
      if (target === 'source') setSourceImage(b64);
      else setStyleImage(b64);
      setResult('');
      setError('');
    } catch { /* ignore */ }
  }, []);

  const handleGenerate = async () => {
    if (!sourceImage || !styleImage) return;
    setIsGenerating(true);
    setError('');
    setResult('');
    setPrompt('');
    setPromptOpen(false);
    try {
      const res = await fetch('/api/photo/style-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceImageUrl: sourceImage, styleImageUrl: styleImage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
      setResult(data.imageUrl);
      if (data.prompt) setPrompt(data.prompt);
      if (data.sourceClothing) setSourceClothing(data.sourceClothing);
      if (data.styleEnvironment) setStyleEnvironment(data.styleEnvironment);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Upload zone ─────────────────────────────────────────────────────────────
  const UploadZone = ({
    label, sublabel, badge, image, inputRef, target,
  }: {
    label: string;
    sublabel: string;
    badge: string;
    image: string;
    inputRef: RefObject<HTMLInputElement | null>;
    target: 'source' | 'style';
  }) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
          target === 'source'
            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
            : 'bg-purple-500/15 text-purple-400 border border-purple-500/25'
        }`}>{badge}</span>
        <p className="text-sm font-semibold text-white">{label}</p>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{sublabel}</p>
      <div
        className={`relative rounded-2xl border-2 overflow-hidden w-full aspect-[3/4] cursor-pointer group transition-all ${
          image
            ? 'border-slate-700/50 bg-slate-900'
            : 'border-dashed border-slate-700 hover:border-slate-500 bg-slate-800/20'
        }`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f, target);
        }}
        onClick={() => inputRef.current?.click()}
      >
        {image ? (
          <>
            <img src={image} alt={label} className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1.5 text-white">
                <Upload className="h-5 w-5" />
                <span className="text-xs font-medium">Заменить</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 p-6 text-center gap-3">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
              target === 'source' ? 'bg-blue-500/10' : 'bg-purple-500/10'
            }`}>
              <Upload className={`h-6 w-6 ${target === 'source' ? 'text-blue-500/60' : 'text-purple-500/60'}`} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Перетащите или нажмите</p>
              <p className="text-xs text-slate-700 mt-0.5">JPG, PNG, WEBP</p>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, target); }}
        />
      </div>
    </div>
  );

  const canGenerate = !!sourceImage && !!styleImage && !isGenerating;

  return (
    <div className="w-full max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="h-4 w-4" />Назад
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <Wand2 className="h-4 w-4 text-purple-400" />
        <h2 className="text-base font-semibold text-white">Перенос стиля</h2>
        <span className="text-xs text-slate-600 hidden md:block">
          — AI перенесёт визуальный стиль со стиль-фото на ваш товар
        </span>
      </div>

      {/* ── How it works hint ── */}
      <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 px-4 py-3 mb-6 flex items-start gap-3">
        <Wand2 className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-purple-300 font-medium">Как работает:</span> загрузите исходное фото товара и фото с понравившимся стилем.
          AI проанализирует оба снимка, сохранит одежду и внешний вид модели из фото&nbsp;№1,
          и применит атмосферу, освещение и фон из фото&nbsp;№2.
        </p>
      </div>

      {/* ── 3-column layout: source | arrow | style | arrow | result ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-start mb-6">

        {/* Source photo */}
        <UploadZone
          label="Исходное фото"
          sublabel="Одежда и модель сохранятся"
          badge="Фото 1"
          image={sourceImage}
          inputRef={sourceRef}
          target="source"
        />

        {/* Arrow 1 */}
        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1">
          <ArrowRight className="h-6 w-6 text-slate-600" />
          <span className="text-[10px] text-slate-700 mt-1 text-center">стиль</span>
        </div>

        {/* Style reference */}
        <UploadZone
          label="Стиль (референс)"
          sublabel="Отсюда возьмётся фон и атмосфера"
          badge="Фото 2"
          image={styleImage}
          inputRef={styleRef}
          target="style"
        />

        {/* Arrow 2 */}
        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1">
          <ArrowRight className="h-6 w-6 text-slate-600" />
          <span className="text-[10px] text-slate-700 mt-1 text-center">результат</span>
        </div>

        {/* Result */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              Результат
            </span>
            <p className="text-sm font-semibold text-white">Готовое фото</p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">Одежда из фото 1 + стиль из фото 2</p>

          <div className="relative rounded-2xl border border-slate-700/50 bg-slate-900 w-full aspect-[3/4] flex items-center justify-center overflow-hidden">
            {isGenerating ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto mb-3" />
                <p className="text-sm text-slate-400 font-medium">AI переносит стиль...</p>
                <p className="text-xs text-slate-600 mt-1.5">Qwen анализирует → FLUX генерирует</p>
                <p className="text-xs text-slate-700 mt-0.5">~40–80 секунд</p>
              </div>
            ) : result ? (
              <img src={result} alt="Результат" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-slate-700 p-8">
                <div className="h-14 w-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-3">
                  <Wand2 className="h-7 w-7 opacity-30" />
                </div>
                <p className="text-sm">Здесь появится результат</p>
                <p className="text-xs mt-1 opacity-50">Загрузите оба фото и нажмите кнопку</p>
              </div>
            )}
          </div>

          {result && !isGenerating && (
            <a
              href={result}
              download="style-transfer.jpg"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 text-xs text-slate-400 hover:text-white transition-all py-2.5"
            >
              ⬇ Скачать результат
            </a>
          )}
        </div>
      </div>

      {/* ── Generate button ── */}
      <Button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:opacity-90 text-white font-semibold rounded-xl h-12 mb-4 disabled:opacity-40"
      >
        {isGenerating ? (
          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую... (~40–80 сек)</>
        ) : (
          <><Wand2 className="h-4 w-4 mr-2" />Применить стиль</>
        )}
      </Button>

      {!sourceImage || !styleImage ? (
        <p className="text-xs text-center text-slate-600">
          {!sourceImage && !styleImage
            ? 'Загрузите оба фото чтобы начать'
            : !sourceImage
            ? 'Загрузите исходное фото (Фото 1)'
            : 'Загрузите фото со стилем (Фото 2)'}
        </p>
      ) : null}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {/* ── AI analysis summary (shown after generation) ── */}
      {(sourceClothing || styleEnvironment) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {sourceClothing && (
            <div className="rounded-xl border border-blue-800/30 bg-blue-900/10 px-3 py-2.5">
              <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-1">Одежда (сохранено)</p>
              <p className="text-xs text-slate-400">{sourceClothing}</p>
            </div>
          )}
          {styleEnvironment && (
            <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 px-3 py-2.5">
              <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider mb-1">Стиль (применено)</p>
              <p className="text-xs text-slate-400">{styleEnvironment}</p>
            </div>
          )}
        </div>
      )}

      {/* ── FLUX prompt (collapsible) ── */}
      {prompt && (
        <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 overflow-hidden">
          <button
            onClick={() => setPromptOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span>Промпт FLUX (технический)</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${promptOpen ? 'rotate-180' : ''}`} />
          </button>
          {promptOpen && (
            <div className="px-4 pb-4">
              <p className="text-xs text-slate-500 font-mono leading-relaxed whitespace-pre-wrap break-words">{prompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
