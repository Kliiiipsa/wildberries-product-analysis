// Photo pipeline — shared types for design system, canvas renderer and layout engine

export interface Characteristic {
  title: string;
  value: string;
}

export interface InfographicData {
  productName: string;
  productSubtitle: string;
  tagline: string;
  characteristics: Characteristic[];
}

export type LayoutName =
  | 'left-column'
  | 'right-column'
  | 'top-bottom'
  | 'bottom-bar'
  | 'floating';

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
