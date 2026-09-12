/**
 * The only place colours, spacing, radii, type sizes and motion constants live.
 * A hardcoded hex or magic number in a screen is a bug. See docs/05-DESIGN-SYSTEM.md.
 */

export const color = {
  bg: '#0B0B0D',
  surface: '#141417',
  surfaceHigh: '#1D1D22',
  border: '#2A2A31',

  text: '#F2F2F4',
  textMuted: '#9A9AA5',
  textFaint: '#5C5C68',

  accent: '#E8552E',      // the primary action. Log set. Quick add.
  accentPressed: '#C4441F',
  accentSoft: 'rgba(232,85,46,0.55)', // secondary muscles in demos and maps
  onAccent: '#FFFFFF',

  positive: '#3FBF7F',    // progression, a new e1RM high
  warning: '#E0A02E',     // stalled, approaching MRV
  danger: '#D9483B',      // pain flag, backoff — NEVER "you missed a day"

  chart: '#E8552E',
  chartFaint: 'rgba(232,85,46,0.28)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/**
 * The rhythm that makes grouping legible: space BETWEEN groups must clearly exceed
 * space WITHIN them. Before this, rows sat 8 apart inside a card and cards sat 12
 * apart, so everything read as one undifferentiated column.
 */
export const gap = {
  /** Between rows of the same thing. */
  within: space.sm,
  /** Between sibling cards. */
  between: space.lg,
  /** Before a new heading. */
  section: space.xxl,
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/**
 * One family, six roles, each visibly distinct from its neighbours.
 *
 * Two things were wrong before. 14 and 12 sat close enough to read as one size, so
 * labels and captions carried the same weight and small text all blurred together —
 * they are 15 and 13 now, and the gap between 28 and 56 is closed by a 44 display
 * that also leaves room for a unit suffix on a phone.
 *
 * And nothing set a line-height, so every paragraph rendered at the platform default
 * and looked cramped whatever the spacing around it. Body copy now has real leading.
 */
export const font = {
  /** Tabular figures everywhere numbers change — no jitter on steppers or timers. */
  numeric: { fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  display: { fontSize: 44, lineHeight: 48, fontWeight: '700' as const, letterSpacing: -1.5 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
} as const;

/** Minimum tap targets. The logging screen uses `gym`; everything else `default`. */
export const hit = { gym: 56, default: 44 } as const;

export const motion = {
  fast: 150,
  base: 200,
  slow: 250,
  /** Springs for anything following a gesture; timing for everything else. */
  spring: { damping: 18, stiffness: 220, mass: 0.7 },
} as const;

export const layout = {
  screenPadding: space.lg,
  /** Primary actions live in the bottom third; nothing critical in top corners. */
  actionBarHeight: 96,
} as const;
