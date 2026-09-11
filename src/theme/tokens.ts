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

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const font = {
  /** Tabular figures everywhere numbers change — no jitter on steppers or timers. */
  numeric: { fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  display: { fontSize: 56, fontWeight: '700' as const, letterSpacing: -1.5 },
  title: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 14, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
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
