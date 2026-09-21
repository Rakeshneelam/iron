/**
 * Writes land on the day the screen is showing, not on today.
 *
 * The regression this guards: Water's date selector governed only the Entries list,
 * while the ring, the quick-add buttons and the custom-amount sheet each decided
 * their own day — so two identical-looking buttons wrote to different dates (UX-06).
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { initDatabase, resetDatabase } from './support/client.ts';
import { deleteEntry, getDayEntries, getDayTotal, logWater } from '../src/db/repositories/water.ts';
import { addDays, todayISO } from '../src/lib/date.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
});

describe('date-targeted water writes', () => {
  const today = todayISO();
  const yesterday = addDays(today, -1);

  test('every add method lands on the selected day and leaves today alone', () => {
    logWater(500, today);
    // quick-add, then custom amount, both on the browsed day
    logWater(250, yesterday);
    logWater(300, yesterday);

    assert.equal(getDayTotal(yesterday), 550);
    assert.equal(getDayTotal(today), 500);
  });

  test('undo removes exactly the entry that was inserted', () => {
    logWater(250, yesterday);
    const row = logWater(500, yesterday);
    assert.ok(row);
    logWater(750, yesterday);

    deleteEntry(row.id);

    const left = getDayEntries(yesterday).map((e) => e.ml).sort((a, b) => a - b);
    assert.deepEqual(left, [250, 750]);
    assert.equal(getDayTotal(yesterday), 1000);
  });

  test('a back-dated drink never counts towards today', () => {
    logWater(1000, addDays(today, -3));
    assert.equal(getDayTotal(today), 0);
  });
});
