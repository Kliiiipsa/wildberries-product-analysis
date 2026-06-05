'use client';

import { useRef, useState, useCallback } from 'react';
import { Loader2, Sparkles, ChevronDown } from 'lucide-react';

import type { InfographicData, TextVariant, CompositionData, OverlayStyleData } from '@/types/photo-pipeline';
import { CARD_W, CARD_H, DEFAULT_DATA, APPROACH_STYLE } from '@/lib/photo/design-system';
import { drawCard, toDataUrl } from '@/lib/photo/canvas-renderer';
import {
  requestInfographicBriefPipeline,
  type PipelineInput,
} from '@/lib/photo/infographic-pipeline-client';

// Experimental pipeline flag — true only in development builds.
// In production this constant is false and the feature is completely bypassed.
const USE_INFOGRAPHIC_PIPELINE = process.env.NODE_ENV === 'development';

// Re-export shared types so existing importers (e.g. PhotoFunnelPanel) don't break
export type { TextVariant, CompositionData, OverlayStyleData } from '@/types/photo-pipeline';

// ── Pipeline helpers ──────────────────────────────────────────────────────────

/** Assemble PipelineInput from the data available in the component. */
function buildPipelineInput(
  textVariants: TextVariant[] | undefined,
  analysis: { good?: string[]; improve?: string[] } | null | undefined,
  overlayStyleData: OverlayStyleData | null | undefined,
): PipelineInput {
  const v = textVariants?.[0];
  return {
    productType: v?.productName,
    benefits: v?.characteristics?.slice(0, 5).map(c =>
      c.value ? `${c.title}: ${c.value}` : c.title,
    ),
    description: analysis?.good?.slice(0, 3).join('; ') || undefined,
    style: overlayStyleData?.titleStyle,
  };
}

/**
 * Calls /api/photo/infographic-brief and returns the fluxPrompt.
 * Returns null on any failure so the caller can fall back to the old prompt.
 */
async function tryGetPipelineFluxPrompt(
  input: PipelineInput,
  fallbackPrompt: string,
): Promise<string> {
  if (!USE_INFOGRAPHIC_PIPELINE) return fallbackPrompt;
  try {
    const result = await requestInfographicBriefPipeline(input);
    if (!result) {
      console.warn('[infographic-pipeline] no result — using fallback fluxPrompt');
      return fallbackPrompt;
    }
    if (process.env.NODE_ENV === 'development') {
      console.groupCollapsed('[infographic-pipeline] pipeline result');
      console.log('source:', result.source);
      console.log('template:', result.template.id, '—', result.template.title);
      console.log('warnings:', result.warnings);
      console.log('fluxPrompt (first 300):', result.fluxPrompt.slice(0, 300));
      console.groupEnd();
    }
    return result.fluxPrompt;
  } catch (e) {
    console.warn('[infographic-pipeline] error, using fallback:', e);
    return fallbackPrompt;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  imageUrl: string;
  analysis?: { good?: string[]; improve?: string[] } | null;
  fluxPrompt?: string;
  textVariants?: TextVariant[];
  compositionData?: CompositionData | null;
  overlayStyleData?: OverlayStyleData | null;
  onExport?: (dataUrl: string) => void;
}

// ── React component ───────────────────────────────────────────────────────────

export default function PhotoInfographicEditor({
  imageUrl,
  analysis,
  fluxPrompt,
  textVariants,
  compositionData,
  overlayStyleData,
  onExport,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<InfographicData>(DEFAULT_DATA);
  const [loadingText, setLoadingText] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState('');

  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');

  const generateBase = useCallback(async () => {
    if (!imageUrl || !fluxPrompt) { setPremiumError('Нет fluxPrompt — сначала проанализируйте фото'); return; }
    setPremiumLoading(true); setPremiumError(''); setBaseImage(null);
    try {
      const imgSrc = await toDataUrl(imageUrl);
      const activePrompt = await tryGetPipelineFluxPrompt(
        buildPipelineInput(textVariants, analysis, overlayStyleData),
        fluxPrompt,
      );
      const res = await fetch('/api/photo/generate-infographic-base', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imgSrc, fluxPrompt: activePrompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка FLUX');
      setBaseImage(json.imageUrl);
    } catch (e) { setPremiumError(String(e)); } finally { setPremiumLoading(false); }
  }, [imageUrl, fluxPrompt, textVariants, analysis, overlayStyleData]);

  const generateAIText = async () => {
    setLoadingText(true);
    try {
      const res = await fetch('/api/photo/text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });
      const json = await res.json();
      if (json.productName) {
        setData({
          productName: json.productName ?? DEFAULT_DATA.productName,
          productSubtitle: json.productSubtitle ?? DEFAULT_DATA.productSubtitle,
          tagline: json.tagline ?? DEFAULT_DATA.tagline,
          characteristics: (json.characteristics ?? DEFAULT_DATA.characteristics).slice(0, 3),
        });
      }
    } catch { /* ignore */ } finally { setLoadingText(false); }
  };

  const renderCard = useCallback(async (overrideData?: InfographicData, activeUrl?: string): Promise<string> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('no canvas');
    canvas.width = CARD_W; canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    const imgSrc = await toDataUrl(activeUrl ?? baseImage ?? imageUrl);
    const d = overrideData ?? data;
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { drawCard(ctx, img, d, compositionData, overlayStyleData); resolve(canvas.toDataURL('image/jpeg', 0.95)); };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = imgSrc;
    });
  }, [baseImage, imageUrl, data, compositionData, overlayStyleData]);

  const handleRender = useCallback(async (overrideData?: InfographicData) => {
    if (!imageUrl) return;
    setRendering(true); setRenderError('');
    let resolvedBase = baseImage;
    if (fluxPrompt && !resolvedBase) {
      setPremiumLoading(true); setPremiumError('');
      try {
        const imgSrc = await toDataUrl(imageUrl);
        const activePrompt = await tryGetPipelineFluxPrompt(
          buildPipelineInput(textVariants, analysis, overlayStyleData),
          fluxPrompt,
        );
        const res = await fetch('/api/photo/generate-infographic-base', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: imgSrc, fluxPrompt: activePrompt }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Ошибка FLUX');
        resolvedBase = json.imageUrl as string;
        setBaseImage(resolvedBase);
      } catch (e) {
        setPremiumError(String(e)); setRendering(false); setPremiumLoading(false); return;
      } finally { setPremiumLoading(false); }
    }
    try {
      const url = await renderCard(overrideData, resolvedBase ?? undefined);
      onExport?.(url);
    } catch (e) { setRenderError(String(e)); } finally { setRendering(false); }
  }, [imageUrl, baseImage, fluxPrompt, textVariants, analysis, overlayStyleData, renderCard, onExport]);

  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);

  const updateChar = (i: number, field: 'title' | 'value', val: string) =>
    setData(prev => { const chars = [...prev.characteristics]; chars[i] = { ...chars[i], [field]: val }; return { ...prev, characteristics: chars }; });

  const applyVariant = useCallback(async (v: TextVariant, idx: number) => {
    setSelectedVariant(idx);
    const newData: InfographicData = {
      productName: v.productName, productSubtitle: v.subtitle,
      tagline: v.tagline, characteristics: v.characteristics.slice(0, 3),
    };
    setData(newData);
    await handleRender(newData);
  }, [handleRender]);

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* FLUX status bar */}
      {(premiumLoading || baseImage || premiumError) && (
        <div className="flex items-center gap-3 flex-wrap">
          {premiumLoading && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-700/30 px-3 py-1.5 rounded-lg">
              <Loader2 className="h-3 w-3 animate-spin" />
              FLUX генерирует базу... (~15–25 сек)
            </div>
          )}
          {!premiumLoading && baseImage && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 px-3 py-1.5 rounded-lg">
              <Sparkles className="h-3 w-3" />
              FLUX база готова
              <button onClick={() => generateBase()} className="text-zinc-500 hover:text-emerald-300 transition-colors ml-1" title="Перегенерировать">↻</button>
            </div>
          )}
          {!premiumLoading && !baseImage && !fluxPrompt && (
            <span className="text-xs text-amber-500/80">Сначала нажмите «Анализировать» — нужен AI-промпт для FLUX</span>
          )}
        </div>
      )}

      {premiumError && (
        <div className="rounded-xl border border-red-800/40 bg-red-900/10 px-3 py-2 text-xs text-red-400">⚠ {premiumError}</div>
      )}

      {/* Qwen overlay hints */}
      {overlayStyleData ? (
        <div className="rounded-xl border border-violet-800/30 bg-violet-900/10 px-3 py-2 text-xs text-violet-300 space-y-0.5">
          <p className="font-medium text-violet-400">✓ Qwen overlay данные получены:</p>
          <p>
            <span className="text-violet-500">layout:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.layoutTemplate ?? '—'}</span>
            {' · '}
            <span className="text-violet-500">titleStyle:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.titleStyle ?? '—'}</span>
            {' · '}
            <span className="text-violet-500">titleSize:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.titleSize ?? '—'}</span>
          </p>
          <p>
            <span className="text-violet-500">colorScheme:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.colorScheme ?? '—'}</span>
            {' · '}
            <span className="text-violet-500">scrim:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.scrimOpacity ?? '—'}</span>
            {' · '}
            <span className="text-violet-500">shadow:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.shadowIntensity ?? '—'}</span>
          </p>
          {compositionData?.primaryTextZone && (
            <p>
              <span className="text-violet-500">textZone:</span>{' '}
              <span className="text-white font-mono">{compositionData.primaryTextZone}</span>
              {compositionData.textZoneReason ? ` — ${compositionData.textZoneReason}` : ''}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 px-3 py-1.5 text-xs text-zinc-600">
          ⚠ overlayStyle от Qwen не получен — используются дефолты (auto-detect)
        </div>
      )}

      {/* Text variants + manual edit */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-400" />
            Варианты текста
          </span>
          <button onClick={generateAIText} disabled={loadingText}
            className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 flex items-center gap-1 transition-colors">
            {loadingText ? <Loader2 className="h-3 w-3 animate-spin" /> : '↻'} Обновить
          </button>
        </div>

        {textVariants && textVariants.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {textVariants.map((v, i) => {
              const st = APPROACH_STYLE[v.approach] ?? APPROACH_STYLE['Минимализм'];
              const isSelected = selectedVariant === i;
              return (
                <button key={i} onClick={() => applyVariant(v, i)} disabled={rendering || premiumLoading}
                  className={`w-full text-left rounded-xl border p-3 transition-all disabled:opacity-60 ${
                    isSelected ? `${st.ring} ring-1 ring-inset` : 'border-zinc-700/60 bg-zinc-800/50 hover:border-zinc-600 hover:brightness-110'
                  }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${st.badge}`}>{v.approach}</span>
                    {isSelected && rendering && <Loader2 className="h-3 w-3 animate-spin text-violet-400 shrink-0" />}
                  </div>
                  <p className="text-white font-bold text-sm leading-tight mb-1.5 truncate">{v.productName}</p>
                  {v.subtitle && <p className="text-zinc-400 text-[11px] italic mb-2 leading-tight">{v.subtitle}</p>}
                  <ul className="space-y-1 mb-2">
                    {v.characteristics.slice(0, 3).map((ch, ci) => (
                      <li key={ci} className="text-xs text-zinc-400 flex items-start gap-1.5 leading-tight">
                        <span className="text-zinc-600 shrink-0 mt-0.5">•</span>
                        <span>
                          <span className="text-zinc-300 font-medium">{ch.title}</span>
                          {ch.value && <span className="text-zinc-500"> — {ch.value}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {isSelected && (
                    <p className="text-[10px] font-medium mt-1.5 flex items-center gap-1">
                      {rendering
                        ? <><Loader2 className="h-2.5 w-2.5 animate-spin text-amber-400" /><span className="text-amber-400">Создаю...</span></>
                        : <span className="text-violet-400">✓ Применено</span>}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-center">
            {loadingText ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                <p className="text-xs text-zinc-500">Генерирую варианты...</p>
              </div>
            ) : (
              <>
                <Sparkles className="h-5 w-5 text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-500 mb-2">Нажмите «Анализировать» — AI сгенерирует 4 варианта текста</p>
                <button onClick={generateAIText} disabled={loadingText}
                  className="text-xs text-violet-400 hover:text-violet-300 border border-violet-700/40 rounded-lg px-3 py-1.5 transition-colors">
                  ✨ Сгенерировать текст
                </button>
              </>
            )}
          </div>
        )}

        {/* Manual editor (collapsible) */}
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <button onClick={() => setShowManual(p => !p)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-all">
            <span className="font-medium uppercase tracking-wide">Редактировать вручную</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showManual ? 'rotate-180' : ''}`} />
          </button>
          {showManual && (
            <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-zinc-900/40">
              <input value={data.tagline} onChange={e => setData(p => ({ ...p, tagline: e.target.value }))}
                placeholder="тег (новинка / хит продаж)"
                className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500" />
              <input value={data.productName} onChange={e => setData(p => ({ ...p, productName: e.target.value }))}
                placeholder="НАЗВАНИЕ ТОВАРА"
                className="w-full bg-zinc-700 text-white text-sm font-bold px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500" />
              <input value={data.productSubtitle} onChange={e => setData(p => ({ ...p, productSubtitle: e.target.value }))}
                placeholder="лёгкий и дышащий"
                className="w-full bg-zinc-700 text-white text-xs italic px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500" />
              <div className="md:col-span-2">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">Характеристики</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {data.characteristics.map((ch, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-600 w-3 shrink-0">{['🌿','✦','◉'][i]}</span>
                        <input value={ch.title} onChange={e => updateChar(i, 'title', e.target.value)}
                          placeholder="Название"
                          className="flex-1 bg-zinc-700 text-white text-xs font-semibold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500" />
                      </div>
                      <input value={ch.value} onChange={e => updateChar(i, 'value', e.target.value)}
                        placeholder="уточнение"
                        className="w-full bg-zinc-700/60 text-zinc-300 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-600 ml-4" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Generate button */}
      <button onClick={() => handleRender()} disabled={!imageUrl || rendering || premiumLoading}
        className="w-full px-4 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-amber-500 to-yellow-500 hover:opacity-90">
        {rendering
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Создаю...</>
          : <><Sparkles className="h-4 w-4" /> Сгенерировать инфографику</>}
      </button>

      {renderError && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-3 py-2 text-xs text-red-400">{renderError}</div>
      )}
    </div>
  );
}
