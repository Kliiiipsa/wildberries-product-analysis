// Photo pipeline — shared types for design system, canvas renderer and layout engine
// Includes design-pipeline types for professional WB infographic templates (Stage 2)

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

// ── Design pipeline — professional infographic template system ────────────────

/** Six canonical WB infographic slide types. */
export type InfographicTemplateType =
  | 'cover'      // Main product shot, minimal text — catches attention in search
  | 'benefits'   // 3–5 key benefits with short labels — converts browsers to buyers
  | 'size_grid'  // Size chart / measurement guide — reduces returns
  | 'details'    // Close-up material/feature callouts — builds product confidence
  | 'lifestyle'  // Product in real-life context — creates emotional connection
  | 'trust';     // Reviews, certifications, guarantees — closes hesitant buyers

/** Goal that drives automatic template selection. */
export type InfographicPhotoGoal =
  | 'show_product'    // → cover
  | 'show_benefits'   // → benefits
  | 'show_sizes'      // → size_grid
  | 'show_details'    // → details
  | 'show_lifestyle'  // → lifestyle
  | 'build_trust';    // → trust

/** A render zone on the 900×1200 canvas expressed as fractions (0–1). */
export interface TemplateRenderZone {
  id: string;
  name: string;
  xFraction: number;        // left edge, 0 = card left
  yFraction: number;        // top edge, 0 = card top
  widthFraction: number;
  heightFraction: number;
  alignment: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  /** Optional zones are not counted toward the 4-block limit and are not used by default. */
  optional?: boolean;
}

/** A single text element within a template. */
export interface TemplateTextBlock {
  id: string;
  role: 'headline' | 'subtitle' | 'body' | 'label' | 'badge' | 'callout';
  zoneId: string;           // references TemplateRenderZone.id
  maxLength: number;        // maximum character count
  required: boolean;
  exampleText?: string;     // placeholder shown in editor
}

/** Full template definition. Not connected to canvas render yet. */
export interface InfographicTemplate {
  id: InfographicTemplateType;
  title: string;
  purpose: string;
  productZone: TemplateRenderZone;
  textZones: TemplateRenderZone[];
  recommendedTextBlocks: TemplateTextBlock[];
  forbiddenRules: string[];
  bestFor: string[];
}

/** Input brief that drives template selection and validation. */
export interface InfographicBrief {
  templateType?: InfographicTemplateType;
  photoGoal?: InfographicPhotoGoal;
  productType?: string;             // e.g. "одежда", "электроника", "обувь"
  mainBenefits?: string[];          // list of key selling points
  hasModel?: boolean;
  shootType?: 'studio' | 'lifestyle' | 'flat_lay' | 'detail';
  textBlocks?: Array<{ role: string; text: string }>;
}

/** Result of brief validation. */
export interface BriefValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
