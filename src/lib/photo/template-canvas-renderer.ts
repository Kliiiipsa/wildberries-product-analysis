// Template canvas renderer — premium, COMPOSITION-AWARE WB infographic templates.
//
// Architecture (unchanged): FLUX draws a clean, text-free base image.
// Canvas owns ALL text, cards, panels, dividers, icons, grid, spacing and style.
//
// Key idea: the layout is NOT fixed. A layout-router reads compositionData
// (subjectZone / primaryTextZone / freeZones / shootType) and decides WHERE text
// goes so it never covers the model/product. A local heuristic also picks the
// template when the brief pipeline didn't give a confident one (so we don't always
// land on `benefits`).
//
// Supported templateId values: cover · benefits · details · lifestyle · trust.
// Any draw error → returns false → caller falls back to legacy drawCard.

import type {
  InfographicData, CompositionData, OverlayStyleData, InfographicTemplateType,
} from '@/types/photo-pipeline';
import { CARD_W, CARD_H, getTitleFont } from '@/lib/photo/design-system';
import { sampleBackground } from '@/lib/photo/layout-engine';
import { wrapText, drawSpaced, spacedTextWidth } from '@/lib/photo/canvas-renderer';

export interface TemplateCardOptions {
  templateId: string;
  overlayStyle?: OverlayStyleData | null;
  composition?: CompositionData | null;
}

const FONT = 'Arial, Helvetica, sans-serif';
const DEV = process.env.NODE_ENV === 'development';

// ── Premium design tokens ──────────────────────────────────────────────────────
const DS = {
  margin: 48,
  panelRadius: 24,
  cardRadius: 16,
  gap: 14,
  panelAlpha: 0.93,
  ink: '#191307',
  inkSoftAlpha: 0.56,
  dividerAlpha: 0.12,
  // Hard limits so text never dominates the product:
  sidePanelW: 336,        // ≈ 37% of 900 — narrow column, only over genuine free space
  bandMaxH: 360,          // ≤ 30% of 1200 — bottom/top band height cap
};

type Placement = 'left' | 'right' | 'top' | 'bottom';
type TID = InfographicTemplateType;

interface RenderPlan {
  templateId: TID;
  placement: Placement;
  sidePanel: boolean;     // true → vertical side column; false → horizontal band
  reason: string;
}

// ════════════════════════════════════════════════════════════════════════════
//  PUBLIC ENTRY
// ════════════════════════════════════════════════════════════════════════════
export function drawTemplateCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  data: InfographicData,
  options: TemplateCardOptions,
): boolean {
  try {
    const comp = options.composition ?? null;
    const plan = resolveRenderPlan(options.templateId, comp, data);

    if (DEV) {
      console.log(
        `[template-renderer] hint=${options.templateId} → templateId=${plan.templateId} ` +
        `placement=${plan.placement} sidePanel=${plan.sidePanel} ` +
        `primaryTextZone=${comp?.primaryTextZone ?? 'none'} subjectZone=${comp?.subjectZone ?? 'none'} ` +
        `shootType=${comp?.shootType ?? 'none'} reason="${plan.reason}"`,
      );
    }

    drawProductFullBleed(ctx, img);
    const overlay = options.overlayStyle ?? null;

    switch (plan.templateId) {
      case 'cover':     drawCoverTemplate(ctx, data, plan, overlay);     break;
      case 'lifestyle': drawLifestyleTemplate(ctx, data, plan, overlay); break;
      case 'benefits':
      case 'details':
      case 'trust':     drawInfoTemplate(ctx, data, plan, overlay);      break;
      default:          return false;
    }
    return true;
  } catch (e) {
    if (DEV) console.warn('[template-renderer] draw error → legacy fallback', e);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  LAYOUT ROUTER + TEMPLATE HEURISTIC
// ════════════════════════════════════════════════════════════════════════════

const VALID_TIDS: Set<string> = new Set(['cover', 'benefits', 'details', 'lifestyle', 'trust']);

/**
 * Picks the effective template (heuristic — the pipeline hint is only a weak signal,
 * because the brief is biased toward `benefits`) AND the placement (so the panel
 * never covers the subject).
 */
export function resolveRenderPlan(
  hint: string | null | undefined,
  comp: CompositionData | null,
  data: InfographicData,
): RenderPlan {
  const chars = data.characteristics ?? [];
  const text = chars.map(c => `${c.title} ${c.value}`).join(' ').toLowerCase();
  const isMaterial = /(ткан|хлоп|лён|лен|шерст|материал|состав|крой|шов|плотн|подклад|трикотаж|вязк)/.test(text);
  const isTrust    = /(гаран|серт|оригинал|отзыв|рейтинг|возврат|обмен|достав|поддержк)/.test(text);

  const shoot   = comp?.shootType;                 // full-body | half-body | flat-lay | product-only
  const subject = comp?.subjectZone;               // left | right | center | full
  const isLifestyleScene = shoot === 'full-body' && (subject === 'center' || subject === 'full');
  const isFlat = shoot === 'flat-lay' || shoot === 'product-only';

  // ── 1. Template selection ────────────────────────────────────────────────
  let templateId: TID;
  let reason: string;

  if (isTrust) {
    templateId = 'trust';
    reason = 'данные про гарантию/отзывы/доставку';
  } else if (isFlat) {
    templateId = isMaterial ? 'details' : (chars.length >= 3 ? 'benefits' : 'cover');
    reason = `flat-lay/product-only → ${templateId}`;
  } else if (isMaterial && chars.length <= 3) {
    templateId = 'details';
    reason = 'характеристики про ткань/крой → details';
  } else if (isLifestyleScene) {
    // Full-body model filling the frame → a big card column would cover the silhouette.
    // Prefer cover (clean) or lifestyle; benefits only as a slim bottom band.
    templateId = chars.length >= 3 ? 'benefits' : (chars.length === 0 ? 'lifestyle' : 'cover');
    reason = 'ростовое фото, модель в центре → не закрываем силуэт';
  } else if (chars.length >= 3) {
    templateId = 'benefits';
    reason = '≥3 характеристик → benefits';
  } else if (chars.length === 0) {
    templateId = 'cover';
    reason = 'мало данных → cover';
  } else if (hint && VALID_TIDS.has(hint)) {
    templateId = hint as TID;
    reason = `подсказка pipeline "${hint}"`;
  } else {
    templateId = 'cover';
    reason = 'fallback → cover';
  }

  // ── 2. Placement (where text goes) ──────────────────────────────────────
  const placement = resolvePlacement(comp);

  // ── 3. Side panel allowed? Only over a genuinely free left/right zone and
  //       NOT when the subject fills the centre/whole frame. ───────────────
  const free = comp?.freeZones ?? [];
  const sideHasSpace =
    (placement === 'left'  && (subject === 'right' || free.includes('left'))) ||
    (placement === 'right' && (subject === 'left'  || free.includes('right')));
  const subjectBlocks = subject === 'center' || subject === 'full';
  const sidePanel =
    (placement === 'left' || placement === 'right') && sideHasSpace && !subjectBlocks;

  // cover & lifestyle never use card panels — force a band edge (vertical)
  const isTextOnly = templateId === 'cover' || templateId === 'lifestyle';
  const finalPlacement: Placement = isTextOnly
    ? (placement === 'top' ? 'top' : 'bottom')
    : (sidePanel ? placement : (placement === 'top' ? 'top' : 'bottom'));

  return { templateId, placement: finalPlacement, sidePanel: !isTextOnly && sidePanel, reason };
}

/** Picks the text edge from composition; defaults to bottom when uncertain. */
function resolvePlacement(comp: CompositionData | null): Placement {
  const ptz = comp?.primaryTextZone;
  if (ptz === 'left' || ptz === 'right' || ptz === 'top' || ptz === 'bottom') return ptz;
  const subject = comp?.subjectZone;
  if (subject === 'left')  return 'right';
  if (subject === 'right') return 'left';
  const free = comp?.freeZones ?? [];
  if (free.includes('top'))   return 'top';
  if (free.includes('left'))  return 'left';
  if (free.includes('right')) return 'right';
  return 'bottom';
}

// ════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════════════

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
  fill?: string; alpha?: number; shadow?: boolean; shadowAlpha?: number;
  strokeColor?: string; strokeAlpha?: number; strokeWidth?: number;
}
function drawRoundedPanel(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, opts: PanelOpts = {},
): void {
  const {
    fill = `rgba(255,255,255,${DS.panelAlpha})`, alpha = 1, shadow = true, shadowAlpha = 0.18,
    strokeColor, strokeAlpha = 0.5, strokeWidth = 1,
  } = opts;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = `rgba(20,16,8,${shadowAlpha})`; ctx.shadowBlur = 30; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 10;
  }
  ctx.globalAlpha = alpha; ctx.fillStyle = fill;
  roundRectPath(ctx, x, y, w, h, r); ctx.fill();
  ctx.restore();
  if (strokeColor) {
    ctx.save();
    ctx.globalAlpha = strokeAlpha; ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth;
    roundRectPath(ctx, x, y, w, h, r); ctx.stroke();
    ctx.restore();
  }
}

/** Wraps text and shrinks the font until it fits maxW within maxLines. */
function fitText(
  ctx: CanvasRenderingContext2D, text: string,
  opts: { maxW: number; maxLines: number; startSize: number; minSize: number; weight: string; step?: number; serif?: boolean },
): { fontSize: number; lines: string[] } {
  const { maxW, maxLines, startSize, minSize, weight, step = 2, serif = false } = opts;
  const family = serif ? "Georgia, 'Times New Roman', serif" : FONT;
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (wrapText(ctx, text, maxW, 999).length <= maxLines) break;
    size -= step;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  return { fontSize: size, lines: wrapText(ctx, text, maxW, maxLines) };
}

interface ReadableTextOpts {
  x: number; y: number; font: string; color: string; alpha?: number;
  align?: CanvasTextAlign; lineHeight: number; shadowAlpha?: number; letterSpacing?: number;
}
function drawReadableText(ctx: CanvasRenderingContext2D, lines: string[], opts: ReadableTextOpts): number {
  const { x, font, color, alpha = 1, align = 'left', lineHeight, shadowAlpha = 0, letterSpacing = 0 } = opts;
  let y = opts.y;
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  for (const line of lines) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (shadowAlpha > 0) { ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2; }
    if (letterSpacing > 0 && align === 'left') drawSpaced(ctx, line, x, y, letterSpacing);
    else if (letterSpacing > 0 && align === 'center') drawSpaced(ctx, line, x - spacedTextWidth(ctx, line, letterSpacing) / 2, y, letterSpacing);
    else ctx.fillText(line, x, y);
    ctx.restore();
    y += lineHeight;
  }
  return y;
}

function drawPremiumBadge(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  opts: { fill: string; textColor: string; size?: number; align?: 'left' | 'center' | 'right' },
): number {
  const { fill, textColor, size = 13, align = 'left' } = opts;
  const label = text.toUpperCase(); const spacing = 1.6;
  ctx.font = `700 ${size}px ${FONT}`;
  const textW = spacedTextWidth(ctx, label, spacing);
  const padX = size * 1.1, padY = size * 0.62;
  const w = textW + padX * 2, h = size + padY * 2;
  const bx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  drawRoundedPanel(ctx, bx, y, w, h, h / 2, { fill, shadow: false });
  ctx.save();
  ctx.fillStyle = textColor; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  drawSpaced(ctx, label, bx + padX, y + h / 2, spacing);
  ctx.restore();
  return w;
}

function drawDivider(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string, alpha = DS.dividerAlpha, width = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  ctx.restore();
}

/** Line-style icon (NO emoji). Falls back to a filled dot. */
function drawIcon(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, s: number, color: string): void {
  const r = s / 2;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (name) {
    case 'check':
      ctx.moveTo(cx - r * 0.55, cy); ctx.lineTo(cx - r * 0.1, cy + r * 0.45); ctx.lineTo(cx + r * 0.6, cy - r * 0.5); ctx.stroke(); break;
    case 'star': {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const ax = cx + Math.cos(a) * r, ay = cy + Math.sin(a) * r;
        const ia = a + Math.PI / 5, ix = cx + Math.cos(ia) * r * 0.45, iy = cy + Math.sin(ia) * r * 0.45;
        if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath(); ctx.fill(); break;
    }
    case 'shield':
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.8, cy - r * 0.55); ctx.lineTo(cx + r * 0.8, cy + r * 0.2);
      ctx.quadraticCurveTo(cx + r * 0.8, cy + r * 0.85, cx, cy + r);
      ctx.quadraticCurveTo(cx - r * 0.8, cy + r * 0.85, cx - r * 0.8, cy + r * 0.2);
      ctx.lineTo(cx - r * 0.8, cy - r * 0.55); ctx.closePath(); ctx.stroke(); break;
    case 'truck':
      ctx.strokeRect(cx - r, cy - r * 0.4, r * 1.1, r * 0.8);
      ctx.moveTo(cx + r * 0.1, cy - r * 0.15); ctx.lineTo(cx + r * 0.6, cy - r * 0.15);
      ctx.lineTo(cx + r * 0.9, cy + r * 0.15); ctx.lineTo(cx + r * 0.9, cy + r * 0.4); ctx.lineTo(cx - r, cy + r * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - r * 0.5, cy + r * 0.45, r * 0.18, 0, Math.PI * 2); ctx.arc(cx + r * 0.55, cy + r * 0.45, r * 0.18, 0, Math.PI * 2); ctx.fill(); break;
    case 'refresh':
      ctx.arc(cx, cy, r * 0.7, Math.PI * 0.35, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + r * 0.5, cy - r * 0.7); ctx.lineTo(cx + r * 0.66, cy - r * 0.18); ctx.lineTo(cx + r * 0.1, cy - r * 0.3); ctx.closePath(); ctx.fill(); break;
    case 'ruler':
      ctx.strokeRect(cx - r, cy - r * 0.4, r * 2, r * 0.8);
      for (let i = 1; i < 4; i++) { const tx = cx - r + (r * 2 * i) / 4; ctx.moveTo(tx, cy - r * 0.4); ctx.lineTo(tx, cy - r * 0.05); }
      ctx.stroke(); break;
    case 'leaf':
      ctx.moveTo(cx - r * 0.6, cy + r * 0.6); ctx.quadraticCurveTo(cx - r * 0.7, cy - r * 0.7, cx + r * 0.6, cy - r * 0.6);
      ctx.quadraticCurveTo(cx + r * 0.7, cy + r * 0.7, cx - r * 0.6, cy + r * 0.6);
      ctx.moveTo(cx - r * 0.4, cy + r * 0.4); ctx.lineTo(cx + r * 0.4, cy - r * 0.4); ctx.stroke(); break;
    case 'bolt':
      ctx.moveTo(cx + r * 0.15, cy - r); ctx.lineTo(cx - r * 0.45, cy + r * 0.1); ctx.lineTo(cx, cy + r * 0.1);
      ctx.lineTo(cx - r * 0.15, cy + r); ctx.lineTo(cx + r * 0.5, cy - r * 0.1); ctx.lineTo(cx, cy - r * 0.1); ctx.closePath(); ctx.stroke(); break;
    default:
      ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function iconForLabel(title: string): string {
  const t = (title || '').toLowerCase();
  if (/(достав|логист|курьер)/.test(t)) return 'truck';
  if (/(возврат|обмен|30 дн)/.test(t)) return 'refresh';
  if (/(гаран|серт|качеств|надёж|надеж|защит|оригинал)/.test(t)) return 'shield';
  if (/(отзыв|рейтинг|оцен|звезд|4\.|5\.0)/.test(t)) return 'star';
  if (/(размер|посад|крой|длин|объ[её]м)/.test(t)) return 'ruler';
  if (/(хлоп|ткан|материал|натур|дыш|эко|лён|лен)/.test(t)) return 'leaf';
  if (/(быстр|скорост|мощн|энерг|заряд)/.test(t)) return 'bolt';
  return 'check';
}

interface Theme { accent: string; onAccent: string; ink: string; panelFill: string; }
function resolveTheme(ctx: CanvasRenderingContext2D, side: 'left' | 'right' | 'bottom' | 'top'): Theme {
  const sampleSide = side === 'top' ? 'top' : side === 'bottom' ? 'bottom' : side;
  const { r, b, luminance: lum } = sampleBackground(ctx, CARD_W, CARD_H, sampleSide as 'left' | 'right' | 'top' | 'bottom');
  const warm = r - b > 0;
  const accent = lum > 140
    ? (warm ? 'rgba(56,36,12,0.94)' : 'rgba(26,38,68,0.94)')
    : (warm ? 'rgba(150,98,22,0.96)' : 'rgba(34,72,152,0.96)');
  return { accent, onAccent: '#FFFFFF', ink: DS.ink, panelFill: `rgba(255,255,255,${DS.panelAlpha})` };
}

function drawProductFullBleed(ctx: CanvasRenderingContext2D, img: HTMLImageElement): void {
  const W = CARD_W, H = CARD_H;
  const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  ctx.drawImage(img, (W - img.naturalWidth * sc) / 2, (H - img.naturalHeight * sc) / 2, img.naturalWidth * sc, img.naturalHeight * sc);
}

/** Adaptive scrim at the given edge for readable text over the photo. */
function drawEdgeScrim(ctx: CanvasRenderingContext2D, edge: 'top' | 'bottom', fromFrac: number, isLight: boolean): void {
  const W = CARD_W, H = CARD_H;
  let g: CanvasGradient;
  if (edge === 'bottom') {
    g = ctx.createLinearGradient(0, H * fromFrac, 0, H);
    g.addColorStop(0, isLight ? 'rgba(255,255,255,0)' : 'rgba(12,10,7,0)');
    g.addColorStop(1, isLight ? 'rgba(255,255,255,0)' : 'rgba(12,10,7,0.55)');
  } else {
    g = ctx.createLinearGradient(0, 0, 0, H * fromFrac);
    g.addColorStop(0, isLight ? 'rgba(255,255,255,0)' : 'rgba(12,10,7,0.5)');
    g.addColorStop(1, isLight ? 'rgba(255,255,255,0)' : 'rgba(12,10,7,0)');
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ════════════════════════════════════════════════════════════════════════════
//  TEMPLATE: COVER — крупный заголовок, минимум текста, без карточек
// ════════════════════════════════════════════════════════════════════════════
function drawCoverTemplate(
  ctx: CanvasRenderingContext2D, data: InfographicData, plan: RenderPlan, overlay: OverlayStyleData | null,
): void {
  const W = CARD_W, H = CARD_H, M = DS.margin;
  const edge = plan.placement === 'top' ? 'top' : 'bottom';
  const { luminance: lum } = sampleBackground(ctx, W, H, edge);
  const isLight = (overlay?.colorScheme ?? (lum > 140 ? 'light' : 'dark')) === 'light';
  drawEdgeScrim(ctx, edge, edge === 'bottom' ? 0.6 : 0.4, isLight);

  const textColor = overlay?.textColorHex ?? (isLight ? DS.ink : '#FFFFFF');
  const accent    = isLight ? 'rgba(25,19,7,0.92)' : 'rgba(255,255,255,0.92)';
  const onAccent  = isLight ? '#FFFFFF' : DS.ink;
  const shadowA   = isLight ? 0 : 0.5;
  const titleStyle = overlay?.titleStyle ?? 'modern-bold';

  const name = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const fit = fitText(ctx, name, { maxW: W - M * 2, maxLines: 2, startSize: overlay?.titleSize ?? 86, minSize: 46, weight: '900' });
  const lineH = Math.ceil(fit.fontSize * 1.08);
  const subH  = data.productSubtitle?.trim() ? 34 : 0;
  const badgeH = data.tagline?.trim() ? 38 : 0;
  const blockH = badgeH + fit.lines.length * lineH + subH;

  let y = edge === 'bottom' ? H - M - blockH : M;

  if (data.tagline?.trim()) {
    drawPremiumBadge(ctx, data.tagline, M, y, { fill: accent, textColor: onAccent, size: 13 });
    y += badgeH;
  }
  y = drawReadableText(ctx, fit.lines, {
    x: M, y, font: getTitleFont(titleStyle, fit.fontSize), color: textColor, lineHeight: lineH, shadowAlpha: shadowA,
  });
  if (data.productSubtitle?.trim()) {
    y += 6;
    drawReadableText(ctx, [data.productSubtitle], { x: M, y, font: `400 22px ${FONT}`, color: textColor, alpha: 0.82, lineHeight: 28, shadowAlpha: shadowA });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TEMPLATE: LIFESTYLE — эмоциональный слоган + маленький тег, без карточек
// ════════════════════════════════════════════════════════════════════════════
function drawLifestyleTemplate(
  ctx: CanvasRenderingContext2D, data: InfographicData, plan: RenderPlan, overlay: OverlayStyleData | null,
): void {
  const W = CARD_W, H = CARD_H, M = DS.margin;
  const edge = plan.placement === 'top' ? 'top' : 'bottom';
  const { luminance: lum } = sampleBackground(ctx, W, H, edge);
  const isLight = lum > 140;
  drawEdgeScrim(ctx, edge, edge === 'bottom' ? 0.58 : 0.42, isLight);

  const textColor = overlay?.textColorHex ?? (isLight ? DS.ink : '#FFFFFF');
  const shadowA   = isLight ? 0.06 : 0.55;

  const slogan = data.productName?.trim() || data.tagline?.trim() || '';
  if (!slogan) return;
  const fit = fitText(ctx, slogan, { maxW: W * 0.74, maxLines: 3, startSize: 56, minSize: 30, weight: 'italic 700', serif: true });
  const lineH = Math.ceil(fit.fontSize * 1.14);
  const tagH = data.tagline?.trim() && data.tagline !== data.productName ? 40 : 0;
  const blockH = fit.lines.length * lineH + tagH;
  let y = edge === 'bottom' ? H - M - blockH : M;

  y = drawReadableText(ctx, fit.lines, {
    x: M, y, font: `italic 700 ${fit.fontSize}px Georgia, 'Times New Roman', serif`,
    color: textColor, lineHeight: lineH, shadowAlpha: shadowA,
  });
  if (tagH) {
    const accent = isLight ? 'rgba(25,19,7,0.9)' : 'rgba(255,255,255,0.92)';
    const onAcc  = isLight ? '#FFFFFF' : DS.ink;
    drawPremiumBadge(ctx, data.tagline, M, y + 10, { fill: accent, textColor: onAcc, size: 12 });
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  TEMPLATE: BENEFITS / DETAILS / TRUST — card content, side panel OR bottom band
// ════════════════════════════════════════════════════════════════════════════
function drawInfoTemplate(
  ctx: CanvasRenderingContext2D, data: InfographicData, plan: RenderPlan, overlay: OverlayStyleData | null,
): void {
  // How many cards per template
  const maxCards = plan.templateId === 'details' ? 2 : plan.templateId === 'trust' ? 4 : 3;
  const items = data.characteristics.slice(0, maxCards);
  const useIcons = plan.templateId !== 'benefits'; // benefits → numbered badges; details/trust → icons

  if (plan.sidePanel) drawSidePanel(ctx, data, items, plan, overlay, useIcons);
  else drawBottomBand(ctx, data, items, plan, overlay, useIcons);
}

/** Narrow vertical panel on the free side. Cards stacked. */
function drawSidePanel(
  ctx: CanvasRenderingContext2D, data: InfographicData,
  items: InfographicData['characteristics'], plan: RenderPlan, overlay: OverlayStyleData | null, useIcons: boolean,
): void {
  const W = CARD_W, H = CARD_H, M = DS.margin;
  const side = plan.placement === 'left' ? 'left' : 'right';
  const theme = resolveTheme(ctx, side);

  const PW = DS.sidePanelW;
  const PX = side === 'left' ? M : W - PW - M;
  const PY = M, PH = H - M * 2;
  drawRoundedPanel(ctx, PX, PY, PW, PH, DS.panelRadius, { fill: theme.panelFill, shadowAlpha: 0.22, strokeColor: '#FFFFFF', strokeAlpha: 0.6 });

  const innerX = PX + 28, innerW = PW - 56, innerR = PX + PW - 28;
  let y = PY + 36;
  y = drawHeader(ctx, data, theme, { x: innerX, y, w: innerW, align: 'left', titleStyle: overlay?.titleStyle ?? 'modern-bold', titleSize: overlay?.titleSize });
  drawDivider(ctx, innerX, innerR, y, theme.ink); y += 22;

  if (items.length === 0) return;
  const cardX = PX + 14, cardW = PW - 28, bottom = PY + PH - 26;
  const slotH = Math.floor((bottom - y) / items.length);
  const cardH = slotH - DS.gap;

  items.forEach((ch, i) => {
    const cy = y + i * slotH;
    drawRoundedPanel(ctx, cardX, cy, cardW, cardH, DS.cardRadius, { fill: 'rgba(247,243,236,0.85)', shadowAlpha: 0.07 });
    drawCardContent(ctx, ch, i, theme, { x: cardX, y: cy, w: cardW, h: cardH, useIcons });
  });
}

/** Translucent floating band at top/bottom with a horizontal row of cards. */
function drawBottomBand(
  ctx: CanvasRenderingContext2D, data: InfographicData,
  items: InfographicData['characteristics'], plan: RenderPlan, overlay: OverlayStyleData | null, useIcons: boolean,
): void {
  const W = CARD_W, H = CARD_H, M = DS.margin;
  const edge = plan.placement === 'top' ? 'top' : 'bottom';
  const theme = resolveTheme(ctx, edge);

  const n = Math.max(1, items.length);
  const bandW = W - M * 2;
  const headerH = 96;
  const cardRowH = items.length ? 132 : 0;
  const bandH = Math.min(DS.bandMaxH, 32 + headerH + (cardRowH ? cardRowH + 16 : 0));
  const bandY = edge === 'bottom' ? H - M - bandH : M;
  const bandX = M;

  drawRoundedPanel(ctx, bandX, bandY, bandW, bandH, DS.panelRadius, { fill: theme.panelFill, shadowAlpha: 0.22, strokeColor: '#FFFFFF', strokeAlpha: 0.55 });

  const innerX = bandX + 30, innerW = bandW - 60;
  let y = bandY + 26;
  y = drawHeader(ctx, data, theme, { x: innerX, y, w: innerW * 0.9, align: 'left', titleStyle: overlay?.titleStyle ?? 'modern-bold', titleSize: Math.min(overlay?.titleSize ?? 46, 46) });

  if (!items.length) return;
  y = bandY + bandH - cardRowH - 16;
  const gap = DS.gap;
  const cardW = (bandW - 28 * 2 - gap * (n - 1)) / n;
  items.forEach((ch, i) => {
    const cx = bandX + 28 + i * (cardW + gap);
    drawRoundedPanel(ctx, cx, y, cardW, cardRowH, DS.cardRadius, { fill: 'rgba(247,243,236,0.85)', shadowAlpha: 0.07 });
    drawCardContentStacked(ctx, ch, i, theme, { x: cx, y, w: cardW, h: cardRowH, useIcons });
  });
}

/** Header block: tagline + product name + subtitle. Returns y below it. */
function drawHeader(
  ctx: CanvasRenderingContext2D, data: InfographicData, theme: Theme,
  o: { x: number; y: number; w: number; align: CanvasTextAlign; titleStyle: string; titleSize?: number },
): number {
  let y = o.y;
  if (data.tagline?.trim()) {
    y = drawReadableText(ctx, [data.tagline.toUpperCase()], { x: o.x, y, font: `600 12px ${FONT}`, color: theme.ink, alpha: 0.42, lineHeight: 22, align: o.align, letterSpacing: 2.2 });
  }
  const name = (data.productName || 'НАЗВАНИЕ').toUpperCase();
  const fit = fitText(ctx, name, { maxW: o.w, maxLines: 2, startSize: o.titleSize ?? 48, minSize: 28, weight: '900' });
  y = drawReadableText(ctx, fit.lines, { x: o.x, y, font: getTitleFont(o.titleStyle, fit.fontSize), color: theme.ink, lineHeight: Math.ceil(fit.fontSize * 1.12), align: o.align, shadowAlpha: 0.05 });
  if (data.productSubtitle?.trim()) {
    y += 4;
    const sub = fitText(ctx, data.productSubtitle, { maxW: o.w, maxLines: 1, startSize: 18, minSize: 13, weight: '400' });
    y = drawReadableText(ctx, sub.lines, { x: o.x, y, font: `400 ${sub.fontSize}px ${FONT}`, color: theme.ink, alpha: DS.inkSoftAlpha, lineHeight: sub.fontSize + 6, align: o.align });
  }
  return y + 14;
}

/** Horizontal card: badge/icon on the left, title + value to the right. */
function drawCardContent(
  ctx: CanvasRenderingContext2D, ch: { title: string; value: string }, i: number, theme: Theme,
  rect: { x: number; y: number; w: number; h: number; useIcons: boolean },
): void {
  const badgeR = 22, badgeCX = rect.x + 20 + badgeR, textX = badgeCX + badgeR + 14, textW = rect.x + rect.w - 16 - textX;
  const titleFit = fitText(ctx, (ch.title || '').toUpperCase(), { maxW: textW, maxLines: 2, startSize: 26, minSize: 17, weight: '800' });
  const titleLH = titleFit.fontSize + 4;
  const descFit = ch.value?.trim() ? fitText(ctx, ch.value, { maxW: textW, maxLines: 2, startSize: 20, minSize: 14, weight: '400' }) : { fontSize: 0, lines: [] as string[] };
  const descLH = descFit.fontSize + 4;
  const blockH = titleFit.lines.length * titleLH + (descFit.lines.length ? 6 + descFit.lines.length * descLH : 0);
  const top = rect.y + Math.max(14, Math.floor((rect.h - blockH) / 2));
  const badgeCY = top + Math.floor(blockH / 2);

  ctx.save();
  ctx.shadowColor = 'rgba(20,16,8,0.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.beginPath(); ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2); ctx.fillStyle = theme.accent; ctx.fill();
  ctx.restore();
  if (rect.useIcons) {
    drawIcon(ctx, iconForLabel(ch.title), badgeCX, badgeCY, badgeR * 1.05, theme.onAccent);
  } else {
    ctx.save(); ctx.font = `800 16px ${FONT}`; ctx.fillStyle = theme.onAccent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), badgeCX, badgeCY + 1); ctx.restore();
  }

  let ty = drawReadableText(ctx, titleFit.lines, { x: textX, y: top, font: `800 ${titleFit.fontSize}px ${FONT}`, color: theme.accent, lineHeight: titleLH });
  if (descFit.lines.length) { ty += 6; drawReadableText(ctx, descFit.lines, { x: textX, y: ty, font: `400 ${descFit.fontSize}px ${FONT}`, color: theme.ink, alpha: 0.82, lineHeight: descLH }); }
}

/** Vertical card (for band row): icon/badge on top, then title + value. */
function drawCardContentStacked(
  ctx: CanvasRenderingContext2D, ch: { title: string; value: string }, i: number, theme: Theme,
  rect: { x: number; y: number; w: number; h: number; useIcons: boolean },
): void {
  const padX = 18;
  const iconS = 28, iconCX = rect.x + padX + iconS / 2, iconCY = rect.y + 22 + iconS / 2;
  if (rect.useIcons) {
    drawIcon(ctx, iconForLabel(ch.title), iconCX, iconCY, iconS, theme.accent);
  } else {
    ctx.save();
    ctx.beginPath(); ctx.arc(iconCX, iconCY, iconS / 2, 0, Math.PI * 2); ctx.fillStyle = theme.accent; ctx.fill();
    ctx.font = `800 15px ${FONT}`; ctx.fillStyle = theme.onAccent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), iconCX, iconCY + 1); ctx.restore();
  }
  let ty = rect.y + 22 + iconS + 12;
  const titleFit = fitText(ctx, (ch.title || '').toUpperCase(), { maxW: rect.w - padX * 2, maxLines: 1, startSize: 16, minSize: 12, weight: '800' });
  ty = drawReadableText(ctx, titleFit.lines, { x: rect.x + padX, y: ty, font: `800 ${titleFit.fontSize}px ${FONT}`, color: theme.accent, lineHeight: titleFit.fontSize + 4, letterSpacing: 0.8 });
  if (ch.value?.trim()) {
    ty += 4;
    const vf = fitText(ctx, ch.value, { maxW: rect.w - padX * 2, maxLines: 2, startSize: 17, minSize: 12, weight: '400' });
    drawReadableText(ctx, vf.lines, { x: rect.x + padX, y: ty, font: `400 ${vf.fontSize}px ${FONT}`, color: theme.ink, alpha: 0.84, lineHeight: vf.fontSize + 4 });
  }
}
