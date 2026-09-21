/**
 * Finding and correcting past work (UX-09).
 *
 * Two regressions here. History asked for 200 rows and told you to narrow the
 * search — so with 250 sessions the oldest were unreachable. And correcting one
 * meant reopening its session, which rewrote its endedAt and status, put it back
 * on Today as the active workout, and refused outright if one was already open.
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { eq } from 'drizzle-orm';

import { db, initDatabase, resetDatabase } from './support/client.ts';
import * as schema from '../src/db/schema.ts';
import { searchWorkoutsPage, type HistoryCursor } from '../src/db/repositories/progress.ts';
import {
  correctSet,
  deleteSetCorrecting,
  finishSession,
  getActiveSession,
  getSession,
  getSessionSets,
  getSessionSummary,
  insertSet,
  restoreSetCorrecting,
  startSession,
} from '../src/db/repositories/sessions.ts';
import { e1rmSeries } from '../src/db/repositories/stats.ts';

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

/** A finished workout, back-dated so ordering is unambiguous. */
function finished(date: string, exerciseId = 'squat', weight = 100): string {
  const s = startSession(null);
  insertSet({ sessionId: s.id, exerciseId, weight, reps: 5, rir: 2 });
  finishSession(s.id);
  db.update(schema.session).set({ date, startedAt: `${date}T09:00:00.000Z` }).where(eq(schema.session.id, s.id)).run();
  db.update(schema.exerciseSessionStat).set({ date }).where(eq(schema.exerciseSessionStat.sessionId, s.id)).run();
  return s.id;
}

describe('paging through history', () => {
  test('every workout is reachable, however many there are', () => {
    // More than the old 200-row ceiling, which printed "narrow the search" and
    // then had nothing behind it.
    const total = 250;
    for (let i = 0; i < total; i++) finished(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`.slice(0, 10));
    // Dates repeat; startedAt does too, which is exactly why the cursor carries the id.
    let after: HistoryCursor | null = null;
    const seen = new Set<string>();
    let pages = 0;
    for (;;) {
      const page = searchWorkoutsPage({ limit: 40, after });
      for (const r of page.rows) seen.add(r.session.id);
      pages++;
      if (!page.next) break;
      after = page.next;
      assert.ok(pages < 20, 'paging must terminate');
    }
    assert.equal(seen.size, total, 'the oldest workout is still reachable');
  });

  test('a page reports whether there is another, and the last one does not', () => {
    for (let i = 0; i < 5; i++) finished('2026-02-01');
    const first = searchWorkoutsPage({ limit: 2 });
    assert.equal(first.rows.length, 2);
    assert.ok(first.next);
    const second = searchWorkoutsPage({ limit: 2, after: first.next });
    assert.equal(second.rows.length, 2);
    const third = searchWorkoutsPage({ limit: 2, after: second.next });
    assert.equal(third.rows.length, 1);
    assert.equal(third.next, null);
  });

  test('a filter narrows the pages without breaking the cursor', () => {
    finished('2026-03-01', 'squat');
    finished('2026-03-02', 'bench');
    finished('2026-03-03', 'squat');
    const page = searchWorkoutsPage({ text: 'Squat', limit: 10 });
    assert.equal(page.rows.length, 2);
    assert.equal(page.next, null);
  });
});

describe('correcting a workout in history', () => {
  test('updates the derived aggregates without reopening the session', () => {
    const id = finished('2026-04-01', 'squat', 100);
    const beforeRow = getSession(id);
    const set = getSessionSets(id)[0];
    assert.ok(set);

    correctSet(set.id, { weight: 120 });

    const after = getSession(id);
    assert.equal(after?.status, beforeRow?.status, 'the status is untouched');
    assert.equal(after?.endedAt, beforeRow?.endedAt, 'the original timestamps survive');
    assert.equal(getActiveSession(), undefined, 'nothing was reopened');

    const summary = getSessionSummary(id);
    assert.equal(summary?.perExercise[0]?.topWeight, 120);
    // The stat table is what Progress and the next prescription read.
    assert.ok((e1rmSeries('squat', 10)[0]?.e1rm ?? 0) > 120, 'aggregates followed the correction');
  });

  test('yesterday can be corrected while today’s workout is open', () => {
    const yesterday = finished('2026-04-01', 'squat', 100);
    const open = startSession(null);
    insertSet({ sessionId: open.id, exerciseId: 'bench', weight: 60, reps: 8, rir: 2 });

    const set = getSessionSets(yesterday)[0];
    assert.ok(set);
    correctSet(set.id, { reps: 8 });

    assert.equal(getSessionSummary(yesterday)?.perExercise[0]?.topReps, 8);
    // Both sessions keep their own status and time.
    assert.equal(getSession(yesterday)?.status, 'completed');
    assert.equal(getActiveSession()?.id, open.id, 'today’s workout is still the open one');
    assert.equal(getSessionSets(open.id).length, 1, 'and is untouched');
  });

  test('deleting a set in history recalculates, and Undo puts it all back', () => {
    const id = finished('2026-04-02', 'squat', 100);
    insertSet({ sessionId: id, exerciseId: 'squat', weight: 140, reps: 3, rir: 1 });
    // The heavier set is now the top one; rebuild so the fixture is consistent.
    correctSet(getSessionSets(id)[0]!.id, {});
    assert.equal(getSessionSummary(id)?.perExercise[0]?.topWeight, 140);

    const heavy = getSessionSets(id).find((s) => s.weight === 140);
    assert.ok(heavy);
    deleteSetCorrecting(heavy.id);
    assert.equal(getSessionSummary(id)?.perExercise[0]?.topWeight, 100, 'the aggregate came down with it');

    restoreSetCorrecting(heavy);
    assert.equal(getSessionSummary(id)?.perExercise[0]?.topWeight, 140, 'and back up on Undo');
  });
});
