'use client';

import { useState, useRef } from 'react';
import { ArrowLeft, Upload, Link2, Loader2, Sparkles, ImageIcon, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface PhotoAnalysis {
  good: string[];
  improve: string[];
  recommendations: {
    composition: string[];
    technique: string[];
    styling: string[];
  };
  ideas: Array<{ title: string; description: string; tag?: string | null }>;
  generatePrompt?: string;
}

interface Props {
  onBack: () => void;
}

export function PhotoFunnelPanel({ onBack }: Props) {
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [generatedImage, setGeneratedImage] = useState('');
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [error, setError] = useState('');
  const [generateError, setGenerateError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImageBase64(base64);
      setImagePreview(base64);
      setImageUrl('');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileSelect(file);
  };

  const handleAnalyze = async () => {
    const src = imageBase64 || imageUrl.trim();
    if (!src) { setError('Загрузите фото или вставьте URL'); return; }

    setIsAnalyzing(true);
    setError('');
    setAnalysis(null);
    setGeneratedImage('');

    try {
      const res = await fetch('/api/photo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: src }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка анализа');

      let parsed: PhotoAnalysis;
      if (typeof data.analysis === 'string') {
        const clean = data.analysis.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(clean);
      } else {
        parsed = data.analysis;
      }

      setAnalysis(parsed);
      if (parsed.generatePrompt) setGeneratePrompt(parsed.generatePrompt);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    const src = imageBase64 || imageUrl.trim();
    if (!src || !generatePrompt.trim()) return;

    setIsGenerating(true);
    setGenerateError('');
    setGeneratedImage('');

    try {
      const res = await fetch('/api/photo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: src, prompt: generatePrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
      setGeneratedImage(data.imageUrl);
    } catch (e) {
      setGenerateError(String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const hasImage = !!(imageBase64 || imageUrl.trim());

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <Camera className="h-4 w-4 text-rose-400" />
        <h2 className="text-base font-semibold text-white">Улучшение фотоворонки</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* Left: Photo input */}
        <div className="space-y-3">
          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="relative rounded-2xl border-2 border-dashed border-slate-700 bg-slate-800/30 cursor-pointer hover:border-slate-600 hover:bg-slate-800/50 transition-all overflow-hidden"
            style={{ minHeight: 240 }}
          >
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="preview"
                className="w-full object-contain max-h-72"
                onError={() => setImagePreview('')}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-60 p-6 text-center">
                <Upload className="h-8 w-8 text-slate-600 mb-2" />
                <p className="text-sm text-slate-500">Перетащите фото или нажмите</p>
                <p className="text-xs text-slate-600 mt-1">JPG, PNG, WebP</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
            />
          </div>

          {/* URL input */}
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Или вставьте URL фото..."
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setImageBase64('');
                setImagePreview(e.target.value);
              }}
              className="pl-9 bg-slate-800/50 border-slate-700/50 text-sm rounded-xl"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !hasImage}
            className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90 text-white font-semibold rounded-xl h-11"
          >
            {isAnalyzing ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Анализирую...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />Анализировать фото</>
            )}
          </Button>
        </div>

        {/* Right: Results */}
        <div>
          {!analysis && !isAnalyzing && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex items-center justify-center" style={{ minHeight: 320 }}>
              <div className="text-center text-slate-600 p-8">
                <Camera className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Загрузите фото и нажмите «Анализировать»</p>
                <p className="text-xs mt-1 opacity-70">AI оценит карточку и предложит идеи</p>
              </div>
            </div>
          )}

          {isAnalyzing && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 flex items-center justify-center" style={{ minHeight: 320 }}>
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-rose-400 mx-auto mb-3" />
                <p className="text-sm text-slate-400">AI анализирует фото...</p>
                <p className="text-xs text-slate-600 mt-1">~10-20 секунд</p>
              </div>
            </div>
          )}

          {analysis && (
            <Tabs defaultValue="assessment" className="w-full">
              <TabsList className="grid grid-cols-3 w-full bg-slate-800/60 rounded-xl mb-4 h-10">
                <TabsTrigger value="assessment" className="text-xs rounded-lg">Оценка фото</TabsTrigger>
                <TabsTrigger value="ideas" className="text-xs rounded-lg">Идеи</TabsTrigger>
                <TabsTrigger value="generate" className="text-xs rounded-lg">Генерация</TabsTrigger>
              </TabsList>

              {/* Assessment */}
              <TabsContent value="assessment" className="space-y-3 mt-0">
                <div className="rounded-xl border border-emerald-800/40 bg-emerald-900/10 p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                      <span className="text-emerald-400 text-xs font-bold">✓</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400">Что уже хорошо</span>
                  </div>
                  <ul className="space-y-1.5">
                    {analysis.good.map((item, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-orange-800/40 bg-orange-900/10 p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="h-5 w-5 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0">
                      <span className="text-orange-400 text-xs font-bold">!</span>
                    </div>
                    <span className="text-sm font-semibold text-orange-400">Что можно улучшить</span>
                  </div>
                  <ul className="space-y-1.5">
                    {analysis.improve.map((item, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                        <span className="text-orange-500 mt-0.5 shrink-0">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-blue-800/40 bg-blue-900/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-sm font-semibold text-blue-400">Рекомендации по улучшению</span>
                  </div>
                  <div className="space-y-3">
                    {analysis.recommendations.composition?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Композиция</p>
                        {analysis.recommendations.composition.map((r, i) => (
                          <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5"><span className="shrink-0">•</span>{r}</p>
                        ))}
                      </div>
                    )}
                    {analysis.recommendations.technique?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Техника</p>
                        {analysis.recommendations.technique.map((r, i) => (
                          <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5"><span className="shrink-0">•</span>{r}</p>
                        ))}
                      </div>
                    )}
                    {analysis.recommendations.styling?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Стайлинг</p>
                        {analysis.recommendations.styling.map((r, i) => (
                          <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5"><span className="shrink-0">•</span>{r}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Ideas */}
              <TabsContent value="ideas" className="mt-0 space-y-2">
                {analysis.ideas?.map((idea, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3.5 hover:border-slate-600 transition-colors cursor-default"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-semibold text-white text-sm">{idea.title}</span>
                      {idea.tag && (
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 border ${
                          idea.tag === 'Главная'
                            ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                            : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                        }`}>
                          {idea.tag}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{idea.description}</p>
                  </div>
                ))}
              </TabsContent>

              {/* Generate */}
              <TabsContent value="generate" className="mt-0 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Промпт для генерации (английский)</label>
                  <textarea
                    value={generatePrompt}
                    onChange={(e) => setGeneratePrompt(e.target.value)}
                    placeholder="Describe what to change in the photo..."
                    rows={4}
                    className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 resize-none"
                  />
                  <p className="text-xs text-slate-600 mt-1">AI автоматически заполнил промпт на основе анализа</p>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !generatePrompt.trim() || !hasImage}
                  className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 text-white font-semibold rounded-xl h-11"
                >
                  {isGenerating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую (~20-30 сек)...</>
                  ) : (
                    <><ImageIcon className="h-4 w-4 mr-2" />Сгенерировать улучшенное фото</>
                  )}
                </Button>

                {generateError && (
                  <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400">
                    {generateError}
                  </div>
                )}

                {generatedImage && (
                  <div className="rounded-xl overflow-hidden border border-slate-700 bg-slate-800/30">
                    <img src={generatedImage} alt="Generated" className="w-full object-contain" />
                    <div className="p-3 text-center border-t border-slate-700">
                      <a
                        href={generatedImage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Открыть в полном размере ↗
                      </a>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
