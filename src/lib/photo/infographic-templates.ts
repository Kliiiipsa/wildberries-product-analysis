// Infographic layout geometry configs — single source of truth for layout dimensions.
// Values match exactly the hardcoded parameters inside canvas-renderer.ts draw functions.
// This file exists for documentation and future design-system customisation.
//
// Stage 2 additions (not yet connected to canvas render):
//   INFOGRAPHIC_TEMPLATES — 6 professional WB slide templates
//   selectInfographicTemplate() — picks the right template from a brief
//   validateInfographicBrief() — checks brief completeness before render

export const LAYOUT_CONFIGS = {
  'left-column': {
    padFraction:        0.07,   // W × 0.07 = left/right padding
    colWidthFraction:   0.40,   // W × 0.40 = text column width
    taglineSpacing:     2.5,    // px letter-spacing for tagline
    titleStartFraction: 0.07,   // H × 0.07 = y-start of title block
    taglineOpacity:     0.50,
    subtitleOpacity:    0.62,
    separatorOpacity:   0.14,
    charOpacity:        0.90,
    charSepOpacity:     0.08,
  },
  'right-column': {
    padFraction:        0.07,
    colWidthFraction:   0.40,
    taglineSpacing:     2.5,
    titleStartFraction: 0.07,
    taglineOpacity:     0.50,
    subtitleOpacity:    0.62,
    separatorOpacity:   0.14,
    charOpacity:        0.90,
    charSepOpacity:     0.08,
  },
  'top-bottom': {
    titleStartFraction: 0.03,   // H × 0.03 = y-start from top
    taglineSpacing:     2.8,
    barHeight:          190,    // px — bottom characteristics bar height
    subtitleBarOffset:  22,     // px from BAR_TOP for subtitle text
    separatorOffset:    50,     // px from BAR_TOP for thin line between subtitle and cols
    charTitleOffset:    68,     // px from BAR_TOP for characteristic title row
    charValueOffset:    92,     // px from BAR_TOP for characteristic value row
    charDividerStart:   64,     // px from BAR_TOP — vertical divider start
    charDividerEnd:     160,    // px from BAR_TOP — vertical divider end
    taglineOpacity:     0.50,
    subtitleOpacity:    0.62,
  },
  'bottom-bar': {
    padFraction:        0.07,
    charXFraction:      0.58,   // W × 0.58 = right-column characteristics x-start
    panelOpacity:       0.86,   // solid panel rgba alpha
    taglineOpacity:     0.50,
    subtitleOpacity:    0.58,
    charOpacity:        0.88,
  },
  'floating': {
    badgeWidth:         260,    // px — badge rectangle width
    badgePadding:       18,     // px — inner padding of badge
    badgeBgOpacity:     0.52,   // rgba alpha of badge background
    labelOpacity:       0.80,
  },
  scrim: {
    leftColumnEnd:      0.46,   // W × 0.46 — gradient fade-end (left layout)
    rightColumnEnd:     0.54,   // W × 0.54 — gradient fade-end (right layout, from right edge)
    topBottomTopEnd:    0.36,   // H × 0.36 — top gradient end
    topBottomBotStart:  0.66,   // H × 0.66 — bottom gradient start
    bottomBarStart:     0.56,   // H × 0.56 — bottom-bar gradient start
  },
} as const;

// ── Professional WB infographic templates (Stage 2) ───────────────────────────
// NOT connected to canvas render yet. Types only — safe to add.

import type {
  InfographicTemplateType,
  InfographicTemplate,
  InfographicBrief,
  BriefValidationResult,
  TemplateRenderZone,
} from '@/types/photo-pipeline';

// Helper: build a render zone from fraction coords (all relative to 900×1200 canvas)
function zone(
  id: string, name: string,
  xF: number, yF: number, wF: number, hF: number,
  alignment: TemplateRenderZone['alignment'] = 'left',
  verticalAlign: TemplateRenderZone['verticalAlign'] = 'top',
): TemplateRenderZone {
  return { id, name, xFraction: xF, yFraction: yF, widthFraction: wF, heightFraction: hF, alignment, verticalAlign };
}

export const INFOGRAPHIC_TEMPLATES: Record<InfographicTemplateType, InfographicTemplate> = {

  // ── 1. Cover — главное фото, минимум текста ────────────────────────────────
  cover: {
    id: 'cover',
    title: 'Обложка',
    purpose: 'Зацепить внимание в поиске. Максимальный контраст товара с фоном, одно ключевое слово.',
    productZone: zone('product', 'Товар', 0, 0, 1, 1, 'center', 'middle'),
    textZones: [
      zone('headline', 'Заголовок', 0.05, 0.78, 0.90, 0.14, 'center', 'middle'),
      zone('tagline',  'Тег',       0.05, 0.04, 0.45, 0.08, 'left',   'top'),
    ],
    recommendedTextBlocks: [
      { id: 'headline', role: 'headline', zoneId: 'headline', maxLength: 24, required: true,  exampleText: 'ДЖОГГЕРЫ МУЖСКИЕ' },
      { id: 'tagline',  role: 'badge',    zoneId: 'tagline',  maxLength: 20, required: false, exampleText: 'хит сезона' },
    ],
    forbiddenRules: [
      'Текст не должен перекрывать лицо модели',
      'Не более 2 текстовых элементов',
      'Никаких перечислений — только название',
    ],
    bestFor: ['одежда', 'обувь', 'аксессуары', 'любой товар с чистым фоном'],
  },

  // ── 2. Benefits — 3–5 преимуществ ─────────────────────────────────────────
  benefits: {
    id: 'benefits',
    title: 'Преимущества',
    purpose: 'Конвертировать просмотр в покупку. Чёткие выгоды рядом с товаром.',
    productZone: zone('product', 'Товар', 0, 0.05, 0.50, 0.90, 'center', 'middle'),
    textZones: [
      zone('headline',   'Заголовок',      0.53, 0.05, 0.44, 0.14, 'left', 'top'),
      zone('benefit-1',  'Преимущество 1', 0.53, 0.22, 0.44, 0.13, 'left', 'top'),
      zone('benefit-2',  'Преимущество 2', 0.53, 0.38, 0.44, 0.13, 'left', 'top'),
      zone('benefit-3',  'Преимущество 3', 0.53, 0.54, 0.44, 0.13, 'left', 'top'),
      zone('cta',        'Призыв',         0.53, 0.80, 0.44, 0.12, 'left', 'bottom'),
    ],
    recommendedTextBlocks: [
      { id: 'headline',  role: 'headline', zoneId: 'headline',  maxLength: 24, required: true,  exampleText: 'ДЖОГГЕРЫ МУЖСКИЕ' },
      { id: 'benefit-1', role: 'label',    zoneId: 'benefit-1', maxLength: 40, required: true,  exampleText: '🌿 Дышащий хлопок' },
      { id: 'benefit-2', role: 'label',    zoneId: 'benefit-2', maxLength: 40, required: true,  exampleText: '✓ Не мнётся' },
      { id: 'benefit-3', role: 'label',    zoneId: 'benefit-3', maxLength: 40, required: false, exampleText: '↕ Удобный крой' },
    ],
    forbiddenRules: [
      'Не более 5 преимуществ — иначе не читается',
      'Не использовать технический язык без пояснения',
      'Нельзя размещать текст поверх детализированных частей товара',
    ],
    bestFor: ['одежда', 'обувь', 'товары для дома', 'электроника', 'спорт'],
  },

  // ── 3. Size grid — таблица размеров ───────────────────────────────────────
  size_grid: {
    id: 'size_grid',
    title: 'Размерная сетка',
    purpose: 'Снизить процент возвратов. Покупатель уверен в размере до заказа.',
    productZone: zone('product', 'Товар на модели', 0.10, 0.04, 0.80, 0.46, 'center', 'top'),
    textZones: [
      zone('table-header', 'Шапка таблицы',   0.04, 0.52, 0.92, 0.07, 'center', 'middle'),
      zone('size-row-1',   'Размер XS/S',      0.04, 0.60, 0.92, 0.08, 'left',   'middle'),
      zone('size-row-2',   'Размер M/L',       0.04, 0.69, 0.92, 0.08, 'left',   'middle'),
      zone('size-row-3',   'Размер XL/XXL',    0.04, 0.78, 0.92, 0.08, 'left',   'middle'),
      zone('note',         'Примечание',       0.04, 0.88, 0.92, 0.08, 'center', 'middle'),
    ],
    recommendedTextBlocks: [
      { id: 'table-header', role: 'label',    zoneId: 'table-header', maxLength: 60, required: true,  exampleText: 'Размер | Грудь | Талия | Бёдра' },
      { id: 'size-row-1',   role: 'body',     zoneId: 'size-row-1',   maxLength: 60, required: true,  exampleText: 'XS / S  |  80-88  |  60-68  |  88-96' },
      { id: 'size-row-2',   role: 'body',     zoneId: 'size-row-2',   maxLength: 60, required: true,  exampleText: 'M / L   |  88-96  |  68-76  |  96-104' },
      { id: 'size-row-3',   role: 'body',     zoneId: 'size-row-3',   maxLength: 60, required: false, exampleText: 'XL / XXL | 96-108 | 76-88  | 104-116' },
      { id: 'note',         role: 'callout',  zoneId: 'note',         maxLength: 60, required: false, exampleText: 'Модель: рост 170 см, размер S' },
    ],
    forbiddenRules: [
      'Нельзя давать маркетинговые тексты вместо реальных размеров',
      'Таблица должна быть читаема на скриншоте телефона',
      'Не перекрывать части тела модели размерными данными',
    ],
    bestFor: ['одежда', 'обувь', 'нижнее бельё', 'детская одежда', 'спортивная форма'],
  },

  // ── 4. Details — детали и материал ────────────────────────────────────────
  details: {
    id: 'details',
    title: 'Детали товара',
    purpose: 'Создать доверие к качеству. Крупный план ткани, фурнитуры, швов, текстуры.',
    productZone: zone('product', 'Крупный план товара', 0.04, 0.04, 0.92, 0.68, 'center', 'top'),
    textZones: [
      zone('detail-left',  'Деталь слева',  0.04, 0.74, 0.43, 0.21, 'left',  'top'),
      zone('detail-right', 'Деталь справа', 0.53, 0.74, 0.43, 0.21, 'right', 'top'),
    ],
    recommendedTextBlocks: [
      { id: 'detail-left',  role: 'callout', zoneId: 'detail-left',  maxLength: 50, required: true,  exampleText: '95% хлопок / 5% эластан' },
      { id: 'detail-right', role: 'callout', zoneId: 'detail-right', maxLength: 50, required: false, exampleText: 'Усиленные швы — не рвётся' },
    ],
    forbiddenRules: [
      'Не размещать текст поверх детали которую показываете',
      'Нельзя указывать несуществующие характеристики',
      'Максимум 2 callout-блока — не перегружать',
    ],
    bestFor: ['ткань и одежда', 'ювелирные украшения', 'электроника', 'кожаные товары', 'продукты питания'],
  },

  // ── 5. Lifestyle — товар в жизни ──────────────────────────────────────────
  lifestyle: {
    id: 'lifestyle',
    title: 'Лайфстайл',
    purpose: 'Создать эмоциональную связь. Покупатель видит себя с этим товаром.',
    productZone: zone('product', 'Модель / сцена', 0, 0, 1, 1, 'center', 'middle'),
    textZones: [
      zone('headline', 'Слоган',   0.05, 0.04, 0.55, 0.14, 'left', 'top'),
      zone('tagline',  'Тег',      0.05, 0.82, 0.90, 0.09, 'left', 'bottom'),
    ],
    recommendedTextBlocks: [
      { id: 'headline', role: 'headline', zoneId: 'headline', maxLength: 32, required: false, exampleText: 'Свободный. Стильный. Твой.' },
      { id: 'tagline',  role: 'subtitle', zoneId: 'tagline',  maxLength: 48, required: false, exampleText: 'Коллекция лето 2026' },
    ],
    forbiddenRules: [
      'Текст не должен закрывать лицо модели',
      'Никаких характеристик — только образ и атмосфера',
      'Нельзя ставить текст там где фон сливается с текстом',
    ],
    bestFor: ['одежда', 'аксессуары', 'спортивные товары', 'косметика', 'товары для отдыха'],
  },

  // ── 6. Trust — доверие и гарантии ────────────────────────────────────────
  trust: {
    id: 'trust',
    title: 'Доверие',
    purpose: 'Дожать колеблющегося покупателя. Отзывы, рейтинг, гарантия, сертификаты.',
    productZone: zone('product', 'Товар / упаковка', 0.20, 0.04, 0.60, 0.42, 'center', 'top'),
    textZones: [
      zone('trust-1', 'Блок доверия 1', 0.04, 0.48, 0.43, 0.21, 'left',  'top'),
      zone('trust-2', 'Блок доверия 2', 0.53, 0.48, 0.43, 0.21, 'right', 'top'),
      zone('trust-3', 'Блок доверия 3', 0.04, 0.72, 0.43, 0.21, 'left',  'top'),
      zone('trust-4', 'Блок доверия 4', 0.53, 0.72, 0.43, 0.21, 'right', 'top'),
    ],
    recommendedTextBlocks: [
      { id: 'trust-1', role: 'callout', zoneId: 'trust-1', maxLength: 48, required: true,  exampleText: '⭐ 4.9 / 1 200 отзывов' },
      { id: 'trust-2', role: 'callout', zoneId: 'trust-2', maxLength: 48, required: true,  exampleText: '🔄 Возврат 30 дней' },
      { id: 'trust-3', role: 'callout', zoneId: 'trust-3', maxLength: 48, required: false, exampleText: '✓ Сертификат качества' },
      { id: 'trust-4', role: 'callout', zoneId: 'trust-4', maxLength: 48, required: false, exampleText: '🚀 Доставка 1–2 дня' },
    ],
    forbiddenRules: [
      'Нельзя указывать фиктивные отзывы или завышенный рейтинг',
      'Не перегружать более чем 4 блоками — теряется доверие',
      'Избегать юридических формулировок — язык должен быть живым',
    ],
    bestFor: ['любой товар при высокой конкуренции', 'новинки без истории', 'дорогостоящие товары'],
  },
};

// ── Template selection ────────────────────────────────────────────────────────

const GOAL_TO_TEMPLATE: Record<string, InfographicTemplateType> = {
  show_product:   'cover',
  show_benefits:  'benefits',
  show_sizes:     'size_grid',
  show_details:   'details',
  show_lifestyle: 'lifestyle',
  build_trust:    'trust',
};

/**
 * Picks the best template for a given brief.
 * Priority: explicit templateType → photoGoal mapping → fallback 'benefits'.
 */
export function selectInfographicTemplate(brief: InfographicBrief): InfographicTemplate {
  if (brief.templateType && INFOGRAPHIC_TEMPLATES[brief.templateType]) {
    return INFOGRAPHIC_TEMPLATES[brief.templateType];
  }
  if (brief.photoGoal) {
    const mapped = GOAL_TO_TEMPLATE[brief.photoGoal] as InfographicTemplateType | undefined;
    if (mapped) return INFOGRAPHIC_TEMPLATES[mapped];
  }
  return INFOGRAPHIC_TEMPLATES.benefits; // safe fallback
}

// ── Brief validation ─────────────────────────────────────────────────────────

const MAX_BENEFIT_LENGTH  = 80;
const MAX_TEXT_BLOCK_LENGTH = 120;
const MAX_TEXT_BLOCKS      = 4;

/**
 * Validates a brief before template rendering.
 * Returns errors (blockers) and warnings (suggestions).
 */
export function validateInfographicBrief(brief: InfographicBrief): BriefValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!brief.productType || brief.productType.trim() === '') {
    errors.push('Не указан тип товара (productType)');
  }
  if (!brief.photoGoal && !brief.templateType) {
    errors.push('Не указана цель фото (photoGoal) или тип шаблона (templateType)');
  }
  if (!brief.mainBenefits || brief.mainBenefits.length === 0) {
    errors.push('Не указаны основные преимущества (mainBenefits)');
  }

  // Text length checks
  if (brief.mainBenefits) {
    brief.mainBenefits.forEach((b, i) => {
      if (b.length > MAX_BENEFIT_LENGTH) {
        warnings.push(`Преимущество ${i + 1} слишком длинное: ${b.length} симв. (рекомендуется ≤${MAX_BENEFIT_LENGTH})`);
      }
    });
  }

  // Text block count
  if (brief.textBlocks && brief.textBlocks.length > MAX_TEXT_BLOCKS) {
    errors.push(`Слишком много текстовых блоков: ${brief.textBlocks.length} (максимум ${MAX_TEXT_BLOCKS})`);
  }

  // Individual text block length
  if (brief.textBlocks) {
    brief.textBlocks.forEach((block, i) => {
      if (block.text.length > MAX_TEXT_BLOCK_LENGTH) {
        warnings.push(`Текстовый блок ${i + 1} слишком длинный: ${block.text.length} симв. (рекомендуется ≤${MAX_TEXT_BLOCK_LENGTH})`);
      }
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
