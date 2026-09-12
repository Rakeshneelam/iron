/**
 * Upgrading an install that already has data. This is the path every existing user
 * takes, and the one where a mistake is unrecoverable — history cannot be re-lived.
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { before, beforeEach, describe, test } from 'node:test';

import { db, expoDb, initDatabase, resetDatabase, rollbackTo, upgrade } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import { seedIfNeeded } from '../src/db/seed/index.ts';
import { getSessionPlan, getSessionSets } from '../src/db/repositories/sessions.ts';
import { getSettings } from '../src/db/repositories/settings.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
});

/** Writes the rows a version-0.2 install would hold, using raw SQL so the old shape is honest. */
function seedLegacyInstall(): void {
  expoDb.execSync(`INSERT INTO exercise (id, name, load_type, load_step, primary_muscles, is_custom)
                   VALUES ('bb-squat', 'Barbell Back Squat', 'barbell', 2.5, '["quads"]', 0),
                          ('bb-bench', 'Bench Press', 'barbell', 2.5, '["chest"]', 0)`);
  expoDb.execSync(`INSERT INTO routine (id, name, days_per_week, active, created_at) VALUES ('r1', 'Upper / Lower', 4, 1, '2026-01-01T00:00:00.000+00:00')`);
  expoDb.execSync(`INSERT INTO routine_day (id, routine_id, day_index, label) VALUES ('d1', 'r1', 0, 'Upper A')`);
  expoDb.execSync(`INSERT INTO routine_slot (id, routine_day_id, exercise_id, position, target_sets, rep_lo, rep_hi, target_rir, rest_seconds)
                   VALUES ('sl1', 'd1', 'bb-squat', 0, 3, 5, 8, 2, 150),
                          ('sl2', 'd1', 'bb-bench', 1, 3, 5, 8, 2, 150)`);
  // A workout finished under the old version…
  expoDb.execSync(`INSERT INTO session (id, routine_day_id, date, started_at, ended_at)
                   VALUES ('old', 'd1', '2026-01-05', '2026-01-05T08:00:00.000+00:00', '2026-01-05T09:00:00.000+00:00')`);
  expoDb.execSync(`INSERT INTO set_log (id, session_id, exercise_id, set_index, weight, reps, rir, is_warmup, pain_flag, logged_at, e1rm, was_override)
                   VALUES ('set1', 'old', 'bb-squat', 0, 100, 5, 2, 0, 0, '2026-01-05T08:10:00.000+00:00', 120, 0)`);
  // …and one still open, whose exercise list lived in settings keys.
  expoDb.execSync(`INSERT INTO session (id, routine_day_id, date, started_at)
                   VALUES ('open', 'd1', '2026-01-06', '2026-01-06T08:00:00.000+00:00')`);
  expoDb.execSync(`INSERT INTO setting (key, value) VALUES ('session:open:skipped', '["bb-bench"]')`);
}

describe('upgrading from the previous version', () => {
  test('keeps history, marks old workouts finished and the open one active', () => {
    rollbackTo(1);
    seedLegacyInstall();
    upgrade(1);

    const old = db.select().from(schema.session).where(eq(schema.session.id, 'old')).get()!;
    assert.equal(old.status, 'completed', 'a finished workout stays finished');
    const open = db.select().from(schema.session).where(eq(schema.session.id, 'open')).get()!;
    assert.equal(open.status, 'active', 'the workout that was in progress is still in progress');
    assert.equal(getSessionSets('old').length, 1, 'logged sets survive the upgrade');
  });

  test('rebuilds the open workout exercise list from the old settings keys', () => {
    rollbackTo(1);
    seedLegacyInstall();
    upgrade(1);
    seedIfNeeded();

    const plan = getSessionPlan('open');
    assert.deepEqual(plan.map((p) => p.exerciseId), ['bb-squat', 'bb-bench']);
    assert.equal(plan.find((p) => p.exerciseId === 'bb-bench')!.skipped, true, 'a skip made before the upgrade is remembered');
    assert.equal(plan[0]!.slot?.targetSets, 3, 'targets come from the plan it was started from');
  });

  test('an existing install is never sent through first-run setup', () => {
    rollbackTo(1);
    seedLegacyInstall();
    upgrade(1);
    seedIfNeeded();
    assert.equal(getSettings().setupDone, true);
  });

  test('a genuinely fresh install does see setup', () => {
    rollbackTo(Number.MAX_SAFE_INTEGER);
    seedIfNeeded();
    assert.equal(getSettings().setupDone, false);
  });

  test('the seed is idempotent: running it twice changes nothing', () => {
    rollbackTo(Number.MAX_SAFE_INTEGER);
    seedIfNeeded();
    const count = () => db.select().from(schema.exercise).all().length;
    const first = count();
    seedIfNeeded();
    assert.equal(count(), first);
    assert.ok(first > 0, 'the catalogue really was seeded');
  });

  test('a plan the user deleted stays deleted after a restart', () => {
    rollbackTo(Number.MAX_SAFE_INTEGER);
    seedIfNeeded();
    db.delete(schema.routine).run();
    seedIfNeeded();
    assert.equal(db.select().from(schema.routine).all().length, 0);
  });
});
