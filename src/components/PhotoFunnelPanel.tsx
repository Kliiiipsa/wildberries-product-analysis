'use client';

import { useState, useRef } from 'react';
import {
  ArrowLeft, Upload, Loader2, Sparkles, ImageIcon,
  Camera, User, Search, Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface PhotoAnalysis {
  good: string[] | string;
  improve: string[] | string;
  recommendations: {
    composition: string[] | string;
    technique: string[] | string;
    styling: string[] | string;
  };
  ideas: Array<{ title: string; description: string; tag?: string | null }>;
  generatePrompt?: string;
}

const toArr = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};

function getWbBasket(vol: number): string {
  if (vol <= 143) return '01';
  if (vol <= 287) return '02';
  if (vol <= 431) return '03';
  if (vol <= 719) return '04';
  if (vol <= 1007) return '05';
  if (vol <= 1061) return '06';
  if (vol <= 1115) return '07';
  if (vol <= 1169) return '08';
  if (vol <= 1313) return '09';
  if (vol <= 1601) return '10';
  if (vol <= 1655) return '11';
  if (vol <= 1919) return '12';
  if (vol <= 2045) return '13';
  if (vol <= 2189) return '14';
  if (vol <= 2405) return '15';
  if (vol <= 2621) return '16';
  if (vol <= 2837) return '17';
  if (vol <= 3053) return '18';
  if (vol <= 3269) return '19';
  if (vol <= 3485) return '20';
  if (vol <= 3701) return '21';
  if (vol <= 3917) return '22';
  // Baskets 23+ follow a regular 216-vol-per-basket pattern
  const n = 23 + Math.floor((vol - 3918) / 216);
  return String(n).padStart(2, '0');
}

function getWbPhotoUrls(nmId: number): string[] {
  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  const basket = getWbBasket(vol);
  const base = `https://basket-${basket}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/`;
  return Array.from({ length: 20 }, (_, i) => `${base}${i + 1}.jpg`);
}

interface ModelAppearance {
  gender: string;
  age: string;
  bodyType: string;
  hairColor: string;
  extra: string;
}

type AppMode = 'input' | 'gallery' | 'editor';

interface Props {
  onBack: () => void;
}

export function PhotoFunnelPanel({ onBack }: Props) {
  const [appMode, setAppMode] = useState<AppMode>('input');
  const [article, setArticle] = useState('');
  const [articleInput, setArticleInput] = useState('');
  const [wbPhotoUrls, setWbPhotoUrls] = useState<string[]>([]);
  const [loadedIndices, setLoadedIndices] = useState<Set<number>>(new Set());
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [generatedImage, setGeneratedImage] = useState('');
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [error, setError] = useState('');
  const [generateError, setGenerateError] = useState('');
  const [activeTab, setActiveTab] = useState('assessment');

  const [modelAppearance, setModelAppearance] = useState<ModelAppearance>({
    gender: '', age: '', bodyType: '', hairColor: '', extra: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveUrl = imageBase64 || selectedPhotoUrl || urlInput.trim();

  // ── Load WB photos ──────────────────────────────────────────────────────────
  const handleLoadArticle = async () => {
    const nmId = parseInt(articleInput.trim());
    if (!nmId || isNaN(nmId)) { setError('Введите корректный артикул'); return; }
    setArticle(articleInput.trim());
    setWbPhotoUrls([]);
    setLoadedIndices(new Set());
    setLoadingPhotos(true);
    setError('');
    setAppMode('gallery');
    try {
      const res = await fetch('/api/photo/wb-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nmId }),
      });
      const data = await res.json();
      if (!res.ok || !data.photos?.length) {
        setError(data.error || 'Фото не найдены. Проверьте артикул.');
        setLoadingPhotos(false);
        return;
      }
      setWbPhotoUrls(data.photos);
      setLoadedIndices(new Set(data.photos.map((_: string, i: number) => i)));
    } catch {
      setError('Ошибка загрузки фото');
    } finally {
      setLoadingPhotos(false);
    }
  };


  // ── Select photo → editor ───────────────────────────────────────────────────
  const openEditor = (url: string) => {
    setSelectedPhotoUrl(url);
    setImageBase64('');
    setImagePreview(url);
    setAnalysis(null);
    setGeneratedImage('');
    setGenerateError('');
    setError('');
    setAppMode('editor');
  };

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const b64 = e.target?.result as string;
      setImageBase64(b64);
      setImagePreview(b64);
      setSelectedPhotoUrl('');
      setAnalysis(null);
      setGeneratedImage('');
      setAppMode('editor');
    };
    reader.readAsDataURL(file);
  };

  // ── Analyze ─────────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!effectiveUrl) return;
    setIsAnalyzing(true);
    setError('');
    setAnalysis(null);
    setGeneratedImage('');
    try {
      const res = await fetch('/api/photo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: effectiveUrl }),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(text); } catch { throw new Error(`Ошибка сервера: ${text.slice(0, 150)}`); }
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
      const raw = data.analysis;
      let parsed: PhotoAnalysis;
      if (typeof raw === 'string') {
        const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(clean);
      } else {
        parsed = raw as PhotoAnalysis;
      }
      setAnalysis(parsed);
      if (parsed.generatePrompt) setGeneratePrompt(parsed.generatePrompt);
      setActiveTab('assessment');
    } catch (e) {
      setError(String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Build prompt with appearance ────────────────────────────────────────────
  const buildPrompt = (base: string): string => {
    const parts = [base];
    const ap = modelAppearance;
    const apMap: Record<string, string> = {
      'Женщина': 'female model', 'Мужчина': 'male model',
      '18-25': 'age 18-25', '25-35': 'age 25-35', '35-45': 'age 35-45', '45+': 'age 45+',
      'Стройное': 'slim body', 'Спортивное': 'athletic body', 'Пышное': 'curvy body', 'Полное': 'plus size body',
      'Тёмные': 'dark hair', 'Светлые': 'blonde hair', 'Рыжие': 'red hair', 'Седые': 'grey hair',
    };
    if (ap.gender) parts.push(apMap[ap.gender] ?? ap.gender);
    if (ap.age) parts.push(apMap[ap.age] ?? ap.age);
    if (ap.bodyType) parts.push(apMap[ap.bodyType] ?? ap.bodyType);
    if (ap.hairColor) parts.push(apMap[ap.hairColor] ?? ap.hairColor);
    if (ap.extra.trim()) parts.push(ap.extra.trim());
    return parts.join(', ');
  };

  // ── Generate ────────────────────────────────────────────────────────────────
  const handleGenerate = async (customPrompt?: string) => {
    const src = effectiveUrl;
    const prompt = customPrompt ?? generatePrompt;
    if (!src || !prompt.trim()) return;
    setIsGenerating(true);
    setGenerateError('');
    setGeneratedImage('');
    setActiveTab('generate');
    try {
      const res = await fetch('/api/photo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: src, prompt: buildPrompt(prompt) }),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(text); } catch { throw new Error(`Ошибка сервера: ${text.slice(0, 150)}`); }
      if (!res.ok) throw new Error((data.error as string) || 'Ошибка генерации');
      setGeneratedImage(data.imageUrl as string);
    } catch (e) {
      setGenerateError(String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleIdeaClick = (idea: { title: string; description: string }) => {
    const prompt = `${idea.description}. Professional Wildberries product photography, high quality, studio setup.`;
    setGeneratePrompt(prompt);
    handleGenerate(prompt);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // INPUT MODE
  // ══════════════════════════════════════════════════════════════════════════
  if (appMode === 'input') {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" />Назад
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <Camera className="h-4 w-4 text-rose-400" />
          <h2 className="text-base font-semibold text-white">Улучшение фотоворонки</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Article */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="h-5 w-5 text-blue-400" />
              <h3 className="text-white font-semibold">По артикулу WB</h3>
            </div>
            <p className="text-xs text-slate-500 mb-5">Введите артикул — загрузим все фото из карточки товара</p>
            <Input
              placeholder="Например: 785628816"
              value={articleInput}
              onChange={e => { setArticleInput(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleLoadArticle(); }}
              className="bg-slate-800/50 border-slate-700/50 text-sm rounded-xl mb-3"
            />
            {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
            <Button onClick={handleLoadArticle} disabled={!articleInput.trim()} className="mt-auto w-full bg-blue-600 hover:bg-blue-500 rounded-xl h-10 text-sm">
              <Search className="h-4 w-4 mr-2" />Загрузить фотоворонку
            </Button>
          </div>

          {/* Single photo */}
          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Upload className="h-5 w-5 text-rose-400" />
              <h3 className="text-white font-semibold">Одно фото</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Загрузите файл или вставьте URL изображения</p>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileSelect(f); }}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/20 cursor-pointer hover:border-slate-600 transition-all p-8 text-center mb-4 flex-1 flex flex-col items-center justify-center"
            >
              <Upload className="h-7 w-7 text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">Перетащите или нажмите для загрузки</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Или URL фото..."
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && urlInput.trim()) openEditor(urlInput.trim()); }}
                className="bg-slate-800/50 border-slate-700/50 text-sm rounded-xl"
              />
              <Button
                onClick={() => { if (urlInput.trim()) openEditor(urlInput.trim()); }}
                disabled={!urlInput.trim()}
                className="bg-rose-500 hover:bg-rose-400 rounded-xl px-4 shrink-0"
              >→</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GALLERY MODE
  // ══════════════════════════════════════════════════════════════════════════
  if (appMode === 'gallery') {
    const visible = wbPhotoUrls.filter((_, i) => loadedIndices.has(i));
    return (
      <div className="w-full">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setAppMode('input')} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" />Назад
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <Camera className="h-4 w-4 text-rose-400" />
          <h2 className="text-base font-semibold text-white">Артикул {article}</h2>
          {visible.length > 0 && (
            <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">
              Все фото ({visible.length})
            </span>
          )}
          <span className="text-xs text-slate-600 ml-auto">Нажмите «Улучшить» для редактирования</span>
        </div>

        {loadingPhotos && visible.length === 0 && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-slate-600 mr-2" />
            <span className="text-slate-500 text-sm">Загружаем фото...</span>
          </div>
        )}

        {!loadingPhotos && visible.length === 0 && (
          <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
            Фото не найдены. Проверьте артикул.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {wbPhotoUrls.map((url, i) => (
            <div key={i} className="group flex flex-col rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800/30 hover:border-slate-600 transition-all">
              <div className="relative aspect-[3/4] overflow-hidden">
                <img src={url} alt={`Фото ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute top-2 left-2">
                  <span className="text-xs text-white/80 bg-black/50 px-2 py-0.5 rounded-full">Фото {i + 1}</span>
                </div>
              </div>
              <div className="p-2">
                <button
                  onClick={() => openEditor(url)}
                  className="w-full text-xs font-semibold text-white bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 rounded-xl py-2 transition-opacity"
                >
                  Улучшить
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EDITOR MODE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setAppMode(wbPhotoUrls.length > 0 ? 'gallery' : 'input')}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          {wbPhotoUrls.length > 0 ? 'К галерее' : 'Назад'}
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <Camera className="h-4 w-4 text-rose-400" />
        <h2 className="text-base font-semibold text-white">Улучшение фото</h2>
        {article && <span className="text-xs text-slate-500">Артикул: {article}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* ── LEFT: photo + controls ── */}
        <div className="space-y-3">
          {/* Original */}
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Исходное фото</p>
          <div
            className="relative rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800/30 aspect-[3/4] group cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileSelect(f); }}
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="preview" className="w-full h-full object-cover" onError={() => setImagePreview('')} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1 text-white">
                    <Upload className="h-6 w-6" />
                    <span className="text-xs font-medium">Заменить фото</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <Upload className="h-8 w-8 mb-2" />
                <p className="text-xs">Перетащите или нажмите</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
          </div>

          {error && (
            <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-xs text-red-400">{error}</div>
          )}

          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !effectiveUrl}
            className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white font-semibold rounded-xl h-11"
          >
            {isAnalyzing
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Анализирую...</>
              : <><Sparkles className="h-4 w-4 mr-2" />Анализировать фото</>}
          </Button>

          {/* Generated result */}
          {(isGenerating || generatedImage || generateError) && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Результат</p>
              {isGenerating && (
                <div className="rounded-2xl border border-slate-700 bg-slate-800/30 flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-400 mr-2" />
                  <span className="text-sm text-slate-400">Генерирую ~30-50 сек...</span>
                </div>
              )}
              {generateError && (
                <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-xs text-red-400">{generateError}</div>
              )}
              {generatedImage && (
                <div className="rounded-2xl overflow-hidden border border-violet-700/40 bg-slate-800/30 aspect-[3/4]">
                  <img src={generatedImage} alt="Generated" className="w-full h-full object-cover" />
                </div>
              )}
              {generatedImage && (
                <a href={generatedImage} target="_blank" rel="noopener noreferrer"
                  className="block text-center text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  Открыть в полном размере ↗
                </a>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: analysis tabs ── */}
        <div>
          {!analysis && !isAnalyzing && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex items-center justify-center h-full min-h-[320px]">
              <div className="text-center text-slate-600 p-8">
                <Camera className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Нажмите «Анализировать»</p>
                <p className="text-xs mt-1 opacity-70">AI оценит карточку и предложит идеи для улучшения</p>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex items-center justify-center min-h-[320px]">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-rose-400 mx-auto mb-3" />
                <p className="text-sm text-slate-400">AI анализирует фото...</p>
                <p className="text-xs text-slate-600 mt-1">~15-25 секунд</p>
              </div>
            </div>
          )}

          {analysis && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-4 w-full bg-slate-800/60 rounded-xl mb-5 h-10">
                <TabsTrigger value="assessment" className="text-xs rounded-lg">Оценка</TabsTrigger>
                <TabsTrigger value="ideas" className="text-xs rounded-lg">Идеи</TabsTrigger>
                <TabsTrigger value="generate" className="text-xs rounded-lg">Генерация</TabsTrigger>
                <TabsTrigger value="character" className="text-xs rounded-lg">Персонаж</TabsTrigger>
              </TabsList>

              {/* ── ASSESSMENT ── */}
              <TabsContent value="assessment" className="mt-0 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-emerald-800/40 bg-emerald-900/10 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                        <span className="text-emerald-400 text-xs font-bold">✓</span>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400">Что уже хорошо</span>
                    </div>
                    <ul className="space-y-2">
                      {toArr(analysis.good).map((item, i) => (
                        <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5 shrink-0">•</span>{item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-orange-800/40 bg-orange-900/10 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-6 w-6 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0">
                        <span className="text-orange-400 text-xs font-bold">!</span>
                      </div>
                      <span className="text-sm font-semibold text-orange-400">Что улучшить</span>
                    </div>
                    <ul className="space-y-2">
                      {toArr(analysis.improve).map((item, i) => (
                        <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                          <span className="text-orange-500 mt-0.5 shrink-0">•</span>{item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border border-blue-800/40 bg-blue-900/10 p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-sm font-semibold text-blue-400">Рекомендации по улучшению</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {[
                      { label: 'Композиция', key: 'composition' as const },
                      { label: 'Техника съёмки', key: 'technique' as const },
                      { label: 'Стайлинг', key: 'styling' as const },
                    ].map(({ label, key }) => (
                      toArr(analysis.recommendations[key]).length > 0 ? (
                        <div key={key}>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
                          {toArr(analysis.recommendations[key]).map((r, i) => (
                            <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5 mb-1.5">
                              <span className="shrink-0 text-blue-500">•</span>{r}
                            </p>
                          ))}
                        </div>
                      ) : null
                    ))}
                  </div>
                </div>

                {generatePrompt && (
                  <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
                    <p className="text-xs text-slate-500 mb-2 font-medium">AI промпт для генерации</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{generatePrompt}</p>
                    <Button
                      onClick={() => handleGenerate()}
                      disabled={isGenerating}
                      className="mt-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 text-white text-xs rounded-xl h-9 px-4"
                    >
                      <Sparkles className="h-3 w-3 mr-1.5" />Применить рекомендации
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* ── IDEAS ── */}
              <TabsContent value="ideas" className="mt-0">
                <p className="text-xs text-slate-500 mb-4">
                  Нажмите на идею — AI сгенерирует фото по этой концепции
                </p>
                <div className="space-y-2">
                  {analysis.ideas?.map((idea, i) => (
                    <button
                      key={i}
                      onClick={() => handleIdeaClick(idea)}
                      disabled={isGenerating}
                      className="w-full text-left rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 hover:border-rose-500/50 hover:bg-slate-800/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <span className="font-semibold text-white text-sm group-hover:text-rose-300 transition-colors">
                          {idea.title}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {idea.tag && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              idea.tag === 'Главная'
                                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            }`}>{idea.tag}</span>
                          )}
                          <span className="text-xs text-slate-600 group-hover:text-rose-400 transition-colors">
                            {isGenerating ? '...' : '→ Генерировать'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{idea.description}</p>
                    </button>
                  ))}
                </div>
              </TabsContent>

              {/* ── GENERATE ── */}
              <TabsContent value="generate" className="mt-0 space-y-4">
                <div>
                  <label className="text-xs text-slate-400 mb-2 block">Промпт (английский) — AI заполнил автоматически</label>
                  <textarea
                    value={generatePrompt}
                    onChange={e => setGeneratePrompt(e.target.value)}
                    placeholder="Describe what to change..."
                    rows={5}
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 resize-none"
                  />
                </div>
                <Button
                  onClick={() => handleGenerate()}
                  disabled={isGenerating || !generatePrompt.trim() || !effectiveUrl}
                  className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl h-11"
                >
                  {isGenerating
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую...</>
                    : <><ImageIcon className="h-4 w-4 mr-2" />Сгенерировать</>}
                </Button>
              </TabsContent>

              {/* ── CHARACTER ── */}
              <TabsContent value="character" className="mt-0 space-y-4">
                <p className="text-xs text-slate-500">
                  Настройте внешность модели на фото. Параметры добавятся к промпту генерации.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { label: 'Пол модели', key: 'gender', options: ['Женщина', 'Мужчина'] },
                    { label: 'Возраст', key: 'age', options: ['18-25', '25-35', '35-45', '45+'] },
                    { label: 'Телосложение', key: 'bodyType', options: ['Стройное', 'Спортивное', 'Пышное', 'Полное'] },
                    { label: 'Цвет волос', key: 'hairColor', options: ['Тёмные', 'Светлые', 'Рыжие', 'Седые'] },
                  ] as const).map(({ label, key, options }) => (
                    <div key={key}>
                      <label className="text-xs text-slate-400 mb-1.5 block">{label}</label>
                      <select
                        value={modelAppearance[key]}
                        onChange={e => setModelAppearance(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/60"
                      >
                        <option value="">Не менять</option>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Дополнительное описание</label>
                  <textarea
                    value={modelAppearance.extra}
                    onChange={e => setModelAppearance(prev => ({ ...prev, extra: e.target.value }))}
                    placeholder="Например: длинные волосы, улыбается, загорелая кожа..."
                    rows={2}
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 resize-none"
                  />
                </div>
                {!generatePrompt && (
                  <p className="text-xs text-amber-500/80">Сначала проанализируйте фото, чтобы AI сформировал базовый промпт</p>
                )}
                <Button
                  onClick={() => handleGenerate()}
                  disabled={isGenerating || !effectiveUrl || !generatePrompt.trim()}
                  className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl h-11"
                >
                  {isGenerating
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую...</>
                    : <><User className="h-4 w-4 mr-2" />Применить персонажа</>}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
