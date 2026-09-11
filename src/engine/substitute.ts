/**
 * Exercise substitution. PURE.
 *
 * "The machine is taken", "I train at home", "I don't like lunges", "my shoulder
 * doesn't like overhead work": all the same question — what else trains the same
 * muscles through the same movement with what I have? Ranked, with reasons.
 */
import { MUSCLE_LABEL, type Accessory, type CatalogExercise, type Equipment, type Stress } from '../data/catalog/types.ts';

export interface SubContext {
  available: ReadonlySet<Equipment | Accessory>;
  disliked?: ReadonlySet<string>;
  limitations?: ReadonlySet<Stress>;
  exclude?: ReadonlySet<string>;
}

export function isAvailable(e: Pick<CatalogExercise, 'equipment' | 'needs'>, available: ReadonlySet<Equipment | Accessory>): boolean {
  return (e.equipment === 'bodyweight' || available.has(e.equipment)) && (e.needs ?? []).every((n) => available.has(n));
}

export function isAllowed(e: CatalogExercise, ctx: SubContext): boolean {
  return (
    isAvailable(e, ctx.available) &&
    !ctx.disliked?.has(e.id) &&
    !(e.stress ?? []).some((s) => ctx.limitations?.has(s)) &&
    !ctx.exclude?.has(e.id)
  );
}

export interface Substitute {
  id: string;
  score: number;
  reasons: string[];
}

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

export function substitutes(target: CatalogExercise, pool: readonly CatalogExercise[], ctx: SubContext, limit = 6): Substitute[] {
  const out: Substitute[] = [];
  for (const c of pool) {
    if (c.id === target.id || !isAllowed(c, ctx)) continue;
    const sharedPrimary = c.primary.filter((m) => target.primary.includes(m));
    const samePattern = c.pattern === target.pattern;
    if (sharedPrimary.length === 0 && !samePattern) continue;
    if (target.measure === 'time' ? c.measure !== 'time' : c.measure === 'time') continue;

    const reasons: string[] = [];
    let score = 0;
    if (samePattern) {
      score += 4;
      reasons.push('Same movement');
    }
    if (sharedPrimary.length) {
      score += 3 + sharedPrimary.length;
      reasons.push(`Trains ${sharedPrimary.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(' and ')}`);
    }
    score += Math.min(1, (c.secondary ?? []).filter((m) => (target.secondary ?? []).includes(m)).length * 0.5);
    if ((target.alts ?? []).includes(c.id) || (c.alts ?? []).includes(target.id)) {
      score += 2;
      reasons.push('Common swap');
    }
    if (c.equipment === target.equipment) score += 0.5;
    if (c.compound === target.compound) score += 0.5;
    score -= Math.abs(LEVELS.indexOf(c.level) - LEVELS.indexOf(target.level)) * 0.75;
    if (score >= 5) out.push({ id: c.id, score: Math.round(score * 100) / 100, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
