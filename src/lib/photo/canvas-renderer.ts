// Canvas renderer — all drawing functions for the 5-layout infographic system.
// Functions are moved 1-to-1 from PhotoInfographicEditor.tsx without behaviour changes.

import type { InfographicData, CompositionData, OverlayStyleData } from '@/types/photo-pipeline';
import { CARD_W, CARD_H, deriveAccent, getTitleFont } from '@/lib/photo/design-system';
import { resolveLayout, resolveCanvasLayout, sampleBackground } from '@/lib/photo/layout-engine';

// ── Text helpers ──────────────────────────────────────────────────────────────

export function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
}

export function spacedTextWidth(ctx: CanvasRenderingContext2D, text: string, spacing: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines = 99): string[] {
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

// ── Scrim ─────────────────────────────────────────────────────────────────────

export function drawScrim(
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

// ── Layout renderers ──────────────────────────────────────────────────────────

/** Layouts 1 & 2: vertical text column on left or right side. */
export function drawColumn(
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
export function drawTopBottom(
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
export function drawBottomBar(
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
export function drawFloating(
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

export function drawCard(
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

  // 2. Resolve layout (supports new + legacy names), then canvas zone validation
  const rawLayout = overlayStyle?.layoutTemplate ?? composition?.primaryTextZone ?? 'left-column';
  const layout    = resolveCanvasLayout(ctx, W, H, resolveLayout(rawLayout as string), composition);
  // headFrac still needed separately to pass to drawTopBottom
  const headFrac  = composition?.modelHeadTopFraction;

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

export async function toDataUrl(url: string): Promise<string> {
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
