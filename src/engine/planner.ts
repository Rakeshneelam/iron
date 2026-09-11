/**
 * Plans for a person, not a template library. PURE.
 *   recommendTemplates — rank predefined plans against a short profile, with reasons
 *   adaptTemplate      — swap out anything the equipment, dislikes or flagged
 *                        limitations rule out (never silently: every swap is listed)
 *   fitSession         — "I only have 30 minutes": keep the important lifts, trim
 *                        accessories first, never shorten rest below the plan's
 */
import type { Accessory, CatalogExercise, Equipment, Level, Stress } from '../data/catalog/types.ts';
import type { EquipmentPreset, Goal, PlanTemplate, TemplateSlot } from '../data/templates.ts';
import { isAllowed, substitutes, type SubContext } from './substitute.ts';

export type Tool = Equipment | Accessory;

export const PRESET_TOOLS: Record<EquipmentPreset, readonly Tool[]> = {
  gym: ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'band', 'smith', 'bodyweight', 'bench', 'rack', 'pullup_bar', 'dip_station', 'box', 'cardio_machine'],
  home: ['barbell', 'dumbbell', 'band', 'bodyweight', 'bench', 'rack', 'pullup_bar', 'box'],
  dumbbells: ['dumbbell', 'bodyweight', 'bench'],
  bands: ['band', 'bodyweight'],
  bodyweight: ['bodyweight'],
};

export interface TrainingProfile {
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  minutes: number;
  tools: ReadonlySet<Tool>;
  disliked: ReadonlySet<string>;
  limitations: ReadonlySet<Stress>;
}

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];

export interface AdaptedPlan {
  days: { label: string; slots: TemplateSlot[] }[];
  swaps: { from: string; to: string; reason: string }[];
  /** Exercises with no acceptable substitute. */
  removed: string[];
}

function ctxOf(p: TrainingProfile): SubContext {
  return { available: p.tools, disliked: p.disliked, limitations: p.limitations };
}

export function adaptTemplate(t: PlanTemplate, profile: TrainingProfile, catalog: ReadonlyMap<string, CatalogExercise>): AdaptedPlan {
  const ctx = ctxOf(profile);
  const pool = [...catalog.values()];
  const swaps: AdaptedPlan['swaps'] = [];
  const removed: string[] = [];
  const days = t.days.map((d) => {
    const used = new Set<string>();
    const slots: TemplateSlot[] = [];
    for (const s of d.slots) {
      const e = catalog.get(s.exerciseId);
      if (!e) {
        removed.push(s.exerciseId);
        continue;
      }
      if (isAllowed(e, ctx) && !used.has(e.id)) {
        slots.push(s);
        used.add(e.id);
        continue;
      }
      const sub = substitutes(e, pool, { ...ctx, exclude: used }, 1)[0];
      if (sub) {
        slots.push({ ...s, exerciseId: sub.id });
        used.add(sub.id);
        swaps.push({ from: e.id, to: sub.id, reason: sub.reasons.join(' · ') });
      } else {
        removed.push(e.id);
      }
    }
    return { label: d.label, slots };
  });
  return { days, swaps, removed };
}

export interface TemplateMatch {
  template: PlanTemplate;
  score: number;
  reasons: string[];
  swaps: number;
  /** False when something important could not be replaced with what you have. */
  fits: boolean;
}

export function recommendTemplates(profile: TrainingProfile, templates: readonly PlanTemplate[], catalog: ReadonlyMap<string, CatalogExercise>): TemplateMatch[] {
  return templates
    .map((t) => {
      const reasons: string[] = [];
      let score = 0;
      if (t.goal === profile.goal) {
        score += 3;
        reasons.push('Matches your goal');
      } else if (t.goal === 'general' || profile.goal === 'general') score += 1;

      const lv = Math.abs(LEVELS.indexOf(t.level) - LEVELS.indexOf(profile.level));
      if (lv === 0) {
        score += 3;
        reasons.push(`Built for ${t.level}s`);
      } else score += lv === 1 ? 0.5 : -3;

      const dd = Math.abs(t.daysPerWeek - profile.daysPerWeek);
      if (dd === 0) {
        score += 3;
        reasons.push(`${t.daysPerWeek} days a week`);
      } else score += dd === 1 ? 1 : -dd;

      if (t.minutes <= profile.minutes) {
        score += 2;
        reasons.push(`About ${t.minutes} min`);
      } else score -= (t.minutes - profile.minutes) / 10;

      const adapted = adaptTemplate(t, profile, catalog);
      const total = t.days.reduce((n, d) => n + d.slots.length, 0);
      const fits = adapted.removed.length === 0 && adapted.swaps.length <= total / 2;
      if (!fits) score -= 6;
      else if (adapted.swaps.length === 0) {
        score += 2;
        reasons.push('Uses exactly what you have');
      } else {
        score += 1;
        reasons.push(`${adapted.swaps.length} ${adapted.swaps.length === 1 ? 'swap' : 'swaps'} for your equipment`);
      }
      return { template: t, score: Math.round(score * 10) / 10, reasons, swaps: adapted.swaps.length, fits };
    })
    .sort((a, b) => b.score - a.score || a.template.minutes - b.template.minutes);
}

/* ============================ time budgeting ============================ */

export interface FitSlot {
  exerciseId: string;
  sets: number;
  restSeconds: number;
  compound: boolean;
  repHi: number;
  measure?: 'reps' | 'time';
}

/** Working time per set (s) for rep-based sets; timed sets use their target. */
const SET_SECONDS = 45;
const CHANGEOVER = 45;

export function estimateSeconds(slots: readonly Pick<FitSlot, 'sets' | 'restSeconds' | 'repHi' | 'measure'>[]): number {
  return slots.reduce((t, s) => {
    const work = s.measure === 'time' ? s.repHi : SET_SECONDS;
    return t + s.sets * work + Math.max(0, s.sets - 1) * s.restSeconds + CHANGEOVER;
  }, 0);
}

export interface FitResult {
  slots: { exerciseId: string; sets: number }[];
  dropped: string[];
  trimmed: string[];
  minutes: number;
  /** True when even the trimmed session runs over the budget. */
  over: boolean;
}

/**
 * Shorten a session to fit `minutes` (warm-up included). Order of cuts: accessory
 * sets → accessories → sets on later compounds → later compounds. The first lift and
 * at least two exercises always stay. Rest periods are not shortened.
 */
export function fitSession(slots: readonly FitSlot[], minutes: number, warmupSeconds: number): FitResult {
  const cur = slots.map((s) => ({ ...s }));
  const budget = minutes * 60 - warmupSeconds;
  const est = () => estimateSeconds(cur);
  const dropped: string[] = [];
  const trimmed: string[] = [];

  for (let i = cur.length - 1; i >= 0 && est() > budget; i--) {
    const s = cur[i];
    if (s && !s.compound && s.sets > 2) {
      s.sets = 2;
      trimmed.push(s.exerciseId);
    }
  }
  for (let i = cur.length - 1; i >= 0 && est() > budget && cur.length > 2; i--) {
    const s = cur[i];
    if (s && !s.compound) {
      dropped.push(s.exerciseId);
      cur.splice(i, 1);
    }
  }
  for (let i = cur.length - 1; i >= 1 && est() > budget; i--) {
    const s = cur[i];
    if (s && s.sets > 2) {
      s.sets = 2;
      if (!trimmed.includes(s.exerciseId)) trimmed.push(s.exerciseId);
    }
  }
  while (cur.length > 2 && est() > budget) {
    const last = cur.pop();
    if (last) dropped.push(last.exerciseId);
  }
  const total = est() + warmupSeconds;
  return {
    slots: cur.map((s) => ({ exerciseId: s.exerciseId, sets: s.sets })),
    dropped,
    trimmed: trimmed.filter((id) => !dropped.includes(id)),
    minutes: Math.round(total / 60),
    over: total > minutes * 60,
  };
}
