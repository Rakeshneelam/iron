/** Daily targets: measured TDEE once 14 days exist, a clearly labelled estimate before that. */
import { getLatestWeight, listWeighIns } from '@/db/repositories/body';
import { intakeHistory } from '@/db/repositories/food';
import { listSessions } from '@/db/repositories/sessions';
import { getSettings } from '@/db/repositories/settings';
import { adaptiveTDEE, dailyTargets, type Targets } from '@/engine/metabolic';
import { addDays } from '@/lib/date';
import { DEFAULT_WEIGHT_KG } from '@/services/hydration';

export interface DayTargets extends Targets {
  tdeeConfidence: number | null;
  loggedDays: number;
  /** True when the user set the numbers themselves. */
  manual: boolean;
}

/**
 * How much to trust the number, in words. A bare 0.62 tells the user nothing they
 * can act on; "still settling" tells them to keep logging.
 */
export function confidenceLabel(t: DayTargets): string {
  if (t.manual) return 'Set by you';
  if (t.tdeeConfidence === null) return `${t.loggedDays} of 14 days logged`;
  if (t.tdeeConfidence >= 0.8) return 'Well established';
  if (t.tdeeConfidence >= 0.5) return 'Still settling';
  return 'Early — keep logging';
}

export function computeTargets(dateISO: string): DayTargets {
  const s = getSettings();
  // Today is still in progress — measure maintenance from the days before it.
  const intake = intakeHistory(28, addDays(dateISO, -1));
  const adaptive = adaptiveTDEE(intake, listWeighIns());
  const trainingDay = s.calorieCycling ? listSessions(10).some((x) => x.date === dateISO) : undefined;
  const t = dailyTargets({
    weightKg: getLatestWeight() ?? DEFAULT_WEIGHT_KG,
    heightCm: s.heightCm,
    age: s.age,
    sex: s.sex,
    phase: s.phase,
    tdee: adaptive?.tdee ?? null,
    activityFactor: s.activityFactor,
    trainingDay,
  });
  // Your own numbers win. Applied here rather than in the engine: `Targets.basis` is
  // 'measured' | 'estimated' in src/engine, which stays pure (AGENTS.md §2).
  const kcal = s.manualKcal ?? t.kcal;
  const proteinG = s.manualProteinG ?? t.proteinG;
  const manual = s.manualKcal !== null || s.manualProteinG !== null;
  // Fat holds its floor and carbs absorb the change, so the macros still add up.
  const fatG = manual ? Math.round(Math.max(t.fatG, (kcal * 0.22) / 9)) : t.fatG;
  const carbG = manual ? Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4)) : t.carbG;

  return {
    ...t,
    kcal,
    proteinG,
    fatG,
    carbG,
    note: manual ? 'Your own targets. Clear them in Settings to go back to the estimate.' : t.note,
    manual,
    tdeeConfidence: adaptive?.confidence ?? null,
    loggedDays: intake.length,
  };
}
