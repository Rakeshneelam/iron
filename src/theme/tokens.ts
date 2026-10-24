/**
 * The only place colours, spacing, radii, type sizes and motion constants live.
 * A hardcoded hex or magic number in a screen is a bug. See docs/05-DESIGN-SYSTEM.md,
 * and docs/13-THE-RECORD.md for the drawing conventions these values serve.
 */

/**
 * Three materials, and one thing that is alive.
 *
 *   graphite — the ground: cast iron, plate rubber, pencil lead. The passive record.
 *   chalk    — the ink. Everything you logged is written in it.
 *   heat     — the forge. Only what is live right now: the one action to take, the
 *              set under your thumb, a running rest, the set you just logged (which
 *              cools into chalk over 900ms). If two things glow, nothing is live.
 *
 * Then four inks that each mean exactly one thing, so none of them is decoration:
 *
 *   cold      — water, the one record that is a level rather than a count
 *   positive  — a new personal best. A fact, drawn as a datum line, never a reward
 *   warning   — "worth a look": a stall, a lighter week. Violet, because amber is
 *               now heat, and because a stall is not an alarm
 *   danger    — pain. Red means that and nothing else (never a missed day, never
 *               bodyweight going up, never eating over a target)
 *
 * The ground used to be near-black #0B0B0D under a single vermilion accent — the
 * most common default in generated dark interfaces, and it said nothing about this
 * app. Graphite keeps everything a gym at night needs from a dark ground (glare,
 * OLED, arm's-length contrast) while reading as a material instead of a void, and
 * chalk ink is warm against it the way chalk is against iron.
 *
 * Every ratio below is measured by tests/theme-contrast.test.ts, not eyeballed.
 */
export const color = {
  bg: '#15181B',
  surface: '#1C2024',
  surfaceHigh: '#252A2F',
  border: '#343A41',
  /**
   * Graduations and minor ticks on the instruments (Rule, the day score, the
   * record). 2.3 : 1 on bg, which is the point: a graduation is a texture you read
   * through, not a mark you read. Nothing that must be seen is drawn in it — a
   * planned set is a chalk or heat outline, never a rule-coloured one.
   */
  rule: '#4A525A',

  text: '#EFEBE4', // chalk. 15.0 : 1 on bg
  textMuted: '#ACABA6', // 6.3 : 1 on surfaceHigh, the worst ground
  /** Still ≥ 4.5 : 1 on every ground (4.74 on surfaceHigh), and still quieter than textMuted. */
  textFaint: '#93948F',

  /**
   * Heat. As ink on graphite it measures 8.9 : 1, so it reads as text, stroke and
   * fill alike. Filled, it carries graphite rather than white: white on an amber
   * this light would be 1.9 : 1, and dark-on-heat is also what high-visibility
   * equipment does, for the same reason — it reads from across a room.
   */
  accent: '#FFA321',
  accentPressed: '#E08A12',
  /** Kept as its own token so a filled action can drift from the ink without touching every chart. */
  accentFill: '#FFA321',
  accentFillPressed: '#E08A12', // graphite on it 6.6 : 1
  accentSoft: 'rgba(255,163,33,0.55)', // secondary muscles in demos and maps
  /** The first frame of the set-logged flash, and nothing else. Never a ground for text. */
  accentWash: 'rgba(255,163,33,0.16)',
  onAccent: '#15181B',

  /** Water's ink. 7.2 : 1 on surfaceHigh. */
  cold: '#6CC3D9',
  /** The water level under its line. A fill to read through, never under text that matters. */
  coldSoft: 'rgba(108,195,217,0.18)',

  positive: '#6CCB8E', // a new best, an on-track trend
  warning: '#B3A2F2', // worth a look — a stall, a lighter week
  /** Pain as ink — text, a flag, a mark. 4.78 : 1 on surfaceHigh. */
  danger: '#EF6B5F',
  /** Pain as a filled destructive button. White on it is 5.94 : 1. */
  dangerFill: '#B23A2E',
  /** Held, on the filled destructive button. White on it is 6.5 : 1. */
  dangerPressed: '#A9352B',
  onDanger: '#FFFFFF',

  /** What a sheet dims the screen behind it with. */
  scrim: 'rgba(5,6,7,0.62)',

  /** Derived lines (a trend, an estimate) are drawn in chalk: they are read, not acted on. */
  chart: '#EFEBE4',
  chartFaint: 'rgba(239,235,228,0.32)',
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

/**
 * Machined, not pillowy: small radii, stepped by what the thing is. A chip is not
 * a button is not a plate is not a sheet, so they do not share one radius — the
 * "one border-radius on everything" look is what made every surface read as the
 * same kind of card.
 */
export const radius = { sm: 4, md: 8, button: 10, lg: 12, xl: 20, pill: 999 } as const;

/**
 * The faces, embedded at build time by the expo-font config plugin (app.json), so
 * there is no runtime loading and nothing to wait on. The Android XML families
 * carry the same names iOS reads from the files, so one string works on both, and
 * fontWeight picks the right file on each.
 *
 * Width carries meaning:
 *
 *   Plex              — everything you read: body, labels, captions.
 *   Archivo           — names: titles, headings, filled buttons, exercise names.
 *   Archivo Condensed — measurements: the weight under your thumb, the trend, the
 *                       litres. Condensed figures are taller for the same width, so
 *                       the number you check from a bench gets bigger without the
 *                       field getting wider. The same family, so the two widths read
 *                       as one voice measuring and naming, not as a second font.
 */
export const family = { text: 'IBM Plex Sans', display: 'Archivo', measure: 'Archivo Condensed' } as const;

/**
 * Roles, each visibly distinct from its neighbours. Body copy has real leading,
 * and every number that changes uses tabular figures so nothing jitters while a
 * stepper is held or a timer runs.
 *
 * The big measuring roles (`hero`, `display`, `measure`) carry their own family and
 * figures. Do not spread `font.numeric` after them — it resets the family to the
 * naming width.
 */
export const font = {
  /** Tabular figures in the naming face — small numbers inside lines of text. */
  numeric: { fontFamily: family.display, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  /** A measurement at any size. Pair with a fontSize; use at 18pt and above. */
  measure: { fontFamily: family.measure, fontWeight: '700' as const, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  /** The number being logged: weight and reps on the session screen. Nothing on screen is louder. */
  hero: { fontFamily: family.measure, fontSize: 52, lineHeight: 56, fontWeight: '800' as const, letterSpacing: -0.6, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  /** The one figure a screen is about: trend weight, litres today, a lift's best. */
  display: { fontFamily: family.measure, fontSize: 52, lineHeight: 56, fontWeight: '800' as const, letterSpacing: -0.8, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  title: { fontFamily: family.display, fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.8 },
  /** A pushed screen's title, beside its back arrow. */
  titleSm: { fontFamily: family.display, fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  /**
   * A short label that names the group under it — "This week", "Weight".
   *
   * Sentence case, and barely tracked. It used to be 11pt upper-case with 1.3pt
   * tracking, the eyebrow every generated interface puts over every heading; the
   * content under it already carries the meaning, so the label only has to be
   * findable, not loud.
   */
  eyebrow: { fontFamily: family.text, fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.2 },
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
  /**
   * How long a just-logged mark stays hot before it is ink like the rest of the
   * record. Long enough to see from the corner of an eye while racking a bar;
   * short enough that it is over before the next thing you look at.
   */
  cool: 900,
  /** How far a pressable gives under a thumb. 3% reads as physical; 5% as a toy. */
  pressScale: 0.97,
  /**
   * Springs, in the two parameters Reanimated 4 actually takes. `dampingRatio` 1
   * is critically damped: fast, no bounce. Below 1 overshoots, and only things
   * that carry a thumb's momentum are allowed to.
   */
  spring: {
    /** Anything returning to rest with no finger on it. */
    settle: { duration: 400, dampingRatio: 1 },
    /**
     * A sheet or drawer under a thumb: a flick carries momentum, and a drawer that
     * stops dead at its detent reads as jammed. Pass the gesture's velocity with it.
     */
    sheet: { duration: 300, dampingRatio: 0.8 },
    /**
     * A rule let go after a drag, settling onto the nearest graduation. Critically
     * damped: it carries the flick's velocity but must stop ON the number it shows,
     * so it never swings past it and back.
     */
    rule: { duration: 320, dampingRatio: 1 },
  },
} as const;

/**
 * Light and heat.
 *
 * `edge` is a one-pixel highlight along the top of a raised surface: machined iron
 * catches light on its chamfer, and a plate carrying one reads as an object sitting
 * ON the ground rather than as a lighter region OF it. Never load-bearing.
 *
 * `heat` is the accent used as light instead of as ink — a glow under the one live
 * thing on screen. Rationed: the primary action, a running rest timer. `boxShadow`
 * rather than `elevation`, because Android's elevation shadow is black whatever
 * `shadowColor` says, and a warm glow drawn that way is just a dark smudge.
 */
export const material = {
  edge: 'rgba(255,255,255,0.05)',
  /** A sheet and the session hero sit closer to the light. */
  edgeStrong: 'rgba(255,255,255,0.085)',
  heat: `0px 6px 22px -6px ${color.accent}66`,
} as const;

export const layout = {
  screenPadding: space.lg,
  /**
   * What a scroll leaves clear at the bottom when the screen has NO fixed dock —
   * just enough that the last row is not flush against the tab bar. A dock
   * reports its measured height instead (UX-11).
   */
  scrollTail: space.xxl,
  /** Primary actions live in the bottom third; nothing critical in top corners. */
  actionBarHeight: 96,
} as const;
