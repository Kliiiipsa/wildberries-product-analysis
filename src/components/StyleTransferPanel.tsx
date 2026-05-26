'use client';

import { useState, useRef, useCallback, RefObject } from 'react';
import { ArrowLeft, Upload, Loader2, Wand2, ArrowRight, ChevronDown, Type, Layers, Image as ImageIcon, Sun, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onBack: () => void;
}

interface ExtractedText {
  headline?: string;
  bodyText?: string;
  footerText?: string;
  badgeText?: string;
  badgeColor?: string;
  brandText?: string;
  textBoxPosition?: string;   // "top" | "center" | "bottom"
  textBoxWidthPct?: number;   // 50–100
}

/** Escape special regex characters */
function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply userNote text instructions to extracted OCR text client-side.
 * Handles patterns:
 *   замени "X" на "Y"  /  замени "X" НА "Y"
 *   убери "X" из текста  /  убери слова "X"  /  убери из текста "X"
 * Also handles without quotes for single words.
 */
function applyUserNoteToText(text: ExtractedText, note: string): ExtractedText {
  if (!note.trim()) return text;
  const result = { ...text };

  const rep = (s: string | undefined, from: string, to: string): string | undefined =>
    s ? s.replace(new RegExp(escapeRx(from), 'gi'), to).replace(/\s{2,}/g, ' ').trim() : s;

  const applyReplace = (from: string, to: string) => {
    result.headline  = rep(result.headline,  from, to);
    result.bodyText  = rep(result.bodyText,  from, to);
    result.footerText= rep(result.footerText,from, to);
    result.badgeText = rep(result.badgeText, from, to);
    result.brandText = rep(result.brandText, from, to);
  };
  const applyRemove = (what: string) => {
    result.headline  = rep(result.headline,  what, '');
    result.bodyText  = rep(result.bodyText,  what, '');
    result.footerText= rep(result.footerText,what, '');
  };

  // замени "X" на/НА "Y"  (with quotes)
  const rxQ = /замени\s+"([^"]+)"\s+(?:на|НА)\s+"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rxQ.exec(note)) !== null) applyReplace(m[1], m[2]);

  // замени X на/НА Y  (without quotes, single token)
  const rxNQ = /замени\s+(\S+)\s+(?:на|НА)\s+(\S+)/gi;
  while ((m = rxNQ.exec(note)) !== null) {
    // Skip if it was already handled by quoted version
    if (!m[1].startsWith('"')) applyReplace(m[1], m[2]);
  }

  // убери "X" из текста / убери слова "X" / убери из текста "X"
  const rxRem = /убери\s+(?:из\s+текста\s+)?(?:слова?\s+)?"([^"]+)"(?:\s+из\s+текста)?/gi;
  while ((m = rxRem.exec(note)) !== null) applyRemove(m[1]);

  return result;
}

/** Resize file to max 1024px → JPEG base64 */
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
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

/** Wrap text in canvas ctx */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 6,
): number {
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;
  for (const word of words) {
    if (lineCount >= maxLines) break;
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = word;
      lineCount++;
    } else {
      line = test;
    }
  }
  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
    lineCount++;
  }
  return lineCount;
}

/** Draw rounded rectangle path */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Composite correct text on top of FLUX result image.
 * FLUX draws the empty frame layout; Canvas draws the actual text.
 */
async function composeTextOverlay(
  imageDataUrl: string,
  text: ExtractedText,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = img.width;
      const H = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // Draw FLUX result
      ctx.drawImage(img, 0, 0);

      // ── Text box dimensions ──────────────────────────────────────────────
      const widthPct = (text.textBoxWidthPct ?? 75) / 100;
      const boxW = Math.round(W * widthPct);
      const boxX = Math.round((W - boxW) / 2);
      const pad = Math.round(boxW * 0.06);
      const innerW = boxW - pad * 2;

      // Font sizes (scale with image width)
      const headlineFontSize = Math.round(W * 0.065);
      const bodyFontSize = Math.round(W * 0.032);
      const footerFontSize = Math.round(W * 0.026);
      const brandFontSize = Math.round(W * 0.028);
      const badgeFontSize = Math.round(W * 0.032);

      // Estimate box height from content
      const headlineLines = text.headline ? Math.ceil((text.headline.length * headlineFontSize * 0.55) / innerW) + 1 : 0;
      const bodyLines = text.bodyText ? Math.min(6, Math.ceil((text.bodyText.length * bodyFontSize * 0.52) / innerW) + 1) : 0;
      const boxH = Math.round(
        pad +
        (headlineLines > 0 ? headlineLines * (headlineFontSize * 1.2) + pad : 0) +
        (bodyLines > 0 ? bodyLines * (bodyFontSize * 1.4) + pad * 0.5 : 0) +
        (text.footerText ? footerFontSize * 1.6 + pad * 0.5 : 0) +
        pad,
      );

      // Box vertical position
      const pos = text.textBoxPosition ?? 'center';
      const margin = Math.round(H * 0.05);
      const boxY =
        pos === 'top' ? margin :
        pos === 'bottom' ? H - boxH - margin :
        Math.round((H - boxH) / 2);

      // ── Draw white box ──────────────────────────────────────────────────
      const radius = Math.round(W * 0.018);
      roundRect(ctx, boxX, boxY, boxW, boxH, radius);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,190,190,0.7)';
      ctx.lineWidth = Math.max(1, Math.round(W * 0.002));
      ctx.stroke();

      let cursorY = boxY + pad;

      // ── Brand text (top-right inside box) ───────────────────────────────
      if (text.brandText) {
        ctx.fillStyle = '#555';
        ctx.font = `600 ${brandFontSize}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(text.brandText, boxX + boxW - pad, cursorY + brandFontSize);
        ctx.textAlign = 'left';
        cursorY += brandFontSize * 1.6;
      }

      // ── Headline ─────────────────────────────────────────────────────────
      if (text.headline) {
        ctx.fillStyle = '#111';
        ctx.font = `bold ${headlineFontSize}px sans-serif`;
        const lh = headlineFontSize * 1.15;
        const linesDone = wrapText(ctx, text.headline, boxX + pad, cursorY + headlineFontSize, innerW, lh, 3);
        cursorY += linesDone * lh + pad * 0.6;
      }

      // ── Body text ────────────────────────────────────────────────────────
      if (text.bodyText) {
        ctx.fillStyle = '#333';
        ctx.font = `${bodyFontSize}px sans-serif`;
        const lh = bodyFontSize * 1.5;
        const linesDone = wrapText(ctx, text.bodyText, boxX + pad, cursorY + bodyFontSize, innerW, lh, 6);
        cursorY += linesDone * lh + pad * 0.5;
      }

      // ── Footer text ──────────────────────────────────────────────────────
      if (text.footerText) {
        ctx.fillStyle = '#666';
        ctx.font = `italic ${footerFontSize}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(text.footerText, boxX + boxW - pad, cursorY + footerFontSize);
        ctx.textAlign = 'left';
      }

      // ── Badge ─────────────────────────────────────────────────────────────
      if (text.badgeText) {
        const badgeColor = text.badgeColor || '#FF1493';
        const badgePadX = Math.round(W * 0.025);
        const badgePadY = Math.round(W * 0.012);
        const badgeTextW = ctx.measureText(text.badgeText).width;
        const badgeW = badgeTextW + badgePadX * 2;
        const badgeH = badgeFontSize + badgePadY * 2;
        const badgeX = boxX;
        const badgeY = boxY + boxH + Math.round(H * 0.012);

        ctx.fillStyle = badgeColor;
        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, Math.round(badgeH * 0.12));
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${badgeFontSize}px sans-serif`;
        ctx.fillText(text.badgeText, badgeX + badgePadX, badgeY + badgePadY + badgeFontSize * 0.85);
      }

      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = imageDataUrl;
  });
}

const DOMINANT_TYPE_LABEL: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  text_overlay:  { label: 'Текстовый оверлей',  icon: <Type className="h-3 w-3" />,      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  graphic_badge: { label: 'Графический элемент', icon: <Layers className="h-3 w-3" />,    color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' },
  background:    { label: 'Фон и окружение',     icon: <ImageIcon className="h-3 w-3" />, color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  lighting:      { label: 'Свет и цвет',         icon: <Sun className="h-3 w-3" />,       color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
};

export function StyleTransferPanel({ onBack }: Props) {
  const [sourceImage, setSourceImage] = useState('');
  const [styleImage, setStyleImage] = useState('');
  const [fluxResult, setFluxResult] = useState('');    // raw FLUX output
  const [result, setResult] = useState('');             // final (with text composited)
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompositing, setIsCompositing] = useState(false);
  const [error, setError] = useState('');
  const [userNote, setUserNote] = useState('');
  const [prompt, setPrompt] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [sourceClothing, setSourceClothing] = useState('');
  const [styleEnvironment, setStyleEnvironment] = useState('');
  const [dominantElement, setDominantElement] = useState('');
  const [dominantType, setDominantType] = useState('');
  const [extractedText, setExtractedText] = useState<ExtractedText | null>(null);
  const [textApplied, setTextApplied] = useState(false);

  const sourceRef = useRef<HTMLInputElement>(null);
  const styleRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File, target: 'source' | 'style') => {
    if (!file.type.startsWith('image/')) return;
    try {
      const b64 = await resizeToBase64(file);
      if (target === 'source') setSourceImage(b64);
      else setStyleImage(b64);
      setResult(''); setFluxResult(''); setError('');
      setDominantElement(''); setDominantType(''); setExtractedText(null); setTextApplied(false);
    } catch { /* ignore */ }
  }, []);

  const handleGenerate = async () => {
    if (!sourceImage || !styleImage) return;
    setIsGenerating(true);
    setError('');
    setResult(''); setFluxResult('');
    setPrompt(''); setPromptOpen(false);
    setDominantElement(''); setDominantType('');
    setExtractedText(null); setTextApplied(false);

    try {
      const res = await fetch('/api/photo/style-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImageUrl: sourceImage,
          styleImageUrl: styleImage,
          userNote: userNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');

      const rawImage: string = data.imageUrl;
      setFluxResult(rawImage);
      if (data.prompt) setPrompt(data.prompt);
      if (data.sourceClothing) setSourceClothing(data.sourceClothing);
      if (data.styleEnvironment) setStyleEnvironment(data.styleEnvironment);
      if (data.dominantElement) setDominantElement(data.dominantElement);
      if (data.dominantType) setDominantType(data.dominantType);

      // ── Auto-composite text if text overlay detected ──────────────────
      if (
        data.dominantType === 'text_overlay' &&
        data.extractedText &&
        (data.extractedText.headline || data.extractedText.bodyText)
      ) {
        // Apply userNote substitutions client-side (reliable, instant)
        const modifiedText = applyUserNoteToText(data.extractedText, userNote);
        setExtractedText(modifiedText);
        setIsCompositing(true);
        try {
          const composed = await composeTextOverlay(rawImage, modifiedText);
          setResult(composed);
          setTextApplied(true);
        } catch {
          setResult(rawImage); // fallback to raw FLUX
        } finally {
          setIsCompositing(false);
        }
      } else {
        setResult(rawImage);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  // Manually re-apply / remove text compositing
  const handleToggleText = async () => {
    if (!fluxResult || !extractedText) return;
    if (textApplied) {
      setResult(fluxResult);
      setTextApplied(false);
    } else {
      setIsCompositing(true);
      try {
        const composed = await composeTextOverlay(fluxResult, extractedText);
        setResult(composed);
        setTextApplied(true);
      } catch { /* ignore */ } finally {
        setIsCompositing(false);
      }
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
          image ? 'border-slate-700/50 bg-slate-900' : 'border-dashed border-slate-700 hover:border-slate-500 bg-slate-800/20'
        }`}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f, target); }}
        onClick={() => inputRef.current?.click()}
      >
        {image ? (
          <>
            <img src={image} alt={label} className="w-full h-full object-contain" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1.5 text-white">
                <Upload className="h-5 w-5" /><span className="text-xs font-medium">Заменить</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 p-6 text-center gap-3">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${target === 'source' ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
              <Upload className={`h-6 w-6 ${target === 'source' ? 'text-blue-500/60' : 'text-purple-500/60'}`} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Перетащите или нажмите</p>
              <p className="text-xs text-slate-700 mt-0.5">JPG, PNG, WEBP</p>
            </div>
          </div>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, target); }} />
      </div>
    </div>
  );

  const isBusy = isGenerating || isCompositing;
  const dtInfo = dominantType ? DOMINANT_TYPE_LABEL[dominantType] : null;

  return (
    <div className="w-full max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
          <ArrowLeft className="h-4 w-4" />Назад
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <Wand2 className="h-4 w-4 text-purple-400" />
        <h2 className="text-base font-semibold text-white">Перенос стиля</h2>
        <span className="text-xs text-slate-600 hidden md:block">
          — AI определит главный элемент фото 2 и перенесёт его на фото 1
        </span>
      </div>

      {/* ── Hint ── */}
      <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 px-4 py-3 mb-6 flex items-start gap-3">
        <Wand2 className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-purple-300 font-medium">Как работает:</span> Qwen OCR считывает текст с фото 2,
          FLUX воссоздаёт визуальный стиль, Canvas накладывает правильный текст — без искажений кириллицы.
        </p>
      </div>

      {/* ── 3-column layout ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-start mb-5">

        <UploadZone label="Исходное фото" sublabel="Одежда и модель сохранятся"
          badge="Фото 1" image={sourceImage} inputRef={sourceRef} target="source" />

        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1 gap-1">
          <ArrowRight className="h-6 w-6 text-slate-600" />
          <span className="text-[10px] text-slate-700 text-center leading-tight">главный<br/>элемент</span>
        </div>

        <UploadZone label="Стиль (референс)" sublabel="Отсюда возьмётся самый заметный элемент"
          badge="Фото 2" image={styleImage} inputRef={styleRef} target="style" />

        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1 gap-1">
          <ArrowRight className="h-6 w-6 text-slate-600" />
          <span className="text-[10px] text-slate-700 text-center leading-tight">результат</span>
        </div>

        {/* Result panel */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              Результат
            </span>
            <p className="text-sm font-semibold text-white">Готовое фото</p>
            {textApplied && (
              <span className="text-[10px] flex items-center gap-1 text-emerald-400">
                <Check className="h-3 w-3" />Текст наложен
              </span>
            )}
          </div>

          {dtInfo ? (
            <div className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border ${dtInfo.color}`}>
              {dtInfo.icon}<span>Применено: {dtInfo.label}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Одежда из фото 1 + стиль из фото 2</p>
          )}

          <div className="relative rounded-2xl border border-slate-700/50 bg-slate-900 w-full aspect-[3/4] flex items-center justify-center overflow-hidden">
            {isBusy ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto mb-3" />
                {isCompositing
                  ? <><p className="text-sm text-slate-400 font-medium">Накладываю текст...</p><p className="text-xs text-slate-600 mt-1">Canvas compositing</p></>
                  : <><p className="text-sm text-slate-400 font-medium">Анализирую и генерирую...</p><p className="text-xs text-slate-600 mt-1.5">OCR → FLUX → Canvas</p><p className="text-xs text-slate-700 mt-0.5">~40–80 сек</p></>
                }
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

          {/* Buttons under result */}
          {result && !isBusy && (
            <div className="space-y-1.5">
              <a href={result} download="style-transfer.jpg" target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 text-xs text-slate-400 hover:text-white transition-all py-2.5">
                ⬇ Скачать результат
              </a>
              {/* Toggle text compositing */}
              {extractedText && (extractedText.headline || extractedText.bodyText) && (
                <button onClick={handleToggleText}
                  className={`w-full text-xs rounded-xl border py-2 transition-all ${
                    textApplied
                      ? 'border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/10'
                      : 'border-purple-700/40 text-purple-400 hover:bg-purple-900/10'
                  }`}>
                  {textApplied ? '✕ Убрать текст (FLUX версия)' : '✓ Наложить правильный текст'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── User note input ── */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4 mb-4">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Дополнительные пожелания
          <span className="ml-2 text-[10px] font-normal text-slate-600 normal-case tracking-normal">(добавится к промпту)</span>
        </label>
        <textarea
          value={userNote}
          onChange={e => setUserNote(e.target.value)}
          placeholder="Например: изменить название бренда на NS DREAM, добавить розовый бейдж SALE..."
          rows={2}
          className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/60 resize-none"
        />
        {userNote.trim() && (
          <p className="text-[10px] text-purple-400/80 mt-1.5 flex items-center gap-1">
            <Wand2 className="h-3 w-3" />
            {dominantType === 'text_overlay'
              ? 'Будет применено к тексту (замени "X" на "Y", убери "X" из текста)'
              : 'Будет добавлено к промпту FLUX'}
          </p>
        )}
      </div>

      {/* ── Generate button ── */}
      <Button onClick={handleGenerate} disabled={!sourceImage || !styleImage || isBusy}
        className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:opacity-90 text-white font-semibold rounded-xl h-12 mb-4 disabled:opacity-40">
        {isGenerating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую... (~40–80 сек)</>
          : isCompositing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Накладываю текст...</>
          : <><Wand2 className="h-4 w-4 mr-2" />Применить стиль</>}
      </Button>

      {(!sourceImage || !styleImage) && (
        <p className="text-xs text-center text-slate-600 mb-4">
          {!sourceImage && !styleImage ? 'Загрузите оба фото чтобы начать'
            : !sourceImage ? 'Загрузите исходное фото (Фото 1)'
            : 'Загрузите фото со стилем (Фото 2)'}
        </p>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400 mb-4">{error}</div>
      )}

      {/* ── Extracted text (OCR result) ── */}
      {extractedText && (extractedText.headline || extractedText.bodyText) && (
        <div className="rounded-xl border border-amber-800/30 bg-amber-900/10 p-4 mb-3">
          <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-2">
            📖 Текст считан с фото 2 (OCR)
          </p>
          <div className="space-y-1.5">
            {extractedText.brandText && (
              <div className="flex gap-2 text-xs">
                <span className="text-slate-600 shrink-0 w-16">Бренд</span>
                <span className="text-white font-mono">{extractedText.brandText}</span>
              </div>
            )}
            {extractedText.headline && (
              <div className="flex gap-2 text-xs">
                <span className="text-slate-600 shrink-0 w-16">Заголовок</span>
                <span className="text-white font-semibold">{extractedText.headline}</span>
              </div>
            )}
            {extractedText.bodyText && (
              <div className="flex gap-2 text-xs">
                <span className="text-slate-600 shrink-0 w-16">Текст</span>
                <span className="text-slate-300 leading-relaxed">{extractedText.bodyText}</span>
              </div>
            )}
            {extractedText.footerText && (
              <div className="flex gap-2 text-xs">
                <span className="text-slate-600 shrink-0 w-16">Подпись</span>
                <span className="text-slate-400 italic">{extractedText.footerText}</span>
              </div>
            )}
            {extractedText.badgeText && (
              <div className="flex gap-2 text-xs items-center">
                <span className="text-slate-600 shrink-0 w-16">Бейдж</span>
                <span className="px-2 py-0.5 rounded text-white text-[10px] font-bold"
                  style={{ backgroundColor: extractedText.badgeColor || '#FF1493' }}>
                  {extractedText.badgeText}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Analysis summary ── */}
      {(dominantElement || sourceClothing) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {dominantElement && (
            <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 px-3 py-2.5">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Главный элемент</p>
              <p className="text-xs text-slate-300">{dominantElement}</p>
            </div>
          )}
          {styleEnvironment && (
            <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 px-3 py-2.5">
              <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider mb-1">Что применено</p>
              <p className="text-xs text-slate-400">{styleEnvironment}</p>
            </div>
          )}
        </div>
      )}

      {/* ── FLUX prompt collapsible ── */}
      {prompt && (
        <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 overflow-hidden">
          <button onClick={() => setPromptOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-500 hover:text-slate-300 transition-colors">
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
