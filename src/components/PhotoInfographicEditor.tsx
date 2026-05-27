'use client';

import { useRef, useState, useCallback } from 'react';
import { Loader2, Sparkles, ChevronDown } from 'lucide-react';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Characteristic {
  title: string;
  value: string;
}

interface InfographicData {
  productName: string;
  productSubtitle: string;
  tagline: string;
  characteristics: Characteristic[];
  bottomText: string;
}

export interface TextVariant {
  approach: 'Выгоды' | 'Характеристики' | 'Эмоции' | 'Минимализм';
  productName: string;
  subtitle: string;
  tagline: string;
  characteristics: Array<{ title: string; value: string }>;
  bottomText: string;
}

export interface CompositionData {
  subjectZone?: string;
  freeZones?: string[];
  primaryTextZone?: string;
  textZoneReason?: string;
  recommendedTextAlignment?: 'vertical' | 'horizontal' | 'two-column';
}

export interface OverlayStyleData {
  /** Editorial layout template (new). Falls back to composition.primaryTextZone if absent. */
  layoutTemplate?: 'side-left' | 'side-right' | 'bottom-band';
  colorScheme?: 'light' | 'dark';
  textColorHex?: string;
  scrimOpacity?: number;
  scrimDirection?: string;
  shadowIntensity?: number;
  /** Legacy fields kept for backwards compat — ignored in new editorial renderer */
  pillStyle?: string;
  pillOpacity?: number;
  pillBgRgba?: string;
  blurRadius?: number;
}

interface Props {
  imageUrl: string;
  analysis?: { good?: string[]; improve?: string[] } | null;
  fluxPrompt?: string;
  textVariants?: TextVariant[];
  compositionData?: CompositionData | null;
  overlayStyleData?: OverlayStyleData | null;
  onExport?: (dataUrl: string) => void;
}

// ── Approach badge styles ─────────────────────────────────────────────────────

const APPROACH_STYLE: Record<string, { badge: string; ring: string }> = {
  'Выгоды':         { badge: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50', ring: 'border-emerald-500/70 bg-emerald-950/30' },
  'Характеристики': { badge: 'bg-blue-900/60 text-blue-300 border border-blue-700/50',          ring: 'border-blue-500/70 bg-blue-950/30' },
  'Эмоции':         { badge: 'bg-rose-900/60 text-rose-300 border border-rose-700/50',           ring: 'border-rose-500/70 bg-rose-950/30' },
  'Минимализм':     { badge: 'bg-zinc-700/80 text-zinc-300 border border-zinc-600/50',           ring: 'border-zinc-400/50 bg-zinc-900/40' },
};

const CARD_W = 900;
const CARD_H = 1200;

const DEFAULT_DATA: InfographicData = {
  productName: 'НАЗВАНИЕ',
  productSubtitle: 'лёгкий и дышащий',
  tagline: 'новинка сезона',
  characteristics: [
    { title: 'Качество', value: 'натуральные материалы' },
    { title: 'Комфорт', value: 'удобная посадка' },
    { title: 'Стиль', value: 'актуальный дизайн' },
  ],
  bottomText: 'стиль и качество в каждой детали',
};

// ── Canvas helpers ────────────────────────────────────────────────────────────

/**
 * Sample average RGB + luminance from the text-zone side of the canvas.
 * `side` determines which region to sample (left 30% or right 30% or top/bottom 25%).
 */
function sampleBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  side: 'left' | 'right' | 'top' | 'bottom' = 'left',
): { r: number; g: number; b: number; luminance: number } {
  try {
    let data: Uint8ClampedArray;
    if (side === 'left') {
      const sW = Math.max(1, Math.floor(W * 0.30));
      data = ctx.getImageData(0, 0, sW, H).data;
    } else if (side === 'right') {
      const sW = Math.max(1, Math.floor(W * 0.30));
      data = ctx.getImageData(W - sW, 0, sW, H).data;
    } else if (side === 'top') {
      const sH = Math.max(1, Math.floor(H * 0.25));
      data = ctx.getImageData(0, 0, W, sH).data;
    } else {
      const sH = Math.max(1, Math.floor(H * 0.25));
      data = ctx.getImageData(0, H - sH, W, sH).data;
    }

    let r = 0, g = 0, b = 0, count = 0;
    const step = 4 * 20; // every 20th pixel
    for (let i = 0; i < data.length; i += step) {
      const pr = data[i], pg = data[i + 1], pb = data[i + 2];
      const mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb);
      const saturation = mx > 0 ? (mx - mn) / mx : 0;
      if (saturation > 0.35) continue;
      r += pr; g += pg; b += pb; count++;
    }

    if (count < 10) {
      let fr = 0, fg = 0, fb = 0, fc = 0;
      for (let i = 0; i < data.length; i += step) {
        fr += data[i]; fg += data[i + 1]; fb += data[i + 2]; fc++;
      }
      const ar = fc ? fr / fc : 200, ag = fc ? fg / fc : 195, ab = fc ? fb / fc : 185;
      return { r: ar, g: ag, b: ab, luminance: 0.299 * ar + 0.587 * ag + 0.114 * ab };
    }

    const ar = r / count, ag = g / count, ab = b / count;
    return { r: ar, g: ag, b: ab, luminance: 0.299 * ar + 0.587 * ag + 0.114 * ab };
  } catch {
    return { r: 240, g: 235, b: 225, luminance: 235 };
  }
}

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

function spacedTextWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 99): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      if (lines.length >= maxLines) return lines;
      cur = w;
    } else cur = test;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

// ── Editorial Canvas Drawing ───────────────────────────────────────────────────

/**
 * Derive accent color from sampled background.
 * Light + warm BG → warm dark charcoal | Light + cool → cool dark navy
 * Dark + warm BG  → warm gold          | Dark + cool  → silver-blue
 */
function deriveAccent(r: number, _g: number, b: number, luminance: number): string {
  const isLight = luminance > 140;
  const warmth  = r - b;
  if (isLight) {
    return warmth >= 0 ? 'rgba(50,36,18,0.72)' : 'rgba(34,40,56,0.74)';
  } else {
    return warmth >= 0 ? 'rgba(212,180,108,0.84)' : 'rgba(174,200,228,0.82)';
  }
}

/** Side layout — text column on left or right, full-height photo. */
function drawSideLayout(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  data: InfographicData,
  isRight: boolean,
  textColor: string,
  accent: string,
  shadowAlpha: number,
) {
  const PAD    = 54;
  const TEXT_W = 296;
  const SPC    = 2.8;       // letter-spacing for small-caps
  const textX  = isRight ? W - PAD : PAD;

  ctx.textBaseline  = 'top';
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  let y = 72;

  // ── Tagline ─────────────────────────────────────────────────────────────
  ctx.font      = "400 10.5px Arial, Helvetica, sans-serif";
  ctx.fillStyle = textColor;
  ctx.globalAlpha = 0.42;
  const tagText = (data.tagline || '').toUpperCase();
  const tagW    = spacedTextWidth(ctx, tagText, SPC);
  drawSpaced(ctx, tagText, isRight ? textX - tagW : textX, y, SPC);
  ctx.globalAlpha = 1;
  y += 26;

  // ── Short accent rule ───────────────────────────────────────────────────
  const rLen = 36;
  const rX   = isRight ? textX - rLen : textX;
  ctx.beginPath();
  ctx.moveTo(rX, y); ctx.lineTo(rX + rLen, y);
  ctx.strokeStyle = accent;
  ctx.lineWidth   = 1.2;
  ctx.globalAlpha = 0.70;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 20;

  // ── Product name — Playfair Display italic bold ─────────────────────────
  const rawName = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const nLen    = rawName.replace(/\s/g, '').length;
  const NS      = nLen <= 7 ? 90 : nLen <= 11 ? 74 : nLen <= 16 ? 60 : 50;
  ctx.font        = `italic bold ${NS}px 'Playfair Display', Georgia, 'Times New Roman', serif`;
  ctx.fillStyle   = textColor;
  ctx.textAlign   = isRight ? 'right' : 'left';
  ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`;
  ctx.shadowBlur  = 16;
  ctx.shadowOffsetY = 2;
  for (const line of wrapText(ctx, rawName, TEXT_W, 3)) {
    ctx.fillText(line, textX, y);
    y += Math.ceil(NS * 1.07);
  }
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetY = 0;
  y += 12;

  // ── Subtitle ────────────────────────────────────────────────────────────
  if (data.productSubtitle) {
    ctx.font        = "italic 400 15.5px Arial, Helvetica, sans-serif";
    ctx.fillStyle   = textColor;
    ctx.globalAlpha = 0.50;
    ctx.textAlign   = isRight ? 'right' : 'left';
    ctx.fillText(data.productSubtitle, textX, y);
    ctx.globalAlpha = 1;
    y += 40;
  }

  // ── Main separator ──────────────────────────────────────────────────────
  const sepX = isRight ? textX - TEXT_W : textX;
  ctx.beginPath();
  ctx.moveTo(sepX, y); ctx.lineTo(sepX + TEXT_W, y);
  ctx.strokeStyle = textColor;
  ctx.lineWidth   = 1;
  ctx.globalAlpha = 0.14;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 22;

  // ── Characteristics ─────────────────────────────────────────────────────
  const chars = data.characteristics.slice(0, 3);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Title: spaced uppercase, accent
    ctx.font        = "700 10px Arial, Helvetica, sans-serif";
    ctx.fillStyle   = accent;
    ctx.globalAlpha = 1;
    const tText = (ch.title || '').toUpperCase();
    const tW    = spacedTextWidth(ctx, tText, 2.2);
    drawSpaced(ctx, tText, isRight ? textX - tW : textX, y, 2.2);
    y += 17;

    // Value
    ctx.font        = "400 13.5px Arial, Helvetica, sans-serif";
    ctx.fillStyle   = textColor;
    ctx.globalAlpha = 0.86;
    ctx.textAlign   = isRight ? 'right' : 'left';
    ctx.fillText(wrapText(ctx, ch.value || '', TEXT_W, 1)[0] ?? ch.value, textX, y);
    ctx.globalAlpha = 1;
    y += 20;

    // Thin separator between items (not after last)
    if (i < chars.length - 1) {
      const csX = isRight ? textX - TEXT_W : textX;
      ctx.beginPath();
      ctx.moveTo(csX, y + 3); ctx.lineTo(csX + TEXT_W, y + 3);
      ctx.strokeStyle = textColor;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.09;
      ctx.stroke();
      ctx.globalAlpha = 1;
      y += 20;
    }
  }

  // ── Bottom text (bottom-anchored) ────────────────────────────────────────
  if (data.bottomText) {
    ctx.font        = "italic 400 12.5px 'Playfair Display', Georgia, serif";
    ctx.fillStyle   = textColor;
    ctx.globalAlpha = 0.40;
    ctx.textAlign   = isRight ? 'right' : 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(data.bottomText, textX, H - 66);
    ctx.globalAlpha  = 1;
    ctx.textBaseline = 'top';
  }
}

/** Bottom-band layout — photo full-height, editorial text block at the bottom. */
function drawBottomLayout(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  data: InfographicData,
  textColor: string,
  accent: string,
  shadowAlpha: number,
) {
  const CX       = W / 2;
  const SPC      = 2.8;
  const BAND_TOP = H - 312;

  ctx.textBaseline  = 'top';
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  let y = BAND_TOP + 26;

  // ── Tagline ─────────────────────────────────────────────────────────────
  ctx.font        = "400 10.5px Arial, Helvetica, sans-serif";
  ctx.fillStyle   = textColor;
  ctx.globalAlpha = 0.40;
  const tagText = (data.tagline || '').toUpperCase();
  const tagW    = spacedTextWidth(ctx, tagText, SPC);
  drawSpaced(ctx, tagText, CX - tagW / 2, y, SPC);
  ctx.globalAlpha = 1;
  y += 24;

  // ── Short accent rule ───────────────────────────────────────────────────
  const rLen = 36;
  ctx.beginPath();
  ctx.moveTo(CX - rLen / 2, y); ctx.lineTo(CX + rLen / 2, y);
  ctx.strokeStyle = accent;
  ctx.lineWidth   = 1.2;
  ctx.globalAlpha = 0.65;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 18;

  // ── Product name ────────────────────────────────────────────────────────
  const rawName = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const nLen    = rawName.replace(/\s/g, '').length;
  const NS      = nLen <= 7 ? 66 : nLen <= 11 ? 54 : nLen <= 16 ? 44 : 36;
  ctx.font        = `italic bold ${NS}px 'Playfair Display', Georgia, 'Times New Roman', serif`;
  ctx.fillStyle   = textColor;
  ctx.textAlign   = 'center';
  ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`;
  ctx.shadowBlur  = 14;
  ctx.shadowOffsetY = 2;
  for (const line of wrapText(ctx, rawName, 640, 2)) {
    ctx.fillText(line, CX, y);
    y += Math.ceil(NS * 1.07);
  }
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetY = 0;
  y += 8;

  // ── Subtitle ────────────────────────────────────────────────────────────
  if (data.productSubtitle) {
    ctx.font        = "italic 400 14px Arial, Helvetica, sans-serif";
    ctx.fillStyle   = textColor;
    ctx.globalAlpha = 0.48;
    ctx.textAlign   = 'center';
    ctx.fillText(data.productSubtitle, CX, y);
    ctx.globalAlpha = 1;
    y += 32;
  }

  // ── Separator ───────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(CX - 100, y); ctx.lineTo(CX + 100, y);
  ctx.strokeStyle = textColor;
  ctx.lineWidth   = 1;
  ctx.globalAlpha = 0.14;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 18;

  // ── Characteristics — 3 columns ─────────────────────────────────────────
  const chars  = data.characteristics.slice(0, 3);
  const colW   = 240;
  const totalW = colW * chars.length;
  const startX = CX - totalW / 2;

  for (let i = 0; i < chars.length; i++) {
    const ch    = chars[i];
    const colCX = startX + colW * i + colW / 2;

    // Title
    ctx.font        = "700 10px Arial, Helvetica, sans-serif";
    ctx.fillStyle   = accent;
    ctx.globalAlpha = 1;
    const tText = (ch.title || '').toUpperCase();
    const tW    = spacedTextWidth(ctx, tText, 2.2);
    drawSpaced(ctx, tText, colCX - tW / 2, y, 2.2);

    // Value
    ctx.font        = "400 12.5px Arial, Helvetica, sans-serif";
    ctx.fillStyle   = textColor;
    ctx.globalAlpha = 0.82;
    ctx.textAlign   = 'center';
    ctx.fillText(
      wrapText(ctx, ch.value || ch.title || '', colW - 24, 1)[0] ?? '',
      colCX,
      y + 16,
    );
    ctx.globalAlpha = 1;
  }
  y += 44;

  // ── Bottom text ─────────────────────────────────────────────────────────
  if (data.bottomText) {
    ctx.font        = "italic 400 12px 'Playfair Display', Georgia, serif";
    ctx.fillStyle   = textColor;
    ctx.globalAlpha = 0.38;
    ctx.textAlign   = 'center';
    ctx.fillText(data.bottomText, CX, y);
    ctx.globalAlpha = 1;
  }
}

// ── Main draw function ────────────────────────────────────────────────────────

function drawCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  composition?: CompositionData | null,
  overlayStyle?: OverlayStyleData | null,
) {
  const W = CARD_W, H = CARD_H;

  // 1. Photo: full-bleed object-cover
  const sx = W / img.naturalWidth, sy = H / img.naturalHeight;
  const sc = Math.max(sx, sy);
  const dW = img.naturalWidth * sc, dH = img.naturalHeight * sc;
  ctx.drawImage(img, (W - dW) / 2, (H - dH) / 2, dW, dH);

  // 2. Resolve layout — prefer overlayStyle.layoutTemplate, fall back to composition.primaryTextZone
  const rawZone = overlayStyle?.layoutTemplate ?? composition?.primaryTextZone ?? 'left';
  const layout: 'side-left' | 'side-right' | 'bottom-band' =
    rawZone === 'bottom-band' || rawZone === 'bottom' ? 'bottom-band' :
    rawZone === 'side-right' || rawZone === 'right' ||
    rawZone === 'top-right'  || rawZone === 'bottom-right' ? 'side-right' :
    'side-left';
  const isBottom = layout === 'bottom-band';
  const isRight  = layout === 'side-right';

  // 3. Sample background for color detection
  const sampleSide: 'left' | 'right' | 'top' | 'bottom' =
    isRight ? 'right' : isBottom ? 'bottom' : 'left';
  const { r: bgR, g: bgG, b: bgB, luminance: lum } = sampleBackground(ctx, W, H, sampleSide);

  // 4. Colors
  const colorScheme = overlayStyle?.colorScheme ?? (lum > 140 ? 'light' : 'dark');
  const isLight     = colorScheme === 'light';
  const textColor   = overlayStyle?.textColorHex ?? (isLight ? '#18140D' : '#EDE9E1');
  const shadowAlpha = overlayStyle?.shadowIntensity ?? 0.28;
  const accent      = deriveAccent(bgR, bgG, bgB, lum);

  // Nudge background color for scrim
  const sr  = Math.min(255, Math.round(bgR * (isLight ? 1.05 : 0.78)));
  const sg  = Math.min(255, Math.round(bgG * (isLight ? 1.03 : 0.74)));
  const sb_ = Math.min(255, Math.round(bgB * (isLight ? 1.02 : 0.70)));

  // 5. Very subtle scrim — max 0.13, nearly invisible, purely for readability
  const scrimMax = Math.min(overlayStyle?.scrimOpacity ?? 0.09, 0.13);

  if (isBottom) {
    const bScrim = ctx.createLinearGradient(0, H - 340, 0, H);
    bScrim.addColorStop(0,    `rgba(${sr},${sg},${sb_},0)`);
    bScrim.addColorStop(0.45, `rgba(${sr},${sg},${sb_},${+(scrimMax * 0.50).toFixed(3)})`);
    bScrim.addColorStop(1,    `rgba(${sr},${sg},${sb_},${scrimMax})`);
    ctx.fillStyle = bScrim;
    ctx.fillRect(0, H - 340, W, 340);
  } else {
    const gx0 = isRight ? W : 0;
    const gx1 = isRight ? W * 0.55 : W * 0.45;
    const sideScrim = ctx.createLinearGradient(gx0, 0, gx1, 0);
    sideScrim.addColorStop(0,    `rgba(${sr},${sg},${sb_},${scrimMax})`);
    sideScrim.addColorStop(0.60, `rgba(${sr},${sg},${sb_},${+(scrimMax * 0.20).toFixed(3)})`);
    sideScrim.addColorStop(1,    `rgba(${sr},${sg},${sb_},0)`);
    ctx.fillStyle = sideScrim;
    ctx.fillRect(0, 0, W, H);
  }

  // 6. Draw editorial text
  if (isBottom) {
    drawBottomLayout(ctx, W, H, data, textColor, accent, shadowAlpha);
  } else {
    drawSideLayout(ctx, W, H, data, isRight, textColor, accent, shadowAlpha);
  }
}

// ── Proxy helper ──────────────────────────────────────────────────────────────

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(`/api/photo/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`Не удалось загрузить изображение (${res.status})`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

  // ── FLUX base generation (manual only — called from handleRender or ↻ button) ──
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');

  /** Called only from the ↻ re-generate button in the status bar */
  const generateBase = useCallback(async () => {
    if (!imageUrl || !fluxPrompt) {
      setPremiumError('Нет fluxPrompt — сначала проанализируйте фото');
      return;
    }
    setPremiumLoading(true);
    setPremiumError('');
    setBaseImage(null);
    try {
      const imgSrc = await toDataUrl(imageUrl);
      const res = await fetch('/api/photo/generate-infographic-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imgSrc, fluxPrompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка FLUX');
      setBaseImage(json.imageUrl);
    } catch (e) {
      setPremiumError(String(e));
    } finally {
      setPremiumLoading(false);
    }
  }, [imageUrl, fluxPrompt]);

  // ── AI text generation (fallback) ───────────────────────────────────────────

  const generateAIText = async () => {
    setLoadingText(true);
    try {
      const res = await fetch('/api/photo/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });
      const json = await res.json();
      if (json.productName) {
        setData({
          productName: json.productName ?? DEFAULT_DATA.productName,
          productSubtitle: json.productSubtitle ?? DEFAULT_DATA.productSubtitle,
          tagline: json.tagline ?? DEFAULT_DATA.tagline,
          characteristics: (json.characteristics ?? DEFAULT_DATA.characteristics).slice(0, 3),
          bottomText: json.bottomText ?? DEFAULT_DATA.bottomText,
        });
      }
    } catch { /* ignore */ } finally {
      setLoadingText(false);
    }
  };

  // ── Canvas render ───────────────────────────────────────────────────────────

  const renderCard = useCallback(async (overrideData?: InfographicData, activeUrl?: string): Promise<string> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('no canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    // Ensure Playfair Display (Google Fonts) is loaded before drawing
    if (typeof document !== 'undefined') {
      await Promise.all([
        document.fonts.load("italic bold 90px 'Playfair Display'"),
        document.fonts.load("italic 400 14px 'Playfair Display'"),
      ]).catch(() => {});
    }
    const imgSrc = await toDataUrl(activeUrl ?? baseImage ?? imageUrl);
    const d = overrideData ?? data;
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        drawCard(ctx, img, d, compositionData, overlayStyleData);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = imgSrc;
    });
  }, [baseImage, imageUrl, data, compositionData, overlayStyleData]);

  const handleRender = useCallback(async (overrideData?: InfographicData) => {
    if (!imageUrl) return;
    setRendering(true);
    setRenderError('');

    // Если есть fluxPrompt, но база ещё не готова — генерируем её прямо сейчас
    let resolvedBase = baseImage;
    if (fluxPrompt && !resolvedBase) {
      setPremiumLoading(true);
      setPremiumError('');
      try {
        const imgSrc = await toDataUrl(imageUrl);
        const res = await fetch('/api/photo/generate-infographic-base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: imgSrc, fluxPrompt }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Ошибка FLUX');
        resolvedBase = json.imageUrl as string;
        setBaseImage(resolvedBase);
      } catch (e) {
        setPremiumError(String(e));
        setRendering(false);
        setPremiumLoading(false);
        return;
      } finally {
        setPremiumLoading(false);
      }
    }

    try {
      const url = await renderCard(overrideData, resolvedBase ?? undefined);
      onExport?.(url);
    } catch (e) {
      setRenderError(String(e));
    } finally {
      setRendering(false);
    }
  }, [imageUrl, baseImage, fluxPrompt, renderCard, onExport]);

  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);

  const updateChar = (i: number, field: 'title' | 'value', val: string) =>
    setData(prev => {
      const chars = [...prev.characteristics];
      chars[i] = { ...chars[i], [field]: val };
      return { ...prev, characteristics: chars };
    });

  const applyVariant = useCallback(async (v: TextVariant, idx: number) => {
    setSelectedVariant(idx);
    const newData: InfographicData = {
      productName: v.productName,
      productSubtitle: v.subtitle,
      tagline: v.tagline,
      characteristics: v.characteristics.slice(0, 3),
      bottomText: v.bottomText,
    };
    setData(newData);
    await handleRender(newData);
  }, [handleRender]);

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* ── FLUX status bar ───────────────────────────────────────────────── */}
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
              <button
                onClick={() => generateBase()}
                className="text-zinc-500 hover:text-emerald-300 transition-colors ml-1"
                title="Перегенерировать"
              >
                ↻
              </button>
            </div>
          )}
          {!premiumLoading && !baseImage && !fluxPrompt && (
            <span className="text-xs text-amber-500/80">
              Сначала нажмите «Анализировать» — нужен AI-промпт для FLUX
            </span>
          )}
        </div>
      )}

      {premiumError && (
        <div className="rounded-xl border border-red-800/40 bg-red-900/10 px-3 py-2 text-xs text-red-400">
          ⚠ {premiumError}
        </div>
      )}

      {/* Qwen overlay hints */}
      {overlayStyleData ? (
        <div className="rounded-xl border border-violet-800/30 bg-violet-900/10 px-3 py-2 text-xs text-violet-300 space-y-0.5">
          <p className="font-medium text-violet-400">✓ Qwen overlay данные получены:</p>
          <p>
            <span className="text-violet-500">layout:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.layoutTemplate ?? '—'}</span>
            {' · '}
            <span className="text-violet-500">colorScheme:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.colorScheme ?? '—'}</span>
            {' · '}
            <span className="text-violet-500">scrimOpacity:</span>{' '}
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
          ⚠ overlayStyle от Qwen не получен — используются дефолты (editorial auto-detect)
        </div>
      )}

      {/* ── Text variants + manual edit ───────────────────────────────── */}
      <div className="flex flex-col gap-3">

        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-violet-400" />
            Варианты текста
          </span>
          <button
            onClick={generateAIText}
            disabled={loadingText}
            className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 flex items-center gap-1 transition-colors"
          >
            {loadingText ? <Loader2 className="h-3 w-3 animate-spin" /> : '↻'} Обновить
          </button>
        </div>

        {/* Variant cards — 2 columns on wide screens */}
        {textVariants && textVariants.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {textVariants.map((v, i) => {
              const st = APPROACH_STYLE[v.approach] ?? APPROACH_STYLE['Минимализм'];
              const isSelected = selectedVariant === i;
              return (
                <button
                  key={i}
                  onClick={() => applyVariant(v, i)}
                  disabled={rendering || premiumLoading}
                  className={`w-full text-left rounded-xl border p-3 transition-all disabled:opacity-60 ${
                    isSelected
                      ? `${st.ring} ring-1 ring-inset`
                      : 'border-zinc-700/60 bg-zinc-800/50 hover:border-zinc-600 hover:brightness-110'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${st.badge}`}>
                      {v.approach}
                    </span>
                    {isSelected && rendering && (
                      <Loader2 className="h-3 w-3 animate-spin text-violet-400 shrink-0" />
                    )}
                  </div>

                  <p className="text-white font-bold text-sm leading-tight mb-1.5 truncate">
                    {v.productName}
                  </p>

                  {v.subtitle && (
                    <p className="text-zinc-400 text-[11px] italic mb-2 leading-tight">{v.subtitle}</p>
                  )}

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

                  {v.bottomText && (
                    <p className="text-[10px] text-zinc-500 italic leading-tight border-t border-zinc-700/50 pt-1.5 mt-1">
                      {v.bottomText}
                    </p>
                  )}

                  {isSelected && (
                    <p className="text-[10px] font-medium mt-1.5 flex items-center gap-1">
                      {rendering
                        ? <><Loader2 className="h-2.5 w-2.5 animate-spin text-amber-400" /><span className="text-amber-400">Создаю...</span></>
                        : <span className="text-violet-400">✓ Применено</span>
                      }
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
                <button
                  onClick={generateAIText}
                  disabled={loadingText}
                  className="text-xs text-violet-400 hover:text-violet-300 border border-violet-700/40 rounded-lg px-3 py-1.5 transition-colors"
                >
                  ✨ Сгенерировать текст
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Manual editor (collapsible) ──────────────────────────────── */}
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowManual(p => !p)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-all"
          >
            <span className="font-medium uppercase tracking-wide">Редактировать вручную</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showManual ? 'rotate-180' : ''}`} />
          </button>

          {showManual && (
            <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-zinc-900/40">
              <input
                value={data.tagline}
                onChange={e => setData(p => ({ ...p, tagline: e.target.value }))}
                placeholder="тег (новинка / хит продаж)"
                className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
              />
              <input
                value={data.productName}
                onChange={e => setData(p => ({ ...p, productName: e.target.value }))}
                placeholder="НАЗВАНИЕ ТОВАРА"
                className="w-full bg-zinc-700 text-white text-sm font-bold px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500"
              />
              <input
                value={data.productSubtitle}
                onChange={e => setData(p => ({ ...p, productSubtitle: e.target.value }))}
                placeholder="лёгкий и дышащий"
                className="w-full bg-zinc-700 text-white text-xs italic px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
              />
              <input
                value={data.bottomText}
                onChange={e => setData(p => ({ ...p, bottomText: e.target.value }))}
                placeholder="стиль и качество"
                className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
              />
              <div className="md:col-span-2">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">Характеристики</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {data.characteristics.map((ch, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-600 w-3 shrink-0">{['🌿','✦','◉'][i]}</span>
                        <input
                          value={ch.title}
                          onChange={e => updateChar(i, 'title', e.target.value)}
                          placeholder="Название"
                          className="flex-1 bg-zinc-700 text-white text-xs font-semibold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500"
                        />
                      </div>
                      <input
                        value={ch.value}
                        onChange={e => updateChar(i, 'value', e.target.value)}
                        placeholder="уточнение"
                        className="w-full bg-zinc-700/60 text-zinc-300 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-600 ml-4"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Generate button ───────────────────────────────────────────────── */}
      <button
        onClick={() => handleRender()}
        disabled={!imageUrl || rendering || premiumLoading}
        className="w-full px-4 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-amber-500 to-yellow-500 hover:opacity-90"
      >
        {rendering
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Создаю...</>
          : <><Sparkles className="h-4 w-4" /> Сгенерировать инфографику</>
        }
      </button>

      {renderError && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/15 px-3 py-2 text-xs text-red-400">
          {renderError}
        </div>
      )}
    </div>
  );
}
