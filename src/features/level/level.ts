import type { IconName } from '@/components/Icon';
import { useLive } from '@/db/live';
import { lifetimeStats } from '@/db/repositories/level';
import { levelOf, newlyEarned, xpOf, type Badge, type BadgeId, type Level, type LifetimeStats, type XpPart } from '@/engine/level';
import { hydrationTarget } from '@/services/hydration';
import { color } from '@/theme/tokens';

/** Everything a level is computed from. A write to any of these can move it. */
const TABLES = ['session', 'set_log', 'exercise_session_stat', 'water_log', 'meal_log', 'weigh_in', 'setting', 'routine'] as const;

export interface LevelNow {
  stats: LifetimeStats;
  xp: number;
  level: Level;
  parts: XpPart[];
}

export function readLevel(): LevelNow {
  const stats = lifetimeStats({ waterTargetMl: hydrationTarget().ml });
  const { total, parts } = xpOf(stats);
  return { stats, xp: total, level: levelOf(total), parts };
}

export function useLevel(): LevelNow {
  return useLive(readLevel, TABLES);
}

export interface Reward {
  gained: number;
  /** Where this workout's XP came from, each source with what it added. */
  parts: XpPart[];
  before: Level;
  after: Level;
  badges: Badge[];
}

/** What one workout added: the stats without it, set against the stats with it. */
export function sessionReward(sessionId: string): Reward {
  const water = hydrationTarget().ml;
  const statsWithout = lifetimeStats({ waterTargetMl: water, exclude: sessionId });
  const statsWith = lifetimeStats({ waterTargetMl: water });
  const without = xpOf(statsWithout);
  const withIt = xpOf(statsWith);
  const parts = withIt.parts
    .map((p, i) => ({ ...p, count: p.count - (without.parts[i]?.count ?? 0), xp: p.xp - (without.parts[i]?.xp ?? 0) }))
    .filter((p) => p.xp > 0);
  return {
    gained: withIt.total - without.total,
    parts,
    before: levelOf(without.total),
    after: levelOf(withIt.total),
    badges: newlyEarned(statsWithout, statsWith),
  };
}

/** Each badge's glyph and the tracker colour it belongs to. */
export const BADGE_LOOK: Record<BadgeId, { icon: IconName; tint: string }> = {
  'first-workout': { icon: 'dumbbell', tint: color.accent },
  'workouts-10': { icon: 'trophy', tint: color.accent },
  'workouts-50': { icon: 'trophy', tint: color.accent },
  'workouts-100': { icon: 'trophy', tint: color.accent },
  'first-best': { icon: 'star', tint: color.accent },
  'bests-25': { icon: 'star', tint: color.accent },
  'tonnes-1': { icon: 'bolt', tint: color.accent },
  'tonnes-10': { icon: 'bolt', tint: color.accent },
  'tonnes-100': { icon: 'bolt', tint: color.accent },
  'goal-week': { icon: 'calendar', tint: color.accent },
  'goal-weeks-4': { icon: 'calendar', tint: color.accent },
  hydrated: { icon: 'water', tint: color.cold },
  fuelled: { icon: 'food', tint: color.peach },
  'on-the-scale': { icon: 'body', tint: color.lav },
  'early-bird': { icon: 'sun', tint: color.warning },
  'night-owl': { icon: 'moon', tint: color.lav },
};

/** "1,240" — grouped, because XP is a score to read at a glance, not a weight to compare. */
export const fmtXp = (n: number) => Math.round(n).toLocaleString('en-US');
