/**
 * The only place colours, spacing, radii, type sizes and motion constants live.
 * A hardcoded hex or magic number in a screen is a bug. See docs/05-DESIGN-SYSTEM.md.
 */

/**
 * "Volt": a near-black stage, one electric lime for action and progress, and a
 * colour of its own for each thing you track, so every tile says what it is
 * before you read it.
 *
 *   volt   — training, the one action on a screen, a new best
 *   sky    — water
 *   peach  — food
 *   lav    — body and weight
 *   pink   — the third macro, and anything a tile needs set apart
 *
 * Tiles in those colours carry near-black ink (`onTile`, 10 : 1 or better on every
 * one). Red still means pain and nothing else. Every ratio is measured by
 * tests/theme-contrast.test.ts.
 */
export const color = {
  bg: '#0C0C0E',
  surface: '#17171A',
  surfaceHigh: '#202024',
  border: '#2A2A30',
  /** Graduations, track backgrounds, chart gridlines. Never text. */
  rule: '#34343B',

  text: '#F6F6F7', // 15.0 : 1 on surfaceHigh
  textMuted: '#A2A2AC', // 6.4 : 1 on surfaceHigh
  textFaint: '#8A8A94', // 4.75 : 1 on surfaceHigh

  /** Volt. As ink, 14 : 1 on the darkest card; filled, it carries near-black ink. */
  accent: '#D6FF3D',
  accentPressed: '#C2EB2B',
  accentFill: '#D6FF3D',
  accentFillPressed: '#C2EB2B',
  accentSoft: 'rgba(214,255,61,0.55)',
  /** A volt tint behind volt text: chips, the done state of a set. Never under body text. */
  accentWash: 'rgba(214,255,61,0.14)',
  onAccent: '#0C0C0E',

  /** Water. */
  cold: '#8ED8FF',
  /** The bottom of the water in the wave card: the same sky, deeper. */
  coldDeep: '#4FA6E0',
  coldSoft: 'rgba(142,216,255,0.16)',
  /** Food. */
  peach: '#FFB98A',
  peachSoft: 'rgba(255,185,138,0.16)',
  /** Body. */
  lav: '#C3B3FF',
  lavSoft: 'rgba(195,179,255,0.16)',
  pink: '#FFA6D6',

  /** Ink on any of the coloured tiles above, and its quieter second voice. */
  onTile: '#0C0C0E',
  onTileMuted: '#3A3A40',
  /** A darker band on a coloured tile: a progress track, a quiet chip. */
  onTileWash: 'rgba(12,12,14,0.12)',

  positive: '#D6FF3D', // a new best, an on-track trend
  warning: '#FFD25C', // worth a look — a stall, a lighter week
  warningWash: 'rgba(255,210,92,0.14)',
  /** Pain as ink. */
  danger: '#FF6B6F',
  dangerWash: 'rgba(255,107,111,0.14)',
  /** Pain as a filled destructive button. White on it is 5.2 : 1. */
  dangerFill: '#CC2F36',
  dangerPressed: '#B3262D',
  onDanger: '#FFFFFF',

  /** What a sheet dims the screen behind it with. */
  scrim: 'rgba(0,0,0,0.66)',

  chart: '#F6F6F7',
  chartFaint: 'rgba(246,246,247,0.3)',
} as const;

/**
 * Google's own sign-in button: white, with the four-colour G. Brand colours, not
 * theme colours — Google's branding rules fix them, so they never follow the palette.
 */
export const brand = {
  googleSurface: '#FFFFFF',
  googleSurfacePressed: '#EDEDED',
  googleInk: '#1F1F1F',
  googleBlue: '#4285F4',
  googleGreen: '#34A853',
  googleYellow: '#FBBC05',
  googleRed: '#EA4335',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Space BETWEEN groups clearly exceeds space WITHIN them, so grouping reads. */
export const gap = {
  within: space.sm,
  between: space.md,
  section: space.xl,
} as const;

/** Soft, generous corners: tiles are big rounded slabs, every control is a pill. */
export const radius = { sm: 10, md: 16, button: 999, lg: 26, xl: 32, pill: 999 } as const;

/**
 * Two faces, embedded at build time by the expo-font config plugin (app.json).
 *
 *   Plus Jakarta Sans          — everything you read and tap: body, labels, buttons.
 *   Archivo Condensed (italic) — the athletic voice: screen titles, the name of
 *                                today's workout, and every big number.
 */
export const family = { text: 'Plus Jakarta Sans', display: 'Archivo Condensed', measure: 'Archivo Condensed' } as const;

export const font = {
  /** Tabular figures in the text face — small numbers inside lines of text. */
  numeric: { fontFamily: family.text, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  /** A big number, at any size. Pair with a fontSize. */
  measure: { fontFamily: family.measure, fontWeight: '800' as const, fontStyle: 'italic' as const, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  /** The number being logged: weight and reps in a workout. */
  hero: { fontFamily: family.measure, fontSize: 60, lineHeight: 64, fontWeight: '900' as const, fontStyle: 'italic' as const, letterSpacing: -1, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  /** The one figure a screen is about. */
  display: { fontFamily: family.measure, fontSize: 64, lineHeight: 66, fontWeight: '900' as const, fontStyle: 'italic' as const, letterSpacing: -1, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  /** A tab screen's title: "Food", "Progress". */
  title: { fontFamily: family.display, fontSize: 40, lineHeight: 44, fontWeight: '900' as const, fontStyle: 'italic' as const, letterSpacing: -0.6 },
  /** A pushed screen's title, centred between its round buttons. */
  titleSm: { fontFamily: family.text, fontSize: 17, lineHeight: 22, fontWeight: '800' as const, letterSpacing: -0.2 },
  /** A small label over a group or a tile. */
  eyebrow: { fontFamily: family.text, fontSize: 13, lineHeight: 17, fontWeight: '700' as const, letterSpacing: 0 },
  heading: { fontFamily: family.text, fontSize: 18, lineHeight: 24, fontWeight: '800' as const, letterSpacing: -0.2 },
  body: { fontFamily: family.text, fontSize: 15, lineHeight: 22, fontWeight: '500' as const },
  label: { fontFamily: family.text, fontSize: 15, lineHeight: 20, fontWeight: '700' as const },
  caption: { fontFamily: family.text, fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
} as const;

/** Minimum tap targets. The workout screen uses `gym`; everything else `default`. */
export const hit = { gym: 56, default: 48 } as const;

export const motion = {
  /** Press feedback, and its ceiling: felt, never watched. */
  press: 120,
  fast: 150,
  base: 200,
  slow: 250,
  /** How long a just-logged set stays lit before it settles. */
  cool: 900,
  pressScale: 0.96,
  spring: {
    /** Anything returning to rest with no finger on it. */
    settle: { duration: 400, dampingRatio: 1 },
    /** A sheet under a thumb: carries the flick's momentum. */
    sheet: { duration: 300, dampingRatio: 0.8 },
    rule: { duration: 320, dampingRatio: 1 },
  },
} as const;

/** Light: a faint top highlight on raised slabs, and a volt glow under the one action. */
export const material = {
  edge: 'rgba(255,255,255,0.04)',
  edgeStrong: 'rgba(255,255,255,0.07)',
  heat: `0px 10px 28px -10px ${color.accent}88`,
  /** A coloured tile casts a little of its own light onto the stage, so it reads as lit, not printed. */
  glow: {
    volt: `0px 18px 48px -18px ${color.accent}99`,
    sky: `0px 18px 48px -18px ${color.cold}88`,
    peach: `0px 18px 48px -18px ${color.peach}88`,
    lav: `0px 18px 48px -18px ${color.lav}88`,
  },
  /** What floats over the stage — the tab bar, a toast — casts this. */
  lift: '0px 12px 32px -10px rgba(0,0,0,0.7)',
  /** Content scrolling under a dock fades into the stage instead of meeting a rule. */
  dockFade: `linear-gradient(to bottom, rgba(12,12,14,0) 0%, ${color.bg} 38%)`,
} as const;

export const layout = {
  screenPadding: 18,
  scrollTail: space.xxl,
  actionBarHeight: 96,
  /** The floating tab bar's footprint above the bottom inset. */
  tabBar: 84,
} as const;
