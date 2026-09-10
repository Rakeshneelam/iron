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
  return { ...t, tdeeConfidence: adaptive?.confidence ?? null, loggedDays: intake.length };
}
