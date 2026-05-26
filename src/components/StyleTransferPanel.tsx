'use client';

import { useState, useRef, useCallback, RefObject } from 'react';
import { ArrowLeft, Upload, Loader2, Wand2, ArrowRight, ChevronDown, Image as ImageIcon, Sun, Check, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props { onBack: () => void; }

interface LayoutData {
  panelSide: string;      // 'left' | 'right' | 'center' | 'bottom'
  panelWidthPct: number;  // 30–85
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

/** Escape special regex characters */
function escapeRx(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Apply userNote substitutions to layout data */
function applyNoteToLayout(ld: LayoutData, note: string): LayoutData {
  if (!note.trim()) return ld;
  const result = { ...ld, features: [...ld.features], sizes: [...ld.sizes] };

  const rep = (s: string, from: string, to: string) =>
    s.replace(new RegExp(escapeRx(from), 'gi'), to).replace(/\s{2,}/g, ' ').trim();

  const applyReplace = (from: string, to: string) => {
    result.headline    = rep(result.headline,    from, to);
    result.subheadline = rep(result.subheadline, from, to);
    result.footer      = rep(result.footer,      from, to);
    result.brand       = rep(result.brand,        from, to);
    result.features    = result.features.map(f => rep(f, from, to));
  };

  // замени "X" на/НА "Y"
  const rxQ = /замени\s+"([^"]+)"\s+(?:на|НА)\s+"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = rxQ.exec(note)) !== null) applyReplace(m[1], m[2]);

  // замени X на/НА Y (without quotes)
  const rxNQ = /замени\s+(\S+)\s+(?:на|НА)\s+(\S+)/gi;
  while ((m = rxNQ.exec(note)) !== null) {
    if (!m[1].startsWith('"')) applyReplace(m[1], m[2]);
  }

  // убери "X" из текста
  const rxRem = /убери\s+(?:из\s+текста\s+)?(?:слова?\s+)?"([^"]+)"(?:\s+из\s+текста)?/gi;
  while ((m = rxRem.exec(note)) !== null) {
    const what = m[1];
    const remFn = (s: string) => s.replace(new RegExp(escapeRx(what), 'gi'), '').replace(/\s{2,}/g, ' ').trim();
    result.headline    = remFn(result.headline);
    result.subheadline = remFn(result.subheadline);
    result.features    = result.features.map(remFn).filter(Boolean);
  }

  return result;
}

/** Parse hex color to RGB */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  return { r: parseInt(h.slice(0,2), 16), g: parseInt(h.slice(2,4), 16), b: parseInt(h.slice(4,6), 16) };
}

/** Draw rounded rectangle */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wrap text, returns number of lines drawn */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxL = 8): number {
  const words = text.split(' ');
  let line = '', count = 0;
  for (const w of words) {
    if (count >= maxL) break;
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y + count * lh);
      line = w; count++;
    } else { line = test; }
  }
  if (line && count < maxL) { ctx.fillText(line, x, y + count * lh); count++; }
  return count;
}

/**
 * Composite layout panel with text on top of FLUX result.
 * Supports: right-panel, left-panel, center-overlay, bottom-panel
 * All font sizes are relative to panelW for correct proportions.
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

      // ── Panel geometry ────────────────────────────────────────────────────
      const side = ld.panelSide || 'right';
      const wPct = Math.max(25, Math.min(85, ld.panelWidthPct || 40));
      const radius = Math.round(Math.min(W, H) * 0.018);

      let panelX: number, panelY: number, panelW: number, panelH: number;

      if (side === 'right') {
        panelW = Math.round(W * wPct / 100);
        panelX = W - panelW;
        panelY = 0; panelH = H;
      } else if (side === 'left') {
        panelW = Math.round(W * wPct / 100);
        panelX = 0;
        panelY = 0; panelH = H;
      } else if (side === 'bottom') {
        panelW = W; panelX = 0;
        panelH = Math.round(H * wPct / 100);
        panelY = H - panelH;
      } else {
        // center-overlay — rounded, with margin
        panelW = Math.round(W * wPct / 100);
        panelX = Math.round((W - panelW) / 2);
        panelY = Math.round(H * 0.06);
        panelH = Math.round(H * 0.88);
      }

      const pad    = Math.round(panelW * 0.09);
      const innerW = panelW - pad * 2;

      // ── Draw panel background ────────────────────────────────────────────
      const rgb = hexToRgb(ld.panelColor || '#FFFFFF');
      const op  = Math.max(0.72, Math.min(1, ld.panelOpacity || 0.95));

      if (side === 'center') {
        rrect(ctx, panelX, panelY, panelW, panelH, radius);
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${op})`;
        ctx.fill();
      } else {
        // Edge-to-edge for side/bottom panels (cleaner look)
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${op})`;
        ctx.fillRect(panelX, panelY, panelW, panelH);
      }

      // ── Typography — all sizes relative to panelW ────────────────────────
      const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
      const isDark      = brightness < 128;
      const textPrimary   = isDark ? '#FFFFFF' : '#111111';
      const textSecondary = isDark ? 'rgba(255,255,255,0.82)' : '#333333';
      const textMuted     = isDark ? 'rgba(255,255,255,0.55)' : '#777777';
      const dividerColor  = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';

      let cy = panelY + pad;
      const tx = panelX + pad;
      ctx.textAlign = 'left';

      // ── Brand ────────────────────────────────────────────────────────────
      if (ld.brand) {
        const fs = Math.round(panelW * 0.048);
        ctx.font      = `600 ${fs}px 'Arial', sans-serif`;
        ctx.fillStyle = textMuted;
        ctx.fillText(ld.brand.toUpperCase(), tx, cy + fs);
        cy += Math.round(fs * 2.4);

        // thin divider after brand
        ctx.strokeStyle = dividerColor;
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx + innerW * 0.55, cy); ctx.stroke();
        cy += Math.round(panelW * 0.045);
      }

      // ── Headline (large bold serif) ───────────────────────────────────────
      if (ld.headline) {
        const fs = Math.round(panelW * 0.145);
        const lh = Math.round(fs * 1.12);
        ctx.font      = `bold ${fs}px 'Georgia', serif`;
        ctx.fillStyle = textPrimary;
        const lines   = wrapText(ctx, ld.headline, tx, cy + fs, innerW, lh, 3);
        cy += lines * lh + Math.round(panelW * 0.04);
      }

      // ── Subheadline ───────────────────────────────────────────────────────
      if (ld.subheadline) {
        const fs = Math.round(panelW * 0.072);
        const lh = Math.round(fs * 1.45);
        ctx.font      = `300 ${fs}px 'Arial', sans-serif`;
        ctx.fillStyle = textSecondary;
        const lines   = wrapText(ctx, ld.subheadline, tx, cy + fs, innerW, lh, 2);
        cy += lines * lh + Math.round(panelW * 0.05);
      }

      // ── Divider before features ───────────────────────────────────────────
      if (ld.features.length > 0 && (ld.headline || ld.subheadline)) {
        ctx.strokeStyle = dividerColor;
        ctx.lineWidth   = 1;
        ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(tx + innerW, cy); ctx.stroke();
        cy += Math.round(panelW * 0.045);
      }

      // ── Feature list ──────────────────────────────────────────────────────
      if (ld.features.length > 0) {
        const fs   = Math.round(panelW * 0.062);
        const lh   = Math.round(fs * 2.1);
        const arrW = Math.round(fs * 1.5);
        for (const feat of ld.features) {
          if (!feat.trim() || cy + lh > panelY + panelH - pad) break;
          // ‹ arrow bullet
          ctx.font      = `bold ${Math.round(fs * 1.15)}px sans-serif`;
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.22)';
          ctx.fillText('›', tx, cy + fs);
          ctx.font      = `${fs}px 'Arial', sans-serif`;
          ctx.fillStyle = textSecondary;
          wrapText(ctx, feat.trim(), tx + arrW, cy + fs, innerW - arrW, lh, 2);
          cy += lh;
        }
        cy += Math.round(panelW * 0.02);
      }

      // ── "Размеры" label ───────────────────────────────────────────────────
      if (ld.sizes.length > 0 && cy + Math.round(panelW * 0.2) < panelY + panelH - pad) {
        const labelFs = Math.round(panelW * 0.05);
        ctx.font      = `500 ${labelFs}px 'Arial', sans-serif`;
        ctx.fillStyle = textMuted;
        ctx.fillText('Размеры', tx, cy + labelFs);
        cy += Math.round(labelFs * 1.9);

        // Size boxes
        const boxSz  = Math.round(panelW * 0.115);
        const boxGap = Math.round(panelW * 0.028);
        const fs     = Math.round(boxSz * 0.42);
        let sx = tx;
        for (const sz of ld.sizes) {
          if (sx + boxSz > panelX + panelW - pad) break;
          rrect(ctx, sx, cy, boxSz, boxSz, Math.round(boxSz * 0.14));
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.28)';
          ctx.lineWidth   = Math.max(1, Math.round(panelW * 0.003));
          ctx.stroke();
          ctx.font      = `500 ${fs}px 'Arial', sans-serif`;
          ctx.fillStyle = textPrimary;
          ctx.textAlign = 'center';
          ctx.fillText(sz.trim(), sx + boxSz / 2, cy + boxSz * 0.68);
          ctx.textAlign = 'left';
          sx += boxSz + boxGap;
        }
        cy += boxSz + Math.round(panelW * 0.05);
      }

      // ── Footer / signature ────────────────────────────────────────────────
      if (ld.footer) {
        const fs = Math.round(panelW * 0.047);
        ctx.font      = `italic ${fs}px 'Georgia', serif`;
        ctx.fillStyle = textMuted;
        const footerY = Math.min(cy + fs, panelY + panelH - Math.round(pad * 0.6));
        wrapText(ctx, ld.footer, tx, footerY, innerW, Math.round(fs * 1.5), 2);
      }

      resolve(canvas.toDataURL('image/jpeg', 0.93));
    };
    img.src = imageDataUrl;
  });
}

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
  const [dominantType,  setDominantType]  = useState('');
  const [visualMood,    setVisualMood]    = useState('');
  const [layoutData,    setLayoutData]    = useState<LayoutData | null>(null);
  const [textApplied,   setTextApplied]   = useState(false);
  const [editMode,      setEditMode]      = useState(false);

  // Editable layout fields
  const [editHeadline,    setEditHeadline]    = useState('');
  const [editSubheadline, setEditSubheadline] = useState('');
  const [editFeatures,    setEditFeatures]    = useState('');
  const [editSizes,       setEditSizes]       = useState('');
  const [editFooter,      setEditFooter]      = useState('');
  const [editBrand,       setEditBrand]       = useState('');

  const sourceRef = useRef<HTMLInputElement>(null);
  const styleRef  = useRef<HTMLInputElement>(null);

  const populateEditFields = (ld: LayoutData) => {
    setEditHeadline(ld.headline);
    setEditSubheadline(ld.subheadline);
    setEditFeatures(ld.features.join('\n'));
    setEditSizes(ld.sizes.join(', '));
    setEditFooter(ld.footer);
    setEditBrand(ld.brand);
  };

  const buildEditedLayout = (base: LayoutData): LayoutData => ({
    ...base,
    headline:    editHeadline,
    subheadline: editSubheadline,
    features:    editFeatures.split('\n').map(s => s.trim()).filter(Boolean),
    sizes:       editSizes.split(',').map(s => s.trim()).filter(Boolean),
    footer:      editFooter,
    brand:       editBrand,
  });

  const handleFile = useCallback(async (file: File, target: 'source' | 'style') => {
    if (!file.type.startsWith('image/')) return;
    try {
      const b64 = await resizeToBase64(file);
      if (target === 'source') setSourceImage(b64);
      else setStyleImage(b64);
      setResult(''); setFluxResult(''); setError('');
      setDominantType(''); setLayoutData(null); setTextApplied(false); setEditMode(false);
    } catch { /* ignore */ }
  }, []);

  const handleGenerate = async () => {
    if (!sourceImage || !styleImage) return;
    setIsGenerating(true);
    setError('');
    setResult(''); setFluxResult('');
    setPrompt(''); setPromptOpen(false);
    setDominantType(''); setVisualMood('');
    setLayoutData(null); setTextApplied(false); setEditMode(false);

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
      if (data.prompt)      setPrompt(data.prompt);
      if (data.dominantType) setDominantType(data.dominantType);
      if (data.visualMood)   setVisualMood(data.visualMood);

      // ── Canvas compositing if layout data received ─────────────────────
      if (data.dominantType === 'text_overlay' && data.layoutData) {
        // Apply userNote substitutions client-side
        const ld: LayoutData = applyNoteToLayout(data.layoutData, userNote);
        setLayoutData(ld);
        populateEditFields(ld);
        setIsCompositing(true);
        try {
          const composed = await composeLayout(rawImage, ld);
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

  // Re-composite with current edited fields
  const handleApplyEdits = async () => {
    if (!fluxResult || !layoutData) return;
    const edited = buildEditedLayout(layoutData);
    setIsCompositing(true);
    try {
      const composed = await composeLayout(fluxResult, edited);
      setResult(composed);
      setTextApplied(true);
      setLayoutData(edited);
    } catch { /* ignore */ } finally {
      setIsCompositing(false);
    }
  };

  const handleShowFlux = () => { setResult(fluxResult); setTextApplied(false); };

  const handleShowComposed = async () => {
    if (!fluxResult || !layoutData) return;
    setIsCompositing(true);
    try {
      const composed = await composeLayout(fluxResult, layoutData);
      setResult(composed); setTextApplied(true);
    } catch { /* ignore */ } finally { setIsCompositing(false); }
  };

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
  const dominantLabel: Record<string, string> = {
    text_overlay: 'Инфографика / текст', background: 'Фон и окружение', lighting: 'Свет и цвет',
  };

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
          — Qwen анализирует стиль → FLUX генерирует визуал → Canvas накладывает текст
        </span>
      </div>

      {/* Hint */}
      <div className="rounded-xl border border-purple-800/30 bg-purple-900/10 px-4 py-3 mb-6 flex items-start gap-3">
        <Wand2 className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-400 leading-relaxed">
          <span className="text-purple-300 font-medium">Как работает:</span>{' '}
          Qwen анализирует визуальный стиль, цвета, layout и текст референса.
          FLUX генерирует чистое фото в этом стиле без текста.
          Canvas накладывает текст из референса с правильной типографикой.
        </p>
      </div>

      {/* 3-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-start mb-5">

        <UploadZone label="Исходное фото" sublabel="Одежда и модель сохранятся"
          badge="Фото 1" image={sourceImage} inputRef={sourceRef} target="source" />

        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1 gap-1">
          <ArrowRight className="h-5 w-5 text-slate-600" />
          <span className="text-[10px] text-slate-700 text-center leading-tight">стиль</span>
        </div>

        <UploadZone label="Стиль (референс)" sublabel="Полный стиль будет перенесён на фото 1"
          badge="Фото 2" image={styleImage} inputRef={styleRef} target="style" />

        <div className="hidden md:flex flex-col items-center justify-center pt-28 px-1 gap-1">
          <ArrowRight className="h-5 w-5 text-slate-600" />
          <span className="text-[10px] text-slate-700 text-center leading-tight">результат</span>
        </div>

        {/* Result panel */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              Результат
            </span>
            <p className="text-sm font-semibold text-white">Готовое фото</p>
            {textApplied && <span className="text-[10px] flex items-center gap-1 text-emerald-400"><Check className="h-3 w-3" />Текст наложен</span>}
          </div>

          {dominantType && (
            <div className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border text-purple-400 border-purple-500/30 bg-purple-500/10">
              <ImageIcon className="h-3 w-3" />
              <span>{dominantLabel[dominantType] ?? dominantType}</span>
            </div>
          )}
          {visualMood && <p className="text-[10px] text-slate-600 leading-relaxed">{visualMood}</p>}

          {/* Detected text summary */}
          {layoutData && !isBusy && (
            <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Обнаруженный текст</p>
              {layoutData.headline    && <p className="text-[11px] text-white font-semibold truncate">📝 {layoutData.headline}</p>}
              {layoutData.subheadline && <p className="text-[10px] text-slate-400 truncate">— {layoutData.subheadline}</p>}
              {layoutData.features.length > 0 && (
                <p className="text-[10px] text-slate-500 truncate">• {layoutData.features.join(' | ')}</p>
              )}
              {layoutData.sizes.length > 0 && (
                <p className="text-[10px] text-slate-500">Размеры: {layoutData.sizes.join(', ')}</p>
              )}
            </div>
          )}

          <div className="relative rounded-2xl border border-slate-700/50 bg-slate-900 w-full aspect-[3/4] flex items-center justify-center overflow-hidden">
            {isBusy ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto mb-3" />
                {isCompositing
                  ? <><p className="text-sm text-slate-400 font-medium">Накладываю текст...</p><p className="text-xs text-slate-600 mt-1">Canvas compositing</p></>
                  : <><p className="text-sm text-slate-400 font-medium">Анализирую и генерирую...</p>
                     <p className="text-xs text-slate-600 mt-1">Qwen → FLUX → Canvas</p>
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
              {layoutData && (
                <div className="flex gap-1.5">
                  <button onClick={textApplied ? handleShowFlux : handleShowComposed}
                    className={`flex-1 text-xs rounded-xl border py-2 transition-all ${
                      textApplied
                        ? 'border-slate-700/40 text-slate-500 hover:bg-slate-800/20'
                        : 'border-purple-700/40 text-purple-400 hover:bg-purple-900/10'
                    }`}>
                    {textApplied ? '⊡ Только FLUX (без текста)' : '✦ Наложить текст'}
                  </button>
                  <button onClick={() => setEditMode(e => !e)}
                    className={`px-3 text-xs rounded-xl border py-2 transition-all ${
                      editMode ? 'border-amber-700/40 text-amber-400 bg-amber-900/10' : 'border-slate-700/40 text-slate-500 hover:bg-slate-800/20'
                    }`}>
                    <Edit3 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Text editor (shown when editMode) ── */}
      {editMode && layoutData && !isBusy && (
        <div className="rounded-xl border border-amber-800/30 bg-amber-900/10 p-4 mb-4">
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">✏ Редактор текста</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: 'Бренд', value: editBrand, set: setEditBrand, rows: 1 },
              { label: 'Заголовок', value: editHeadline, set: setEditHeadline, rows: 1 },
              { label: 'Подзаголовок', value: editSubheadline, set: setEditSubheadline, rows: 1 },
              { label: 'Подпись', value: editFooter, set: setEditFooter, rows: 1 },
            ].map(({ label, value, set, rows }) => (
              <div key={label}>
                <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">{label}</label>
                <textarea value={value} onChange={e => set(e.target.value)} rows={rows}
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 resize-none" />
              </div>
            ))}
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">Характеристики (каждая с новой строки)</label>
              <textarea value={editFeatures} onChange={e => setEditFeatures(e.target.value)} rows={4}
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 resize-none" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-semibold uppercase mb-1 block">Размеры (через запятую)</label>
              <textarea value={editSizes} onChange={e => setEditSizes(e.target.value)} rows={1}
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/60 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50 resize-none" />
            </div>
          </div>
          <Button onClick={handleApplyEdits} disabled={isBusy}
            className="mt-3 w-full bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-xl h-9">
            {isCompositing ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Применяю...</> : '✓ Применить текст'}
          </Button>
        </div>
      )}

      {/* User note */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4 mb-4">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Дополнительные пожелания
          <span className="ml-2 text-[10px] font-normal text-slate-600 normal-case tracking-normal">(до генерации)</span>
        </label>
        <textarea value={userNote} onChange={e => setUserNote(e.target.value)}
          placeholder={`замени "BRAND NAME" на "NS DREAM"\nубери "ненужная фраза" из текста`}
          rows={2}
          className="w-full rounded-xl border border-slate-700/50 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/60 resize-none" />
        {userNote.trim() && (
          <p className="text-[10px] text-purple-400/80 mt-1.5 flex items-center gap-1">
            <Wand2 className="h-3 w-3" />
            {dominantType === 'text_overlay'
              ? 'Будет применено к тексту карточки (Canvas)'
              : 'Будет добавлено к промпту FLUX'}
          </p>
        )}
      </div>

      {/* Generate button */}
      <Button onClick={handleGenerate} disabled={!sourceImage || !styleImage || isBusy}
        className="w-full bg-gradient-to-r from-purple-500 to-violet-600 hover:opacity-90 text-white font-semibold rounded-xl h-12 mb-4 disabled:opacity-40">
        {isGenerating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Анализирую и генерирую... (~50–90 сек)</>
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

      {/* Suppress unused import warnings */}
      <span className="hidden"><Sun className="h-0 w-0" /></span>
    </div>
  );
}
