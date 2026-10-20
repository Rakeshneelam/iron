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
  /**
   * The accent as a wash over a dark surface — the first frame of the set-logged
   * flash, and nothing else. Never a ground for text: it exists to be left.
   */
  accentWash: 'rgba(232,85,46,0.16)',
  onAccent: '#FFFFFF',

  positive: '#3FBF7F',    // progression, a new e1RM high
  warning: '#E0A02E',     // stalled, approaching MRV
  danger: '#D9483B',      // pain flag, backoff — NEVER "you missed a day"
  /** Held, on the filled destructive button. White on it is 5.94 : 1. */
  dangerPressed: '#B23A2E',

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
 * The two faces the design is drawn in, embedded at build time by the expo-font
 * config plugin (app.json), so there is no runtime loading and nothing to wait on.
 * The Android XML families carry the same names iOS reads from the files, so one
 * string works on both, and fontWeight picks the right file on each.
 *
 *   Plex    — everything you read: body, labels, captions.
 *   Archivo — everything you glance at: titles, headings, filled buttons, and
 *             every number that changes.
 */
export const family = { text: 'IBM Plex Sans', display: 'Archivo' } as const;

/**
 * Six roles, each visibly distinct from its neighbours.
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
  numeric: { fontFamily: family.display, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  /** The number being logged: weight and reps on the session screen. Nothing on screen is louder. */
  hero: { fontFamily: family.display, fontSize: 60, lineHeight: 64, fontWeight: '800' as const, letterSpacing: -2 },
  display: { fontFamily: family.display, fontSize: 44, lineHeight: 48, fontWeight: '800' as const, letterSpacing: -1.5 },
  title: { fontFamily: family.display, fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  /** A pushed screen's title, beside its back arrow. */
  titleSm: { fontFamily: family.display, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  /**
   * A small tracked label above a group — "This week", "Up next". Upper-cased so it
   * reads as a signpost, not as content, and never used for anything you must read
   * to act: the content under it carries the meaning.
   */
  eyebrow: { fontFamily: family.text, fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 1.3, textTransform: 'uppercase' as const },
  heading: { fontFamily: family.display, fontSize: 20, lineHeight: 26, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontFamily: family.text, fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  label: { fontFamily: family.text, fontSize: 15, lineHeight: 20, fontWeight: '500' as const },
  caption: { fontFamily: family.text, fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
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
  /**
   * Press feedback, and the ceiling for it. A pressable is touched hundreds of
   * times a day, so its response has to be felt rather than watched: anything
   * longer than this stops reading as the surface giving way and starts reading
   * as the app thinking about it.
   */
  press: 120,
  fast: 150,
  base: 200,
  slow: 250,
  /** How far a pressable gives under a thumb. 3% reads as physical; 5% as a toy. */
  pressScale: 0.97,
  /**
   * Springs, in the two parameters Reanimated 4 actually takes.
   *
   * The old `{ damping, stiffness, mass }` triple is gone — nothing consumed it,
   * and that form cannot express "settle in 300ms without overshooting" without
   * doing the algebra by hand. `dampingRatio` 1 is critically damped: fast, no
   * bounce. Below 1 overshoots, and only one thing here is allowed to.
   */
  spring: {
    /** Anything returning to rest with no finger on it. */
    settle: { duration: 400, dampingRatio: 1 },
    /**
     * A sheet or drawer under a thumb, and the only overshoot in the app: a flick
     * carries momentum, and a drawer that stops dead at its detent reads as jammed.
     * Pass the gesture's velocity with it or the handoff shows a seam.
     */
    sheet: { duration: 300, dampingRatio: 0.8 },
  },
} as const;

/**
 * Light and heat: the two things this palette has that a flat dark theme does not.
 *
 * `edge` is a one-pixel highlight along the top of a raised surface. Machined iron
 * catches light on its chamfer, and a card carrying one reads as an object sitting
 * ON the background rather than as a lighter region OF it. White at 5.5% — far too
 * faint to be a border, which is exactly the point: a border marks where a thing
 * ends, this marks which way is up. It is never load-bearing, so it needs no
 * contrast ratio; remove it and nothing becomes unreadable.
 *
 * `heat` is the accent used as light instead of as ink — an accent-coloured glow
 * under the one live thing on screen. It is rationed on purpose: the primary
 * action, a session in progress, a running rest timer. Nothing else. If three
 * things glow, nothing reads as live, and the ration is the whole idea — in a dark
 * room the eye goes to the warm thing, which is the thing you are meant to touch.
 *
 * `boxShadow` rather than `elevation`: Android's elevation shadow is black
 * whatever `shadowColor` says, so a warm glow drawn that way is just a dark
 * smudge. RN 0.86 renders `boxShadow` on both platforms.
 */
export const material = {
  edge: 'rgba(255,255,255,0.055)',
  /** A sheet and the session hero sit closer to the light. */
  edgeStrong: 'rgba(255,255,255,0.09)',
  heat: `0px 6px 20px -4px ${color.accent}59`,
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
