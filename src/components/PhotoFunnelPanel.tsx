'use client';

import { useState, useRef } from 'react';
import {
  ArrowLeft, Upload, Loader2, Sparkles, ImageIcon,
  Camera, User, Search, Hash, Type,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import PhotoTextEditor from '@/components/PhotoTextEditor';
import PhotoInfographicEditor from '@/components/PhotoInfographicEditor';

interface TextVariant {
  approach: 'Выгоды' | 'Характеристики' | 'Эмоции' | 'Минимализм';
  productName: string;
  subtitle: string;
  tagline: string;
  characteristics: Array<{ title: string; value: string }>;
  bottomText: string;
}

interface CompositionData {
  subjectZone?: string;
  freeZones?: string[];
  primaryTextZone?: string;
  textZoneReason?: string;
  recommendedTextAlignment?: 'vertical' | 'horizontal' | 'two-column';
}

interface OverlayStyleData {
  pillStyle?: 'frosted' | 'solid' | 'outline' | 'gradient' | 'minimal' | 'none';
  pillOpacity?: number;
  colorScheme?: 'light' | 'dark';
  pillBgRgba?: string;
  textColorHex?: string;
  scrimOpacity?: number;
  scrimDirection?: string;
  blurRadius?: number;
  shadowIntensity?: number;
}

interface PhotoAnalysis {
  good: string[] | string;
  improve: string[] | string;
  recommendations: {
    composition: string[] | string;
    technique: string[] | string;
    styling: string[] | string;
  };
  bestAction?: { title: string; promptEn: string };
  ideas: Array<{ title: string; description: string; tag?: string | null; promptEn?: string }>;
  generatePrompt?: string;
  generatePromptRu?: string;
  fluxPrompt?: string;
  recommendedLayout?: 'left' | 'bottom' | 'minimal';
  style?: 'minimal' | 'studio' | 'lifestyle' | 'premium';
  textPosition?: 'left-third' | 'bottom' | 'overlay';
  textVariants?: TextVariant[];
  composition?: CompositionData;
  overlayStyle?: OverlayStyleData;
  fluxExtendNote?: string;
}

interface FunnelPhoto {
  title: string;
  description: string;
  concept: 'studio' | 'closeup' | 'lifestyle' | 'silhouette';
  promptEn: string;
}

const toArr = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
};


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
  const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());
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

  // Ideas funnel (from AI ideas tab)
  const [funnelImages, setFunnelImages] = useState<(string | null)[]>([]);
  const [funnelLoading, setFunnelLoading] = useState<boolean[]>([]);
  const [isFunnelGenerating, setIsFunnelGenerating] = useState(false);

  // Воронка tab — 4 fixed concept photos
  const [funnelPhotos, setFunnelPhotos] = useState<FunnelPhoto[]>([]);
  const [isLoadingFunnelPrompts, setIsLoadingFunnelPrompts] = useState(false);
  const [funnelPhotoImages, setFunnelPhotoImages] = useState<(string | null)[]>([null, null, null, null]);
  const [funnelPhotoLoading, setFunnelPhotoLoading] = useState<boolean[]>([false, false, false, false]);
  const [isFunnelPhotoGenerating, setIsFunnelPhotoGenerating] = useState(false);

  // Russian prompt display (generatePrompt is English for AI, generatePromptRu is Russian for user)
  const [generatePromptRu, setGeneratePromptRu] = useState('');
  const [ruPrompt, setRuPrompt] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  const [modelAppearance, setModelAppearance] = useState<ModelAppearance>({
    gender: '', age: '', bodyType: '', hairColor: '', extra: '',
  });
  const [textMode, setTextMode] = useState<'infographic' | 'overlay'>('infographic');
  const [fluxPrompt, setFluxPrompt] = useState('');
  const [textVariants, setTextVariants] = useState<TextVariant[]>([]);
  const [compositionData, setCompositionData] = useState<CompositionData | null>(null);
  const [overlayStyleData, setOverlayStyleData] = useState<OverlayStyleData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveUrl = imageBase64 || selectedPhotoUrl || urlInput.trim();

  // ── Load WB photos ──────────────────────────────────────────────────────────
  const handleLoadArticle = async () => {
    const nmId = parseInt(articleInput.trim());
    if (!nmId || isNaN(nmId)) { setError('Введите корректный артикул'); return; }
    setArticle(articleInput.trim());
    setWbPhotoUrls([]);
    setFailedIndices(new Set());
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
    } catch {
      setError('Ошибка загрузки фото');
    } finally {
      setLoadingPhotos(false);
    }
  };


  // ── Select photo → editor ───────────────────────────────────────────────────
  // Load through server proxy so WebP (WB CDN) can be drawn on canvas without CORS issues,
  // then export as JPEG base64 — required by Yandex API which rejects WebP.
  const openEditor = (url: string) => {
    setSelectedPhotoUrl(url);
    setImageBase64('');
    setImagePreview(url);
    setAnalysis(null);
    setGeneratedImage('');
    setGenerateError('');
    setError('');
    setAppMode('editor');

    const proxyUrl = `/api/photo/proxy?url=${encodeURIComponent(url)}`;
    const img = new Image();
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      const b64 = canvas.toDataURL('image/jpeg', 0.92);
      setImageBase64(b64);
      setImagePreview(b64);
    };
    img.src = proxyUrl;
  };

  // ── File upload — resize to max 1024px JPEG 0.92 (confirmed working with FLUX) ─
  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const src = e.target?.result as string;
      const img = new Image();
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
        const b64 = canvas.toDataURL('image/jpeg', 0.92);
        setImageBase64(b64);
        setImagePreview(b64);
        setSelectedPhotoUrl('');
        setAnalysis(null);
        setGeneratedImage('');
        setAppMode('editor');
      };
      img.src = src;
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
      if (parsed.fluxPrompt) setFluxPrompt(parsed.fluxPrompt);
      if (parsed.textVariants?.length) setTextVariants(parsed.textVariants);
      if (parsed.composition) setCompositionData(parsed.composition);
      if (parsed.overlayStyle) setOverlayStyleData(parsed.overlayStyle);
      if (parsed.generatePrompt) {
        setGeneratePrompt(parsed.generatePrompt);
        // Use Qwen's own Russian description (more reliable than translate API)
        if (parsed.generatePromptRu) {
          setGeneratePromptRu(parsed.generatePromptRu);
        }
      }
      setActiveTab('assessment');
    } catch (e) {
      setError(String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Build prompt with appearance (used for idea/funnel generation) ──────────
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

  // ── Build dedicated character-replacement prompt ──────────────────────────
  // Unlike buildPrompt (which appends traits to a [PRESERVE]-first prompt),
  // this function builds a fresh prompt where [PRESERVE] protects ONLY the
  // clothing and [CHANGE] explicitly instructs FLUX to swap the model.
  const buildCharacterChangePrompt = (): string => {
    const ap = modelAppearance;
    const hasAnyParam = ap.gender || ap.age || ap.bodyType || ap.hairColor || ap.extra.trim();
    if (!hasAnyParam) return generatePrompt;

    const genderMap: Record<string, string> = { 'Женщина': 'female', 'Мужчина': 'male' };
    const ageMap: Record<string, string> = { '18-25': 'young 20s', '25-35': 'mid-30s', '35-45': 'late 30s', '45+': '50s' };
    const bodyMap: Record<string, string> = { 'Стройное': 'slim', 'Спортивное': 'athletic muscular', 'Пышное': 'curvy', 'Полное': 'plus-size' };
    const hairMap: Record<string, string> = { 'Тёмные': 'dark hair', 'Светлые': 'blonde hair', 'Рыжие': 'red hair', 'Седые': 'grey hair' };

    const modelParts: string[] = [];
    if (ap.age) modelParts.push(ageMap[ap.age] ?? ap.age);
    if (ap.bodyType) modelParts.push(bodyMap[ap.bodyType] ?? ap.bodyType);
    if (ap.hairColor) modelParts.push(hairMap[ap.hairColor] ?? ap.hairColor);
    if (ap.gender) modelParts.push((genderMap[ap.gender] ?? ap.gender) + ' model');
    if (ap.extra.trim()) modelParts.push(ap.extra.trim());
    const modelDesc = modelParts.join(', ');

    // Extract clothing from [PRESERVE] section of generatePrompt.
    // generatePrompt typically: "[PRESERVE] Keep unchanged: <clothing>. [CHANGE] ... [SCENE] ... [QUALITY] ..."
    const preserveMatch = generatePrompt.match(/\[PRESERVE\]([\s\S]*?)(?=\[CHANGE\]|\[SCENE\]|\[QUALITY\])/);
    const clothingDesc = preserveMatch
      ? preserveMatch[1].replace(/Keep unchanged:/i, '').trim().replace(/\.$/, '')
      : 'all clothing items from the original photo';

    return (
      `[PRESERVE] Keep ONLY the clothing unchanged: ${clothingDesc}. ` +
      `[CHANGE] Replace the model entirely with a new ${modelDesc} — the new model wears the exact same outfit. ` +
      `[SCENE] Clean studio background, professional fashion photography, same lighting as original. ` +
      `[QUALITY] Genuine photograph, Canon EOS R5, 50mm f/1.8, natural light, real film grain, no AI artifacts.`
    );
  };

  // ── Translate prompt RU→EN if needed, then generate ────────────────────────
  const resolveEnglishPrompt = async (ru: string, enFallback: string): Promise<string> => {
    if (!/[а-яёА-ЯЁ]/.test(ru)) return ru; // already English
    try {
      const r = await fetch('/api/photo/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ru }),
      });
      const d = await r.json();
      return d.translated || enFallback;
    } catch { return enFallback; }
  };

  // ── Generate ────────────────────────────────────────────────────────────────
  const handleGenerate = async (customPrompt?: string) => {
    const src = effectiveUrl;
    // customPrompt is always English (from idea cards).
    // generatePromptRu is a Russian description shown/edited by user.
    // generatePrompt is the original English technical prompt from Qwen.
    // Strategy: if user has Russian text — translate it; otherwise use English directly.
    let prompt: string;
    if (customPrompt) {
      prompt = customPrompt;
    } else if (generatePromptRu.trim()) {
      // User sees/edits Russian — translate to English for AI
      prompt = await resolveEnglishPrompt(generatePromptRu, generatePrompt);
    } else {
      // Fallback: use the original English prompt directly (no translation needed)
      prompt = generatePrompt;
    }
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

  const handleIdeaClick = (idea: { title: string; description: string; promptEn?: string }) => {
    const prompt = idea.promptEn || generatePrompt;
    if (!prompt) return;
    setGeneratePrompt(prompt);
    handleGenerate(prompt);
  };

  // ── Generate full funnel (all ideas in parallel) ────────────────────────────
  const handleFunnelGenerate = async () => {
    const src = effectiveUrl;
    if (!src || !analysis?.ideas?.length) return;
    const ideas = analysis.ideas;
    const count = ideas.length;
    setIsFunnelGenerating(true);
    setFunnelImages(Array(count).fill(null));
    setFunnelLoading(Array(count).fill(true));
    setActiveTab('ideas');

    await Promise.allSettled(
      ideas.map(async (idea, i) => {
        const prompt = idea.promptEn || generatePrompt;
        if (!prompt) {
          setFunnelLoading(prev => { const n = [...prev]; n[i] = false; return n; });
          return;
        }
        try {
          const res = await fetch('/api/photo/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: src, prompt: buildPrompt(prompt) }),
          });
          const data = await res.json();
          if (res.ok && data.imageUrl) {
            setFunnelImages(prev => { const n = [...prev]; n[i] = data.imageUrl; return n; });
          }
        } catch { /* ignore individual errors */ } finally {
          setFunnelLoading(prev => { const n = [...prev]; n[i] = false; return n; });
        }
      })
    );
    setIsFunnelGenerating(false);
  };

  // ── Translate custom Russian prompt to English ──────────────────────────────
  const handleTranslate = async () => {
    if (!ruPrompt.trim()) return;
    setIsTranslating(true);
    try {
      const res = await fetch('/api/photo/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ruPrompt }),
      });
      const data = await res.json();
      if (data.translated) setGeneratePromptRu(data.translated);
    } catch { /* ignore */ } finally {
      setIsTranslating(false);
    }
  };

  // ── Load funnel prompts (4 fixed concepts) ──────────────────────────────────
  const handleLoadFunnelPrompts = async () => {
    if (!analysis?.generatePrompt && !generatePrompt) return;
    setIsLoadingFunnelPrompts(true);
    setFunnelPhotos([]);
    setFunnelPhotoImages([null, null, null, null]);
    try {
      const analysisText = analysis
        ? `Что хорошо: ${toArr(analysis.good).join('; ')} | Улучшить: ${toArr(analysis.improve).join('; ')}`
        : '';
      const res = await fetch('/api/photo/funnel-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatePrompt: generatePrompt || '', analysisText }),
      });
      const data = await res.json();
      if (data.funnelPhotos?.length) setFunnelPhotos(data.funnelPhotos);
    } catch { /* ignore */ } finally {
      setIsLoadingFunnelPrompts(false);
    }
  };

  // ── Generate all 4 funnel photos ────────────────────────────────────────────
  const handleGenerateFunnelPhotos = async () => {
    const src = effectiveUrl;
    if (!src || !funnelPhotos.length) return;
    setIsFunnelPhotoGenerating(true);
    setFunnelPhotoImages([null, null, null, null]);
    setFunnelPhotoLoading([true, true, true, true]);

    await Promise.allSettled(
      funnelPhotos.map(async (photo, i) => {
        try {
          const res = await fetch('/api/photo/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: src, prompt: buildPrompt(photo.promptEn) }),
          });
          const data = await res.json();
          if (res.ok && data.imageUrl) {
            setFunnelPhotoImages(prev => { const n = [...prev]; n[i] = data.imageUrl; return n; });
          }
        } catch { /* ignore */ } finally {
          setFunnelPhotoLoading(prev => { const n = [...prev]; n[i] = false; return n; });
        }
      })
    );
    setIsFunnelPhotoGenerating(false);
  };

  // ── Generate single funnel photo ────────────────────────────────────────────
  const handleGenerateSingleFunnelPhoto = async (photo: FunnelPhoto, i: number) => {
    const src = effectiveUrl;
    if (!src) return;
    setFunnelPhotoLoading(prev => { const n = [...prev]; n[i] = true; return n; });
    setFunnelPhotoImages(prev => { const n = [...prev]; n[i] = null; return n; });
    try {
      const res = await fetch('/api/photo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: src, prompt: buildPrompt(photo.promptEn) }),
      });
      const data = await res.json();
      if (res.ok && data.imageUrl) {
        setFunnelPhotoImages(prev => { const n = [...prev]; n[i] = data.imageUrl; return n; });
      }
    } catch { /* ignore */ } finally {
      setFunnelPhotoLoading(prev => { const n = [...prev]; n[i] = false; return n; });
    }
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
    const visibleCount = wbPhotoUrls.length - failedIndices.size;
    const allFailed = !loadingPhotos && wbPhotoUrls.length > 0 && failedIndices.size === wbPhotoUrls.length;
    const isEmpty = !loadingPhotos && wbPhotoUrls.length === 0;

    return (
      <div className="w-full">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setAppMode('input')} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft className="h-4 w-4" />Назад
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <Camera className="h-4 w-4 text-rose-400" />
          <h2 className="text-base font-semibold text-white">Артикул {article}</h2>
          {visibleCount > 0 && (
            <span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">
              Все фото ({visibleCount})
            </span>
          )}
          <span className="text-xs text-slate-600 ml-auto">Нажмите «Улучшить» для редактирования</span>
        </div>

        {loadingPhotos && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-slate-600 mr-2" />
            <span className="text-slate-500 text-sm">Загружаем фото...</span>
          </div>
        )}

        {(isEmpty || allFailed) && (
          <div className="flex items-center justify-center py-24 text-slate-500 text-sm">
            {error || 'Фото не найдены. Проверьте артикул.'}
          </div>
        )}

        {!loadingPhotos && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {wbPhotoUrls.map((url, i) => (
              !failedIndices.has(i) && (
                <div key={i} className="group flex flex-col rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800/30 hover:border-slate-600 transition-all">
                  <div className="relative aspect-[3/4] overflow-hidden">
                    <img
                      src={url}
                      alt={`Фото ${i + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={() => setFailedIndices(prev => new Set([...prev, i]))}
                    />
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
              )
            ))}
          </div>
        )}
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

      {/* Row 1: photos side by side — big */}
      <div className="grid gap-5 mb-5 grid-cols-1 md:grid-cols-2">

        {/* Original photo */}
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Исходное фото</p>
          <div
            className="relative rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800/30 w-full aspect-[3/4] max-h-[72vh] group cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleFileSelect(f); }}
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="preview" className="w-full h-full object-contain" onError={() => setImagePreview('')} />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1 text-white">
                    <Upload className="h-6 w-6" />
                    <span className="text-xs font-medium">Заменить</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 p-4 text-center">
                <Upload className="h-10 w-10 mb-3" />
                <p className="text-sm">Перетащите или нажмите</p>
                <p className="text-xs mt-1 opacity-60">JPG, PNG, WEBP</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
          </div>
          {error && (
            <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-3 py-2.5 text-xs text-red-400">{error}</div>
          )}
        </div>

        {/* Result photo */}
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Результат</p>
          <div className="relative rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-800/30 w-full aspect-[3/4] max-h-[72vh] flex items-center justify-center">
            {isGenerating && (
              <div className="text-center">
                <Loader2 className="h-10 w-10 animate-spin text-violet-400 mx-auto mb-3" />
                <p className="text-sm text-slate-400">Генерирую...</p>
                <p className="text-xs text-slate-600 mt-1">~30–60 секунд</p>
              </div>
            )}
            {!isGenerating && generateError && (
              <div className="p-6 text-center">
                <p className="text-xs text-red-400">{generateError}</p>
              </div>
            )}
            {!isGenerating && !generateError && generatedImage && (
              <img src={generatedImage} alt="Результат" className="w-full h-full object-contain" />
            )}
            {!isGenerating && !generateError && !generatedImage && (
              <div className="text-center text-slate-700 p-8">
                <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Здесь появится результат</p>
                <p className="text-xs mt-1 opacity-60">Нажмите «Анализировать» или выберите идею</p>
              </div>
            )}
          </div>
          {generatedImage && !isGenerating && (
            <a
              href={generatedImage}
              download="generated.jpg"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 text-xs text-slate-400 hover:text-white transition-all py-2.5"
            >
              Скачать
            </a>
          )}
        </div>
      </div>

      {/* Row 2: Analyze button */}
      <Button
        onClick={handleAnalyze}
        disabled={isAnalyzing || !effectiveUrl}
        className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white font-semibold rounded-xl h-12 mb-5"
      >
        {isAnalyzing
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Анализирую... (~20 сек)</>
          : <><Sparkles className="h-4 w-4 mr-2" />Анализировать фото</>}
      </Button>

      {/* Row 3: Analysis tabs */}
      {!analysis && !isAnalyzing && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex items-center justify-center py-10">
          <div className="text-center text-slate-600 p-4">
            <Camera className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Нажмите «Анализировать» — AI оценит фото и предложит идеи</p>
          </div>
        </div>
      )}

      {isAnalyzing && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex items-center justify-center py-10">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-rose-400 mx-auto mb-3" />
            <p className="text-sm text-slate-400">AI анализирует фото...</p>
          </div>
        </div>
      )}

      {analysis && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-6 w-full bg-slate-800/60 rounded-xl mb-5 h-10">
            <TabsTrigger value="assessment" className="text-xs rounded-lg">Оценка</TabsTrigger>
            <TabsTrigger value="funnel" className="text-xs rounded-lg">Воронка</TabsTrigger>
            <TabsTrigger value="ideas" className="text-xs rounded-lg">Идеи</TabsTrigger>
            <TabsTrigger value="generate" className="text-xs rounded-lg">Генерация</TabsTrigger>
            <TabsTrigger value="character" className="text-xs rounded-lg">Персонаж</TabsTrigger>
            <TabsTrigger value="text" className="text-xs rounded-lg flex items-center gap-1"><Sparkles className="h-3 w-3" />Инфографика AI</TabsTrigger>
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
                <span className="text-sm font-semibold text-blue-400">Рекомендации</span>
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

            {analysis.bestAction && (
              <div className="rounded-xl border border-violet-700/50 bg-violet-900/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-violet-400 shrink-0" />
                  <span className="text-sm font-semibold text-violet-300">Лучшее действие</span>
                </div>
                <p className="text-sm text-white font-medium mb-3">{analysis.bestAction.title}</p>
                <Button
                  onClick={() => {
                    setGeneratePrompt(analysis.bestAction!.promptEn);
                    handleGenerate(analysis.bestAction!.promptEn);
                  }}
                  disabled={isGenerating || !effectiveUrl}
                  className="bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 text-white text-xs rounded-xl h-9 px-4"
                >
                  <Sparkles className="h-3 w-3 mr-1.5" />Применить — {analysis.bestAction.title}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── ВОРОНКА ── */}
          <TabsContent value="funnel" className="mt-0 space-y-5">
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-4">
              <p className="text-sm text-slate-300 font-medium mb-1">Фотоворонка из 4 снимков</p>
              <p className="text-xs text-slate-500 mb-4">
                Студийное главное фото · Детали и качество · Лайфстайл в движении · Посадка и силуэт —
                AI подберёт промпты под ваш товар на основе анализа фото.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleLoadFunnelPrompts}
                  disabled={isLoadingFunnelPrompts || !generatePrompt}
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl h-10 px-4 text-sm"
                >
                  {isLoadingFunnelPrompts
                    ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Формирую промпты...</>
                    : <><Sparkles className="h-4 w-4 mr-2" />Сформировать промпты воронки</>}
                </Button>
                {funnelPhotos.length === 4 && (
                  <Button
                    onClick={handleGenerateFunnelPhotos}
                    disabled={isFunnelPhotoGenerating || !effectiveUrl}
                    className="bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white font-semibold rounded-xl h-10 px-4 text-sm"
                  >
                    {isFunnelPhotoGenerating
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую все 4...</>
                      : '📸 Создать все 4 фото'}
                  </Button>
                )}
              </div>
              {!generatePrompt && (
                <p className="text-xs text-amber-500/80 mt-2">Сначала нажмите «Анализировать» — нужен анализ фото</p>
              )}
            </div>

            {/* 4 concept cards + results */}
            {funnelPhotos.length === 4 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {funnelPhotos.map((photo, i) => {
                  const conceptIcon = ['📸', '🔍', '🏃', '👗'][i];
                  const img = funnelPhotoImages[i];
                  const isLoading = funnelPhotoLoading[i];
                  return (
                    <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
                      {/* Image area */}
                      <div className="relative aspect-[3/4] bg-slate-900">
                        {isLoading ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <Loader2 className="h-10 w-10 animate-spin text-rose-400 mb-2" />
                            <p className="text-xs text-slate-500">Генерирую...</p>
                          </div>
                        ) : img ? (
                          <img src={img} alt={photo.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                            <span className="text-4xl mb-2">{conceptIcon}</span>
                            <p className="text-xs text-slate-500">{photo.description}</p>
                          </div>
                        )}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          <span className="text-xs bg-black/70 text-white px-2 py-0.5 rounded-full font-medium">{i + 1}</span>
                          <span className="text-xs bg-black/70 text-white px-2 py-0.5 rounded-full">{photo.title}</span>
                        </div>
                        {img && (
                          <a href={img} download={`funnel-${i + 1}.jpg`} target="_blank" rel="noreferrer"
                            className="absolute bottom-2 right-2 text-xs bg-black/70 text-white px-2 py-1 rounded-lg hover:bg-black">⬇ Скачать</a>
                        )}
                      </div>
                      {/* Card info */}
                      <div className="p-3">
                        <p className="text-xs text-slate-400 mb-2 leading-relaxed">{photo.description}</p>
                        <Button
                          onClick={() => handleGenerateSingleFunnelPhoto(photo, i)}
                          disabled={isLoading || isFunnelPhotoGenerating || !effectiveUrl}
                          size="sm"
                          className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs h-8"
                        >
                          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : '↻ Перегенерировать'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── IDEAS ── */}
          <TabsContent value="ideas" className="mt-0 space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={handleFunnelGenerate}
                disabled={isFunnelGenerating || isGenerating || !effectiveUrl || !analysis.ideas?.length}
                className="bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white font-semibold rounded-xl h-10 px-5"
              >
                {isFunnelGenerating
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую...</>
                  : <><Sparkles className="h-4 w-4 mr-2" />Сгенерировать все {analysis.ideas?.length ?? 6} идей</>}
              </Button>
              <p className="text-xs text-slate-500">или нажмите на идею для одного фото</p>
            </div>

            {/* Ideas funnel grid */}
            {(isFunnelGenerating || funnelImages.some(img => img !== null)) && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {funnelImages.map((img, i) => {
                  const idea = analysis.ideas?.[i];
                  return (
                    <div key={i} className="rounded-xl overflow-hidden border border-slate-700/50 bg-slate-800/30">
                      <div className="relative aspect-[3/4]">
                        {funnelLoading[i] ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-rose-400 mb-2" />
                            <p className="text-xs text-slate-500">{idea?.title ?? `Фото ${i + 1}`}</p>
                          </div>
                        ) : img ? (
                          <img src={img} alt={idea?.title ?? `Фото ${i + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="h-8 w-8 text-slate-700" />
                          </div>
                        )}
                        {idea?.tag && (
                          <span className={`absolute top-2 left-2 text-xs px-2 py-0.5 rounded-full border ${
                            idea.tag === 'Главная'
                              ? 'bg-blue-500/80 text-white border-blue-400/50'
                              : 'bg-amber-500/80 text-white border-amber-400/50'
                          }`}>{idea.tag}</span>
                        )}
                      </div>
                      <div className="p-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-400 truncate">{idea?.title ?? `Фото ${i + 1}`}</p>
                        {img && (
                          <a href={img} download={`funnel-${i + 1}.jpg`} target="_blank" rel="noreferrer"
                            className="text-xs text-slate-500 hover:text-white shrink-0">⬇</a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Individual idea cards */}
            <div>
              <p className="text-xs text-slate-500 mb-3">Идеи по отдельности</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.ideas?.map((idea, i) => (
                  <button
                    key={i}
                    onClick={() => handleIdeaClick(idea)}
                    disabled={isGenerating || isFunnelGenerating}
                    className="text-left rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 hover:border-rose-500/50 hover:bg-slate-800/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-white text-sm group-hover:text-rose-300 transition-colors">{idea.title}</span>
                      {idea.tag && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${
                          idea.tag === 'Главная'
                            ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                            : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`}>{idea.tag}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{idea.description}</p>
                    <p className="text-xs text-slate-600 group-hover:text-rose-400 transition-colors mt-2">
                      {isGenerating || isFunnelGenerating ? '...' : '→ Генерировать одно фото'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ── GENERATE ── */}
          <TabsContent value="generate" className="mt-0 space-y-4">
            {/* Russian description of what will change */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400 font-medium">Что будет изменено</label>
                {generatePromptRu && (
                  <span className="text-xs text-emerald-500/80">✓ AI заполнил после анализа</span>
                )}
              </div>
              <textarea
                value={generatePromptRu}
                onChange={e => setGeneratePromptRu(e.target.value)}
                placeholder="Нажмите «Анализировать» — AI опишет, что именно изменит на фото и почему это улучшит продажи..."
                rows={5}
                className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 resize-none"
              />
              <p className="text-xs text-slate-600 mt-1">Можно отредактировать текст — при генерации AI переведёт в технический промпт автоматически</p>
            </div>

            {/* Custom Russian additions */}
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-3 space-y-2">
              <label className="text-xs text-slate-500 font-medium block">Добавьте свои пожелания:</label>
              <div className="flex gap-2">
                <input
                  value={ruPrompt}
                  onChange={e => setRuPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && ruPrompt.trim()) handleTranslate(); }}
                  placeholder="например: модель должна улыбаться..."
                  className="flex-1 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60"
                />
                <Button
                  onClick={handleTranslate}
                  disabled={isTranslating || !ruPrompt.trim()}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs h-9 px-3 shrink-0"
                >
                  {isTranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : '→ Добавить'}
                </Button>
              </div>
            </div>

            <Button
              onClick={() => handleGenerate()}
              disabled={isGenerating || !(generatePromptRu || generatePrompt).trim() || !effectiveUrl}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl h-11"
            >
              {isGenerating
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую...</>
                : <><ImageIcon className="h-4 w-4 mr-2" />Сгенерировать</>}
            </Button>
          </TabsContent>

          {/* ── CHARACTER ── */}
          <TabsContent value="character" className="mt-0 space-y-4">
            <p className="text-xs text-slate-500">Настройте внешность модели. Параметры добавятся к промпту генерации.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: 'Пол', key: 'gender', options: ['Женщина', 'Мужчина'] },
                { label: 'Возраст', key: 'age', options: ['18-25', '25-35', '35-45', '45+'] },
                { label: 'Телосложение', key: 'bodyType', options: ['Стройное', 'Спортивное', 'Пышное', 'Полное'] },
                { label: 'Волосы', key: 'hairColor', options: ['Тёмные', 'Светлые', 'Рыжие', 'Седые'] },
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
              <p className="text-xs text-amber-500/80">Сначала проанализируйте фото — AI сформирует базовый промпт</p>
            )}
            <Button
              onClick={() => handleGenerate(buildCharacterChangePrompt())}
              disabled={isGenerating || !effectiveUrl || !generatePrompt.trim()}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl h-11"
            >
              {isGenerating
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую...</>
                : <><User className="h-4 w-4 mr-2" />Применить персонажа</>}
            </Button>
          </TabsContent>
          {/* ── INFOGRAPHIC AI ── */}
          <TabsContent value="text" className="mt-0">
            {imagePreview ? (
              <div className="space-y-4">
                {/* Secondary toggle: Инфографика ↔ Текст поверх фото */}
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 bg-zinc-800/60 rounded-xl p-1">
                    <button
                      onClick={() => setTextMode('infographic')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        textMode === 'infographic' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      Инфографика
                    </button>
                    <button
                      onClick={() => setTextMode('overlay')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        textMode === 'overlay' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'
                      }`}
                    >
                      Текст поверх фото
                    </button>
                  </div>
                </div>

                {textMode === 'infographic' ? (
                  <PhotoInfographicEditor
                    imageUrl={imagePreview}
                    analysis={{ good: toArr(analysis?.good ?? []), improve: toArr(analysis?.improve ?? []) }}
                    fluxPrompt={fluxPrompt || undefined}
                    textVariants={textVariants.length ? textVariants : undefined}
                    compositionData={compositionData}
                    overlayStyleData={overlayStyleData}
                    onExport={dataUrl => setGeneratedImage(dataUrl)}
                  />
                ) : (
                  <PhotoTextEditor
                    imageUrl={imagePreview}
                    analysis={{ good: toArr(analysis?.good ?? []), improve: toArr(analysis?.improve ?? []) }}
                    onExport={dataUrl => setGeneratedImage(dataUrl)}
                  />
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex items-center justify-center py-16 text-center text-slate-600">
                <div>
                  <Type className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Загрузите фото чтобы добавить текст</p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
