// Infographic layout geometry configs — single source of truth for layout dimensions.
// Values match exactly the hardcoded parameters inside canvas-renderer.ts draw functions.
// This file exists for documentation and future design-system customisation.

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
