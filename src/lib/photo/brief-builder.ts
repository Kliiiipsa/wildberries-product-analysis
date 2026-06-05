// Brief builder — transforms raw product/photo data into a normalised InfographicBrief.
// Not connected to UI or API routes yet.

import type {
  InfographicBrief,
  InfographicPhotoGoal,
  InfographicTemplateType,
} from '@/types/photo-pipeline';

// ── Input type ────────────────────────────────────────────────────────────────

/** Raw input coming from product data, UI form, or a Qwen JSON response. */
export interface BriefBuilderInput {
  productName?: string;
  productType?: string;
  category?: string;         // fallback if productType is absent
  benefits?: unknown;        // string[], single string, or comma-separated string
  photoGoal?: string;        // raw string — will be normalised to InfographicPhotoGoal
  templateType?: string;     // raw string — will be normalised to InfographicTemplateType
  shootType?: string;
  hasModel?: boolean;
  textBlocks?: Array<{ role: string; text: string }>;
}

// ── Normalisation maps ────────────────────────────────────────────────────────

const GOAL_MAP: Record<string, InfographicPhotoGoal> = {
  // canonical values
  show_product:    'show_product',
  show_benefits:   'show_benefits',
  show_sizes:      'show_sizes',
  show_details:    'show_details',
  show_lifestyle:  'show_lifestyle',
  build_trust:     'build_trust',
  // template-name aliases
  cover:           'show_product',
  benefits:        'show_benefits',
  size_grid:       'show_sizes',
  details:         'show_details',
  lifestyle:       'show_lifestyle',
  trust:           'build_trust',
  // Russian synonyms (Qwen may return these)
  'товар':         'show_product',
  'обложка':       'show_product',
  'преимущества':  'show_benefits',
  'выгоды':        'show_benefits',
  'размеры':       'show_sizes',
  'детали':        'show_details',
  'лайфстайл':     'show_lifestyle',
  'доверие':       'build_trust',
  'гарантии':      'build_trust',
};

const TEMPLATE_MAP: Record<string, InfographicTemplateType> = {
  cover:     'cover',
  benefits:  'benefits',
  size_grid: 'size_grid',
  details:   'details',
  lifestyle: 'lifestyle',
  trust:     'trust',
};

const VALID_SHOOT_TYPES = new Set(['studio', 'lifestyle', 'flat_lay', 'detail']);

// ── Public functions ──────────────────────────────────────────────────────────

/**
 * Maps a raw string to a canonical InfographicPhotoGoal.
 * Returns undefined if the string is not recognised.
 */
export function normalizePhotoGoal(goal: string): InfographicPhotoGoal | undefined {
  return GOAL_MAP[goal.toLowerCase().trim()];
}

/**
 * Normalises a benefits value to a clean string[].
 * Accepts: string[], single string, or comma/semicolon/pipe/newline-separated string.
 * Enforces: max 80 chars per item, max 5 items total.
 */
export function normalizeBenefits(benefits: unknown): string[] {
  if (!benefits) return [];

  let raw: string[];
  if (Array.isArray(benefits)) {
    raw = benefits.map(String);
  } else if (typeof benefits === 'string') {
    raw = benefits.split(/[,;|\n]/).map(s => s.trim());
  } else {
    return [];
  }

  return raw
    .filter(b => b.length > 0)
    .map(b => b.slice(0, 80))
    .slice(0, 5);
}

/**
 * Builds a normalised InfographicBrief from raw input.
 * Applies all normalisation rules; does not validate (call validateInfographicBrief separately).
 */
export function buildInfographicBriefFromInput(input: BriefBuilderInput): InfographicBrief {
  const brief: InfographicBrief = {};

  // Product type — prefer explicit productType, fall back to category
  const rawType = input.productType?.trim() || input.category?.trim();
  if (rawType) brief.productType = rawType;

  // Photo goal
  if (input.photoGoal) {
    const goal = normalizePhotoGoal(input.photoGoal);
    if (goal) brief.photoGoal = goal;
  }

  // Template type (explicit override)
  if (input.templateType) {
    const mapped = TEMPLATE_MAP[input.templateType.toLowerCase().trim()];
    if (mapped) brief.templateType = mapped;
  }

  // Main benefits
  const benefits = normalizeBenefits(input.benefits);
  if (benefits.length > 0) brief.mainBenefits = benefits;

  // Shoot type — only accept known values
  if (input.shootType && VALID_SHOOT_TYPES.has(input.shootType)) {
    brief.shootType = input.shootType as InfographicBrief['shootType'];
  }

  // Has model flag
  if (typeof input.hasModel === 'boolean') brief.hasModel = input.hasModel;

  // Text blocks — enforce 4-block limit at construction time
  if (input.textBlocks && input.textBlocks.length > 0) {
    brief.textBlocks = input.textBlocks.slice(0, 4);
  }

  return brief;
}
