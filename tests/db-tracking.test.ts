/** Water, bodyweight, food and the derived stats — against the real database. */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { before, beforeEach, describe, test } from 'node:test';

import { db, expoDb, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import { addMeasurement, deleteWeighIn, getLatestWeight, getWeighIn, listWeighIns, moveWeighIn, upsertWeighIn } from '../src/db/repositories/body.ts';
import { deleteEntry, getDayEntries, getDayTotal, historyMl, logWater, restoreEntry, undoLast } from '../src/db/repositories/water.ts';
import { createPlan, getDays } from '../src/db/repositories/program.ts';
import { finishSession, insertSet, startSession, updateSet, deleteSet } from '../src/db/repositories/sessions.ts';
import { e1rmSeries, rebuildAllStats, weeklySetsPerMuscle } from '../src/db/repositories/stats.ts';
import { buildCSVs, buildJSONDump } from '../src/services/export.ts';
import { buildAIExport } from '../src/db/repositories/export.ts';
import { todayISO, weekStartISO } from '../src/lib/date.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
  db.insert(schema.exercise)
    .values([{ id: 'squat', name: 'Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], isCustom: 0 }])
    .run();
});

describe('water', () => {
  test('totals add up and undo removes only the last drink', () => {
    const today = todayISO();
    logWater(250, today);
    logWater(750, today);
    assert.equal(getDayTotal(today), 1000);
    undoLast(today);
    assert.equal(getDayTotal(today), 250);
  });

  test('a zero or negative amount is refused rather than stored', () => {
    const today = todayISO();
    assert.equal(logWater(0, today), undefined);
    assert.equal(logWater(-500, today), undefined);
    assert.equal(getDayEntries(today).length, 0);
  });

  test('deleting is undoable down to the same row', () => {
    const today = todayISO();
    const row = logWater(500, today)!;
    deleteEntry(row.id);
    assert.equal(getDayTotal(today), 0);
    restoreEntry(row);
    assert.equal(getDayTotal(today), 500);
    assert.equal(getDayEntries(today)[0]!.id, row.id);
  });

  test('history zero-fills the days you drank nothing instead of skipping them', () => {
    logWater(500, todayISO());
    const h = historyMl(7);
    assert.equal(h.length, 7);
    assert.equal(h.at(-1)!.ml, 500);
    assert.ok(h.slice(0, 6).every((d) => d.ml === 0));
  });
});

describe('bodyweight', () => {
  test('one reading per day: logging again replaces it', () => {
    upsertWeighIn('2026-01-01', 80.04);
    upsertWeighIn('2026-01-01', 81.26);
    assert.equal(listWeighIns().length, 1);
    assert.equal(getWeighIn('2026-01-01')?.kg, 81.3, 'rounded to 100 g');
  });

  test('moving a weigh-in to the right day leaves exactly one reading', () => {
    upsertWeighIn('2026-01-01', 80);
    moveWeighIn('2026-01-01', '2026-01-02', 80);
    assert.equal(getWeighIn('2026-01-01'), undefined);
    assert.equal(getWeighIn('2026-01-02')?.kg, 80);
    assert.equal(listWeighIns().length, 1);
  });

  test('moving onto a day that already has a reading replaces it, never duplicates', () => {
    upsertWeighIn('2026-01-01', 80);
    upsertWeighIn('2026-01-02', 85);
    moveWeighIn('2026-01-01', '2026-01-02', 80);
    assert.equal(listWeighIns().length, 1);
    assert.equal(getWeighIn('2026-01-02')?.kg, 80);
  });

  test('weigh-ins come back oldest first, whatever order they were logged in', () => {
    upsertWeighIn('2026-01-03', 82);
    upsertWeighIn('2026-01-01', 80);
    upsertWeighIn('2026-01-02', 81);
    assert.deepEqual(listWeighIns().map((w) => w.kg), [80, 81, 82]);
  });

  test('latest weight falls back to the last session morning weight', () => {
    assert.equal(getLatestWeight(), undefined);
    db.insert(schema.session)
      .values({ id: 's1', date: '2026-01-01', startedAt: '2026-01-01T08:00:00.000+00:00', endedAt: '2026-01-01T09:00:00.000+00:00', status: 'completed', bodyweightKg: 77 })
      .run();
    assert.equal(getLatestWeight(), 77);
    upsertWeighIn('2026-01-02', 79);
    assert.equal(getLatestWeight(), 79, 'a real weigh-in wins');
    deleteWeighIn('2026-01-02');
    assert.equal(getLatestWeight(), 77);
  });
});

describe('derived stats', () => {
  function loggedSession() {
    const r = createPlan({ name: 'P', daysPerWeek: 1, days: [{ label: 'D', slots: [{ exerciseId: 'squat', targetSets: 3, repLo: 5, repHi: 8 }] }] }, { activate: true });
    const day = getDays(r.id)[0]!;
    const s = startSession(day.id);
    insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 40, reps: 5, rir: 5, isWarmup: true });
    insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 100, reps: 5, rir: 2 });
    insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 100, reps: 5, rir: 1 });
    return s;
  }

  test('warm-up sets never count towards volume, top weight or hard sets', () => {
    const s = loggedSession();
    finishSession(s.id);
    const stat = db.select().from(schema.exerciseSessionStat).get()!;
    assert.equal(stat.hardSets, 2);
    assert.equal(stat.tonnage, 1000, '2 × 100 kg × 5 reps, warm-up excluded');
    assert.equal(stat.topWeight, 100);
  });

  test('editing a set after the fact is reflected once stats are rebuilt', () => {
    const s = loggedSession();
    finishSession(s.id);
    const set = db.select().from(schema.setLog).where(eq(schema.setLog.weight, 100)).all()[0]!;
    updateSet(set.id, { weight: 120 });
    rebuildAllStats();
    assert.equal(db.select().from(schema.exerciseSessionStat).get()!.topWeight, 120);
  });

  test('deleting every working set leaves no stat row behind', () => {
    const s = loggedSession();
    finishSession(s.id);
    for (const row of db.select().from(schema.setLog).all()) if (row.isWarmup === 0) deleteSet(row.id);
    rebuildAllStats();
    assert.equal(db.select().from(schema.exerciseSessionStat).all().length, 0);
  });

  test('weekly sets per muscle counts this week only', () => {
    const s = loggedSession();
    finishSession(s.id);
    assert.equal(weeklySetsPerMuscle(weekStartISO(todayISO())).quads, 2);
    assert.equal(Object.keys(weeklySetsPerMuscle('2020-01-06')).length, 0);
  });

  test('the e1RM series is ascending by date', () => {
    const s = loggedSession();
    finishSession(s.id);
    const series = e1rmSeries('squat');
    assert.equal(series.length, 1);
    assert.ok(series[0]!.e1rm > 100, 'five reps at 100 kg estimates above 100');
  });
});

describe('export', () => {
  test('the JSON dump is valid JSON and carries the workouts', () => {
    const r = createPlan({ name: 'P', daysPerWeek: 1, days: [{ label: 'D', slots: [{ exerciseId: 'squat', targetSets: 1, repLo: 5, repHi: 8 }] }] }, { activate: true });
    const s = startSession(getDays(r.id)[0]!.id);
    insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 100, reps: 5, rir: 2 });
    finishSession(s.id);

    const parsed = JSON.parse(buildJSONDump()) as { tables: Record<string, unknown[]> };
    assert.equal(parsed.tables.session!.length, 1, 'the raw dump carries every table');
    assert.equal(parsed.tables.set_log!.length, 1);

    const ai = buildAIExport({ appVersion: 'test', hydrationTargetMl: 3000 });
    assert.equal(ai.workouts.length, 1);
    assert.equal(ai.workouts[0]!.status, 'completed');
  });

  test('every CSV written has a header, and empty ones are left out', () => {
    logWater(500, todayISO());
    addMeasurement(todayISO(), 'waist', 82);
    const files = buildCSVs(buildAIExport({ appVersion: 'test', hydrationTargetMl: 3000 }));
    assert.ok(files.length > 0);
    assert.ok(!files.some((f) => f.name === 'workouts'), 'no workouts logged, so no blank workouts file');
    for (const file of files) {
      const header = file.csv.split('\r\n')[0] ?? '';
      assert.ok(header.includes(','), `${file.name} has no header`);
    }
  });

  test('reading every table works even when the database is empty', () => {
    resetDatabase();
    assert.doesNotThrow(() => buildJSONDump());
    assert.doesNotThrow(() => buildCSVs(buildAIExport({ appVersion: 'test', hydrationTargetMl: 3000 })));
    assert.ok(expoDb.getAllSync('SELECT 1 AS ok').length === 1);
  });
});
