// Layout engine — resolves which canvas layout to use based on composition data
// and live canvas pixel analysis (zone variance check + head-clearance fallback).

import type { LayoutName, CompositionData } from '@/types/photo-pipeline';

/** Normalises raw layout string (including legacy names) to a canonical LayoutName. */
export function resolveLayout(raw: string): LayoutName {
  if (raw === 'right-column' || raw === 'side-right' || raw === 'right' || raw === 'top-right' || raw === 'bottom-right') return 'right-column';
  if (raw === 'top-bottom' || raw === 'bottom-band' || raw === 'top' || raw === 'bottom') return 'top-bottom';
  if (raw === 'bottom-bar')  return 'bottom-bar';
  if (raw === 'floating')    return 'floating';
  return 'left-column';
}

/** Samples average background colour from one edge of the canvas, skipping saturated pixels. */
export function sampleBackground(
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
export function sampleZoneVariance(
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

/**
 * Applies head-clearance fallback and canvas zone validation to finalise the layout.
 * Extracted from drawCard so the decision logic lives in one dedicated place.
 *
 * Rules (identical to original inline logic):
 * 1. top-bottom with headFrac < 0.18 → column layout
 * 2. Column zone has model (high pixel variance) → try opposite column or bottom-bar
 */
export function resolveCanvasLayout(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  initialLayout: LayoutName,
  composition: CompositionData | null | undefined,
): LayoutName {
  let layout = initialLayout;

  // Rule 1 — top-bottom without enough head clearance → column fallback
  const headFrac = composition?.modelHeadTopFraction;
  if (layout === 'top-bottom' && typeof headFrac === 'number' && headFrac < 0.18) {
    layout = (composition?.subjectZone === 'left' || composition?.subjectZone === 'center-left')
      ? 'right-column'
      : 'left-column';
  }

  // Rule 2 — check ACTUAL text rendering zones (PAD + COL_W), not just outer edge
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

  return layout;
}
