// Template canvas renderer — professional WB infographic templates.
// Currently implements: 'benefits' (product left, 3 benefit cards right).
// All other templateId values return false → caller falls back to legacy drawCard.

import type { InfographicData, CompositionData, OverlayStyleData } from '@/types/photo-pipeline';
import { CARD_W, CARD_H, deriveAccent, getTitleFont } from '@/lib/photo/design-system';
import { sampleBackground } from '@/lib/photo/layout-engine';
import { wrapText, drawSpaced } from '@/lib/photo/canvas-renderer';

export interface TemplateCardOptions {
  templateId: string;
  overlayStyle?: OverlayStyleData | null;
  composition?: CompositionData | null;
}

/**
 * Draws a professional infographic card using the template system.
 * Returns true if the template was handled, false if templateId is not yet implemented.
 * Caller must fall back to legacy drawCard when false is returned.
 *
 * Wraps drawing in try/catch — any internal error returns false (safe fallback).
 */
export function drawTemplateCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  options: TemplateCardOptions,
): boolean {
  if (options.templateId !== 'benefits') return false;
  try {
    drawBenefitsTemplate(ctx, img, data, options);
    return true;
  } catch {
    // Internal draw error — let caller fall back to legacy renderer
    return false;
  }
}

// ── Benefits template ─────────────────────────────────────────────────────────
// Layout: product photo full-bleed, right column (≈54–98% width) holds text.
// Right-side scrim ensures text readability on any background.
// Text blocks: tagline · product name · subtitle · separator · 3 benefit cards.

function drawBenefitsTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  { overlayStyle }: TemplateCardOptions,
): void {
  const W = CARD_W;   // 900
  const H = CARD_H;   // 1200

  // ── 1. Photo full-bleed ───────────────────────────────────────────────────
  const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  ctx.drawImage(
    img,
    (W - img.naturalWidth * sc) / 2,
    (H - img.naturalHeight * sc) / 2,
    img.naturalWidth * sc,
    img.naturalHeight * sc,
  );

  // ── 2. Sample colors from right side (the text column region) ─────────────
  const { r: bgR, g: bgG, b: bgB, luminance: lum } = sampleBackground(ctx, W, H, 'right');

  // ── 3. Colors ─────────────────────────────────────────────────────────────
  const isLight   = (overlayStyle?.colorScheme ?? (lum > 140 ? 'light' : 'dark')) === 'light';
  const textColor = overlayStyle?.textColorHex ?? (isLight ? '#1A1205' : '#F0ECE4');
  const shadow    = overlayStyle?.shadowIntensity ?? 0.28;
  const accent    = deriveAccent(bgR, bgG, bgB, lum);
  const scrimMax  = Math.min(overlayStyle?.scrimOpacity ?? 0.48, 0.65);

  // ── 4. Right-column scrim ─────────────────────────────────────────────────
  const sr  = Math.min(255, Math.round(bgR * (isLight ? 1.04 : 0.76)));
  const sg  = Math.min(255, Math.round(bgG * (isLight ? 1.02 : 0.72)));
  const sb_ = Math.min(255, Math.round(bgB * (isLight ? 1.01 : 0.68)));
  const rgba = (a: number) => `rgba(${sr},${sg},${sb_},${+a.toFixed(3)})`;

  const scrimG = ctx.createLinearGradient(W, 0, W * 0.48, 0);
  scrimG.addColorStop(0,    rgba(scrimMax));
  scrimG.addColorStop(0.60, rgba(scrimMax * 0.14));
  scrimG.addColorStop(1,    rgba(0));
  ctx.fillStyle = scrimG;
  ctx.fillRect(0, 0, W, H);

  // ── 5. Layout constants ───────────────────────────────────────────────────
  const COL_X      = 488;          // left edge of text column
  const PAD        = 28;           // horizontal inner padding
  const TEXT_X     = COL_X + PAD; // 516 — text left anchor
  const RIGHT_EDGE = 878;          // text right boundary (22px from card edge)
  const TEXT_W     = RIGHT_EDGE - TEXT_X; // 362px usable text width

  // ── 6. Title style ────────────────────────────────────────────────────────
  const titleStyle = overlayStyle?.titleStyle ?? 'modern-bold';
  const nChars     = (data.productName || '').replace(/\s/g, '').length;
  const titleSize  = overlayStyle?.titleSize ?? (nChars <= 10 ? 60 : nChars <= 18 ? 48 : 40);

  ctx.textBaseline  = 'top';
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  let y = 72;

  // ── 7. Tagline ────────────────────────────────────────────────────────────
  const tagU = (data.tagline || '').toUpperCase().trim();
  if (tagU) {
    ctx.font        = '400 11px Arial, Helvetica, sans-serif';
    ctx.fillStyle   = textColor;
    ctx.globalAlpha = 0.50;
    ctx.textAlign   = 'left';
    drawSpaced(ctx, tagU, TEXT_X, y, 2.5);
    ctx.globalAlpha = 1;
    y += 26;
  }

  // ── 8. Product name (max 2 lines) ─────────────────────────────────────────
  const rawName = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  ctx.font          = getTitleFont(titleStyle, titleSize);
  ctx.fillStyle     = textColor;
  ctx.textAlign     = 'left';
  ctx.shadowColor   = `rgba(0,0,0,${shadow})`;
  ctx.shadowBlur    = 10;
  ctx.shadowOffsetY = 2;
  for (const line of wrapText(ctx, rawName, TEXT_W, 2)) {
    ctx.fillText(line, TEXT_X, y);
    y += Math.ceil(titleSize * 1.14);
  }
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetY = 0;
  y += 8;

  // ── 9. Subtitle ───────────────────────────────────────────────────────────
  if (data.productSubtitle?.trim()) {
    const subSz = Math.max(14, Math.round(titleSize * 0.28));
    ctx.font        = `400 ${subSz}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle   = textColor;
    ctx.globalAlpha = 0.62;
    ctx.textAlign   = 'left';
    ctx.fillText(data.productSubtitle, TEXT_X, y);
    ctx.globalAlpha = 1;
    y += subSz + 14;
  }

  // ── 10. Separator ─────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(TEXT_X, y);
  ctx.lineTo(RIGHT_EDGE, y);
  ctx.strokeStyle = textColor;
  ctx.lineWidth   = 1;
  ctx.globalAlpha = 0.18;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 24;

  // ── 11. Benefit cards ─────────────────────────────────────────────────────
  const benefits = data.characteristics.slice(0, 3);
  if (benefits.length === 0) return;

  const BOTTOM_PAD = 64;
  const slotH      = Math.floor((H - y - BOTTOM_PAD) / benefits.length);

  const BADGE_R  = 17;
  const BADGE_D  = BADGE_R * 2;
  const TITLE_SZ = 13;
  const VALUE_SZ = 15;

  for (let i = 0; i < benefits.length; i++) {
    const ch      = benefits[i];
    const slotY   = y + i * slotH;
    const badgeCX = TEXT_X + BADGE_R;
    const badgeCY = slotY + Math.round(slotH * 0.22) + BADGE_R;

    // Number badge circle
    ctx.beginPath();
    ctx.arc(badgeCX, badgeCY, BADGE_R, 0, Math.PI * 2);
    ctx.fillStyle   = accent;
    ctx.globalAlpha = 0.90;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Number inside badge
    ctx.font         = `700 13px Arial, Helvetica, sans-serif`;
    ctx.fillStyle    = isLight ? '#FFFFFF' : '#0E0C08';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), badgeCX, badgeCY);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';

    // Text column to the right of badge
    const tX = TEXT_X + BADGE_D + 12;
    const tW = RIGHT_EDGE - tX;
    let   ty = badgeCY - BADGE_R + 1;

    // Benefit title
    ctx.font        = `700 ${TITLE_SZ}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle   = accent;
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'top';
    drawSpaced(ctx, (ch.title || '').toUpperCase(), tX, ty, 1.6);
    ty += TITLE_SZ + 6;

    // Benefit value (max 2 lines)
    if (ch.value?.trim()) {
      ctx.font        = `500 ${VALUE_SZ}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle   = textColor;
      ctx.globalAlpha = 0.88;
      ctx.textAlign   = 'left';
      for (const vl of wrapText(ctx, ch.value, tW, 2)) {
        ctx.fillText(vl, tX, ty);
        ty += VALUE_SZ + 4;
      }
      ctx.globalAlpha = 1;
    }

    // Thin divider between benefits (not after the last one)
    if (i < benefits.length - 1) {
      const divY = slotY + slotH - 4;
      ctx.beginPath();
      ctx.moveTo(TEXT_X, divY);
      ctx.lineTo(RIGHT_EDGE, divY);
      ctx.strokeStyle = textColor;
      ctx.lineWidth   = 1;
      ctx.globalAlpha = 0.08;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
