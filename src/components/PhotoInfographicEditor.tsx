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
}

export interface TextVariant {
  approach: 'Выгоды' | 'Характеристики' | 'Эмоции' | 'Минимализм';
  productName: string;
  subtitle: string;
  tagline: string;
  characteristics: Array<{ title: string; value: string }>;
}

export interface CompositionData {
  subjectZone?: string;
  shootType?: string;
  freeZones?: string[];
  primaryTextZone?: string;
  textZoneReason?: string;
  modelHeadTopFraction?: number;
  modelFeetBottomFraction?: number;
}

export interface OverlayStyleData {
  layoutTemplate?: 'left-column' | 'right-column' | 'top-bottom' | 'bottom-bar' | 'floating'
                 | 'side-left' | 'side-right' | 'bottom-band'; // legacy names still accepted
  titleStyle?: 'premium-serif' | 'modern-bold' | 'mixed';
  titleSize?: number;
  floatingZones?: string[];
  colorScheme?: 'light' | 'dark';
  textColorHex?: string;
  scrimOpacity?: number;
  scrimDirection?: string;
  shadowIntensity?: number;
  /** Legacy fields — ignored */
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
};

// ── Canvas helpers ────────────────────────────────────────────────────────────

function sampleBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  side: 'left' | 'right' | 'top' | 'bottom' = 'left',
): { r: number; g: number; b: number; luminance: number } {
  try {
    let data: Uint8ClampedArray;
    if (side === 'left') {
      data = ctx.getImageData(0, 0, Math.max(1, Math.floor(W * 0.30)), H).data;
    } else if (side === 'right') {
      const sW = Math.max(1, Math.floor(W * 0.30));
      data = ctx.getImageData(W - sW, 0, sW, H).data;
    } else if (side === 'top') {
      data = ctx.getImageData(0, 0, W, Math.max(1, Math.floor(H * 0.25))).data;
    } else {
      const sH = Math.max(1, Math.floor(H * 0.25));
      data = ctx.getImageData(0, H - sH, W, sH).data;
    }
    let r = 0, g = 0, b = 0, count = 0;
    const step = 4 * 20;
    for (let i = 0; i < data.length; i += step) {
      const pr = data[i], pg = data[i + 1], pb = data[i + 2];
      const mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb);
      if (mx > 0 && (mx - mn) / mx > 0.35) continue;
      r += pr; g += pg; b += pb; count++;
    }
    if (count < 10) {
      let fr = 0, fg = 0, fb = 0, fc = 0;
      for (let i = 0; i < data.length; i += step) { fr += data[i]; fg += data[i+1]; fb += data[i+2]; fc++; }
      const ar = fc ? fr/fc : 200, ag = fc ? fg/fc : 195, ab = fc ? fb/fc : 185;
      return { r: ar, g: ag, b: ab, luminance: 0.299*ar + 0.587*ag + 0.114*ab };
    }
    const ar = r/count, ag = g/count, ab = b/count;
    return { r: ar, g: ag, b: ab, luminance: 0.299*ar + 0.587*ag + 0.114*ab };
  } catch {
    return { r: 240, g: 235, b: 225, luminance: 235 };
  }
}

/** Returns luminance std-dev of a canvas zone. High value (~25+) means complex content (model). */
function sampleZoneVariance(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
): number {
  try {
    const data = ctx.getImageData(
      Math.round(x), Math.round(y),
      Math.max(1, Math.round(w)), Math.max(1, Math.round(h)),
    ).data;
    let sum = 0, sumSq = 0, n = 0;
    const step = 4 * 10;
    for (let i = 0; i < data.length; i += step) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      sum += lum; sumSq += lum * lum; n++;
    }
    if (n < 2) return 0;
    const mean = sum / n;
    return Math.sqrt(sumSq / n - mean * mean);
  } catch { return 0; }
}

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
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

// ── Canvas Drawing — 5-Layout System ─────────────────────────────────────────

function deriveAccent(r: number, _g: number, b: number, luminance: number): string {
  const isLight = luminance > 140;
  const warmth  = r - b;
  if (isLight) return warmth >= 0 ? 'rgba(50,36,18,0.82)' : 'rgba(34,40,56,0.84)';
  return warmth >= 0 ? 'rgba(212,180,108,0.92)' : 'rgba(174,200,228,0.90)';
}

function getTitleFont(style: string, size: number): string {
  if (style === 'premium-serif') return `italic bold ${size}px Georgia, 'Times New Roman', serif`;
  return `900 ${size}px 'Arial Black', Arial, Helvetica, sans-serif`;
}

function resolveLayout(raw: string): 'left-column' | 'right-column' | 'top-bottom' | 'bottom-bar' | 'floating' {
  if (raw === 'right-column' || raw === 'side-right' || raw === 'right' || raw === 'top-right' || raw === 'bottom-right') return 'right-column';
  if (raw === 'top-bottom' || raw === 'bottom-band' || raw === 'top' || raw === 'bottom') return 'top-bottom';
  if (raw === 'bottom-bar')  return 'bottom-bar';
  if (raw === 'floating')    return 'floating';
  return 'left-column';
}

function drawScrim(
  ctx: CanvasRenderingContext2D, W: number, H: number, layout: string,
  bgR: number, bgG: number, bgB: number, isLight: boolean, scrimMax: number,
) {
  const sr  = Math.min(255, Math.round(bgR * (isLight ? 1.04 : 0.80)));
  const sg  = Math.min(255, Math.round(bgG * (isLight ? 1.02 : 0.76)));
  const sb_ = Math.min(255, Math.round(bgB * (isLight ? 1.01 : 0.72)));
  const rgba = (a: number) => `rgba(${sr},${sg},${sb_},${+a.toFixed(3)})`;

  if (layout === 'left-column') {
    const g = ctx.createLinearGradient(0, 0, W * 0.46, 0);
    g.addColorStop(0, rgba(scrimMax)); g.addColorStop(0.68, rgba(scrimMax * 0.10)); g.addColorStop(1, rgba(0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (layout === 'right-column') {
    const g = ctx.createLinearGradient(W, 0, W * 0.54, 0);
    g.addColorStop(0, rgba(scrimMax)); g.addColorStop(0.68, rgba(scrimMax * 0.10)); g.addColorStop(1, rgba(0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (layout === 'top-bottom') {
    const gt = ctx.createLinearGradient(0, 0, 0, H * 0.36);
    gt.addColorStop(0, rgba(scrimMax)); gt.addColorStop(1, rgba(0));
    ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H);
    const gb = ctx.createLinearGradient(0, H * 0.66, 0, H);
    gb.addColorStop(0, rgba(0)); gb.addColorStop(1, rgba(scrimMax));
    ctx.fillStyle = gb; ctx.fillRect(0, 0, W, H);
  } else if (layout === 'bottom-bar') {
    const g = ctx.createLinearGradient(0, H * 0.56, 0, H);
    g.addColorStop(0, rgba(0)); g.addColorStop(0.30, rgba(scrimMax * 0.50));
    g.addColorStop(1, rgba(Math.min(scrimMax * 1.4, 0.65)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
}

/** Layouts 1 & 2: vertical text column on left or right side. */
function drawColumn(
  ctx: CanvasRenderingContext2D, W: number, H: number, data: InfographicData,
  titleStyle: string, titleSize: number, textColor: string, accent: string, shadowAlpha: number,
  isRight: boolean,
) {
  const PAD   = Math.round(W * 0.07);
  const COL_W = Math.round(W * 0.40);
  const SPC   = 2.5;
  const x     = isRight ? W - PAD : PAD;
  const align = (isRight ? 'right' : 'left') as CanvasTextAlign;

  ctx.textBaseline = 'top'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  let y = Math.round(H * 0.07);

  // Tagline
  const tagU = (data.tagline || '').toUpperCase();
  ctx.font = "400 11px Arial, Helvetica, sans-serif";
  ctx.fillStyle = textColor; ctx.globalAlpha = 0.50; ctx.textAlign = align;
  if (isRight) { const tw = spacedTextWidth(ctx, tagU, SPC); drawSpaced(ctx, tagU, x - tw, y, SPC); }
  else { drawSpaced(ctx, tagU, x, y, SPC); }
  ctx.globalAlpha = 1; y += 22;

  // Product name
  const rawName = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  ctx.font = getTitleFont(titleStyle, titleSize);
  ctx.fillStyle = textColor; ctx.textAlign = align;
  ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
  for (const line of wrapText(ctx, rawName, COL_W, 3)) {
    ctx.fillText(line, x, y); y += Math.ceil(titleSize * 1.12);
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; y += 10;

  // Subtitle
  if (data.productSubtitle) {
    const subSz = Math.max(14, Math.round(titleSize * 0.28));
    ctx.font = `400 ${subSz}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = textColor; ctx.globalAlpha = 0.62; ctx.textAlign = align;
    ctx.fillText(data.productSubtitle, x, y); ctx.globalAlpha = 1; y += subSz + 14;
  }

  // Separator
  const sepX = isRight ? x - COL_W : x;
  ctx.beginPath(); ctx.moveTo(sepX, y); ctx.lineTo(sepX + COL_W, y);
  ctx.strokeStyle = textColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.14; ctx.stroke();
  ctx.globalAlpha = 1; y += 20;

  // Characteristics
  for (let i = 0; i < Math.min(3, data.characteristics.length); i++) {
    const ch = data.characteristics[i];
    const tText = (ch.title || '').toUpperCase();
    ctx.font = "700 12px Arial, Helvetica, sans-serif"; ctx.fillStyle = accent; ctx.globalAlpha = 1;
    if (isRight) { const tw = spacedTextWidth(ctx, tText, 2.0); drawSpaced(ctx, tText, x - tw, y, 2.0); }
    else { drawSpaced(ctx, tText, x, y, 2.0); }
    y += 18;
    ctx.font = "600 17px Arial, Helvetica, sans-serif"; ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.90; ctx.textAlign = align;
    ctx.fillText(wrapText(ctx, ch.value || '', COL_W, 1)[0] ?? '', x, y);
    ctx.globalAlpha = 1; y += 22;
    if (i < 2) {
      ctx.beginPath(); ctx.moveTo(sepX, y + 2); ctx.lineTo(sepX + COL_W, y + 2);
      ctx.strokeStyle = textColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.08; ctx.stroke();
      ctx.globalAlpha = 1; y += 16;
    }
  }
}

/** Layout 3: title at top center, 3-column characteristics bar at bottom (190px). */
function drawTopBottom(
  ctx: CanvasRenderingContext2D, W: number, H: number, data: InfographicData,
  titleStyle: string, titleSize: number, textColor: string, accent: string, shadowAlpha: number,
  headFrac?: number,
) {
  const CX = W / 2;
  const SPC = 2.8;
  ctx.textBaseline = 'top'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  let y = Math.round(H * 0.03);

  // Tagline
  const tagU = (data.tagline || '').toUpperCase();
  ctx.font = "400 11px Arial, Helvetica, sans-serif";
  ctx.fillStyle = textColor; ctx.globalAlpha = 0.50; ctx.textAlign = 'center';
  drawSpaced(ctx, tagU, CX - spacedTextWidth(ctx, tagU, SPC) / 2, y, SPC);
  ctx.globalAlpha = 1; y += 22;

  // Adapt title size to available head-clearance zone
  const clearMaxY = headFrac != null ? Math.round(H * headFrac * 0.88) : Math.round(H * 0.40);
  const rawName   = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  ctx.font = getTitleFont(titleStyle, titleSize);
  const neededH   = wrapText(ctx, rawName, W * 0.78, 2).length * Math.ceil(titleSize * 1.12);
  const availH    = clearMaxY - y;
  const tSize     = (neededH > availH && availH > 30)
    ? Math.max(30, Math.floor(titleSize * availH / neededH))
    : titleSize;

  // Product name
  ctx.font = getTitleFont(titleStyle, tSize);
  ctx.fillStyle = textColor; ctx.textAlign = 'center';
  ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2;
  for (const line of wrapText(ctx, rawName, W * 0.78, 2)) {
    ctx.fillText(line, CX, y); y += Math.ceil(tSize * 1.12);
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Bottom bar (190px): subtitle (italic) + thin separator + 3-column characteristics
  const BAR_TOP = H - 190;
  const chars   = data.characteristics.slice(0, 3);
  const colW    = Math.round(W / chars.length);

  // Subtitle — small italic, centered at top of bar
  if (data.productSubtitle) {
    ctx.font = 'italic 400 15px Georgia, serif';
    ctx.fillStyle = textColor; ctx.globalAlpha = 0.62; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(data.productSubtitle, CX, BAR_TOP + 22);
    ctx.globalAlpha = 1;
  }

  // Thin separator between subtitle and columns
  ctx.beginPath();
  ctx.moveTo(Math.round(W * 0.10), BAR_TOP + 50); ctx.lineTo(Math.round(W * 0.90), BAR_TOP + 50);
  ctx.strokeStyle = textColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.10; ctx.stroke(); ctx.globalAlpha = 1;

  // 3-column characteristics
  for (let i = 0; i < chars.length; i++) {
    const colCX = colW * i + colW / 2;
    if (i > 0) {
      ctx.beginPath(); ctx.moveTo(colW * i, BAR_TOP + 64); ctx.lineTo(colW * i, BAR_TOP + 160);
      ctx.strokeStyle = textColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.10; ctx.stroke(); ctx.globalAlpha = 1;
    }
    const tText = (chars[i].title || '').toUpperCase();
    ctx.font = "700 12px Arial, Helvetica, sans-serif"; ctx.fillStyle = accent;
    ctx.globalAlpha = 1; ctx.textBaseline = 'top';
    drawSpaced(ctx, tText, colCX - spacedTextWidth(ctx, tText, 2.0) / 2, BAR_TOP + 68, 2.0);
    ctx.font = "600 17px Arial, Helvetica, sans-serif"; ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.90; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(wrapText(ctx, chars[i].value || '', colW - 30, 1)[0] ?? '', colCX, BAR_TOP + 92);
    ctx.globalAlpha = 1;
  }
}

/** Layout 4: all text in bottom band — title left, characteristics right. */
function drawBottomBar(
  ctx: CanvasRenderingContext2D, W: number, H: number, data: InfographicData,
  titleStyle: string, titleSize: number, textColor: string, accent: string, shadowAlpha: number,
  bgR: number, bgG: number, bgB: number, isLight: boolean,
) {
  const PAD = Math.round(W * 0.07);
  const SPC = 2.5;

  // Dynamic band height
  ctx.font = getTitleFont(titleStyle, titleSize);
  const rawName    = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const titleLines = wrapText(ctx, rawName, W * 0.50, 2).length;
  const titleH     = 24 + titleLines * Math.ceil(titleSize * 1.12) + 24;
  const charsH     = 3 * (18 + 26) + 2 * 14;
  const BAND_H     = Math.max(titleH, charsH) + Math.round(PAD * 1.2);
  const BAND_TOP   = H - BAND_H;
  const VPAD       = Math.round(PAD * 0.65);

  // Solid panel — guarantees readability on any background (studio or lifestyle)
  const pr = Math.min(255, Math.round(bgR * (isLight ? 1.03 : 0.55)));
  const pg = Math.min(255, Math.round(bgG * (isLight ? 1.02 : 0.50)));
  const pb = Math.min(255, Math.round(bgB * (isLight ? 1.01 : 0.48)));
  ctx.fillStyle = `rgba(${pr},${pg},${pb},0.86)`;
  ctx.fillRect(0, BAND_TOP, W, BAND_H);

  ctx.textBaseline = 'top'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  // Left: tagline + title + subtitle
  let ly = BAND_TOP + VPAD;
  ctx.font = "400 11px Arial, Helvetica, sans-serif";
  ctx.fillStyle = textColor; ctx.globalAlpha = 0.50; ctx.textAlign = 'left';
  drawSpaced(ctx, (data.tagline || '').toUpperCase(), PAD, ly, SPC);
  ctx.globalAlpha = 1; ly += 22;

  ctx.font = getTitleFont(titleStyle, titleSize);
  ctx.fillStyle = textColor; ctx.textAlign = 'left';
  ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  for (const line of wrapText(ctx, rawName, W * 0.50, 2)) {
    ctx.fillText(line, PAD, ly); ly += Math.ceil(titleSize * 1.12);
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  if (data.productSubtitle) {
    const subSz = Math.max(13, Math.round(titleSize * 0.26));
    ctx.font = `400 ${subSz}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = textColor; ctx.globalAlpha = 0.58; ctx.textAlign = 'left';
    ctx.fillText(data.productSubtitle, PAD, ly); ctx.globalAlpha = 1;
  }

  // Right: 3 characteristics
  const charX = Math.round(W * 0.58);
  const charW = W - charX - PAD;
  let   ry    = BAND_TOP + VPAD;
  for (let i = 0; i < Math.min(3, data.characteristics.length); i++) {
    const ch = data.characteristics[i];
    ctx.font = "700 13px Arial, Helvetica, sans-serif"; ctx.fillStyle = accent;
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
    drawSpaced(ctx, (ch.title || '').toUpperCase(), charX, ry, 2.0); ry += 19;
    ctx.font = "600 18px Arial, Helvetica, sans-serif"; ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.88; ctx.textAlign = 'left';
    ctx.fillText(wrapText(ctx, ch.value || '', charW, 1)[0] ?? '', charX, ry);
    ctx.globalAlpha = 1; ry += 22;
    if (i < 2) {
      ctx.beginPath(); ctx.moveTo(charX, ry + 3); ctx.lineTo(charX + charW, ry + 3);
      ctx.strokeStyle = textColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.08; ctx.stroke();
      ctx.globalAlpha = 1; ry += 14;
    }
  }
}

/** Layout 5: small compact badges in 2 free corner zones. */
function drawFloating(
  ctx: CanvasRenderingContext2D, W: number, H: number, data: InfographicData,
  titleStyle: string, titleSize: number, _textColor: string, _accent: string, shadowAlpha: number,
  zones: string[],
) {
  const PAD     = Math.round(W * 0.07);
  const BADGE_W = 260;
  const BADGE_P = 18;
  const badges  = [
    { label: data.tagline || 'товар', value: (data.productName || 'НАЗВАНИЕ').toUpperCase(), isTitle: true },
    ...data.characteristics.slice(0, 2).map(ch => ({ label: ch.title, value: ch.value, isTitle: false })),
  ];

  zones.slice(0, Math.min(zones.length, badges.length)).forEach((zone, idx) => {
    const b      = badges[idx];
    const fSz    = b.isTitle ? Math.min(titleSize, 52) : 16;
    const badgeH = BADGE_P * 2 + 13 + 8 + Math.ceil(fSz * 1.15);
    let   bx     = PAD;
    let   by     = PAD;
    if (zone === 'top-right' || zone === 'center-right' || zone === 'bottom-right') bx = W - PAD - BADGE_W;
    if (zone === 'center-left' || zone === 'center-right') by = Math.round((H - badgeH) / 2);
    if (zone === 'bottom-left' || zone === 'bottom-right') by = H - PAD - badgeH;

    // Badge background
    ctx.fillStyle = 'rgba(0,0,0,0.52)';
    const r = 10;
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.lineTo(bx + BADGE_W - r, by);
    ctx.quadraticCurveTo(bx + BADGE_W, by, bx + BADGE_W, by + r);
    ctx.lineTo(bx + BADGE_W, by + badgeH - r);
    ctx.quadraticCurveTo(bx + BADGE_W, by + badgeH, bx + BADGE_W - r, by + badgeH);
    ctx.lineTo(bx + r, by + badgeH); ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - r);
    ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath(); ctx.fill();

    let ty = by + BADGE_P;
    ctx.font = "400 11px Arial, sans-serif"; ctx.fillStyle = '#CCCCCC';
    ctx.globalAlpha = 0.80; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(b.label.toUpperCase(), bx + BADGE_P, ty); ctx.globalAlpha = 1; ty += 13 + 8;

    ctx.font = b.isTitle ? getTitleFont(titleStyle, fSz) : `600 ${fSz}px Arial, sans-serif`;
    ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`; ctx.shadowBlur = 6;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const line of wrapText(ctx, b.value, BADGE_W - BADGE_P * 2, 2)) {
      ctx.fillText(line, bx + BADGE_P, ty); ty += Math.ceil(fSz * 1.15);
    }
    ctx.shadowBlur = 0;
  });
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

  // 1. Photo full-bleed
  const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  ctx.drawImage(img, (W - img.naturalWidth * sc) / 2, (H - img.naturalHeight * sc) / 2, img.naturalWidth * sc, img.naturalHeight * sc);

  // 2. Resolve layout (supports new + legacy names)
  const rawLayout = overlayStyle?.layoutTemplate ?? composition?.primaryTextZone ?? 'left-column';
  let layout      = resolveLayout(rawLayout as string);

  // Protective fallback: top-bottom without enough head clearance → column layout
  const headFrac = composition?.modelHeadTopFraction;
  if (layout === 'top-bottom' && typeof headFrac === 'number' && headFrac < 0.18) {
    layout = (composition?.subjectZone === 'left' || composition?.subjectZone === 'center-left')
      ? 'right-column'
      : 'left-column';
  }

  // Canvas zone validation: check ACTUAL text rendering zones (PAD + COL_W), not just outer edge
  if (layout === 'left-column' || layout === 'right-column') {
    const PAD_PX  = Math.round(W * 0.07);
    const COL_PX  = Math.round(W * 0.40);
    const CHECK_H = Math.round(H * 0.40); // upper 40%: head + title zone
    const varL  = sampleZoneVariance(ctx, PAD_PX, 0, COL_PX, CHECK_H);
    const varR  = sampleZoneVariance(ctx, W - PAD_PX - COL_PX, 0, COL_PX, CHECK_H);
    // Background reference: min of 4 corners — most uniform = most background-like
    const cH = Math.round(H * 0.08), cW = Math.round(W * 0.10);
    const bgRef = Math.min(
      sampleZoneVariance(ctx, 0,      0,      cW, cH),
      sampleZoneVariance(ctx, W - cW, 0,      cW, cH),
      sampleZoneVariance(ctx, 0,      H - cH, cW, cH),
      sampleZoneVariance(ctx, W - cW, H - cH, cW, cH),
    );
    const BUSY  = bgRef + 12; // zone has model if variance > this
    const CLEAN = bgRef + 6;  // alternative column only accepted if it's THIS clean
    if (layout === 'left-column' && varL > BUSY) {
      layout = varR < CLEAN ? 'right-column' : 'bottom-bar';
    } else if (layout === 'right-column' && varR > BUSY) {
      layout = varL < CLEAN ? 'left-column' : 'bottom-bar';
    }
  }

  // 3. Sample background
  const sampleSide: 'left' | 'right' | 'top' | 'bottom' =
    layout === 'right-column' ? 'right' :
    layout === 'top-bottom'   ? 'top'   :
    (layout === 'bottom-bar' || layout === 'floating') ? 'bottom' : 'left';
  const { r: bgR, g: bgG, b: bgB, luminance: lum } = sampleBackground(ctx, W, H, sampleSide);

  // 4. Colors
  const isLight   = (overlayStyle?.colorScheme ?? (lum > 140 ? 'light' : 'dark')) === 'light';
  const textColor = overlayStyle?.textColorHex ?? (isLight ? '#1A1205' : '#F0ECE4');
  const shadow    = overlayStyle?.shadowIntensity ?? 0.28;
  const accent    = deriveAccent(bgR, bgG, bgB, lum);

  // 5. Title style + size
  const titleStyle  = overlayStyle?.titleStyle ?? 'modern-bold';
  const nChars      = (data.productName || '').replace(/\s/g, '').length;
  // top-bottom spans full card width (~700px) — can use larger sizes
  const autoSize    = layout === 'top-bottom'
    ? (nChars <= 10 ? 78 : nChars <= 18 ? 62 : 52)
    : (nChars <= 10 ? 68 : nChars <= 18 ? 52 : 42);
  const titleSize   = overlayStyle?.titleSize ?? autoSize;

  // 6. Scrim
  const scrimMax = Math.min(overlayStyle?.scrimOpacity ?? 0.38, 0.60);
  drawScrim(ctx, W, H, layout, bgR, bgG, bgB, isLight, scrimMax);

  // 7. Dispatch to layout renderer
  const fz = overlayStyle?.floatingZones ?? ['top-left', 'bottom-right'];
  if      (layout === 'left-column')  drawColumn    (ctx, W, H, data, titleStyle, titleSize, textColor, accent, shadow, false);
  else if (layout === 'right-column') drawColumn    (ctx, W, H, data, titleStyle, titleSize, textColor, accent, shadow, true);
  else if (layout === 'top-bottom')   drawTopBottom (ctx, W, H, data, titleStyle, titleSize, textColor, accent, shadow, headFrac ?? undefined);
  else if (layout === 'bottom-bar')   drawBottomBar (ctx, W, H, data, titleStyle, titleSize, textColor, accent, shadow, bgR, bgG, bgB, isLight);
  else                                drawFloating  (ctx, W, H, data, titleStyle, titleSize, textColor, accent, shadow, fz);
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

  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');

  const generateBase = useCallback(async () => {
    if (!imageUrl || !fluxPrompt) { setPremiumError('Нет fluxPrompt — сначала проанализируйте фото'); return; }
    setPremiumLoading(true); setPremiumError(''); setBaseImage(null);
    try {
      const imgSrc = await toDataUrl(imageUrl);
      const res = await fetch('/api/photo/generate-infographic-base', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imgSrc, fluxPrompt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка FLUX');
      setBaseImage(json.imageUrl);
    } catch (e) { setPremiumError(String(e)); } finally { setPremiumLoading(false); }
  }, [imageUrl, fluxPrompt]);

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
        const res = await fetch('/api/photo/generate-infographic-base', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: imgSrc, fluxPrompt }),
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
  }, [imageUrl, baseImage, fluxPrompt, renderCard, onExport]);

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
