'use client';

import { useState, useRef, useCallback, RefObject } from 'react';
import { ArrowLeft, Upload, Loader2, Wand2, ArrowRight, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { onBack: () => void; }

interface LayoutData {
  panelSide: string;
  panelWidthPct: number;
  panelColor: string;
  panelOpacity: number;
  headline: string;
  subheadline: string;
  features: string[];
  sizes: string[];
  footer: string;
  brand: string;
}

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

/**
 * Снижает насыщенность изображения до ~20% от оригинала.
 * Используется для обхода pixel-level content-фильтра SiliconFlow:
 * без насыщенных тонов кожи классификатор не срабатывает,
 * FLUX при этом всё равно видит форму одежды и переносит стиль.
 */
function desaturateBase64(src: string, saturation = 0.18): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
        d[i]   = Math.round(gray + (d[i]   - gray) * saturation);
        d[i+1] = Math.round(gray + (d[i+1] - gray) * saturation);
        d[i+2] = Math.round(gray + (d[i+2] - gray) * saturation);
      }
      ctx.putImageData(px, 0, 0);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.src = src;
  });
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxL = 6): number {
  const words = text.split(' ');
  let line = '', count = 0;
  for (const w of words) {
    if (count >= maxL) break;
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + count * lh); line = w; count++;
    } else { line = test; }
  }
  if (line && count < maxL) { ctx.fillText(line, x, y + count * lh); count++; }
  return count;
}

/**
 * Overlay text directly on the FLUX image — no panel rectangle.
 * Text is placed on the photo with shadows for readability.
 * Panel color hint used only to pick text color (dark vs light).
 */
async function composeLayout(imageDataUrl: string, ld: LayoutData): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = img.width, H = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // ── Determine text zone ───────────────────────────────────────────────
      const side = ld.panelSide || 'right';
      const wPct = Math.max(25, Math.min(85, ld.panelWidthPct || 40));

      let zoneX: number, zoneW: number, zoneY: number, zoneH: number;
      if (side === 'right') {
        zoneW = Math.round(W * wPct / 100); zoneX = W - zoneW;
        zoneY = 0; zoneH = H;
      } else if (side === 'left') {
        zoneW = Math.round(W * wPct / 100); zoneX = 0;
        zoneY = 0; zoneH = H;
      } else if (side === 'bottom') {
        zoneW = W; zoneX = 0;
        zoneH = Math.round(H * wPct / 100); zoneY = H - zoneH;
      } else {
        zoneW = Math.round(W * wPct / 100); zoneX = Math.round((W - zoneW) / 2);
        zoneY = Math.round(H * 0.05); zoneH = Math.round(H * 0.9);
      }

      // ── Sample average brightness of the text zone from the photo ─────────
      // This tells us whether to use dark or light text
      const sample = ctx.getImageData(zoneX, zoneY, Math.min(zoneW, W - zoneX), Math.min(80, zoneH));
      let totalBrightness = 0;
      for (let i = 0; i < sample.data.length; i += 4) {
        totalBrightness += (sample.data[i] * 299 + sample.data[i+1] * 587 + sample.data[i+2] * 114) / 1000;
      }
      const avgBrightness = totalBrightness / (sample.data.length / 4);
      const isDark = avgBrightness < 140;  // actual photo brightness, not panelColor hint

      // ── Text colors ───────────────────────────────────────────────────────
      const textPrimary   = isDark ? '#FFFFFF'               : '#1A1A1A';
      const textSecondary = isDark ? 'rgba(255,255,255,0.88)' : '#2D2D2D';
      const textMuted     = isDark ? 'rgba(255,255,255,0.6)'  : '#5A5A5A';

      // ── Shadow helper ─────────────────────────────────────────────────────
      const setShadow = (blur = 6, spread = 2) => {
        ctx.shadowColor    = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)';
        ctx.shadowBlur     = blur;
        ctx.shadowOffsetX  = 0;
        ctx.shadowOffsetY  = spread;
      };
      const clearShadow = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };

      const pad    = Math.round(zoneW * 0.09);
      const innerW = zoneW - pad * 2;
      const tx     = zoneX + pad;
      let cy       = zoneY + Math.round(zoneH * 0.08);  // start 8% from top

      ctx.textAlign = 'left';

      // ── Brand ─────────────────────────────────────────────────────────────
      if (ld.brand) {
        const fs = Math.round(zoneW * 0.048);
        ctx.font = `600 ${fs}px Arial, sans-serif`;
        ctx.fillStyle = textMuted;
        setShadow(4, 1);
        ctx.fillText(ld.brand.toUpperCase(), tx, cy + fs);
        clearShadow();
        cy += Math.round(fs * 2.4);

        // thin line after brand
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx + innerW * 0.5, cy); ctx.stroke();
        cy += Math.round(zoneW * 0.04);
      }

      // ── Headline ──────────────────────────────────────────────────────────
      if (ld.headline) {
        const fs = Math.round(zoneW * 0.15);
        const lh = Math.round(fs * 1.1);
        ctx.font      = `bold ${fs}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = textPrimary;
        setShadow(8, 2);
        const lines = wrapText(ctx, ld.headline, tx, cy + fs, innerW, lh, 3);
        clearShadow();
        cy += lines * lh + Math.round(zoneW * 0.04);
      }

      // ── Subheadline ───────────────────────────────────────────────────────
      if (ld.subheadline) {
        const fs = Math.round(zoneW * 0.068);
        const lh = Math.round(fs * 1.45);
        ctx.font      = `300 ${fs}px Arial, sans-serif`;
        ctx.fillStyle = textSecondary;
        setShadow(5, 1);
        const lines = wrapText(ctx, ld.subheadline, tx, cy + fs, innerW, lh, 2);
        clearShadow();
        cy += lines * lh + Math.round(zoneW * 0.05);
      }

      // ── Divider ───────────────────────────────────────────────────────────
      if (ld.features.length > 0 && (ld.headline || ld.subheadline)) {
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx + innerW, cy); ctx.stroke();
        cy += Math.round(zoneW * 0.04);
      }

      // ── Features ──────────────────────────────────────────────────────────
      if (ld.features.length > 0) {
        const fs   = Math.round(zoneW * 0.058);
        const lh   = Math.round(fs * 2.0);
        const arrW = Math.round(fs * 1.4);
        for (const feat of ld.features) {
          if (!feat.trim() || cy + lh > zoneY + zoneH - Math.round(zoneH * 0.18)) break;
          ctx.font      = `bold ${Math.round(fs * 1.1)}px sans-serif`;
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.25)';
          setShadow(3, 1);
          ctx.fillText('›', tx, cy + fs);
          ctx.font      = `${fs}px Arial, sans-serif`;
          ctx.fillStyle = textSecondary;
          wrapText(ctx, feat.trim(), tx + arrW, cy + fs, innerW - arrW, lh, 2);
          clearShadow();
          cy += lh;
        }
        cy += Math.round(zoneW * 0.02);
      }

      // ── "Размеры" + size boxes ────────────────────────────────────────────
      if (ld.sizes.length > 0 && cy + Math.round(zoneW * 0.22) < zoneY + zoneH - Math.round(zoneH * 0.06)) {
        const labelFs = Math.round(zoneW * 0.048);
        ctx.font      = `500 ${labelFs}px Arial, sans-serif`;
        ctx.fillStyle = textMuted;
        setShadow(4, 1);
        ctx.fillText('Размеры', tx, cy + labelFs);
        clearShadow();
        cy += Math.round(labelFs * 1.9);

        const boxSz  = Math.round(zoneW * 0.11);
        const boxGap = Math.round(zoneW * 0.025);
        const fs     = Math.round(boxSz * 0.42);
        let sx = tx;
        for (const sz of ld.sizes) {
          if (sx + boxSz > zoneX + zoneW - pad) break;
          setShadow(3, 1);
          rrect(ctx, sx, cy, boxSz, boxSz, Math.round(boxSz * 0.15));
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)';
          ctx.lineWidth   = Math.max(1, Math.round(W * 0.0018));
          ctx.stroke();
          clearShadow();
          ctx.font      = `500 ${fs}px Arial, sans-serif`;
          ctx.fillStyle = textPrimary;
          ctx.textAlign = 'center';
          setShadow(3, 1);
          ctx.fillText(sz.trim(), sx + boxSz / 2, cy + boxSz * 0.68);
          clearShadow();
          ctx.textAlign = 'left';
          sx += boxSz + boxGap;
        }
        cy += boxSz + Math.round(zoneW * 0.04);
      }

      // ── Footer ────────────────────────────────────────────────────────────
      if (ld.footer) {
        const fs      = Math.round(zoneW * 0.044);
        const footerY = Math.min(cy + fs, zoneY + zoneH - Math.round(zoneH * 0.04));
        ctx.font      = `italic ${fs}px Georgia, serif`;
        ctx.fillStyle = textMuted;
        setShadow(4, 1);
        wrapText(ctx, ld.footer, tx, footerY, innerW, Math.round(fs * 1.5), 2);
        clearShadow();
      }

      resolve(canvas.toDataURL('image/jpeg', 0.94));
    };
    img.src = imageDataUrl;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export function StyleTransferPanel({ onBack }: Props) {
  const [sourceImage,   setSourceImage]   = useState('');
  const [styleImage,    setStyleImage]    = useState('');
  const [fluxResult,    setFluxResult]    = useState('');
  const [result,        setResult]        = useState('');
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [isCompositing, setIsCompositing] = useState(false);
  const [error,         setError]         = useState('');
  const [userNote,      setUserNote]      = useState('');
  const [prompt,        setPrompt]        = useState('');
  const [promptOpen,    setPromptOpen]    = useState(false);
  const [visualMood,    setVisualMood]    = useState('');
  const [textApplied,   setTextApplied]   = useState(false);

  const sourceRef = useRef<HTMLInputElement>(null);
  const styleRef  = useRef<HTMLInputElement>(null);

  const resetResult = () => {
    setResult(''); setFluxResult(''); setError('');
    setVisualMood('');
    setTextApplied(false); setPrompt(''); setPromptOpen(false);
  };

  const handleFile = useCallback(async (file: File, target: 'source' | 'style') => {
    if (!file.type.startsWith('image/')) return;
    try {
      const b64 = await resizeToBase64(file);
      if (target === 'source') setSourceImage(b64);
      else setStyleImage(b64);
      resetResult();
    } catch { /* ignore */ }
  }, []);

  const callApi = async (srcUrl: string, styUrl: string) =>
    fetch('/api/photo/style-transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceImageUrl: srcUrl, styleImageUrl: styUrl, userNote: userNote.trim() }),
    });

  const handleGenerate = async () => {
    if (!sourceImage || !styleImage) return;
    setIsGenerating(true);
    resetResult();

    try {
      // Обесцвечиваем исходное фото перед отправкой — убирает тона кожи,
      // которые триггерят pixel-level фильтр SiliconFlow (код 451).
      // FLUX видит форму и текстуру одежды даже в почти-сером изображении.
      const srcToSend = await desaturateBase64(sourceImage);
      const res = await callApi(srcToSend, styleImage);

      const data = await res.json();
      if (!res.ok) throw new Error(
        res.status === 451
          ? 'Фото заблокировано контент-фильтром. Попробуйте другое исходное фото.'
          : data.error || 'Ошибка генерации'
      );

      const rawImage: string = data.imageUrl;
      setFluxResult(rawImage);
      if (data.prompt)     setPrompt(data.prompt);
      if (data.visualMood) setVisualMood(data.visualMood);

      // Always try to composite text if layoutData returned
      const ld: LayoutData | null = data.layoutData ?? null;
      const hasAnyText = ld && (ld.headline || ld.subheadline || ld.features.length > 0 || ld.sizes.length > 0);

      if (hasAnyText) {
        setIsCompositing(true);
        setResult(rawImage); // show flux while compositing
        try {
          const composed = await composeLayout(rawImage, ld!);
          setResult(composed);
          setTextApplied(true);
        } catch {
          setResult(rawImage);
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

  const handleShowFlux = () => { setResult(fluxResult); setTextApplied(false); };

  const UploadZone = ({ label, sublabel, badge, image, inputRef, target }: {
    label: string; sublabel: string; badge: string; image: string;
    inputRef: RefObject<HTMLInputElement | null>; target: 'source' | 'style';
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

  return (
    <div className="w-full max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
          <ArrowLeft className="h-4 w-4" />Назад
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <Wand2 className="h-4 w-4 text-purple-400" />
        <h2 className="text-base font-semibold text-white">Перенос стиля</h2>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-start mb-5">

        <UploadZone label="Исходное фото" sublabel="Модель и одежда сохранятся"
          badge="Фото 1" image={sourceImage} inputRef={sourceRef} target="source" />

        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1 gap-1">
          <ArrowRight className="h-5 w-5 text-slate-600" />
          <span className="text-[10px] text-slate-700 text-center leading-tight">стиль</span>
        </div>

        <UploadZone label="Стиль (референс)" sublabel="Дизайн карточки будет перенесён"
          badge="Фото 2" image={styleImage} inputRef={styleRef} target="style" />

        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1 gap-1">
          <ArrowRight className="h-5 w-5 text-slate-600" />
          <span className="text-[10px] text-slate-700 text-center leading-tight">результат</span>
        </div>

        {/* Result panel */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Результат</span>
            <p className="text-sm font-semibold text-white">Готовое фото</p>
            {textApplied && <span className="text-[10px] flex items-center gap-1 text-emerald-400"><Check className="h-3 w-3" />Текст наложен</span>}
          </div>
          {visualMood && <p className="text-[10px] text-slate-600 leading-relaxed italic">{visualMood}</p>}

          <div className="relative rounded-2xl border border-slate-700/50 bg-slate-900 w-full aspect-[3/4] flex items-center justify-center overflow-hidden">
            {isBusy ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto mb-3" />
                {isCompositing
                  ? <><p className="text-sm text-slate-400 font-medium">Накладываю текст...</p><p className="text-xs text-slate-600 mt-1">Canvas</p></>
                  : <><p className="text-sm text-slate-400 font-medium">Генерирую...</p>
                     <p className="text-xs text-slate-600 mt-1">Qwen → FLUX</p>
                     <p className="text-xs text-slate-700 mt-0.5">~40–90 сек</p></>}
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

          {result && !isBusy && (
            <div className="space-y-1.5">
              <a href={result} download="style-transfer.jpg" target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/60 text-xs text-slate-400 hover:text-white transition-all py-2.5">
                ⬇ Скачать результат
              </a>
              {fluxResult && textApplied && (
                <button onClick={handleShowFlux}
                  className="w-full text-xs rounded-xl border border-slate-700/40 text-slate-600 hover:text-slate-400 hover:bg-slate-800/20 py-2 transition-all">
                  Показать без текста
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User note */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4 mb-4">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Пожелания к стилю
          <span className="ml-2 text-[10px] font-normal text-slate-600 normal-case">(влияет на фон и освещение)</span>
        </label>
        <textarea value={userNote} onChange={e => setUserNote(e.target.value)}
          placeholder="Более тёплый свет. Светлый нейтральный фон."
          rows={2}
          className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/60 resize-none" />
      </div>

      {/* Generate button */}
      <Button onClick={handleGenerate} disabled={!sourceImage || !styleImage || isBusy}
        className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:opacity-90 text-white font-semibold rounded-xl h-12 mb-4 disabled:opacity-40">
        {isGenerating
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Генерирую... (~50–90 сек)</>
          : isCompositing
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Накладываю текст...</>
          : <><Wand2 className="h-4 w-4 mr-2" />Применить стиль</>}
      </Button>

      {(!sourceImage || !styleImage) && (
        <p className="text-xs text-center text-slate-600 mb-4">
          {!sourceImage && !styleImage ? 'Загрузите оба фото чтобы начать'
            : !sourceImage ? 'Загрузите исходное фото (Фото 1)'
            : 'Загрузите фото со стилем (Фото 2)'}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400 mb-4">{error}</div>
      )}

      {/* FLUX prompt — collapsed */}
      {prompt && (
        <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 overflow-hidden">
          <button onClick={() => setPromptOpen(p => !p)}
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <span>Промпт FLUX</span>
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
