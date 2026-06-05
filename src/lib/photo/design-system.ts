// Design system — canvas dimensions, default data, visual tokens, color utilities

import type { InfographicData } from '@/types/photo-pipeline';

export const CARD_W = 900;
export const CARD_H = 1200;

export const DEFAULT_DATA: InfographicData = {
  productName: 'НАЗВАНИЕ',
  productSubtitle: 'лёгкий и дышащий',
  tagline: 'новинка сезона',
  characteristics: [
    { title: 'Качество', value: 'натуральные материалы' },
    { title: 'Комфорт', value: 'удобная посадка' },
    { title: 'Стиль', value: 'актуальный дизайн' },
  ],
};

export const APPROACH_STYLE: Record<string, { badge: string; ring: string }> = {
  'Выгоды':         { badge: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50', ring: 'border-emerald-500/70 bg-emerald-950/30' },
  'Характеристики': { badge: 'bg-blue-900/60 text-blue-300 border border-blue-700/50',          ring: 'border-blue-500/70 bg-blue-950/30' },
  'Эмоции':         { badge: 'bg-rose-900/60 text-rose-300 border border-rose-700/50',           ring: 'border-rose-500/70 bg-rose-950/30' },
  'Минимализм':     { badge: 'bg-zinc-700/80 text-zinc-300 border border-zinc-600/50',           ring: 'border-zinc-400/50 bg-zinc-900/40' },
};

/** Derives accent colour from sampled background RGB + luminance. */
export function deriveAccent(r: number, _g: number, b: number, luminance: number): string {
  const isLight = luminance > 140;
  const warmth  = r - b;
  if (isLight) return warmth >= 0 ? 'rgba(50,36,18,0.82)' : 'rgba(34,40,56,0.84)';
  return warmth >= 0 ? 'rgba(212,180,108,0.92)' : 'rgba(174,200,228,0.90)';
}

/** Returns CSS font string for title text. */
export function getTitleFont(style: string, size: number): string {
  if (style === 'premium-serif') return `italic bold ${size}px Georgia, 'Times New Roman', serif`;
  return `900 ${size}px 'Arial Black', Arial, Helvetica, sans-serif`;
}
