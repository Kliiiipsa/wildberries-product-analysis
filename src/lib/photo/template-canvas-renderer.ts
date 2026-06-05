// Template canvas renderer — professional WB infographic templates.
// benefits: white panel + 3 large-text benefit cards. Readable at WB thumbnail scale.
// All other templateId values return false → caller falls back to legacy drawCard.

import type { InfographicData, CompositionData, OverlayStyleData } from '@/types/photo-pipeline';
import { CARD_W, CARD_H, getTitleFont } from '@/lib/photo/design-system';
import { sampleBackground } from '@/lib/photo/layout-engine';
import { wrapText, drawSpaced } from '@/lib/photo/canvas-renderer';

export interface TemplateCardOptions {
  templateId: string;
  overlayStyle?: OverlayStyleData | null;
  composition?: CompositionData | null;
}

/**
 * Draws a professional infographic card using the template system.
 * Returns true if templateId was handled, false if not yet implemented.
 * Any internal draw error also returns false → caller falls back to legacy drawCard.
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
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Draws a filled rounded rectangle path (does not call fill/stroke). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.lineTo(x + w - R, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + R);
  ctx.lineTo(x + w, y + h - R);
  ctx.quadraticCurveTo(x + w, y + h, x + w - R, y + h);
  ctx.lineTo(x + R, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - R);
  ctx.lineTo(x, y + R);
  ctx.quadraticCurveTo(x, y, x + R, y);
  ctx.closePath();
}

/**
 * Returns an accent colour that has sufficient contrast against a white/light panel.
 * Samples the left (product) side: dark product → medium colour; light product → very dark.
 */
function accentForWhitePanel(lum: number, r: number, b: number): string {
  const warm = r - b > 0;
  if (lum > 140) {
    // Light product area → very dark brown/navy — max contrast on white
    return warm ? 'rgba(56,36,12,0.92)' : 'rgba(26,38,68,0.92)';
  }
  // Dark product area → warm amber or medium blue — readable on white
  return warm ? 'rgba(150,98,22,0.94)' : 'rgba(34,72,152,0.94)';
}

// ── Benefits template ─────────────────────────────────────────────────────────
//
// Layout (900 × 1200):
//   LEFT  0–458px   product photo, no text overlay
//   RIGHT 460–886px white semi-transparent panel
//     ├─ tagline  (11px spaced)
//     ├─ headline (46–56px, weight 900, max 2 lines)
//     ├─ subtitle (17px)
//     ├─ separator
//     └─ 3 benefit cards (numbered badge + 30px title + 22px description)

function drawBenefitsTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  { overlayStyle }: TemplateCardOptions,
): void {
  const W = CARD_W;  // 900
  const H = CARD_H;  // 1200

  // ── 1. Photo full-bleed ───────────────────────────────────────────────────
  const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  ctx.drawImage(
    img,
    (W - img.naturalWidth * sc) / 2,
    (H - img.naturalHeight * sc) / 2,
    img.naturalWidth * sc,
    img.naturalHeight * sc,
  );

  // ── 2. Sample product (LEFT) side for accent colour ───────────────────────
  const { r: bgR, b: bgB, luminance: lum } = sampleBackground(ctx, W, H, 'left');
  const accent = accentForWhitePanel(lum, bgR, bgB);

  // ── 3. Panel geometry ─────────────────────────────────────────────────────
  const PX = 458, PY = 40;
  const PW = 428, PH = 1120;
  const PR = 20;  // border-radius

  // ── 4. Panel: shadow + white fill ─────────────────────────────────────────
  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur    = 32;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle     = 'rgba(255,255,255,0.92)';
  roundRect(ctx, PX, PY, PW, PH, PR);
  ctx.fill();
  ctx.restore();

  // ── 5. Typography constants ───────────────────────────────────────────────
  const INNER_X    = PX + 28;      // 486
  const INNER_W    = PW - 56;      // 372
  const INNER_R    = PX + PW - 28; // 858
  const TEXT_COLOR = '#1A1205';

  const titleStyle = overlayStyle?.titleStyle ?? 'modern-bold';
  const nChars     = (data.productName || '').replace(/\s/g, '').length;
  const titleSize  = overlayStyle?.titleSize
    ?? (nChars <= 10 ? 54 : nChars <= 18 ? 46 : 38);

  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.textBaseline  = 'top';

  let y = PY + 40;

  // ── 6. Tagline ────────────────────────────────────────────────────────────
  const tagU = (data.tagline || '').toUpperCase().trim();
  if (tagU) {
    ctx.font        = '400 11px Arial, Helvetica, sans-serif';
    ctx.fillStyle   = TEXT_COLOR;
    ctx.globalAlpha = 0.44;
    ctx.textAlign   = 'left';
    drawSpaced(ctx, tagU, INNER_X, y, 2.5);
    ctx.globalAlpha = 1;
    y += 24;
  }

  // ── 7. Headline ───────────────────────────────────────────────────────────
  const rawName = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  ctx.font          = getTitleFont(titleStyle, titleSize);
  ctx.fillStyle     = TEXT_COLOR;
  ctx.textAlign     = 'left';
  ctx.shadowColor   = 'rgba(0,0,0,0.07)';
  ctx.shadowBlur    = 3;
  ctx.shadowOffsetY = 1;
  for (const line of wrapText(ctx, rawName, INNER_W, 2)) {
    ctx.fillText(line, INNER_X, y);
    y += Math.ceil(titleSize * 1.14);
  }
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetY = 0;
  y += 8;

  // ── 8. Subtitle ───────────────────────────────────────────────────────────
  if (data.productSubtitle?.trim()) {
    ctx.font        = '400 17px Arial, Helvetica, sans-serif';
    ctx.fillStyle   = TEXT_COLOR;
    ctx.globalAlpha = 0.54;
    ctx.textAlign   = 'left';
    ctx.fillText(data.productSubtitle, INNER_X, y);
    ctx.globalAlpha = 1;
    y += 30;
  }

  // ── 9. Separator ─────────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(INNER_X, y);
  ctx.lineTo(INNER_R, y);
  ctx.strokeStyle = TEXT_COLOR;
  ctx.lineWidth   = 1;
  ctx.globalAlpha = 0.12;
  ctx.stroke();
  ctx.globalAlpha = 1;
  y += 20;

  // ── 10. Benefit cards ────────────────────────────────────────────────────
  const benefits = data.characteristics.slice(0, 3);
  if (benefits.length === 0) return;

  const PANEL_BOTTOM = PY + PH - 32; // 1128
  const SLOT_H       = Math.floor((PANEL_BOTTOM - y) / benefits.length);
  const CARD_GAP     = 10;
  const CARD_H_VAL   = SLOT_H - CARD_GAP;

  // Card x/w (inside panel with 14px margin)
  const CARD_X   = PX + 14;  // 472
  const CARD_WV  = PW - 28;  // 400  (renamed to avoid shadowing imported CARD_W)
  const CARD_R   = 12;

  // Badge
  const BADGE_R  = 22;
  const BADGE_CX = CARD_X + 20 + BADGE_R; // 514

  // Text area
  const TITLE_SZ    = 30;
  const DESC_SZ     = 22;
  const TITLE_LINE  = TITLE_SZ + 5;
  const DESC_LINE   = DESC_SZ + 4;
  const TEXT_X_CARD = BADGE_CX + BADGE_R + 14;           // 550
  const TEXT_W_CARD = CARD_X + CARD_WV - 14 - TEXT_X_CARD; // 324

  for (let i = 0; i < benefits.length; i++) {
    const ch    = benefits[i];
    const cardY = y + i * SLOT_H;
    const cardH = CARD_H_VAL;

    // ── Card background (warm white, subtle shadow) ─────────────────────
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.07)';
    ctx.shadowBlur    = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle     = 'rgba(246,242,234,0.80)';
    roundRect(ctx, CARD_X, cardY, CARD_WV, cardH, CARD_R);
    ctx.fill();
    ctx.restore();

    // ── Measure text block to vertically center it ──────────────────────
    ctx.font = `700 ${TITLE_SZ}px Arial, Helvetica, sans-serif`;
    const titleLines = wrapText(ctx, (ch.title || '').toUpperCase(), TEXT_W_CARD, 2);

    ctx.font = `400 ${DESC_SZ}px Arial, Helvetica, sans-serif`;
    const descLines = ch.value?.trim()
      ? wrapText(ctx, ch.value, TEXT_W_CARD, 2)
      : [];

    const textBlockH =
      titleLines.length * TITLE_LINE
      + (descLines.length > 0 ? 8 + descLines.length * DESC_LINE : 0);

    const contentTop = cardY + Math.max(16, Math.floor((cardH - textBlockH) / 2));

    // ── Badge circle ─────────────────────────────────────────────────────
    const badgeCY = contentTop + Math.floor(textBlockH / 2);
    ctx.beginPath();
    ctx.arc(BADGE_CX, badgeCY, BADGE_R, 0, Math.PI * 2);
    ctx.fillStyle   = accent;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Badge number
    ctx.font         = '700 16px Arial, Helvetica, sans-serif';
    ctx.fillStyle    = '#FFFFFF';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), BADGE_CX, badgeCY);
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';

    // ── Title ─────────────────────────────────────────────────────────────
    ctx.font        = `700 ${TITLE_SZ}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle   = accent;
    ctx.globalAlpha = 1;
    let ty = contentTop;
    for (const line of titleLines) {
      ctx.fillText(line, TEXT_X_CARD, ty);
      ty += TITLE_LINE;
    }

    // ── Description ───────────────────────────────────────────────────────
    if (descLines.length > 0) {
      ty += 8;
      ctx.font        = `400 ${DESC_SZ}px Arial, Helvetica, sans-serif`;
      ctx.fillStyle   = TEXT_COLOR;
      ctx.globalAlpha = 0.84;
      for (const vl of descLines) {
        ctx.fillText(vl, TEXT_X_CARD, ty);
        ty += DESC_LINE;
      }
      ctx.globalAlpha = 1;
    }
  }
}
