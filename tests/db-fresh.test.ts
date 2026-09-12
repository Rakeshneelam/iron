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
import { getSettings } from '../src/db/repositories/settings.ts';
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
