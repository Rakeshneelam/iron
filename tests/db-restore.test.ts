/**
 * Restore replaces everything, so the tests that matter are the ones proving it
 * either replaces correctly or changes nothing at all.
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { db, expoDb, initDatabase, resetDatabase } from './support/client.ts';
import { createPlan, getDays } from '../src/db/repositories/program.ts';
import { inspectBackup, restoreBackup } from '../src/db/repositories/restore.ts';
import { finishSession, getSessionSets, insertSet, listSessions, startSession } from '../src/db/repositories/sessions.ts';
import { upsertWeighIn, listWeighIns } from '../src/db/repositories/body.ts';
import * as schema from '../src/db/schema.ts';
import { buildJSONDump } from '../src/services/export.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
  db.insert(schema.exercise)
    .values([
      { id: 'squat', name: 'Squat', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['quads'], isCustom: 0 },
      { id: 'bench', name: 'Bench Press', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['chest'], isCustom: 0 },
    ])
    .run();
});

/** A person with some history: one finished workout and two weigh-ins. */
function seedHistory() {
  const r = createPlan(
    {
      name: 'Test plan',
      daysPerWeek: 1,
      days: [{ label: 'Day A', slots: [{ exerciseId: 'squat', targetSets: 2, repLo: 5, repHi: 8 }] }],
    },
    { activate: true },
  );
  const day = getDays(r.id)[0]!;
  const s = startSession(day.id);
  insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 100, reps: 5, rir: 2 });
  insertSet({ sessionId: s.id, exerciseId: 'squat', weight: 100, reps: 5, rir: 2 });
  finishSession(s.id);
  upsertWeighIn('2026-01-01', 84);
  upsertWeighIn('2026-01-02', 83.8);
  return { sessionId: s.id };
}

describe('restore', () => {
  test('a backup taken, wiped and restored gives back every row', () => {
    seedHistory();
    const dump = buildJSONDump();
    const before = { sessions: listSessions().length, weighIns: listWeighIns().length };

    resetDatabase();
    assert.equal(listSessions().length, 0, 'wiped');

    const found = inspectBackup(dump);
    assert.ok(found.ok, found.ok ? '' : found.reason);
    restoreBackup(found.tables);

    assert.equal(listSessions().length, before.sessions);
    assert.equal(listWeighIns().length, before.weighIns);
    const restored = listSessions()[0]!;
    assert.equal(getSessionSets(restored.id).length, 2, 'the sets came back too');
  });

  test('the preview says what is in the backup and what this phone would lose', () => {
    seedHistory();
    const dump = buildJSONDump();
    // Something logged after the backup: exactly what the user needs warning about.
    upsertWeighIn('2030-01-01', 80);

    const found = inspectBackup(dump);
    assert.ok(found.ok);
    assert.equal(found.summary.workouts, 1);
    assert.equal(found.summary.weighIns, 2);
    assert.equal(found.summary.losesWeighIns, 1, 'the later weigh-in is named as a loss');
  });

  test('nothing is lost when the phone has nothing newer', () => {
    seedHistory();
    const found = inspectBackup(buildJSONDump());
    assert.ok(found.ok);
    assert.equal(found.summary.losesWorkouts, 0);
    assert.equal(found.summary.losesWeighIns, 0);
  });

  test('a failure part-way through leaves the database exactly as it was', () => {
    seedHistory();
    const found = inspectBackup(buildJSONDump());
    assert.ok(found.ok);
    // A set pointing at an exercise that does not exist: the foreign key fails at commit.
    const poisoned = { ...found.tables, set_log: [...(found.tables.set_log ?? []), { ...found.tables.set_log![0]!, id: 'bad', exercise_id: 'ghost' }] };

    const before = listSessions().length;
    assert.throws(() => restoreBackup(poisoned));
    assert.equal(listSessions().length, before, 'rolled back');
    assert.equal(listWeighIns().length, 2, 'and the weigh-ins survived too');
  });

  test('names the right file when the readable summary export is picked by mistake', () => {
    const r = inspectBackup(JSON.stringify({ schema: 'iron.export', schemaVersion: 3, profile: {} }));
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.reason, /iron-backup-<date>\.json/);
  });

  test('refuses a backup from a newer version instead of guessing', () => {
    const r = inspectBackup(JSON.stringify({ app: 'iron', tables: { session: [{ id: 'x', invented_column: 1 }] } }));
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.reason, /newer version/);

    const t = inspectBackup(JSON.stringify({ app: 'iron', tables: { invented_table: [] } }));
    assert.equal(t.ok, false);
    assert.match(t.ok ? '' : t.reason, /newer version/);
  });

  test('rejects a file that is not a backup at all', () => {
    assert.equal(inspectBackup('not json').ok, false);
    assert.equal(inspectBackup(JSON.stringify({ hello: 'world' })).ok, false);
  });

  test('accepts a backup written before the format carried a version', () => {
    seedHistory();
    const legacy = JSON.parse(buildJSONDump()) as Record<string, unknown>;
    delete legacy.schemaVersion;
    delete legacy.appVersion;
    const found = inspectBackup(JSON.stringify(legacy));
    assert.ok(found.ok, found.ok ? '' : found.reason);
    assert.equal(found.summary.workouts, 1);
  });

  test('a backup missing a column that is nullable today still restores', () => {
    seedHistory();
    const parsed = JSON.parse(buildJSONDump()) as { tables: Record<string, Record<string, unknown>[]> };
    for (const row of parsed.tables.session ?? []) delete row.notes;
    const found = inspectBackup(JSON.stringify(parsed));
    assert.ok(found.ok, found.ok ? '' : found.reason);
    resetDatabase();
    restoreBackup(found.tables);
    assert.equal(listSessions().length, 1);
  });

  test('the built-in catalogue is not overwritten by an older one', () => {
    seedHistory();
    const dump = buildJSONDump();
    // A built-in added after the backup was taken must survive the restore.
    db.insert(schema.exercise)
      .values({ id: 'newer-lift', name: 'Newer Lift', loadType: 'barbell', loadStep: 2.5, primaryMuscles: ['back'], isCustom: 0 })
      .run();

    const found = inspectBackup(dump);
    assert.ok(found.ok);
    restoreBackup(found.tables);

    const ids = expoDb.getAllSync<{ id: string }>(`SELECT id FROM exercise`).map((r) => r.id);
    assert.ok(ids.includes('newer-lift'), 'a catalogue entry newer than the backup is kept');
    assert.ok(ids.includes('squat'), 'and the ones the backup needs are there');
  });
});
