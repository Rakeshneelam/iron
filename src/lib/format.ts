/**
 * Number -> string, for display only. Never parse these back.
 *
 * Rules that hold everywhere: no trailing '.0', no thousands separators (they jitter
 * under tabular figures), and the unit is part of the string so a screen never
 * concatenates one by hand.
 *
 * Pure module: no React, no DB.
 */

/** Round to `dp` and drop trailing zeros: 62.50 -> '62.5', 100.00 -> '100'. */
function trim(n: number, dp: number): string {
  if (!Number.isFinite(n)) return '0';
  const fixed = n.toFixed(dp);
  if (dp <= 0) return fixed;
  return fixed.replace(/\.?0+$/, '');
}

/** '62.5' — bare weight, up to 2 dp (plate maths bottoms out at 0.25 kg). */
export function kgNum(n: number): string {
  return trim(n, 2);
}

/** '62.5 kg'. */
export function kg(n: number): string {
  return `${kgNum(n)} kg`;
}

/** '750 ml' below a litre, '1.2 L' at or above it. */
export function ml(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  if (Math.abs(v) >= 1000) return `${trim(v / 1000, 1)} L`;
  return `${Math.round(v)} ml`;
}

/** '2450 kcal'. */
export function kcal(n: number): string {
  return `${Math.round(Number.isFinite(n) ? n : 0)} kcal`;
}

/** '180 g'; keeps one decimal under 10 g so 2.4 g of fibre does not read as 2 g. */
export function grams(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${Math.abs(v) < 10 ? trim(v, 1) : trim(v, 0)} g`;
}

/** Ratio -> percent: `pct(0.62)` is '62%', `pct(0.625, 1)` is '62.5%'. */
export function pct(n: number, dp = 0): string {
  const v = Number.isFinite(n) ? n * 100 : 0;
  return `${v.toFixed(Math.max(0, dp))}%`;
}

/** '+2.5' / '-1.0'; an exact zero after rounding loses the sign: '0.0'. */
export function signed(n: number, dp = 1): string {
  const places = Math.max(0, dp);
  const v = Number.isFinite(n) ? n : 0;
  const rounded = Number(v.toFixed(places));
  if (rounded === 0) return (0).toFixed(places);
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(places)}`;
}
