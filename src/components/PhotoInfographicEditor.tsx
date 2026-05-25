'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Loader2, Zap, Sparkles, ChevronDown } from 'lucide-react';

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

type TemplateStyle = 'light' | 'dark' | 'beige' | 'black';
type InfographicMode = 'quick' | 'premium';

interface Props {
  imageUrl: string;
  analysis?: { good?: string[]; improve?: string[] } | null;
  generatePrompt?: string;
  fluxPrompt?: string;
  initialMode?: InfographicMode;
  textVariants?: TextVariant[];
  onExport?: (dataUrl: string) => void;
}

// Approach badge styles
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

// Accent palette — template controls accent colour only.
// Overlay colours are auto-derived from the photo (see sampleRegion).
const ACCENTS: Record<TemplateStyle, { accent: string; stroke: string }> = {
  light: { accent: '#7A5830', stroke: '#A07840' },
  dark:  { accent: '#C9A96E', stroke: '#C9A96E' },
  beige: { accent: '#8B5E30', stroke: '#A07840' },
  black: { accent: '#D4B86A', stroke: '#D4B86A' },
};

// ── Canvas helpers ────────────────────────────────────────────────────────────

/**
 * Sample average RGB + luminance from the left background zone of the canvas.
 * We sample three narrow vertical strips in the leftmost 32% to avoid any
 * model bleed-over from the right side, and skip pixels that look saturated
 * (likely clothing or skin) to focus on pure background colour.
 *
 * Called after the photo is drawn — canvas must contain actual pixel data.
 */
function sampleBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
): { r: number; g: number; b: number; luminance: number } {
  try {
    // Sample leftmost 30% — should be pure background in a proper infographic base
    const sampleW = Math.max(1, Math.floor(W * 0.30));
    const data = ctx.getImageData(0, 0, sampleW, H).data;

    let r = 0, g = 0, b = 0, count = 0;
    const step = 4 * 20; // every 20th pixel — fast, ~2 700 samples for 900×1200
    for (let i = 0; i < data.length; i += step) {
      const pr = data[i], pg = data[i + 1], pb = data[i + 2];
      // Skip highly saturated pixels (likely garment or skin bleed)
      const mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb);
      const saturation = mx > 0 ? (mx - mn) / mx : 0;
      if (saturation > 0.35) continue; // skip vivid coloured pixels
      r += pr; g += pg; b += pb; count++;
    }

    if (count < 10) {
      // Fallback: sample without saturation filter (very saturated background)
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
    // Canvas tainted or other error → fall back to neutral light defaults
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function iconLeaf(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.bezierCurveTo(cx + r * 0.88, cy - r * 0.45, cx + r * 0.88, cy + r * 0.38, cx, cy + r * 0.22);
  ctx.bezierCurveTo(cx - r * 0.88, cy + r * 0.38, cx - r * 0.88, cy - r * 0.45, cx, cy - r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.72); ctx.lineTo(cx, cy + r * 0.18);
  ctx.stroke();
  ctx.restore();
}

function iconSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.36;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function iconButton(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  [0, 1, 2, 3].forEach(i => {
    const a = i * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

const ICON_FNS = [iconLeaf, iconSparkle, iconButton] as const;

// ── Main draw function ────────────────────────────────────────────────────────

function drawCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  style: TemplateStyle,
  mode: InfographicMode = 'quick',
) {
  const W = CARD_W, H = CARD_H;
  const PAD = 58, TEXT_W = 310;

  // ── 1. Photo: full-bleed object-cover ─────────────────────────────────────
  const sx = W / img.naturalWidth, sy = H / img.naturalHeight;
  const sc = Math.max(sx, sy);
  const dW = img.naturalWidth * sc, dH = img.naturalHeight * sc;
  ctx.drawImage(img, (W - dW) / 2, (H - dH) / 2, dW, dH);

  // ── 2. Sample left area pixels to detect background colour ────────────────
  // Reading AFTER photo draw, so we get actual scene colours.
  // sampleBackground reads the leftmost 30% and skips saturated pixels
  // (clothing/skin bleed) to isolate pure background colour.
  const { r: bgR, g: bgG, b: bgB, luminance: lum } =
    sampleBackground(ctx, W, H);

  const isLight = lum > 130; // bright background → use dark text

  // ── 3. Adaptive scrim — colour derived from detected background ────────────
  // Slightly nudge the sampled colour: brighten for light BG, deepen for dark.
  // This makes the text panel feel like it BELONGS to the photo, not pasted on.
  const sr = Math.min(255, Math.round(bgR * (isLight ? 1.06 : 0.80)));
  const sg = Math.min(255, Math.round(bgG * (isLight ? 1.04 : 0.76)));
  const sb = Math.min(255, Math.round(bgB * (isLight ? 1.03 : 0.74)));

  // Premium mode (FLUX-repositioned model in right 60%): stronger, wider panel.
  // Quick mode (centred model): lighter, narrower to avoid darkening the model.
  const saMax    = mode === 'premium' ? (isLight ? 0.92 : 0.88) : (isLight ? 0.80 : 0.76);
  const solidEnd = mode === 'premium' ? 0.40 : 0.32;   // solid panel ends here
  const fade1    = mode === 'premium' ? 0.57 : 0.46;   // 25% opacity here
  const fade2    = mode === 'premium' ? 0.72 : 0.56;   // ~2% opacity here
  const fadeEnd  = mode === 'premium' ? 0.85 : 0.64;   // fully transparent

  const scrim = ctx.createLinearGradient(0, 0, W, 0);
  scrim.addColorStop(0,        `rgba(${sr},${sg},${sb},${saMax})`);
  scrim.addColorStop(solidEnd, `rgba(${sr},${sg},${sb},${saMax})`);
  scrim.addColorStop(fade1,    `rgba(${sr},${sg},${sb},${+(saMax * 0.25).toFixed(3)})`);
  scrim.addColorStop(fade2,    `rgba(${sr},${sg},${sb},${+(saMax * 0.04).toFixed(3)})`);
  scrim.addColorStop(fadeEnd,  `rgba(${sr},${sg},${sb},0)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  // Subtle bottom fade for bottom text (left zone only)
  const bScrim = ctx.createLinearGradient(0, H - 100, 0, H);
  bScrim.addColorStop(0, `rgba(${sr},${sg},${sb},0)`);
  bScrim.addColorStop(1, `rgba(${sr},${sg},${sb},${+(saMax * 0.40).toFixed(3)})`);
  ctx.fillStyle = bScrim;
  ctx.fillRect(0, H - 100, W * 0.52, 100);

  // ── 4. Adaptive text/pill colours ─────────────────────────────────────────
  const textColor  = isLight ? '#15110A'              : '#F3F0E9';
  const subColor   = isLight ? 'rgba(21,17,10,0.52)'  : 'rgba(243,240,233,0.52)';
  const pillBg     = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(14,12,22,0.84)';
  const pillSh     = isLight ? 'rgba(0,0,0,0.09)'     : 'rgba(0,0,0,0.38)';
  const pillIconBg = isLight ? 'rgba(120,84,40,0.10)' : 'rgba(200,165,100,0.12)';

  // Accent from template (unchanged by auto-detection)
  const { accent, stroke } = ACCENTS[style];

  // ── 5. Typography ─────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = 88;

  // Tagline — small, spaced letters
  ctx.font = '400 11.5px Arial, Helvetica, sans-serif';
  ctx.fillStyle = subColor;
  drawSpaced(ctx, data.tagline.toUpperCase(), PAD, y, 2.6);
  y += 36;

  // Product name — italic serif, weight 600, auto-sizes
  const rawName = data.productName.toUpperCase();
  const nLen = rawName.replace(/\s/g, '').length;
  const NS = nLen <= 6 ? 64 : nLen <= 10 ? 52 : nLen <= 15 ? 42 : 34;
  ctx.font = `italic 600 ${NS}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = textColor;
  ctx.shadowColor = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.70)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  const nameLines = wrapText(ctx, rawName, TEXT_W, 3);
  for (const line of nameLines) {
    ctx.fillText(line, PAD, y);
    y += Math.ceil(NS * 1.12);
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  y += 14;

  // Subtitle — thin italic
  if (data.productSubtitle) {
    ctx.font = 'italic 300 16px Arial, Helvetica, sans-serif';
    ctx.fillStyle = subColor;
    ctx.fillText(data.productSubtitle, PAD, y);
    y += 44;
  }

  // Short gold rule
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(PAD + 50, y);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.52;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 28;

  // ── 6. Feature pills ──────────────────────────────────────────────────────
  const PILL_H = 66, PILL_W = 318, PILL_R = 33;
  const ICON_CX = 42, ICON_DOT_R = 14, ICON_R = 15;

  for (let i = 0; i < data.characteristics.slice(0, 3).length; i++) {
    const ch = data.characteristics[i];
    const px = PAD, py = y;

    // Pill fill with shadow (creates depth/volume)
    ctx.save();
    ctx.shadowColor = pillSh;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
    ctx.fillStyle = pillBg;
    ctx.fill();
    ctx.restore();

    // Pill border
    roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.18;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Icon circle
    const iconCX = px + ICON_CX, iconCY = py + PILL_H / 2;
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, ICON_DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = pillIconBg;
    ctx.fill();
    ICON_FNS[i % 3](ctx, iconCX, iconCY, ICON_R * 0.64, accent);

    // Text
    const textX = iconCX + ICON_DOT_R + 14;
    const maxTW = px + PILL_W - textX - 16;
    ctx.textBaseline = 'middle';
    if (ch.value) {
      ctx.font = '600 14px Arial, Helvetica, sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(ch.title, textX, iconCY - 10);
      ctx.font = '400 12px Arial, Helvetica, sans-serif';
      ctx.fillStyle = subColor;
      ctx.fillText(wrapText(ctx, ch.value, maxTW, 1)[0] ?? ch.value, textX, iconCY + 10);
    } else {
      ctx.font = '500 14px Arial, Helvetica, sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(ch.title, textX, iconCY);
    }
    ctx.textBaseline = 'top';
    y += PILL_H + 14;
  }

  // ── 7. Bottom italic text ─────────────────────────────────────────────────
  if (data.bottomText) {
    const btY = H - 76, btSz = 15;
    ctx.font = `italic 300 ${btSz}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = subColor;
    ctx.textBaseline = 'top';
    let bty = btY;
    for (const bl of wrapText(ctx, data.bottomText, TEXT_W - 20, 2)) {
      ctx.fillText(bl, PAD, bty);
      bty += btSz + 4;
    }
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
  initialMode = 'quick',
  textVariants,
  onExport,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<InfographicData>(DEFAULT_DATA);
  const [template, setTemplate] = useState<TemplateStyle>('light');
  const [loadingText, setLoadingText] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState('');

  // ── Premium mode ────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<InfographicMode>(initialMode);
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');
  const autoStartedRef = useRef(false);

  const generatePremiumBase = useCallback(async () => {
    if (!imageUrl || !fluxPrompt) {
      setPremiumError('Нет fluxPrompt — сначала проанализируйте фото');
      return;
    }
    setPremiumLoading(true);
    setPremiumError('');
    setBaseImage(null);
    setResultUrl(null);
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
      setMode('quick');
    } finally {
      setPremiumLoading(false);
    }
  }, [imageUrl, fluxPrompt]);

  useEffect(() => {
    if (mode === 'premium' && fluxPrompt && !autoStartedRef.current) {
      autoStartedRef.current = true;
      generatePremiumBase();
    }
  }, [mode, fluxPrompt, generatePremiumBase]);

  // ── AI text generation ──────────────────────────────────────────────────────

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

  const activeImageUrl = (mode === 'premium' && baseImage) ? baseImage : imageUrl;

  // renderCard accepts an optional data override so applyVariant can bypass
  // the async setState delay and render with fresh data immediately.
  const renderCard = useCallback(async (overrideData?: InfographicData): Promise<string> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('no canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    const imgSrc = await toDataUrl(activeImageUrl);
    const d = overrideData ?? data;
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        drawCard(ctx, img, d, template, mode);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => reject(new Error('image load failed'));
      img.src = imgSrc;
    });
  }, [activeImageUrl, data, template, mode]);

  const handleRender = useCallback(async (overrideData?: InfographicData) => {
    if (!imageUrl) return;
    setRendering(true);
    setResultUrl(null);
    setRenderError('');
    try {
      const url = await renderCard(overrideData);
      setResultUrl(url);
      onExport?.(url);
    } catch (e) {
      setRenderError(String(e));
    } finally {
      setRendering(false);
    }
  }, [imageUrl, renderCard, onExport]);

  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [showManual, setShowManual] = useState(false);

  const updateChar = (i: number, field: 'title' | 'value', val: string) =>
    setData(prev => {
      const chars = [...prev.characteristics];
      chars[i] = { ...chars[i], [field]: val };
      return { ...prev, characteristics: chars };
    });

  // One-click: apply variant text AND immediately render the card.
  // We pass newData directly to handleRender to bypass async setState delay.
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

  const TMPL: [TemplateStyle, string, string][] = [
    ['light', 'Золото',  'bg-amber-50 text-amber-900 border border-amber-200'],
    ['dark',  'Бронза',  'bg-zinc-900 text-amber-400 border border-zinc-700'],
    ['beige', 'Карамель','bg-amber-100 text-amber-950 border border-amber-300'],
    ['black', 'Роскошь', 'bg-black text-yellow-300 border border-yellow-700'],
  ];

  return (
    <div className="space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Mode switcher ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-zinc-900/70 rounded-xl p-1">
          <button
            onClick={() => { setMode('quick'); setResultUrl(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'quick' ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Zap className="h-3 w-3" />
            Быстрый
          </button>
          <button
            onClick={() => {
              setMode('premium');
              setResultUrl(null);
              if (!baseImage && !premiumLoading) {
                autoStartedRef.current = true;
                generatePremiumBase();
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'premium'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            Премиум (FLUX)
          </button>
        </div>

        {mode === 'premium' && premiumLoading && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-700/30 px-3 py-1.5 rounded-lg">
            <Loader2 className="h-3 w-3 animate-spin" />
            FLUX генерирует базу... (~15 сек)
          </div>
        )}
        {mode === 'premium' && !premiumLoading && baseImage && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 px-3 py-1.5 rounded-lg">
            ✓ FLUX база готова
            <button
              onClick={() => { autoStartedRef.current = true; generatePremiumBase(); }}
              className="text-zinc-500 hover:text-emerald-300 transition-colors"
              title="Перегенерировать"
            >
              ↻
            </button>
          </div>
        )}
        {mode === 'premium' && !premiumLoading && !baseImage && !premiumError && !fluxPrompt && (
          <span className="text-xs text-amber-500/80">
            Сначала нажмите «Анализировать» — нужен AI-промпт для FLUX
          </span>
        )}
      </div>

      {premiumError && (
        <div className="rounded-xl border border-red-800/40 bg-red-900/10 px-3 py-2 text-xs text-red-400">
          ⚠ {premiumError}{mode === 'quick' ? ' — переключено на быстрый режим' : ''}
        </div>
      )}

      <div className="flex gap-4">

        {/* ── Result preview ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {mode === 'premium' && baseImage && !resultUrl && (
            <div className="mb-2 rounded-xl border border-amber-700/30 bg-amber-900/10 px-3 py-2 text-xs text-amber-400 flex items-center gap-2">
              <Sparkles className="h-3 w-3 shrink-0" />
              FLUX база готова — нажмите «Создать» для рендера с текстом
            </div>
          )}

          <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden max-h-[520px] min-h-[260px] relative flex items-center justify-center">
            {rendering ? (
              <div className="text-center p-6">
                <Loader2 className="h-10 w-10 animate-spin text-rose-400 mx-auto mb-3" />
                <p className="text-sm text-slate-300 font-medium">Создаю карточку...</p>
              </div>
            ) : resultUrl ? (
              <>
                <img src={resultUrl} alt="Карточка" className="w-full h-full object-contain" />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = resultUrl!;
                      a.download = 'wb-card.jpg';
                      a.click();
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
                  >
                    ⬇ Скачать
                  </button>
                  <button
                    onClick={() => setResultUrl(null)}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm"
                  >
                    ↩ Изменить
                  </button>
                </div>
              </>
            ) : premiumLoading ? (
              <div className="text-center p-8">
                <div className="relative mb-4">
                  <Loader2 className="h-12 w-12 animate-spin text-amber-400 mx-auto" />
                  <Sparkles className="h-5 w-5 text-amber-300 absolute -top-1 right-[calc(50%-28px)]" />
                </div>
                <p className="text-sm text-amber-300 font-medium">FLUX создаёт премиум базу...</p>
                <p className="text-xs text-slate-500 mt-1">обычно 10–20 секунд</p>
              </div>
            ) : (
              <div className="text-center p-8 text-zinc-600">
                <div className="text-5xl mb-3">{mode === 'premium' ? '✨' : '🖼'}</div>
                <p className="text-sm font-medium text-zinc-500">
                  {mode === 'premium'
                    ? 'Заполните поля и нажмите «Создать» (FLUX + Canvas)'
                    : 'Заполните поля и нажмите «Создать»'}
                </p>
              </div>
            )}
          </div>

          {renderError && (
            <div className="mt-2 rounded-xl border border-red-800/50 bg-red-900/15 px-3 py-2 text-xs text-red-400">
              {renderError}
            </div>
          )}

          <button
            onClick={() => handleRender()}
            disabled={!imageUrl || rendering || premiumLoading}
            className={`mt-3 w-full px-4 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-all ${
              mode === 'premium'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:opacity-90'
                : 'bg-gradient-to-r from-rose-500 to-pink-600 hover:opacity-90'
            }`}
          >
            {rendering
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Создаю...</>
              : mode === 'premium'
                ? <><Sparkles className="h-4 w-4" /> Создать премиум карточку</>
                : '✨ Создать карточку'}
          </button>

          {/* Accent colour selector */}
          <div className="mt-2 flex gap-1 flex-wrap">
            <span className="text-[10px] text-zinc-600 self-center mr-1">Акцент:</span>
            {TMPL.map(([t, label, cls]) => (
              <button
                key={t}
                onClick={() => { setTemplate(t); setResultUrl(null); }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${cls} ${template === t ? 'ring-2 ring-violet-500' : 'opacity-60 hover:opacity-90'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-700 mt-1">
            Цвет текста/пилюль подбирается автоматически по фону фото
          </p>
        </div>

        {/* ── Right panel: AI suggestions + manual edit ─────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-3 max-h-[640px] overflow-y-auto pr-0.5">

          {/* Header */}
          <div className="flex items-center justify-between sticky top-0 bg-zinc-950/90 backdrop-blur-sm z-10 pb-1">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-violet-400" />
              Предложения AI
            </span>
            <button
              onClick={generateAIText}
              disabled={loadingText}
              className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 flex items-center gap-1 transition-colors"
            >
              {loadingText ? <Loader2 className="h-3 w-3 animate-spin" /> : '↻'} Обновить
            </button>
          </div>

          {/* Variant cards */}
          {textVariants && textVariants.length > 0 ? (
            <div className="flex flex-col gap-2">
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
                    {/* Approach badge + rendering indicator */}
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${st.badge}`}>
                        {v.approach}
                      </span>
                      {isSelected && rendering && (
                        <Loader2 className="h-3 w-3 animate-spin text-violet-400 shrink-0" />
                      )}
                    </div>

                    {/* Product name */}
                    <p className="text-white font-bold text-sm leading-tight mb-1.5 truncate">
                      {v.productName}
                    </p>

                    {/* Subtitle */}
                    {v.subtitle && (
                      <p className="text-zinc-400 text-[11px] italic mb-2 leading-tight">{v.subtitle}</p>
                    )}

                    {/* Bullets */}
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

                    {/* Bottom text */}
                    {v.bottomText && (
                      <p className="text-[10px] text-zinc-500 italic leading-tight border-t border-zinc-700/50 pt-1.5 mt-1">
                        {v.bottomText}
                      </p>
                    )}

                    {isSelected && (
                      <p className="text-[10px] font-medium mt-1.5 flex items-center gap-1">
                        {rendering
                          ? <><Loader2 className="h-2.5 w-2.5 animate-spin text-amber-400" /><span className="text-amber-400">Создаю карточку...</span></>
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

          {/* ── Manual editor (collapsible) ─────────────────────────────── */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowManual(p => !p)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 transition-all"
            >
              <span className="font-medium uppercase tracking-wide">Редактировать вручную</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showManual ? 'rotate-180' : ''}`} />
            </button>

            {showManual && (
              <div className="px-3 pb-3 flex flex-col gap-2.5 bg-zinc-900/40">
                {/* Text fields */}
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

                {/* Characteristics */}
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide mt-1">Характеристики</p>
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

                {/* Bottom text */}
                <input
                  value={data.bottomText}
                  onChange={e => setData(p => ({ ...p, bottomText: e.target.value }))}
                  placeholder="стиль и качество"
                  className="w-full bg-zinc-700 text-white text-xs px-2 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-500"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
