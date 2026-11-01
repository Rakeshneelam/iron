/** Levels, XP and badges: loss-free, explained, and only ever growing. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BADGES, badgeStates, EMPTY_STATS, levelOf, newlyEarned, XP, xpForLevel, xpOf, type LifetimeStats } from '../src/engine/level.ts';

const stats = (patch: Partial<LifetimeStats>): LifetimeStats => ({ ...EMPTY_STATS, ...patch });

describe('xpOf', () => {
  test('nothing logged is zero XP, every source at zero', () => {
    const r = xpOf(EMPTY_STATS);
    assert.equal(r.total, 0);
    assert.ok(r.parts.every((p) => p.xp === 0));
  });

  test('every point comes from a named source', () => {
    const r = xpOf(stats({ workouts: 2, sets: 30, bests: 1, goalWeeks: 1, waterDays: 3, foodDays: 2, weighIns: 4 }));
    const expected = 2 * XP.workout + 30 * XP.set + XP.best + XP.goalWeek + 3 * XP.waterDay + 2 * XP.foodDay + 4 * XP.weighIn;
    assert.equal(r.total, expected);
    assert.equal(r.parts.reduce((t, p) => t + p.xp, 0), r.total);
  });

  test('more of anything never lowers the total', () => {
    const base = stats({ workouts: 5, sets: 60, waterDays: 2 });
    for (const key of Object.keys(EMPTY_STATS) as (keyof LifetimeStats)[]) {
      assert.ok(xpOf({ ...base, [key]: base[key] + 1 }).total >= xpOf(base).total, key);
    }
  });
});

describe('levelOf', () => {
  test('starts at level 1 with nothing to lose', () => {
    const l = levelOf(0);
    assert.equal(l.level, 1);
    assert.equal(l.floor, 0);
    assert.equal(l.progress, 0);
  });

  test('crosses each threshold exactly', () => {
    for (const level of [2, 3, 4, 5, 10, 12]) {
      assert.equal(levelOf(xpForLevel(level)).level, level, `at ${xpForLevel(level)}`);
      assert.equal(levelOf(xpForLevel(level) - 1).level, level - 1, `just under ${xpForLevel(level)}`);
    }
  });

  test('progress runs from 0 to just under 1 within a level', () => {
    const l = levelOf(1000);
    assert.equal(l.level, 2);
    assert.ok(l.progress > 0 && l.progress < 1);
    assert.equal(l.next, xpForLevel(3));
  });

  test('titles stop at Legend, levels do not', () => {
    assert.equal(levelOf(xpForLevel(15)).title, 'Legend');
    assert.equal(levelOf(xpForLevel(15)).level, 15);
  });
});

describe('badges', () => {
  test('ids are unique', () => {
    assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
  });

  test('a badge is earned at its goal, with progress capped at 1', () => {
    const s = badgeStates(stats({ workouts: 10 }));
    const ten = s.find((b) => b.badge.id === 'workouts-10');
    const fifty = s.find((b) => b.badge.id === 'workouts-50');
    assert.equal(ten?.earned, true);
    assert.equal(ten?.progress, 1);
    assert.equal(fifty?.earned, false);
    assert.equal(fifty?.progress, 0.2);
  });

  test('newlyEarned lists only what this change crossed into', () => {
    const before = stats({ workouts: 9, tonnage: 900 });
    const after = stats({ workouts: 10, tonnage: 1200, bests: 1 });
    assert.deepEqual(
      newlyEarned(before, after).map((b) => b.id),
      ['workouts-10', 'first-best', 'tonnes-1'],
    );
    assert.deepEqual(newlyEarned(after, after), []);
  });
});
