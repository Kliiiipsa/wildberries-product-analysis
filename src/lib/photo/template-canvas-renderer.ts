// Template canvas renderer — premium WB/Ozon-style infographic templates.
//
// Architecture (unchanged): FLUX draws a clean, text-free base image.
// Canvas owns ALL text, cards, panels, dividers, icons, grid, spacing and style.
// This keeps Russian text correct, editable, stable and never alters the product.
//
// Supported templateId values (premium render):
//   cover · benefits · details · lifestyle · trust
// size_grid + any unknown id → returns false → caller falls back to legacy drawCard.
// Any internal draw error also returns false → safe fallback, nothing breaks.

import type { InfographicData, CompositionData, OverlayStyleData } from '@/types/photo-pipeline';
import { CARD_W, CARD_H, getTitleFont } from '@/lib/photo/design-system';
import { sampleBackground } from '@/lib/photo/layout-engine';
import { wrapText, drawSpaced, spacedTextWidth } from '@/lib/photo/canvas-renderer';

export interface TemplateCardOptions {
  templateId: string;
  overlayStyle?: OverlayStyleData | null;
  composition?: CompositionData | null;
}

const FONT = 'Arial, Helvetica, sans-serif';

// ── Premium design system tokens ───────────────────────────────────────────────
const DS = {
  margin: 48,            // outer card margin
  panelRadius: 24,       // big panel corners
  cardRadius: 16,        // small card corners
  gap: 14,               // gap between stacked cards
  panelAlpha: 0.93,      // white glass panel opacity
  cardAlpha: 0.82,       // inner card opacity
  ink: '#191307',        // near-black warm text
  inkSoftAlpha: 0.56,    // secondary text alpha
  dividerAlpha: 0.12,    // hairline divider alpha
};

/**
 * Draws a professional infographic card using the template system.
 * Returns true if templateId was handled, false if not (caller falls back).
 */
export function drawTemplateCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  options: TemplateCardOptions,
): boolean {
  try {
    switch (options.templateId) {
      case 'cover':     drawCoverTemplate(ctx, img, data, options);     return true;
      case 'benefits':  drawBenefitsTemplate(ctx, img, data, options);  return true;
      case 'details':   drawDetailsTemplate(ctx, img, data, options);   return true;
      case 'lifestyle': drawLifestyleTemplate(ctx, img, data, options); return true;
      case 'trust':     drawTrustTemplate(ctx, img, data, options);     return true;
      // size_grid needs real measurement rows that InfographicData doesn't carry.
      // Don't fake a table → fall back to the legacy renderer.
      case 'size_grid':
      default:          return false;
    }
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

/** Rounded-rectangle path (does not fill/stroke). */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const R = Math.max(0, Math.min(r, w / 2, h / 2));
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

interface PanelOpts {
  fill?: string;
  alpha?: number;
  shadow?: boolean;
  shadowAlpha?: number;
  strokeColor?: string;
  strokeAlpha?: number;
  strokeWidth?: number;
}

/** Soft rounded panel with optional drop shadow + hairline stroke. */
function drawRoundedPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  opts: PanelOpts = {},
): void {
  const {
    fill = `rgba(255,255,255,${DS.panelAlpha})`,
    alpha = 1,
    shadow = true,
    shadowAlpha = 0.18,
    strokeColor,
    strokeAlpha = 0.5,
    strokeWidth = 1,
  } = opts;

  ctx.save();
  if (shadow) {
    ctx.shadowColor   = `rgba(20,16,8,${shadowAlpha})`;
    ctx.shadowBlur    = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = fill;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  if (strokeColor) {
    ctx.save();
    ctx.globalAlpha = strokeAlpha;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth   = strokeWidth;
    roundRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
  }
}

/** Wraps text and shrinks the font until it fits `maxW` within `maxLines`. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { maxW: number; maxLines: number; startSize: number; minSize: number; weight: string; step?: number; serif?: boolean },
): { fontSize: number; lines: string[] } {
  const { maxW, maxLines, startSize, minSize, weight, step = 2, serif = false } = opts;
  const family = serif ? "Georgia, 'Times New Roman', serif" : FONT;
  let size = startSize;
  let lines = wrapText(ctx, text, maxW, 999);
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapText(ctx, text, maxW, 999);
    if (lines.length <= maxLines) break;
    size -= step;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  // Final clamp to maxLines (last line may be truncated if still too long)
  lines = wrapText(ctx, text, maxW, maxLines);
  return { fontSize: size, lines };
}

interface ReadableTextOpts {
  x: number;
  y: number;
  font: string;
  color: string;
  alpha?: number;
  align?: CanvasTextAlign;
  lineHeight: number;
  shadowAlpha?: number;
  letterSpacing?: number;
}

/** Draws an array of lines and returns the y just below the block. */
function drawReadableText(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  opts: ReadableTextOpts,
): number {
  const { x, font, color, alpha = 1, align = 'left', lineHeight, shadowAlpha = 0, letterSpacing = 0 } = opts;
  let y = opts.y;
  ctx.font         = font;
  ctx.fillStyle    = color;
  ctx.textAlign    = align;
  ctx.textBaseline = 'top';
  for (const line of lines) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (shadowAlpha > 0) {
      ctx.shadowColor   = `rgba(0,0,0,${shadowAlpha})`;
      ctx.shadowBlur    = 6;
      ctx.shadowOffsetY = 2;
    }
    if (letterSpacing > 0 && align === 'left') {
      drawSpaced(ctx, line, x, y, letterSpacing);
    } else if (letterSpacing > 0 && align === 'center') {
      drawSpaced(ctx, line, x - spacedTextWidth(ctx, line, letterSpacing) / 2, y, letterSpacing);
    } else {
      ctx.fillText(line, x, y);
    }
    ctx.restore();
    y += lineHeight;
  }
  return y;
}

/** Small uppercase pill badge (e.g. "ХИТ СЕЗОНА"). Returns its width. */
function drawPremiumBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  opts: { fill: string; textColor: string; size?: number; align?: 'left' | 'center' | 'right' } ,
): number {
  const { fill, textColor, size = 13, align = 'left' } = opts;
  const label = text.toUpperCase();
  const spacing = 1.6;
  ctx.font = `700 ${size}px ${FONT}`;
  const textW = spacedTextWidth(ctx, label, spacing);
  const padX = size * 1.1;
  const padY = size * 0.62;
  const w = textW + padX * 2;
  const h = size + padY * 2;
  const bx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;

  drawRoundedPanel(ctx, bx, y, w, h, h / 2, { fill, shadow: false });
  ctx.save();
  ctx.fillStyle    = textColor;
  ctx.textBaseline = 'middle';
  ctx.textAlign    = 'left';
  drawSpaced(ctx, label, bx + padX, y + h / 2, spacing);
  ctx.restore();
  return w;
}

/** Thin horizontal hairline divider. */
function drawDivider(
  ctx: CanvasRenderingContext2D,
  x1: number, x2: number, y: number,
  color: string, alpha = DS.dividerAlpha, width = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth   = width;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Simple line-style icon (NO emoji). Stroke drawn centred on (cx, cy) within `s`.
 * Falls back to a filled dot for unknown names.
 */
function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number, cy: number, s: number, color: string,
): void {
  const r = s / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = Math.max(2, s * 0.10);
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  switch (name) {
    case 'check':
      ctx.moveTo(cx - r * 0.55, cy);
      ctx.lineTo(cx - r * 0.1, cy + r * 0.45);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.5);
      ctx.stroke();
      break;
    case 'star': {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const ax = cx + Math.cos(a) * r;
        const ay = cy + Math.sin(a) * r;
        const ia = a + Math.PI / 5;
        const ix = cx + Math.cos(ia) * r * 0.45;
        const iy = cy + Math.sin(ia) * r * 0.45;
        if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'shield':
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.8, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.8, cy + r * 0.2);
      ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 0.85, cx, cy + r);
      ctx.quadraticCurveTo(cx - r * 0.8, cy + r * 0.85, cx - r * 0.8, cy + r * 0.2);
      ctx.lineTo(cx - r * 0.8, cy - r * 0.55);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'truck':
      ctx.strokeRect(cx - r, cy - r * 0.4, r * 1.1, r * 0.8);
      ctx.moveTo(cx + r * 0.1, cy - r * 0.15);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.15);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.15);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.4);
      ctx.lineTo(cx - r, cy + r * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - r * 0.5, cy + r * 0.45, r * 0.18, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.55, cy + r * 0.45, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'refresh':
      ctx.arc(cx, cy, r * 0.7, Math.PI * 0.35, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.5, cy - r * 0.7);
      ctx.lineTo(cx + r * 0.66, cy - r * 0.18);
      ctx.lineTo(cx + r * 0.1, cy - r * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    case 'ruler':
      ctx.strokeRect(cx - r, cy - r * 0.4, r * 2, r * 0.8);
      for (let i = 1; i < 4; i++) {
        const tx = cx - r + (r * 2 * i) / 4;
        ctx.moveTo(tx, cy - r * 0.4);
        ctx.lineTo(tx, cy - r * 0.05);
      }
      ctx.stroke();
      break;
    case 'leaf':
      ctx.moveTo(cx - r * 0.6, cy + r * 0.6);
      ctx.quadraticCurveTo(cx - r * 0.7, cy - r * 0.7, cx + r * 0.6, cy - r * 0.6);
      ctx.quadraticCurveTo(cx + r * 0.7, cy + r * 0.7, cx - r * 0.6, cy + r * 0.6);
      ctx.moveTo(cx - r * 0.4, cy + r * 0.4);
      ctx.lineTo(cx + r * 0.4, cy - r * 0.4);
      ctx.stroke();
      break;
    case 'bolt':
      ctx.moveTo(cx + r * 0.15, cy - r);
      ctx.lineTo(cx - r * 0.45, cy + r * 0.1);
      ctx.lineTo(cx, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.15, cy + r);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.1);
      ctx.lineTo(cx, cy - r * 0.1);
      ctx.closePath();
      ctx.stroke();
      break;
    default: // dot
      ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}

/** Maps a Russian benefit/trust title to a line icon name. */
function iconForLabel(title: string): string {
  const t = (title || '').toLowerCase();
  if (/(достав|логист|курьер)/.test(t)) return 'truck';
  if (/(возврат|обмен|30 дн)/.test(t)) return 'refresh';
  if (/(гаран|серт|качеств|надёж|надеж|защит)/.test(t)) return 'shield';
  if (/(отзыв|рейтинг|оцен|звезд|⭐|4\.|5\.0)/.test(t)) return 'star';
  if (/(размер|посад|крой|длин|объ[её]м)/.test(t)) return 'ruler';
  if (/(хлоп|ткан|материал|натур|дыш|эко)/.test(t)) return 'leaf';
  if (/(быстр|скорост|мощн|энерг|заряд)/.test(t)) return 'bolt';
  return 'check';
}

// ── Theme / colour resolution ──────────────────────────────────────────────────

interface Theme {
  accent: string;       // high-contrast colour for badges/icons on light panels
  onAccent: string;     // text colour on the accent
  ink: string;          // primary text on light panels
  panelFill: string;    // white glass panel fill
}

/** Premium, non-acid accent that contrasts on a white/light panel. */
function resolveTheme(ctx: CanvasRenderingContext2D, side: 'left' | 'right' | 'bottom'): Theme {
  const { r, b, luminance: lum } = sampleBackground(ctx, CARD_W, CARD_H, side);
  const warm = r - b > 0;
  let accent: string;
  if (lum > 140) {
    accent = warm ? 'rgba(56,36,12,0.94)' : 'rgba(26,38,68,0.94)';
  } else {
    accent = warm ? 'rgba(150,98,22,0.96)' : 'rgba(34,72,152,0.96)';
  }
  return {
    accent,
    onAccent: '#FFFFFF',
    ink: DS.ink,
    panelFill: `rgba(255,255,255,${DS.panelAlpha})`,
  };
}

/** Full-bleed cover-fit product image. */
function drawProductFullBleed(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  const W = CARD_W, H = CARD_H;
  const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  ctx.drawImage(
    img,
    (W - img.naturalWidth * sc) / 2,
    (H - img.naturalHeight * sc) / 2,
    img.naturalWidth * sc,
    img.naturalHeight * sc,
  );
}

/** Adaptive bottom scrim for readable text over the lower part of the photo. */
function drawBottomScrim(ctx: CanvasRenderingContext2D, fromFrac: number, isLight: boolean): void {
  const W = CARD_W, H = CARD_H;
  const g = ctx.createLinearGradient(0, H * fromFrac, 0, H);
  if (isLight) {
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)'); // light bg → rely on dark text + shadow, keep airy
  } else {
    g.addColorStop(0, 'rgba(12,10,7,0)');
    g.addColorStop(1, 'rgba(12,10,7,0.55)');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ════════════════════════════════════════════════════════════════════════════
//  TEMPLATE: COVER — большое название, минимум текста, чистая обложка
// ════════════════════════════════════════════════════════════════════════════
function drawCoverTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  { overlayStyle }: TemplateCardOptions,
): void {
  const W = CARD_W;
  const M = DS.margin;
  drawProductFullBleed(ctx, img);

  const { luminance: lum } = sampleBackground(ctx, W, CARD_H, 'bottom');
  const isLight = (overlayStyle?.colorScheme ?? (lum > 140 ? 'light' : 'dark')) === 'light';
  drawBottomScrim(ctx, 0.62, isLight);

  const textColor = overlayStyle?.textColorHex ?? (isLight ? DS.ink : '#FFFFFF');
  const accent    = isLight ? 'rgba(25,19,7,0.92)' : 'rgba(255,255,255,0.92)';
  const onAccent  = isLight ? '#FFFFFF' : DS.ink;
  const shadowA   = isLight ? 0 : 0.5;

  // Tagline badge — top-left
  if (data.tagline?.trim()) {
    drawPremiumBadge(ctx, data.tagline, M, M, { fill: accent, textColor: onAccent, size: 13 });
  }

  // Headline + subtitle anchored near the bottom
  const titleStyle = overlayStyle?.titleStyle ?? 'modern-bold';
  const name = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const fit = fitText(ctx, name, {
    maxW: W - M * 2, maxLines: 2, startSize: overlayStyle?.titleSize ?? 84, minSize: 44, weight: '900',
  });
  const lineH = Math.ceil(fit.fontSize * 1.08);
  const subH  = data.productSubtitle?.trim() ? 34 : 0;
  const blockH = fit.lines.length * lineH + subH;
  let y = CARD_H - M - blockH;

  ctx.font = getTitleFont(titleStyle, fit.fontSize);
  y = drawReadableText(ctx, fit.lines, {
    x: M, y, font: getTitleFont(titleStyle, fit.fontSize),
    color: textColor, lineHeight: lineH, shadowAlpha: shadowA, align: 'left',
  });

  if (data.productSubtitle?.trim()) {
    y += 6;
    drawReadableText(ctx, [data.productSubtitle], {
      x: M, y, font: `400 22px ${FONT}`, color: textColor, alpha: 0.82,
      lineHeight: 28, shadowAlpha: shadowA, align: 'left',
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TEMPLATE: BENEFITS — товар слева, белая панель с 3 преимуществами справа
// ════════════════════════════════════════════════════════════════════════════
function drawBenefitsTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  { overlayStyle }: TemplateCardOptions,
): void {
  const W = CARD_W, H = CARD_H;
  drawProductFullBleed(ctx, img);
  const theme = resolveTheme(ctx, 'left');

  // Panel geometry — right column
  const PW = 430, PX = W - PW - DS.margin + 18, PY = DS.margin, PH = H - DS.margin * 2;
  drawRoundedPanel(ctx, PX, PY, PW, PH, DS.panelRadius, {
    fill: theme.panelFill, shadowAlpha: 0.22,
    strokeColor: '#FFFFFF', strokeAlpha: 0.6,
  });

  const INNER_X = PX + 30;
  const INNER_W = PW - 60;
  const INNER_R = PX + PW - 30;
  let y = PY + 38;

  // Tagline
  if (data.tagline?.trim()) {
    y = drawReadableText(ctx, [data.tagline.toUpperCase()], {
      x: INNER_X, y, font: `600 12px ${FONT}`, color: theme.ink, alpha: 0.42,
      lineHeight: 22, align: 'left', letterSpacing: 2.4,
    });
  }

  // Headline
  const titleStyle = overlayStyle?.titleStyle ?? 'modern-bold';
  const name = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const fit = fitText(ctx, name, {
    maxW: INNER_W, maxLines: 2, startSize: overlayStyle?.titleSize ?? 50, minSize: 30, weight: '900',
  });
  const lineH = Math.ceil(fit.fontSize * 1.12);
  y = drawReadableText(ctx, fit.lines, {
    x: INNER_X, y, font: getTitleFont(titleStyle, fit.fontSize),
    color: theme.ink, lineHeight: lineH, shadowAlpha: 0.06, align: 'left',
  });
  y += 6;

  // Subtitle
  if (data.productSubtitle?.trim()) {
    const sub = fitText(ctx, data.productSubtitle, { maxW: INNER_W, maxLines: 2, startSize: 18, minSize: 14, weight: '400' });
    y = drawReadableText(ctx, sub.lines, {
      x: INNER_X, y, font: `400 ${sub.fontSize}px ${FONT}`, color: theme.ink, alpha: DS.inkSoftAlpha,
      lineHeight: sub.fontSize + 6, align: 'left',
    });
  }
  y += 14;
  drawDivider(ctx, INNER_X, INNER_R, y, theme.ink);
  y += 22;

  // Benefit cards (max 3)
  const benefits = data.characteristics.slice(0, 3);
  if (benefits.length === 0) return;

  const cardX = PX + 16;
  const cardW = PW - 32;
  const bottom = PY + PH - 28;
  const slotH  = Math.floor((bottom - y) / benefits.length);
  const cardH  = slotH - DS.gap;

  for (let i = 0; i < benefits.length; i++) {
    const ch = benefits[i];
    const cy = y + i * slotH;
    drawRoundedPanel(ctx, cardX, cy, cardW, cardH, DS.cardRadius, {
      fill: 'rgba(247,243,236,0.85)', shadowAlpha: 0.07,
    });

    const badgeR  = 23;
    const badgeCX = cardX + 22 + badgeR;
    const textX   = badgeCX + badgeR + 16;
    const textW   = cardX + cardW - 18 - textX;

    // Measure to vertically centre
    const titleFit = fitText(ctx, (ch.title || '').toUpperCase(), { maxW: textW, maxLines: 2, startSize: 28, minSize: 19, weight: '800' });
    const titleLH  = titleFit.fontSize + 4;
    const descFit  = ch.value?.trim()
      ? fitText(ctx, ch.value, { maxW: textW, maxLines: 2, startSize: 21, minSize: 15, weight: '400' })
      : { fontSize: 0, lines: [] as string[] };
    const descLH   = descFit.fontSize + 4;
    const blockH   = titleFit.lines.length * titleLH + (descFit.lines.length ? 6 + descFit.lines.length * descLH : 0);
    const top      = cy + Math.max(16, Math.floor((cardH - blockH) / 2));

    // Numbered premium badge
    const badgeCY = top + Math.floor(blockH / 2);
    ctx.save();
    ctx.shadowColor = 'rgba(20,16,8,0.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = theme.accent; ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.font = `800 17px ${FONT}`; ctx.fillStyle = theme.onAccent;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), badgeCX, badgeCY + 1);
    ctx.restore();

    // Title + description
    let ty = drawReadableText(ctx, titleFit.lines, {
      x: textX, y: top, font: `800 ${titleFit.fontSize}px ${FONT}`, color: theme.accent,
      lineHeight: titleLH, align: 'left',
    });
    if (descFit.lines.length) {
      ty += 6;
      drawReadableText(ctx, descFit.lines, {
        x: textX, y: ty, font: `400 ${descFit.fontSize}px ${FONT}`, color: theme.ink, alpha: 0.82,
        lineHeight: descLH, align: 'left',
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TEMPLATE: DETAILS — акцент на материал/детали, 2 callout-карточки снизу
// ════════════════════════════════════════════════════════════════════════════
function drawDetailsTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  { overlayStyle }: TemplateCardOptions,
): void {
  const W = CARD_W, H = CARD_H, M = DS.margin;
  drawProductFullBleed(ctx, img);
  const { luminance: lum } = sampleBackground(ctx, W, H, 'bottom');
  const isLight = lum > 140;
  drawBottomScrim(ctx, 0.55, isLight);
  const theme = resolveTheme(ctx, 'bottom');

  // Header (top-left): tagline + product name — kept clear of the product centre
  const textColor = isLight ? DS.ink : '#FFFFFF';
  const shadowA   = isLight ? 0.05 : 0.5;
  let hy = M;
  if (data.tagline?.trim()) {
    hy = drawReadableText(ctx, [data.tagline.toUpperCase()], {
      x: M, y: hy, font: `600 12px ${FONT}`, color: textColor, alpha: 0.7,
      lineHeight: 22, align: 'left', letterSpacing: 2.4, shadowAlpha: shadowA,
    });
    hy += 2;
  }
  const titleStyle = overlayStyle?.titleStyle ?? 'modern-bold';
  const name = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const fit  = fitText(ctx, name, { maxW: W * 0.62, maxLines: 2, startSize: overlayStyle?.titleSize ?? 52, minSize: 32, weight: '900' });
  drawReadableText(ctx, fit.lines, {
    x: M, y: hy, font: getTitleFont(titleStyle, fit.fontSize),
    color: textColor, lineHeight: Math.ceil(fit.fontSize * 1.1), align: 'left', shadowAlpha: shadowA,
  });

  // Bottom callout cards (max 2) — material / construction details
  const details = data.characteristics.slice(0, 2);
  if (details.length === 0) return;

  const cardW = (W - M * 2 - DS.gap) / details.length;
  const cardH = 150;
  const cy = H - M - cardH;

  details.forEach((ch, i) => {
    const cx = M + i * (cardW + DS.gap);
    drawRoundedPanel(ctx, cx, cy, cardW, cardH, DS.cardRadius, {
      fill: theme.panelFill, shadowAlpha: 0.2, strokeColor: '#FFFFFF', strokeAlpha: 0.5,
    });

    const padX = 24;
    const iconS = 30;
    const iconCX = cx + padX + iconS / 2;
    const iconCY = cy + 30 + iconS / 2;
    drawIcon(ctx, iconForLabel(ch.title), iconCX, iconCY, iconS, theme.accent);

    let ty = cy + 30 + iconS + 14;
    const titleFit = fitText(ctx, (ch.title || '').toUpperCase(), { maxW: cardW - padX * 2, maxLines: 1, startSize: 17, minSize: 13, weight: '800' });
    ty = drawReadableText(ctx, titleFit.lines, {
      x: cx + padX, y: ty, font: `800 ${titleFit.fontSize}px ${FONT}`, color: theme.accent,
      lineHeight: titleFit.fontSize + 4, align: 'left', letterSpacing: 1.0,
    });
    if (ch.value?.trim()) {
      ty += 4;
      const vf = fitText(ctx, ch.value, { maxW: cardW - padX * 2, maxLines: 2, startSize: 19, minSize: 14, weight: '400' });
      drawReadableText(ctx, vf.lines, {
        x: cx + padX, y: ty, font: `400 ${vf.fontSize}px ${FONT}`, color: theme.ink, alpha: 0.84,
        lineHeight: vf.fontSize + 5, align: 'left',
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  TEMPLATE: LIFESTYLE — минимум текста, эмоциональный слоган, маленький тег
// ════════════════════════════════════════════════════════════════════════════
function drawLifestyleTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  { overlayStyle }: TemplateCardOptions,
): void {
  const W = CARD_W, H = CARD_H, M = DS.margin;
  drawProductFullBleed(ctx, img);
  const { luminance: lum } = sampleBackground(ctx, W, H, 'bottom');
  const isLight = lum > 140;
  drawBottomScrim(ctx, 0.58, isLight);

  const textColor = overlayStyle?.textColorHex ?? (isLight ? DS.ink : '#FFFFFF');
  const shadowA   = isLight ? 0.06 : 0.55;

  // Emotional slogan — bottom-left, serif for an editorial premium feel
  const slogan = data.productName?.trim() || data.tagline?.trim() || '';
  if (slogan) {
    const fit = fitText(ctx, slogan, { maxW: W * 0.74, maxLines: 3, startSize: 56, minSize: 30, weight: 'italic 700', serif: true });
    const lineH = Math.ceil(fit.fontSize * 1.14);
    const tagH = data.tagline?.trim() ? 40 : 0;
    let y = H - M - fit.lines.length * lineH - tagH;
    y = drawReadableText(ctx, fit.lines, {
      x: M, y, font: `italic 700 ${fit.fontSize}px Georgia, 'Times New Roman', serif`,
      color: textColor, lineHeight: lineH, align: 'left', shadowAlpha: shadowA,
    });
    // Small tag pill below the slogan
    if (data.tagline?.trim()) {
      const accent = isLight ? 'rgba(25,19,7,0.9)' : 'rgba(255,255,255,0.92)';
      const onAcc  = isLight ? '#FFFFFF' : DS.ink;
      drawPremiumBadge(ctx, data.tagline, M, y + 10, { fill: accent, textColor: onAcc, size: 12 });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TEMPLATE: TRUST — аккуратные карточки доверия (без фейковых отзывов)
// ════════════════════════════════════════════════════════════════════════════
function drawTrustTemplate(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  { overlayStyle }: TemplateCardOptions,
): void {
  const W = CARD_W, H = CARD_H, M = DS.margin;
  drawProductFullBleed(ctx, img);
  const { luminance: lum } = sampleBackground(ctx, W, H, 'bottom');
  const isLight = lum > 140;
  drawBottomScrim(ctx, 0.5, isLight);
  const theme = resolveTheme(ctx, 'bottom');

  // Header top-centre
  const headColor = isLight ? DS.ink : '#FFFFFF';
  const shadowA   = isLight ? 0.05 : 0.5;
  const titleStyle = overlayStyle?.titleStyle ?? 'modern-bold';
  const name = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const fit = fitText(ctx, name, { maxW: W - M * 2, maxLines: 2, startSize: overlayStyle?.titleSize ?? 56, minSize: 34, weight: '900' });
  drawReadableText(ctx, fit.lines, {
    x: W / 2, y: M, font: getTitleFont(titleStyle, fit.fontSize),
    color: headColor, lineHeight: Math.ceil(fit.fontSize * 1.1), align: 'center', shadowAlpha: shadowA,
  });

  // Trust cards — only real data; up to 4 in a 2-column grid at the bottom.
  const blocks = data.characteristics.slice(0, 4);
  if (blocks.length === 0) return;

  const cols = blocks.length >= 2 ? 2 : 1;
  const rows = Math.ceil(blocks.length / cols);
  const gridGap = DS.gap;
  const cardW = (W - M * 2 - gridGap * (cols - 1)) / cols;
  const cardH = 132;
  const gridH = rows * cardH + (rows - 1) * gridGap;
  const gridTop = H - M - gridH;

  blocks.forEach((ch, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = M + col * (cardW + gridGap);
    const cy = gridTop + row * (cardH + gridGap);
    drawRoundedPanel(ctx, cx, cy, cardW, cardH, DS.cardRadius, {
      fill: theme.panelFill, shadowAlpha: 0.2, strokeColor: '#FFFFFF', strokeAlpha: 0.5,
    });

    const padX = 22;
    const iconS = 30;
    const iconCX = cx + padX + iconS / 2;
    const iconCY = cy + 26 + iconS / 2;
    drawIcon(ctx, iconForLabel(ch.title), iconCX, iconCY, iconS, theme.accent);

    let ty = cy + 26 + iconS + 12;
    const titleFit = fitText(ctx, ch.title || '', { maxW: cardW - padX * 2, maxLines: 1, startSize: 17, minSize: 13, weight: '800' });
    ty = drawReadableText(ctx, titleFit.lines, {
      x: cx + padX, y: ty, font: `800 ${titleFit.fontSize}px ${FONT}`, color: theme.accent,
      lineHeight: titleFit.fontSize + 3, align: 'left',
    });
    if (ch.value?.trim()) {
      ty += 3;
      const vf = fitText(ctx, ch.value, { maxW: cardW - padX * 2, maxLines: 2, startSize: 18, minSize: 13, weight: '400' });
      drawReadableText(ctx, vf.lines, {
        x: cx + padX, y: ty, font: `400 ${vf.fontSize}px ${FONT}`, color: theme.ink, alpha: 0.84,
        lineHeight: vf.fontSize + 4, align: 'left',
      });
    }
  });
}
