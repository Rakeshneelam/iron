/**
 * metabolic-engine.ts
 * ---------------------------------------------------------------------------
 * Bodyweight trend, adaptive TDEE, macro targets and hydration scheduling.
 * Same rules as the progression engine: pure functions, no I/O.
 *
 * The one idea worth stealing here: your calorie target is NOT derived from a
 * BMR formula after week two. It is derived from what you actually ate and
 * what your weight actually did. Formulas are only the cold start.
 * ---------------------------------------------------------------------------
 */

export type Phase = 'cut' | 'recomp' | 'maintain' | 'bulk';
export type Sex = 'male' | 'female';

export interface WeighIn {
  date: string;   // ISO yyyy-mm-dd
  kg: number;
}

export interface IntakeDay {
  date: string;
  kcal: number;
  proteinG?: number;
}

const KCAL_PER_KG_TISSUE = 7700;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/* ========================= Bodyweight trend ============================== */

/**
 * Exponentially weighted moving average. Daily scale weight swings 1-2 kg on
 * water alone — never show the user a raw dot chart and never make a decision
 * from a single morning. alpha 0.1 ≈ a 10-day smoothing window.
 */
export function weightTrend(weighIns: WeighIn[], alpha = 0.1): { date: string; trend: number; raw: number }[] {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date));
  let ewma: number | null = null;
  return sorted.map((w) => {
    ewma = ewma === null ? w.kg : alpha * w.kg + (1 - alpha) * ewma;
    return { date: w.date, trend: Math.round(ewma * 100) / 100, raw: w.kg };
  });
}

/**
 * kg per week the trend line is moving. Negative = losing.
 *
 * `points` counts weigh-ins, not days — someone who weighs once a week has seven
 * readings across six weeks, so the change is divided by the real calendar span
 * between the first and last of them. Counting readings as days reported a rate
 * seven times too fast, and phaseCheck turns that into calorie advice.
 */
export function weeklyRateKg(weighIns: WeighIn[], points = 14, alpha = 0.1): number {
  const t = weightTrend(weighIns, alpha);
  if (t.length < 7) return 0;
  const window = t.slice(-points);
  if (window.length < 7) return 0;
  const firstW = window[0];
  const lastW = window[window.length - 1];
  if (!firstW || !lastW) return 0;
  const spanDays = Math.max(1, daysBetween(firstW.date, lastW.date));
  return ((lastW.trend - firstW.trend) / spanDays) * 7;
}

/* ============================ TDEE ======================================= */

/** Mifflin-St Jeor. Cold start only — replaced by adaptiveTDEE after ~14 days. */
export function bmrMifflin(kg: number, cm: number, age: number, sex: Sex): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function formulaTDEE(bmr: number, activityFactor = 1.5): number {
  return Math.round(bmr * activityFactor);
}

/**
 * Adaptive TDEE — the honest one.
 *   TDEE ≈ average intake + (energy stored or released by weight change)
 * Needs >= 14 days of BOTH intake and weigh-ins to be meaningful, and it is
 * only as good as your food logging. Returns null when the data isn't there,
 * so the UI can say "keep logging" instead of showing a confident wrong number.
 */
export function adaptiveTDEE(
  intake: IntakeDay[],
  weighIns: WeighIn[],
  windowDays = 21
): { tdee: number; confidence: number; loggedDays: number } | null {
  const intakeWindow = [...intake].sort((a, b) => a.date.localeCompare(b.date)).slice(-windowDays);
  if (intakeWindow.length < 14) return null;

  const trend = weightTrend(weighIns);
  if (trend.length < 14) return null;

  const windowStart = intakeWindow[0];
  const windowEnd = intakeWindow[intakeWindow.length - 1];
  if (!windowStart || !windowEnd) return null;

  // Both endpoints must sit inside the food window. Without this, a food diary
  // from August and a weight history from January produce a confident number
  // describing neither: the intake is one period and the weight change another.
  const first = trend.find((t) => t.date >= windowStart.date);
  const within = trend.filter((t) => t.date <= windowEnd.date);
  const lastT = within[within.length - 1];
  if (!first || !lastT || first.date > lastT.date) return null;
  const spanDays = Math.max(1, daysBetween(first.date, lastT.date));
  if (spanDays < 10) return null;

  const deltaKg = lastT.trend - first.trend;
  const dailyEnergyFromTissue = (deltaKg * KCAL_PER_KG_TISSUE) / spanDays;
  const tdee = Math.round(mean(intakeWindow.map((d) => d.kcal)) - dailyEnergyFromTissue);

  // Confidence: more logged days + longer span = better.
  const confidence = Math.min(1, (intakeWindow.length / windowDays) * (spanDays / 21));
  return { tdee, confidence: Math.round(confidence * 100) / 100, loggedDays: intakeWindow.length };
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/* ======================= Calorie & macro targets ========================= */

export interface TargetInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  phase: Phase;
  tdee?: number | null;          // from adaptiveTDEE when available
  activityFactor?: number;
  trainingDay?: boolean;
}

export interface Targets {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  basis: 'measured' | 'estimated';
  note: string;
}

/**
 * Rate caps are deliberate: faster than ~0.7%/wk down and you start paying in
 * lean mass and gym performance; faster than ~0.25%/wk up is mostly fat.
 */
export function dailyTargets(i: TargetInput): Targets {
  const measured = i.tdee != null && i.tdee > 0;
  const tdee = measured
    ? (i.tdee as number)
    : formulaTDEE(bmrMifflin(i.weightKg, i.heightCm, i.age, i.sex), i.activityFactor ?? 1.5);

  const adjust: Record<Phase, number> = {
    cut: -0.18,
    recomp: -0.08,
    maintain: 0,
    bulk: 0.1,
  };

  let kcal = Math.round(tdee * (1 + adjust[i.phase]));

  // Calorie cycling: a little more on training days, taken from rest days,
  // same weekly total. Helps performance without changing the deficit.
  if (i.trainingDay != null) kcal = Math.round(kcal * (i.trainingDay ? 1.08 : 0.92));

  const proteinPerKg = i.phase === 'cut' ? 2.2 : i.phase === 'recomp' ? 2.0 : 1.8;
  const proteinG = Math.round(i.weightKg * proteinPerKg);
  const fatG = Math.round(Math.max(i.weightKg * 0.8, (kcal * 0.22) / 9));
  const carbG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  return {
    kcal,
    proteinG,
    fatG,
    carbG,
    basis: measured ? 'measured' : 'estimated',
    note: measured
      ? 'Based on your own intake and weight trend, not a formula.'
      : 'Formula estimate. Log food and weight for 2 weeks and this becomes a real number.',
  };
}

/**
 * Weekly check-in: is the phase actually working? Called once a week.
 */
export function phaseCheck(
  phase: Phase,
  weightKg: number,
  ratePerWeek: number
): { onTrack: boolean; suggestedKcalDelta: number; message: string } {
  const pct = (ratePerWeek / weightKg) * 100;
  const band: Record<Phase, [number, number]> = {
    cut: [-0.8, -0.3],
    recomp: [-0.25, 0.1],
    maintain: [-0.2, 0.2],
    bulk: [0.1, 0.35],
  };
  const [min, max] = band[phase];

  if (pct < min) {
    return {
      onTrack: false,
      suggestedKcalDelta: +150,
      message: `Dropping ${Math.abs(pct).toFixed(2)}%/wk — faster than intended. Add ~150 kcal or you'll start losing strength.`,
    };
  }
  if (pct > max) {
    return {
      onTrack: false,
      suggestedKcalDelta: -150,
      message: `Trend is ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%/wk. Cut ~150 kcal to get back into the target band.`,
    };
  }
  return { onTrack: true, suggestedKcalDelta: 0, message: `On track at ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%/wk.` };
}

/* ============================= Hydration ================================= */

export interface HydrationContext {
  weightKg: number;
  trainingToday: boolean;
  trainingMinutes?: number;
  ambientTempC?: number;
}

/** Baseline ~33 ml/kg, plus sweat replacement, plus a heat bump. */
export function hydrationTargetMl(c: HydrationContext): number {
  let ml = c.weightKg * 33;
  if (c.trainingToday) ml += ((c.trainingMinutes ?? 60) / 60) * 600;
  if (c.ambientTempC != null && c.ambientTempC > 30) ml += 400;
  if (c.ambientTempC != null && c.ambientTempC > 38) ml += 300;
  return Math.round(ml / 50) * 50;
}

export interface ReminderSlot {
  atMinutes: number;   // minutes from midnight
  amountMl: number;
  label: string;
}

/**
 * Debt-based reminders, not a fixed drumbeat every 90 minutes.
 * Recomputed after every log: it looks at what you still owe and how much of
 * the day is left, then spaces the remainder. If you're ahead, it stays quiet.
 * That silence is the feature — fixed-schedule reminders get muted in a week.
 */
export function scheduleHydration(params: {
  targetMl: number;
  consumedMl: number;
  nowMinutes: number;
  wakeMinutes?: number;     // default 06:30
  sleepMinutes?: number;    // default 22:30
  maxPerSlotMl?: number;    // default 350
  minGapMinutes?: number;   // default 60
}): ReminderSlot[] {
  const wake = params.wakeMinutes ?? 6 * 60 + 30;
  const sleep = params.sleepMinutes ?? 22 * 60 + 30;
  const maxSlot = params.maxPerSlotMl ?? 350;
  const minGap = params.minGapMinutes ?? 60;

  const remaining = params.targetMl - params.consumedMl;
  if (remaining <= 0) return [];

  const start = Math.max(params.nowMinutes, wake);
  const windowMin = sleep - start;
  if (windowMin <= 30) return [];

  // How far behind are you vs where you should be by now?
  const dayFraction = (start - wake) / Math.max(1, sleep - wake);
  const expectedByNow = params.targetMl * dayFraction;
  const behind = expectedByNow - params.consumedMl;

  let slots = Math.ceil(remaining / maxSlot);
  slots = Math.min(slots, Math.floor(windowMin / minGap));
  if (slots < 1) return [{ atMinutes: start + 15, amountMl: Math.min(remaining, maxSlot), label: 'Last chance before bed' }];

  const per = Math.round(remaining / slots / 25) * 25;
  const gap = Math.floor(windowMin / slots);

  return Array.from({ length: slots }, (_, k) => ({
    atMinutes: start + gap * (k + 1) - 5,
    amountMl: per,
    label:
      k === 0 && behind > 400
        ? `You're ${Math.round(behind)} ml behind — drink ${per} ml now`
        : k === slots - 1
          ? 'Last one before bed'
          : 'Water break',
  }));
}

export const fmtTime = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
