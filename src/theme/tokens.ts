/**
 * The only place colours, spacing, radii, type sizes and motion constants live.
 * A hardcoded hex or magic number in a screen is a bug. See docs/05-DESIGN-SYSTEM.md.
 */

export const color = {
  bg: '#0B0B0D',
  surface: '#141417',
  surfaceHigh: '#1D1D22',
  border: '#2A2A31',

  text: '#F2F2F4',        // 17.6 : 1 on bg
  textMuted: '#9A9AA5',   // 6.0 : 1 on surfaceHigh, the worst ground
  /**
   * Was #5C5C68, which measured 2.79 : 1 on surface and 2.55 : 1 on surfaceHigh —
   * under half the 4.5 : 1 readability target, on text that was carrying real
   * content: "+2.5 kg since Mon 3 Mar", set counts, timestamps. Now 4.60 : 1 at
   * its worst, and still visibly quieter than textMuted so the two tokens still
   * mean different things (UX-11).
   */
  textFaint: '#85858F',

  /**
   * Accent is for text, icons and strokes ON a dark ground, where it measures
   * 5.40 : 1. It is NOT a background for white text: #E8552E under #FFFFFF is
   * 3.64 : 1, which is what every filled button was.
   */
  accent: '#E8552E',
  accentPressed: '#C4441F',
  /**
   * The filled-action pairing: white on #C4441F is 5.01 : 1. A separate token
   * rather than darkening `accent` everywhere — doing that would dim every chart
   * line, ring and icon to fix a problem only filled buttons have.
   */
  accentFill: '#C4441F',
  accentFillPressed: '#A8380F',   // white 6.49 : 1
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

/** `button` sits between a chip (md) and a card (lg), so a button never reads as either. */
export const radius = { sm: 8, md: 12, button: 14, lg: 16, xl: 24, pill: 999 } as const;

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
  /** The number being logged: weight and reps on the session screen. Nothing on screen is louder. */
  hero: { fontSize: 60, lineHeight: 64, fontWeight: '800' as const, letterSpacing: -2 },
  display: { fontSize: 44, lineHeight: 48, fontWeight: '800' as const, letterSpacing: -1.5 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  /** A pushed screen's title, beside its back arrow. */
  titleSm: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  /**
   * A small tracked label above a group — "This week", "Up next". Upper-cased so it
   * reads as a signpost, not as content, and never used for anything you must read
   * to act: the content under it carries the meaning.
   */
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 1.3, textTransform: 'uppercase' as const },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
} as const;

/**
 * Minimum tap targets. The logging screen uses `gym`; everything else `default`.
 *
 * `default` was 44 — the iOS figure. Android's guidance is 48, this app's primary
 * target is Android, and both exceed the 44 the repo used to floor at (UX-11).
 * Icon artwork size is not the target: these are the box, not the glyph.
 */
export const hit = { gym: 56, default: 48 } as const;

export const motion = {
  fast: 150,
  base: 200,
  slow: 250,
  /** Springs for anything following a gesture; timing for everything else. */
  spring: { damping: 18, stiffness: 220, mass: 0.7 },
} as const;

export const layout = {
  screenPadding: space.lg,
  /**
   * What a scroll leaves clear at the bottom when the screen has NO fixed dock —
   * just enough that the last row is not flush against the tab bar.
   *
   * Screen used to reserve `actionBarHeight` (96) on every screen whether or not
   * one existed, so screens without a dock ended in 96dp of nothing and screens
   * with a taller one still clipped. A dock reports its measured height instead
   * (UX-11).
   */
  scrollTail: space.xxl,
  /** Primary actions live in the bottom third; nothing critical in top corners. */
  actionBarHeight: 96,
} as const;
