'use client';

import { useState, useRef, useCallback, RefObject } from 'react';
import { ArrowLeft, Upload, Loader2, Wand2, ArrowRight, ChevronDown, Image as ImageIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { onBack: () => void; }

interface LayoutData {
  panelSide: string;      // 'left' | 'right' | 'center' | 'bottom'
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

/** Parse hex color to RGB */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || '#FFFFFF').replace('#', '');
  if (h.length === 3) {
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  return {
    r: parseInt(h.slice(0, 2), 16) || 240,
    g: parseInt(h.slice(2, 4), 16) || 237,
    b: parseInt(h.slice(4, 6), 16) || 230,
  };
}

/** Draw rounded rectangle path */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wrap text; returns number of lines drawn */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, maxW: number, lh: number, maxL = 8,
): number {
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
 * Composite text panel on top of FLUX result.
 * right/left/bottom → edge-to-edge; center → floating with rounded corners.
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

      // ── Panel geometry ───────────────────────────────────────────────────
      const side = ld.panelSide || 'right';
      const wPct = Math.max(25, Math.min(85, ld.panelWidthPct || 40));
      const radius = Math.round(Math.min(W, H) * 0.018);

      let panelX: number, panelY: number, panelW: number, panelH: number;
      if (side === 'right') {
        panelW = Math.round(W * wPct / 100); panelX = W - panelW;
        panelY = 0; panelH = H;
      } else if (side === 'left') {
        panelW = Math.round(W * wPct / 100); panelX = 0;
        panelY = 0; panelH = H;
      } else if (side === 'bottom') {
        panelW = W; panelX = 0;
        panelH = Math.round(H * wPct / 100); panelY = H - panelH;
      } else {
        // center-overlay — floating with rounded corners
        panelW = Math.round(W * wPct / 100);
        panelX = Math.round((W - panelW) / 2);
        panelY = Math.round(H * 0.06); panelH = Math.round(H * 0.88);
      }

      const pad    = Math.round(panelW * 0.09);
      const innerW = panelW - pad * 2;

      // ── Panel background ─────────────────────────────────────────────────
      const rgb = hexToRgb(ld.panelColor || '#F0EDE6');
      const op  = Math.max(0.72, Math.min(1, ld.panelOpacity || 0.95));

      if (side === 'center') {
        rrect(ctx, panelX, panelY, panelW, panelH, radius);
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${op})`;
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${op})`;
        ctx.fillRect(panelX, panelY, panelW, panelH);
      }

      // ── Typography (all sizes relative to panelW) ────────────────────────
      const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
      const isDark        = brightness < 128;
      const textPrimary   = isDark ? '#FFFFFF' : '#111111';
      const textSecondary = isDark ? 'rgba(255,255,255,0.82)' : '#333333';
      const textMuted     = isDark ? 'rgba(255,255,255,0.55)' : '#777777';
      const dividerColor  = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';

      let cy = panelY + pad;
      const tx = panelX + pad;
      ctx.textAlign = 'left';

      // Brand
      if (ld.brand) {
        const fs = Math.round(panelW * 0.048);
        ctx.font = `600 ${fs}px Arial, sans-serif`;
        ctx.fillStyle = textMuted;
        ctx.fillText(ld.brand.toUpperCase(), tx, cy + fs);
        cy += Math.round(fs * 2.4);
        ctx.strokeStyle = dividerColor; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx + innerW * 0.55, cy); ctx.stroke();
        cy += Math.round(panelW * 0.045);
      }

      // Headline
      if (ld.headline) {
        const fs = Math.round(panelW * 0.145);
        const lh = Math.round(fs * 1.12);
        ctx.font = `bold ${fs}px Georgia, serif`;
        ctx.fillStyle = textPrimary;
        const lines = wrapText(ctx, ld.headline, tx, cy + fs, innerW, lh, 3);
        cy += lines * lh + Math.round(panelW * 0.04);
      }

      // Subheadline
      if (ld.subheadline) {
        const fs = Math.round(panelW * 0.072);
        const lh = Math.round(fs * 1.45);
        ctx.font = `300 ${fs}px Arial, sans-serif`;
        ctx.fillStyle = textSecondary;
        const lines = wrapText(ctx, ld.subheadline, tx, cy + fs, innerW, lh, 2);
        cy += lines * lh + Math.round(panelW * 0.05);
      }

      // Divider before features
      if (ld.features.length > 0 && (ld.headline || ld.subheadline)) {
        ctx.strokeStyle = dividerColor; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx + innerW, cy); ctx.stroke();
        cy += Math.round(panelW * 0.045);
      }

      // Features
      if (ld.features.length > 0) {
        const fs  = Math.round(panelW * 0.062);
        const lh  = Math.round(fs * 2.1);
        const arrW = Math.round(fs * 1.5);
        for (const feat of ld.features) {
          if (!feat.trim() || cy + lh > panelY + panelH - pad) break;
          ctx.font = `bold ${Math.round(fs * 1.15)}px sans-serif`;
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.22)';
          ctx.fillText('›', tx, cy + fs);
          ctx.font = `${fs}px Arial, sans-serif`;
          ctx.fillStyle = textSecondary;
          wrapText(ctx, feat.trim(), tx + arrW, cy + fs, innerW - arrW, lh, 2);
          cy += lh;
        }
        cy += Math.round(panelW * 0.02);
      }

      // "Размеры" label + size boxes
      if (ld.sizes.length > 0 && cy + Math.round(panelW * 0.2) < panelY + panelH - pad) {
        const labelFs = Math.round(panelW * 0.05);
        ctx.font = `500 ${labelFs}px Arial, sans-serif`;
        ctx.fillStyle = textMuted;
        ctx.fillText('Размеры', tx, cy + labelFs);
        cy += Math.round(labelFs * 1.9);

        const boxSz  = Math.round(panelW * 0.115);
        const boxGap = Math.round(panelW * 0.028);
        const fs     = Math.round(boxSz * 0.42);
        let sx = tx;
        for (const sz of ld.sizes) {
          if (sx + boxSz > panelX + panelW - pad) break;
          rrect(ctx, sx, cy, boxSz, boxSz, Math.round(boxSz * 0.14));
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.28)';
          ctx.lineWidth = Math.max(1, Math.round(panelW * 0.003));
          ctx.stroke();
          ctx.font = `500 ${fs}px Arial, sans-serif`;
          ctx.fillStyle = textPrimary;
          ctx.textAlign = 'center';
          ctx.fillText(sz.trim(), sx + boxSz / 2, cy + boxSz * 0.68);
          ctx.textAlign = 'left';
          sx += boxSz + boxGap;
        }
        cy += boxSz + Math.round(panelW * 0.05);
      }

      // Footer
      if (ld.footer) {
        const fs      = Math.round(panelW * 0.047);
        const footerY = Math.min(cy + fs, panelY + panelH - Math.round(pad * 0.6));
        ctx.font      = `italic ${fs}px Georgia, serif`;
        ctx.fillStyle = textMuted;
        wrapText(ctx, ld.footer, tx, footerY, innerW, Math.round(fs * 1.5), 2);
      }

      resolve(canvas.toDataURL('image/jpeg', 0.93));
    };
    img.src = imageDataUrl;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export function StyleTransferPanel({ onBack }: Props) {
  const [sourceImage,   setSourceImage]   = useState('');
  const [styleImage,    setStyleImage]    = useState('');
  const [fluxResult,    setFluxResult]    = useState('');   // raw FLUX output
  const [result,        setResult]        = useState('');   // shown to user (flux or composed)
  const [isGenerating,  setIsGenerating]  = useState(false);
  const [isCompositing, setIsCompositing] = useState(false);
  const [error,         setError]         = useState('');
  const [userNote,      setUserNote]      = useState('');
  const [prompt,        setPrompt]        = useState('');
  const [promptOpen,    setPromptOpen]    = useState(false);
  const [dominantType,  setDominantType]  = useState('');
  const [visualMood,    setVisualMood]    = useState('');
  const [textApplied,   setTextApplied]   = useState(false);
  const [ocrFound,      setOcrFound]      = useState(false);  // did OCR detect any text

  // ── Panel geometry ──────────────────────────────────────────────────────────
  const [editPanelSide,     setEditPanelSide]     = useState<'right'|'left'|'bottom'|'center'>('right');
  const [editPanelWidthPct, setEditPanelWidthPct] = useState(40);
  const [editPanelColor,    setEditPanelColor]     = useState('#F0EDE6');
  const [editPanelOpacity,  setEditPanelOpacity]   = useState(0.95);

  // ── Text content ─────────────────────────────────────────────────────────────
  const [editHeadline,    setEditHeadline]    = useState('');
  const [editSubheadline, setEditSubheadline] = useState('');
  const [editFeatures,    setEditFeatures]    = useState('');
  const [editSizes,       setEditSizes]       = useState('');
  const [editFooter,      setEditFooter]      = useState('');
  const [editBrand,       setEditBrand]       = useState('');

  const sourceRef = useRef<HTMLInputElement>(null);
  const styleRef  = useRef<HTMLInputElement>(null);

  const populateFields = (ld: LayoutData) => {
    setEditPanelSide((ld.panelSide || 'right') as 'right'|'left'|'bottom'|'center');
    setEditPanelWidthPct(ld.panelWidthPct || 40);
    setEditPanelColor(ld.panelColor || '#F0EDE6');
    setEditPanelOpacity(ld.panelOpacity || 0.95);
    setEditHeadline(ld.headline);
    setEditSubheadline(ld.subheadline);
    setEditFeatures(ld.features.join('\n'));
    setEditSizes(ld.sizes.join(', '));
    setEditFooter(ld.footer);
    setEditBrand(ld.brand);
  };

  const buildLayout = (): LayoutData => ({
    panelSide:    editPanelSide,
    panelWidthPct: editPanelWidthPct,
    panelColor:   editPanelColor,
    panelOpacity: editPanelOpacity,
    headline:     editHeadline,
    subheadline:  editSubheadline,
    features:     editFeatures.split('\n').map(s => s.trim()).filter(Boolean),
    sizes:        editSizes.split(',').map(s => s.trim()).filter(Boolean),
    footer:       editFooter,
    brand:        editBrand,
  });

  const resetResult = () => {
    setResult(''); setFluxResult(''); setError('');
    setDominantType(''); setVisualMood('');
    setTextApplied(false); setOcrFound(false);
    setPrompt(''); setPromptOpen(false);
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

  const handleGenerate = async () => {
    if (!sourceImage || !styleImage) return;
    setIsGenerating(true);
    resetResult();

    try {
      const res = await fetch('/api/photo/style-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImageUrl: sourceImage,
          styleImageUrl:  styleImage,
          userNote:       userNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');

      const rawImage: string = data.imageUrl;
      setFluxResult(rawImage);
      setResult(rawImage);
      if (data.prompt)       setPrompt(data.prompt);
      if (data.dominantType) setDominantType(data.dominantType);
      if (data.visualMood)   setVisualMood(data.visualMood);

      // layoutData is always returned from server now
      if (data.layoutData) {
        const ld: LayoutData = data.layoutData;
        populateFields(ld);

        const hasOcrText = !!(ld.headline || ld.subheadline || ld.features.length > 0);
        setOcrFound(hasOcrText);

        // Auto-composite only when OCR actually found a headline
        if (hasOcrText) {
          setIsCompositing(true);
          try {
            const composed = await composeLayout(rawImage, ld);
            setResult(composed);
            setTextApplied(true);
          } catch { /* keep flux result */ }
          finally { setIsCompositing(false); }
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyText = async () => {
    if (!fluxResult) return;
    setIsCompositing(true);
    try {
      const composed = await composeLayout(fluxResult, buildLayout());
      setResult(composed);
      setTextApplied(true);
    } catch { /* ignore */ }
    finally { setIsCompositing(false); }
  };

  const handleShowFlux = () => { setResult(fluxResult); setTextApplied(false); };

  // ── Upload zone component ────────────────────────────────────────────────────
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
  const showEditor = !!fluxResult && !isGenerating;

  const SIDES = [
    { key: 'right',  label: '▶ Справа' },
    { key: 'left',   label: '◀ Слева'  },
    { key: 'bottom', label: '▼ Снизу'  },
    { key: 'center', label: '⊞ Центр'  },
  ] as const;

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
        <span className="text-xs text-slate-600 hidden md:block">
          — FLUX переносит стиль → вы добавляете текст через редактор
        </span>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-start mb-5">

        <UploadZone label="Исходное фото" sublabel="Одежда и модель сохранятся"
          badge="Фото 1" image={sourceImage} inputRef={sourceRef} target="source" />

        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1 gap-1">
          <ArrowRight className="h-5 w-5 text-slate-600" />
          <span className="text-[10px] text-slate-700 text-center leading-tight">стиль</span>
        </div>

        <UploadZone label="Стиль (референс)" sublabel="Визуальный стиль и компоновка"
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

          {dominantType && (
            <div className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border text-purple-400 border-purple-500/30 bg-purple-500/10">
              <ImageIcon className="h-3 w-3" />
              <span>{dominantType === 'text_overlay' ? 'Инфографика / текст' : dominantType === 'lighting' ? 'Свет и цвет' : 'Фон и окружение'}</span>
            </div>
          )}
          {visualMood && <p className="text-[10px] text-slate-600 leading-relaxed">{visualMood}</p>}

          <div className="relative rounded-2xl border border-slate-700/50 bg-slate-900 w-full aspect-[3/4] flex items-center justify-center overflow-hidden">
            {isBusy ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto mb-3" />
                {isCompositing
                  ? <><p className="text-sm text-slate-400 font-medium">Накладываю текст...</p><p className="text-xs text-slate-600 mt-1">Canvas compositing</p></>
                  : <><p className="text-sm text-slate-400 font-medium">Анализирую и генерирую...</p>
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
                  className="w-full text-xs rounded-xl border border-slate-700/40 text-slate-500 hover:bg-slate-800/20 py-2 transition-all">
                  ⊡ Показать без текста (только FLUX)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TEXT EDITOR — always shown after generation
      ═══════════════════════════════════════════════════════════════════ */}
      {showEditor && (
        <div className="rounded-xl border border-amber-800/30 bg-amber-900/10 p-5 mb-4">

          {/* Editor header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-400">✏ Текст карточки</span>
              {ocrFound
                ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-700/30 text-emerald-400">Текст определён автоматически — проверьте и исправьте</span>
                : <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/30 text-slate-500">Введите текст из референса вручную</span>
              }
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {/* Text fields */}
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">Заголовок</label>
              <input value={editHeadline} onChange={e => setEditHeadline(e.target.value)}
                placeholder="Костюм"
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 placeholder:text-slate-700" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">Подзаголовок</label>
              <input value={editSubheadline} onChange={e => setEditSubheadline(e.target.value)}
                placeholder="Рубашка с шортами"
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 placeholder:text-slate-700" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">Бренд / магазин</label>
              <input value={editBrand} onChange={e => setEditBrand(e.target.value)}
                placeholder="NS Dream"
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 placeholder:text-slate-700" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">Размеры (через запятую)</label>
              <input value={editSizes} onChange={e => setEditSizes(e.target.value)}
                placeholder="XS, S, M, L, XL"
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 placeholder:text-slate-700" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">Характеристики (каждая с новой строки)</label>
              <textarea value={editFeatures} onChange={e => setEditFeatures(e.target.value)} rows={4}
                placeholder={"Ткань Сингапур\nСвободный крой\nНатуральный состав"}
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none placeholder:text-slate-700" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">Подпись / футер</label>
              <textarea value={editFooter} onChange={e => setEditFooter(e.target.value)} rows={2}
                placeholder="Цвет стильных образцов"
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 resize-none placeholder:text-slate-700" />
            </div>
          </div>

          {/* Panel geometry controls */}
          <div className="border-t border-slate-700/40 pt-4 mb-4">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-3">Расположение панели</p>
            <div className="flex flex-wrap gap-4 items-start">

              {/* Side selector */}
              <div>
                <p className="text-[10px] text-slate-600 mb-1.5">Сторона</p>
                <div className="flex gap-1.5">
                  {SIDES.map(({ key, label }) => (
                    <button key={key} onClick={() => setEditPanelSide(key)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all ${
                        editPanelSide === key
                          ? 'border-amber-500/50 bg-amber-900/25 text-amber-300'
                          : 'border-slate-700/50 text-slate-500 hover:bg-slate-800/40 hover:text-slate-300'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Width */}
              <div className="flex-1 min-w-[140px]">
                <p className="text-[10px] text-slate-600 mb-1.5">Ширина: <span className="text-slate-400">{editPanelWidthPct}%</span></p>
                <input type="range" min={25} max={80} value={editPanelWidthPct}
                  onChange={e => setEditPanelWidthPct(parseInt(e.target.value))}
                  className="w-full accent-amber-500 h-1.5" />
              </div>

              {/* Color */}
              <div>
                <p className="text-[10px] text-slate-600 mb-1.5">Цвет панели</p>
                <div className="flex items-center gap-2">
                  <input type="color" value={editPanelColor} onChange={e => setEditPanelColor(e.target.value)}
                    className="h-8 w-10 rounded cursor-pointer border border-slate-700/50 bg-transparent" />
                  <input type="text" value={editPanelColor} onChange={e => setEditPanelColor(e.target.value)}
                    className="w-24 rounded-lg border border-slate-700/50 bg-slate-800/60 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 font-mono" />
                </div>
              </div>

              {/* Opacity */}
              <div className="flex-1 min-w-[120px]">
                <p className="text-[10px] text-slate-600 mb-1.5">Непрозрачность: <span className="text-slate-400">{Math.round(editPanelOpacity * 100)}%</span></p>
                <input type="range" min={70} max={100} value={Math.round(editPanelOpacity * 100)}
                  onChange={e => setEditPanelOpacity(parseInt(e.target.value) / 100)}
                  className="w-full accent-amber-500 h-1.5" />
              </div>
            </div>
          </div>

          {/* Apply button */}
          <Button onClick={handleApplyText} disabled={isBusy}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl h-11">
            {isCompositing
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Накладываю текст...</>
              : '✦ Наложить текст на карточку'}
          </Button>
        </div>
      )}

      {/* User note */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4 mb-4">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Пожелания к стилю фото
          <span className="ml-2 text-[10px] font-normal text-slate-600 normal-case tracking-normal">(влияет на FLUX, не на текст)</span>
        </label>
        <textarea value={userNote} onChange={e => setUserNote(e.target.value)}
          placeholder="Сделать фон светлее. Мягкое естественное освещение."
          rows={2}
          className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/60 resize-none" />
      </div>

      {/* Generate button */}
      <Button onClick={handleGenerate} disabled={!sourceImage || !styleImage || isBusy}
        className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:opacity-90 text-white font-semibold rounded-xl h-12 mb-4 disabled:opacity-40">
        {isGenerating
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Анализирую и генерирую... (~50–90 сек)</>
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

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-4 py-3 text-sm text-red-400 mb-4">{error}</div>
      )}

      {/* FLUX prompt collapsible */}
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
