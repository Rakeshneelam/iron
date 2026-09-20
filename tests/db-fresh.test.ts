/**
 * A brand-new install with nothing in it. Every screen's reads must return something
 * sensible rather than throwing — the first launch is the one you cannot recover from,
 * and this app is handed to friends as an APK with no way to report a crash.
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { initDatabase, resetDatabase } from './support/client.ts';
import { seedIfNeeded } from '../src/db/seed/index.ts';
import { getActiveRoutine, getDays, getSlots, listRoutines, plannedWeeklySets, resolveNextDay } from '../src/db/repositories/program.ts';
import { getActiveSession, getSessionPlan, getSessionSummary, listSessions, planProgress } from '../src/db/repositories/sessions.ts';
import { activeRecommendations, countFinishedWorkouts, recentMuscles, recentWorkouts, sessionRecords, weekInsights, weekSummary } from '../src/db/repositories/progress.ts';
import { avgRIRLast7d, buildDeloadInput, dailyTonnage, e1rmSeries, weeklySetsPerMuscle, weeksSinceDeload } from '../src/db/repositories/stats.ts';
import { getLatestWeight, listMeasurements, listWeighIns } from '../src/db/repositories/body.ts';
import { getDayTotal, historyMl } from '../src/db/repositories/water.ts';
import { getDayTotals, intakeHistory, quickAddFoods } from '../src/db/repositories/food.ts';
import { getSettings, setSetting } from '../src/db/repositories/settings.ts';
import { computeTargets } from '../src/features/food/targets.ts';
import { hydrationPlan, hydrationTarget, tomorrowHydrationSlots } from '../src/services/hydration.ts';
import { buildAIExport } from '../src/db/repositories/export.ts';
import { suggestionContext } from '../src/features/session/prescription.ts';
import { todayISO, weekStartISO } from '../src/lib/date.ts';

before(async () => {
  await initDatabase();
});

describe('a fresh install', () => {
  beforeEach(() => {
    resetDatabase();
    seedIfNeeded();
  });

  const today = todayISO();
  const week = () => weekStartISO(todayISO());

  test('Today has no plan and no workout, and says so without throwing', () => {
    assert.equal(getActiveSession(), undefined);
    assert.equal(getActiveRoutine(), undefined);
    assert.deepEqual(listRoutines(), []);
    assert.deepEqual(listSessions(), []);
    assert.equal(getDayTotal(today), 0);
    assert.ok(hydrationTarget().ml > 0, 'there is still a water target to aim at');
    assert.doesNotThrow(() => hydrationPlan());
    assert.doesNotThrow(() => tomorrowHydrationSlots());
  });

  test('Progress opens on an empty week', () => {
    const s = weekSummary(week(), 3000);
    assert.equal(s.completed + s.partial + s.skipped + s.cancelled, 0);
    assert.equal(s.sets, 0);
    assert.deepEqual(s.lifts, []);
    assert.deepEqual(weekInsights(week(), 3000, 150), []);
    assert.deepEqual(recentWorkouts(), []);
    assert.deepEqual(activeRecommendations(), []);
    assert.equal(countFinishedWorkouts(), 0);
    assert.deepEqual(recentMuscles(), []);
  });

  test('the stats layer has nothing to divide by and copes', () => {
    assert.deepEqual(e1rmSeries('bb-squat'), []);
    assert.deepEqual(weeklySetsPerMuscle(week()), {});
    assert.equal(dailyTonnage(28).length, 28);
    assert.doesNotThrow(() => avgRIRLast7d());
    assert.doesNotThrow(() => weeksSinceDeload());
    assert.doesNotThrow(() => buildDeloadInput());
  });

  test('Body and Food are empty but functional', () => {
    assert.equal(getLatestWeight(), undefined);
    assert.deepEqual(listWeighIns(), []);
    assert.deepEqual(listMeasurements(), []);
    assert.equal(historyMl(14).length, 14);
    assert.equal(getDayTotals(today).kcal, 0);
    assert.deepEqual(intakeHistory(28), []);
    assert.ok(quickAddFoods().length >= 0);
    const t = computeTargets(today);
    assert.ok(t.kcal > 0 && t.proteinG > 0, 'targets fall back to an estimate, never zero');
    assert.equal(t.manual, false);
  });

  test('your own calorie and protein targets override the estimate, and hand back cleanly', () => {
    const today = todayISO();
    const estimated = computeTargets(today);

    setSetting('manualKcal', 2400);
    setSetting('manualProteinG', 180);
    const mine = computeTargets(today);
    assert.equal(mine.kcal, 2400);
    assert.equal(mine.proteinG, 180);
    assert.equal(mine.manual, true);
    // The macros still describe the same day: protein and fat, then carbs take the rest.
    assert.equal(mine.carbG, Math.max(0, Math.round((2400 - 180 * 4 - mine.fatG * 9) / 4)));

    // One of the two on its own still counts as manual; the other keeps the estimate.
    setSetting('manualProteinG', null);
    const half = computeTargets(today);
    assert.equal(half.kcal, 2400);
    assert.equal(half.proteinG, estimated.proteinG);
    assert.equal(half.manual, true);

    setSetting('manualKcal', null);
    const back = computeTargets(today);
    assert.equal(back.manual, false);
    assert.equal(back.kcal, estimated.kcal);
  });

  /**
   * UX-08: the target sheet showed a null override as `0`, so the first + tap wrote
   * a 50 kcal target instead of nudging the value actually in force. The sheet now
   * reads `auto`, which must keep reporting what Iron works out regardless of any
   * override, so Custom can start there.
   */
  test('the calculated target stays visible underneath an override', () => {
    const today = todayISO();
    const estimated = computeTargets(today);
    assert.equal(estimated.auto.kcal, estimated.kcal, 'with no override the effective target IS the automatic one');
    assert.ok(estimated.auto.kcal > 0, 'never a zero target');

    setSetting('manualKcal', 2400);
    const mine = computeTargets(today);
    assert.equal(mine.kcal, 2400);
    assert.equal(mine.auto.kcal, estimated.auto.kcal, 'the automatic figure is unchanged by taking over');
    assert.equal(mine.auto.proteinG, estimated.auto.proteinG);

    // Switching protein to custom must leave the calorie mode alone, and vice versa.
    setSetting('manualProteinG', mine.auto.proteinG);
    const both = computeTargets(today);
    assert.equal(both.kcal, 2400);
    assert.equal(both.proteinG, estimated.auto.proteinG);

    setSetting('manualKcal', null);
    const autoKcal = computeTargets(today);
    assert.equal(autoKcal.kcal, estimated.auto.kcal, 'Use automatic target restores the calculated value');
    assert.equal(autoKcal.proteinG, estimated.auto.proteinG, 'protein stayed custom at the value it started from');

    setSetting('manualProteinG', null);
  });

  test('the exercise catalogue is there so the library is never empty', () => {
    const ctx = suggestionContext();
    assert.deepEqual(ctx.weekly, {});
    assert.ok(Array.isArray(ctx.equipment));
  });

  test('exporting an empty app still produces a valid file', () => {
    const out = buildAIExport({ appVersion: 'test', hydrationTargetMl: 3000 });
    assert.deepEqual(out.workouts, []);
    assert.doesNotThrow(() => JSON.stringify(out));
  });

  test('asking about a workout or plan that does not exist returns nothing, not a crash', () => {
    assert.equal(getSessionSummary('nope'), undefined);
    assert.deepEqual(getSessionPlan('nope'), []);
    assert.deepEqual(planProgress('nope'), { planned: 0, done: 0, skipped: 0 });
    assert.deepEqual(sessionRecords('nope'), []);
    assert.equal(resolveNextDay('nope'), undefined);
    assert.deepEqual(getDays('nope'), []);
    assert.deepEqual(getSlots('nope'), []);
    assert.deepEqual(plannedWeeklySets('nope'), {});
  });

  test('settings come back as the documented defaults', () => {
    const s = getSettings();
    assert.equal(s.setupDone, false);
    assert.equal(s.name, '');
    assert.ok(s.trainingDays.length > 0);
    assert.ok(s.reminders.water.on !== undefined, 'reminder defaults are merged in');
  });
});
