/**
 * What the gym can actually load.
 *
 * `roundToStep` in the engine rounds to a nominal increment; this module rounds to
 * the metal on the rack. A 2.5 kg step is a lie on a dumbbell rack that jumps 2 kg
 * to 30 and 5 kg after, and a plate breakdown is only real if he owns the plates.
 *
 * Pure module: no React, no DB — it takes `equipment` rows, it does not read them.
 */
import type * as schema from '@/db/schema';
import type { LoadType } from '@/engine/progression';
import { roundToStep } from '@/engine/progression';

export type EquipmentRow = typeof schema.equipment.$inferSelect;

/** Plate maths in hundredths of a kg: 1.25 kg is exact, 1.25 as a float is not. */
const CENTI = 100;
const toCenti = (v: number): number => Math.round(v * CENTI);
const fromCenti = (v: number): number => v / CENTI;

/** Guard so a pathological inventory can never hang the logging screen. */
const SEARCH_BUDGET = 200_000;

interface Denomination {
  /** Plate weight, hundredths of a kg. */
  value: number;
  /** How many of it can go on ONE side. */
  max: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Plate rows -> per-side denominations, heaviest first. `count` on the row is TOTAL
 * plates owned, and plates load in pairs, so one side gets floor(count / 2).
 */
function plateInventory(equipment: EquipmentRow[]): Denomination[] {
  const owned = new Map<number, number>();
  for (const row of equipment) {
    if (row.kind !== 'plate') continue;
    const value = toCenti(row.valueKg);
    if (value <= 0) continue;
    const perSide = Math.floor((row.count ?? 0) / 2);
    if (perSide <= 0) continue;
    owned.set(value, (owned.get(value) ?? 0) + perSide);
  }
  return [...owned.entries()]
    .map(([value, max]) => ({ value, max }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Depth-first, heaviest-and-most-first: the first solution found is the greedy one
 * (fewest, biggest plates), and backtracking catches the cases where plain greedy
 * paints itself into a corner because he ran out of 5s.
 */
function solve(
  inv: Denomination[],
  index: number,
  remaining: number,
  picked: number[],
  budget: { left: number },
): boolean {
  if (remaining === 0) return true;
  if (index >= inv.length || budget.left <= 0) return false;
  budget.left -= 1;
  const denom = inv[index];
  if (!denom) return false;
  const take = Math.min(denom.max, Math.floor(remaining / denom.value));
  for (let count = take; count >= 0; count--) {
    picked[index] = count;
    if (solve(inv, index + 1, remaining - count * denom.value, picked, budget)) return true;
  }
  picked[index] = 0;
  return false;
}

/** Can one side be made up of exactly `perSideCenti` from this inventory? */
function loadable(inv: Denomination[], perSideCenti: number): boolean {
  if (perSideCenti === 0) return true;
  if (perSideCenti < 0) return false;
  return solve(inv, 0, perSideCenti, [], { left: SEARCH_BUDGET });
}

/**
 * Per-side plate breakdown for a barbell target, heaviest plate first.
 * `null` when the bar cannot be loaded to it — below the bar, or the plates are not
 * in the drawer. An empty array means "just the bar".
 */
export function platesPerSide(
  targetKg: number,
  barKg: number,
  plates: EquipmentRow[],
): { plate: number; count: number }[] | null {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barKg)) return null;
  const perSide = toCenti((targetKg - barKg) / 2);
  if (perSide < 0) return null;
  if (perSide === 0) return [];

  const inv = plateInventory(plates);
  if (inv.length === 0) return null;

  const picked: number[] = new Array<number>(inv.length).fill(0);
  if (!solve(inv, 0, perSide, picked, { left: SEARCH_BUDGET })) return null;

  const out: { plate: number; count: number }[] = [];
  for (let i = 0; i < inv.length; i++) {
    const denom = inv[i];
    const count = picked[i] ?? 0;
    if (!denom || count <= 0) continue;
    out.push({ plate: fromCenti(denom.value), count });
  }
  return out;
}

/** Bars he owns, heaviest first. Empty when the gym has none. */
export function barsAvailable(equipment: EquipmentRow[]): EquipmentRow[] {
  return equipment
    .filter((e) => e.kind === 'bar' && e.count > 0 && e.valueKg > 0)
    .sort((a, b) => b.valueKg - a.valueKg);
}

/** Distinct values of a kind, ascending. */
function valuesOfKind(equipment: EquipmentRow[], kind: EquipmentRow['kind']): number[] {
  const set = new Set<number>();
  for (const e of equipment) {
    if (e.kind !== kind || e.count <= 0 || e.valueKg <= 0) continue;
    set.add(e.valueKg);
  }
  return [...set].sort((a, b) => a - b);
}

/** Closest value in an ascending list; a tie keeps the lighter one. */
function nearestIn(values: number[], target: number, fallback: number): number {
  const first = values[0];
  if (first === undefined) return fallback;
  let best = first;
  let bestDiff = Math.abs(first - target);
  for (const v of values) {
    const diff = Math.abs(v - target);
    if (diff < bestDiff - 1e-9) {
      best = v;
      bestDiff = diff;
    }
  }
  return best;
}

/** Closest loadable total on one specific bar, or null if nothing is reachable. */
function nearestOnBar(targetKg: number, barKg: number, inv: Denomination[]): number | null {
  if (inv.length === 0) return barKg;

  let granularity = 0;
  let maxPerSide = 0;
  for (const d of inv) {
    granularity = granularity === 0 ? d.value : gcd(granularity, d.value);
    maxPerSide += d.value * d.max;
  }
  if (granularity <= 0) return barKg;

  const ideal = toCenti((targetKg - barKg) / 2);
  const steps = Math.floor(maxPerSide / granularity);
  const ideal_k = Math.min(Math.max(Math.round(ideal / granularity), 0), steps);

  for (let d = 0; d <= steps; d++) {
    const down = ideal_k - d;
    if (down >= 0 && loadable(inv, down * granularity)) {
      return barKg + fromCenti(down * granularity) * 2;
    }
    const up = ideal_k + d;
    if (up <= steps && loadable(inv, up * granularity)) {
      return barKg + fromCenti(up * granularity) * 2;
    }
  }
  return null;
}

/**
 * Snap a suggested load to a weight the gym can actually produce.
 *
 * - `dumbbell` — the nearest bell on the rack (2 kg jumps to 30, then 5 kg here).
 * - `barbell`  — bar + a loadable pair of plates, across every bar he owns, so a
 *                12 kg curl lands on the 10 kg EZ bar rather than the 20 kg bar.
 * - `machine` / `cable` — a multiple of the stack's step, never below one plate.
 * - `bodyweight` and any empty inventory — plain `fallbackStep` rounding.
 */
export function nearestLoadable(
  targetKg: number,
  loadType: LoadType,
  equipment: EquipmentRow[],
  fallbackStep: number,
): number {
  const target = Number.isFinite(targetKg) ? targetKg : 0;
  const fallback = roundToStep(target, fallbackStep);

  if (loadType === 'dumbbell') {
    return nearestIn(valuesOfKind(equipment, 'dumbbell'), target, fallback);
  }

  if (loadType === 'barbell') {
    const bars = barsAvailable(equipment);
    if (bars.length === 0) return fallback;
    const inv = plateInventory(equipment);
    let best: number | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const bar of bars) {
      const total = nearestOnBar(target, bar.valueKg, inv);
      if (total === null) continue;
      const diff = Math.abs(total - target);
      if (diff < bestDiff - 1e-9) {
        best = total;
        bestDiff = diff;
      }
    }
    return best ?? fallback;
  }

  if (loadType === 'machine' || loadType === 'cable') {
    const steps = valuesOfKind(equipment, 'machine_stack');
    if (steps.length === 0) return fallback;
    // No machine identity in the signature: the exercise's own declared increment is
    // the best available hint at which stack this is.
    const hint = fallbackStep > 0 ? fallbackStep : (steps[0] ?? 0);
    const step = nearestIn(steps, hint, 0);
    if (step <= 0) return fallback;
    const snapped = roundToStep(target, step);
    return target > 0 ? Math.max(step, snapped) : snapped;
  }

  return fallback;
}
