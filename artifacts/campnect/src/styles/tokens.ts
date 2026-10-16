/**
 * Campnect Design Tokens — Premium Glassmorphism Dark Theme
 * Deep purple-black bg + intense purple radial glow + lime-green primary CTA
 * Typography: Plus Jakarta Sans (display/headings) + Inter (body)
 */

export const colors = {
  // ── Theme-aware: resolve via CSS variables so light/dark mode works ──────────
  bg:           'var(--color-bg)',
  bgMid:        'var(--color-bg-mid)',
  surface:      'var(--color-surface)',
  surfaceHover: 'var(--color-surface-hover)',
  border:       'var(--color-border)',
  borderStrong: 'var(--color-border-strong)',

  textPrimary:   'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  textMuted:     'var(--color-text-muted)',
  textAccent:    'var(--color-text-accent)',

  // ── Glass surface layers ───────────────────────────────────────────────────
  glass1:       'var(--glass-1)',
  glass2:       'var(--glass-2)',
  glass3:       'var(--glass-3)',
  glassBorder:  'var(--glass-border)',

  // ── Brand constants ────────────────────────────────────────────────────────
  /** Primary CTA — theme-aware (black pill in light mode) */
  lime:         'var(--color-lime)',
  limeHover:    'var(--color-lime-hover)',
  limeDim:      'var(--color-lime-dim)',
  /** Text/icon color for content placed on top of a `lime` background */
  onLime:       'var(--color-on-lime)',

  /** Purple accent palette — theme-aware */
  purpleCore:   'var(--color-purple-core)',
  purpleBright: 'var(--color-purple-bright)',
  purpleGlow:   'var(--color-purple-glow)',
  purpleGlowSm: 'var(--color-purple-glow-sm)',
  purpleDim:    'var(--color-purple-dim)',

  /** Legacy aliases — kept so existing screens compile without changes */
  blueCore:    'var(--color-blue-core)',
  blueBright:  'var(--color-blue-bright)',
  blueLight:   'var(--color-blue-light)',
  blueGlow:    'var(--color-blue-glow)',
  blueGlowSm:  'var(--color-blue-glow-sm)',
} as const

export const gradients = {
  /** Primary CTA button — theme-aware (black in light mode) */
  cta:       'var(--color-lime)',
  ctaHover:  'var(--color-lime-hover)',

  /** Ambient backgrounds — theme-aware (none in light mode) */
  radialBg:  'var(--gradient-radial-bg)',
  radialMid: 'var(--gradient-radial-mid)',
  radialSide:'var(--gradient-radial-side)',

  /** Story ring gradient */
  storyRing: 'var(--gradient-story-ring)',

  /** Own message bubble */
  ownBubble: 'linear-gradient(135deg, #18181B 0%, #27272A 100%)',

  /** Subtle glass surface gradient */
  surface:   'var(--glass-1)',

  /** Purple glow behind elements */
  purpleGlow:'radial-gradient(ellipse 60% 60% at 50% 50%, var(--color-purple-glow-sm) 0%, transparent 70%)',
} as const

export const shadows = {
  card:      'var(--shadow-card)',
  cardHover: 'var(--shadow-card-hover)',
  glow:      'var(--shadow-glow)',
  btn:       'var(--shadow-btn)',
  btnHover:  'var(--shadow-btn-hover)',
  glass:     'var(--shadow-glass)',
  float:     'var(--shadow-float)',
  purple:    'var(--shadow-purple)',
} as const

export const radii = {
  sm:   '8px',
  md:   '14px',
  lg:   '20px',
  xl:   '28px',
  pill: '9999px',
} as const

export const typography = {
  fontDisplay: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontBody:    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamily:  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

  weights: {
    display:  800,
    bold:     700,
    semi:     600,
    medium:   500,
    regular:  400,
    light:    300,
  },

  sizes: {
    hero:   { size: '32px', lineHeight: '1.15', weight: 800, font: 'display' },
    h1:     { size: '24px', lineHeight: '1.20', weight: 700, font: 'display' },
    h2:     { size: '20px', lineHeight: '1.25', weight: 700, font: 'display' },
    h3:     { size: '17px', lineHeight: '1.30', weight: 600, font: 'display' },
    body:   { size: '15px', lineHeight: '1.60', weight: 400, font: 'body' },
    bodySm: { size: '14px', lineHeight: '1.55', weight: 400, font: 'body' },
    caption:{ size: '12px', lineHeight: '1.40', weight: 400, font: 'body' },
    label:  { size: '13px', lineHeight: '1.20', weight: 600, font: 'display' },
    micro:  { size: '11px', lineHeight: '1.30', weight: 400, font: 'body' },
    // Flat sizes for backward compat
    xs:   '11px',
    sm:   '13px',
    base: '15px',
    md:   '17px',
    lg:   '20px',
    xl:   '24px',
    '2xl':'28px',
    '3xl':'36px',
    '4xl':'46px',
  },
  lineHeights: {
    tight:   1.15,
    snug:    1.3,
    base:    1.5,
    relaxed: 1.65,
  },
} as const

export const motion = {
  easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  easeSmooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easeBounce: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
  easeOut:    'cubic-bezier(0.0, 0, 0.2, 1)',
  fast:   '120ms',
  base:   '220ms',
  slow:   '380ms',
} as const

export const layout = {
  mobileMaxWidth: '430px',
  navHeight:      '64px',
  topBarHeight:   '56px',
  navFloatMargin: '16px',
  navPillRadius:  '26px',
  safeBottom:     'env(safe-area-inset-bottom, 0px)',
  safeTop:        'env(safe-area-inset-top, 0px)',
} as const
