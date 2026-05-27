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
  composition?: CompositionData | null,
  overlayStyle?: OverlayStyleData | null,
) {
  const W = CARD_W, H = CARD_H;
  const PAD = 58, TEXT_W = 310;

  // ── 1. Photo: full-bleed object-cover ─────────────────────────────────────
  const sx = W / img.naturalWidth, sy = H / img.naturalHeight;
  const sc = Math.max(sx, sy);
  const dW = img.naturalWidth * sc, dH = img.naturalHeight * sc;
  ctx.drawImage(img, (W - dW) / 2, (H - dH) / 2, dW, dH);

  // ── 2. Determine text zone from composition data ───────────────────────────
  const textZone = composition?.primaryTextZone ?? 'left';
  const isRight = ['right', 'top-right', 'bottom-right'].includes(textZone);

  // ── 3. Sample background at the text zone side ────────────────────────────
  const sampleSide: 'left' | 'right' | 'top' | 'bottom' =
    isRight ? 'right' :
    textZone === 'top' ? 'top' :
    textZone === 'bottom' ? 'bottom' : 'left';

  const { r: bgR, g: bgG, b: bgB, luminance: lum } = sampleBackground(ctx, W, H, sampleSide);

  // ── 4. Color scheme — from overlayStyle or auto-detected ──────────────────
  const colorScheme = overlayStyle?.colorScheme ?? (lum > 130 ? 'light' : 'dark');
  const isLight = colorScheme === 'light';

  // Slightly nudge sampled colour: brighten for light BG, deepen for dark
  const sr = Math.min(255, Math.round(bgR * (isLight ? 1.06 : 0.80)));
  const sg = Math.min(255, Math.round(bgG * (isLight ? 1.04 : 0.76)));
  const sb = Math.min(255, Math.round(bgB * (isLight ? 1.03 : 0.74)));

  // ── 5. pillStyle определяется ДО scrim — чтобы скрим зависел от стиля ──────
  const pillStyle  = overlayStyle?.pillStyle ?? 'solid';
  const blurR      = overlayStyle?.blurRadius ?? 10;

  // Для frosted/outline/minimal скрим минимальный — пилюли сами дают читаемость.
  // Для solid/gradient — стандартный скрим из JSON или дефолт.
  const scrimBase  = overlayStyle?.scrimOpacity ?? (isLight ? 0.42 : 0.55);
  const SCRIM_BY_STYLE: Partial<Record<string, number>> = {
    frosted: 0.16, outline: 0.10, minimal: 0.13, none: 0.08,
  };
  const saMax    = Math.max(SCRIM_BY_STYLE[pillStyle] ?? scrimBase, 0.10);
  const solidEnd = pillStyle === 'frosted' || pillStyle === 'outline' ? 0.14 : 0.28;
  const fade1    = solidEnd + 0.18;
  const fade2    = solidEnd + 0.36;
  const fadeEnd  = solidEnd + 0.52;

  // Gradient direction
  const scrimDir = overlayStyle?.scrimDirection ?? (isRight ? 'right' : textZone);
  let gx0 = 0, gy0 = 0, gx1 = W, gy1 = 0; // default: left→right
  switch (scrimDir) {
    case 'right':     gx0 = W; gy0 = 0;  gx1 = 0; gy1 = 0;  break;
    case 'top':       gx0 = 0; gy0 = 0;  gx1 = 0; gy1 = H;  break;
    case 'bottom':    gx0 = 0; gy0 = H;  gx1 = 0; gy1 = 0;  break;
    case 'top-left':  gx0 = 0; gy0 = 0;  gx1 = W; gy1 = H;  break;
    case 'top-right': gx0 = W; gy0 = 0;  gx1 = 0; gy1 = H;  break;
  }

  const scrim = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
  scrim.addColorStop(0,        `rgba(${sr},${sg},${sb},${saMax})`);
  scrim.addColorStop(solidEnd, `rgba(${sr},${sg},${sb},${saMax})`);
  scrim.addColorStop(fade1,    `rgba(${sr},${sg},${sb},${+(saMax * 0.25).toFixed(3)})`);
  scrim.addColorStop(fade2,    `rgba(${sr},${sg},${sb},${+(saMax * 0.04).toFixed(3)})`);
  scrim.addColorStop(fadeEnd,  `rgba(${sr},${sg},${sb},0)`);
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);

  // Subtle bottom fade for bottom text (text-zone side only)
  const bScrim = ctx.createLinearGradient(0, H - 100, 0, H);
  bScrim.addColorStop(0, `rgba(${sr},${sg},${sb},0)`);
  bScrim.addColorStop(1, `rgba(${sr},${sg},${sb},${+(saMax * 0.40).toFixed(3)})`);
  ctx.fillStyle = bScrim;
  ctx.fillRect(isRight ? W * 0.48 : 0, H - 100, W * 0.52, 100);

  // ── 6. Adaptive text/pill colours ─────────────────────────────────────────
  const textColor   = overlayStyle?.textColorHex ?? (isLight ? '#15110A' : '#F3F0E9');
  const subColor    = isLight ? 'rgba(21,17,10,0.52)'  : 'rgba(243,240,233,0.52)';
  const pillOpacity = overlayStyle?.pillOpacity ?? 0.62;
  const pillBg      = overlayStyle?.pillBgRgba ??
    (isLight ? `rgba(255,255,255,${pillOpacity})` : `rgba(14,12,22,${pillOpacity})`);
  const pillIconBg  = isLight ? 'rgba(120,84,40,0.10)' : 'rgba(200,165,100,0.12)';
  const accent      = isLight ? '#7A5830'               : '#C9A96E';

  // Диагностика — что реально применяется к Canvas
  console.log(`[Canvas] pillStyle="${pillStyle}" scrim=${saMax.toFixed(2)} colorScheme="${colorScheme}" zone="${textZone}" overlayStyle_null=${overlayStyle == null}`);

  // ── 7. Typography ─────────────────────────────────────────────────────────
  // Text anchor: left edge for left zones, right edge for right zones
  const textX = isRight ? W - PAD : PAD;
  ctx.textBaseline = 'top';
  let y = 88;

  // Tagline — small, spaced letters
  ctx.font = '400 11.5px Arial, Helvetica, sans-serif';
  ctx.fillStyle = subColor;
  ctx.textAlign = 'left';
  const tagText = data.tagline.toUpperCase();
  const tagW = spacedTextWidth(ctx, tagText, 2.6);
  const tagStartX = isRight ? textX - tagW : textX;
  drawSpaced(ctx, tagText, tagStartX, y, 2.6);
  y += 36;

  // Product name — italic serif bold
  const rawName = data.productName.toUpperCase();
  const nLen = rawName.replace(/\s/g, '').length;
  const NS = nLen <= 6 ? 68 : nLen <= 10 ? 56 : nLen <= 15 ? 46 : 38;
  ctx.font = `italic bold ${NS}px Georgia, 'Times New Roman', serif`;
  ctx.fillStyle = textColor;
  ctx.textAlign = isRight ? 'right' : 'left';
  // Всегда тёмная тень — создаёт контраст на любом фоне независимо от colorScheme
  const shadowAlpha = overlayStyle?.shadowIntensity ?? 0.35;
  ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`;
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 2;
  const nameLines = wrapText(ctx, rawName, TEXT_W, 3);
  for (const line of nameLines) {
    ctx.fillText(line, textX, y);
    y += Math.ceil(NS * 1.12);
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  y += 14;

  // Subtitle — italic (400, не 300 — 300 нечитаем)
  if (data.productSubtitle) {
    ctx.font = 'italic 400 17px Arial, Helvetica, sans-serif';
    ctx.fillStyle = subColor;
    ctx.textAlign = isRight ? 'right' : 'left';
    ctx.fillText(data.productSubtitle, textX, y);
    y += 44;
  }

  // Short accent rule
  const ruleX = isRight ? textX - 50 : textX;
  ctx.beginPath();
  ctx.moveTo(ruleX, y);
  ctx.lineTo(ruleX + 50, y);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.52;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 28;

  // ── 8. Feature pills ──────────────────────────────────────────────────────
  const PILL_H = 66, PILL_W = 318, PILL_R = 33;
  const ICON_CX = 42, ICON_DOT_R = 14, ICON_R = 15;

  for (let i = 0; i < data.characteristics.slice(0, 3).length; i++) {
    const ch = data.characteristics[i];
    const px = isRight ? W - PAD - PILL_W : PAD;
    const py = y;

    // ── Pill background — branched by pillStyle ──────────────────────────
    switch (pillStyle) {

      case 'frosted': {
        // Настоящий frosted glass: blur фото за пилюлей + сильный wash + белая граница
        ctx.save();
        roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
        ctx.clip();
        ctx.filter = `blur(${blurR}px)`;
        ctx.drawImage(img, (W - dW) / 2, (H - dH) / 2, dW, dH);
        ctx.filter = 'none';
        // Сильный wash — чтобы frosted был реально заметен даже на bokeh фоне
        ctx.fillStyle = isLight ? 'rgba(255,255,255,0.52)' : 'rgba(8,6,16,0.52)';
        ctx.fillRect(px, py, PILL_W, PILL_H);
        ctx.restore();
        // Видимая белая граница — характерна для frosted glass
        roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
        ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Тонкий блик сверху (top highlight)
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(px + PILL_R, py + 1);
        ctx.lineTo(px + PILL_W - PILL_R, py + 1);
        ctx.strokeStyle = isLight ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'outline': {
        // Полностью прозрачный фон — только жирная цветная обводка
        roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Внутри — тонкая подложка для читаемости текста
        roundRect(ctx, px + 1, py + 1, PILL_W - 2, PILL_H - 2, PILL_R - 1);
        ctx.fillStyle = isLight ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
        ctx.fill();
        break;
      }

      case 'gradient': {
        // Сильный градиент: почти непрозрачный → полностью прозрачный
        const gDir = isRight ? ctx.createLinearGradient(px + PILL_W, py, px, py)
                             : ctx.createLinearGradient(px, py, px + PILL_W, py);
        gDir.addColorStop(0,    isLight ? 'rgba(255,255,255,0.88)' : 'rgba(8,6,16,0.88)');
        gDir.addColorStop(0.55, isLight ? 'rgba(255,255,255,0.52)' : 'rgba(8,6,16,0.52)');
        gDir.addColorStop(1,    isLight ? 'rgba(255,255,255,0.04)' : 'rgba(8,6,16,0.04)');
        roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
        ctx.fillStyle = gDir;
        ctx.fill();
        break;
      }

      case 'minimal': {
        // Почти невидимая подложка — текст как будто висит в воздухе
        roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
        ctx.fillStyle = isLight ? 'rgba(255,255,255,0.10)' : 'rgba(8,6,16,0.10)';
        ctx.fill();
        roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.22;
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }

      case 'none':
        // Текст прямо на фото — без подложки
        break;

      default: { // 'solid' — плотная непрозрачная плашка
        ctx.save();
        ctx.shadowColor = isLight ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.38)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 3;
        roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
        ctx.fillStyle = pillBg;
        ctx.fill();
        ctx.restore();
        roundRect(ctx, px, py, PILL_W, PILL_H, PILL_R);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.22;
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
    }

    // Icon circle — always on the inner side of the pill
    const iconCX = px + ICON_CX;
    const iconCY = py + PILL_H / 2;
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, ICON_DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = pillIconBg;
    ctx.fill();
    ICON_FNS[i % 3](ctx, iconCX, iconCY, ICON_R * 0.64, accent);

    // Pill text (always left-aligned inside pill)
    const textXP = iconCX + ICON_DOT_R + 14;
    const maxTW = px + PILL_W - textXP - 16;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (ch.value) {
      ctx.font = '600 14px Arial, Helvetica, sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(ch.title, textXP, iconCY - 10);
      ctx.font = '400 12px Arial, Helvetica, sans-serif';
      ctx.fillStyle = subColor;
      ctx.fillText(wrapText(ctx, ch.value, maxTW, 1)[0] ?? ch.value, textXP, iconCY + 10);
    } else {
      ctx.font = '500 14px Arial, Helvetica, sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(ch.title, textXP, iconCY);
    }
    ctx.textBaseline = 'top';
    y += PILL_H + 14;
  }

  // ── 9. Bottom italic text ─────────────────────────────────────────────────
  if (data.bottomText) {
    const btY = H - 76, btSz = 15;
    ctx.font = `italic 300 ${btSz}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = subColor;
    ctx.textAlign = isRight ? 'right' : 'left';
    ctx.textBaseline = 'top';
    let bty = btY;
    for (const bl of wrapText(ctx, data.bottomText, TEXT_W - 20, 2)) {
      ctx.fillText(bl, textX, bty);
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
            <span className="text-violet-500">pillStyle:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.pillStyle ?? '—'}</span>
            {' · '}
            <span className="text-violet-500">colorScheme:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.colorScheme ?? '—'}</span>
            {' · '}
            <span className="text-violet-500">scrimOpacity:</span>{' '}
            <span className="text-white font-mono">{overlayStyleData.scrimOpacity ?? '—'}</span>
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
          ⚠ overlayStyle от Qwen не получен — используются дефолты (solid + auto-detect)
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
