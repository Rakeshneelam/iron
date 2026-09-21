/**
 * Which exercise the workout's one primary action points at (UX-04).
 *
 * The regression: the search ran over the slice AFTER the selected exercise only.
 * Jump to the last exercise, finish it, and with three unfinished ones above, the
 * big button offered to end the workout.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { allSettled, isSettled, nextPendingIndex, type ExState } from '../src/features/session/order.ts';

const states = (...s: ExState[]) => s;

describe('the next exercise with work left', () => {
  test('is the next one down the list in the ordinary case', () => {
    assert.equal(nextPendingIndex(states('done', 'todo', 'todo'), 0), 1);
  });

  test('wraps to earlier unfinished work from the last exercise', () => {
    // Jumped to the end, finished it; three above are still open.
    assert.equal(nextPendingIndex(states('todo', 'partial', 'todo', 'done'), 3), 0);
  });

  test('a partly-done exercise still counts as work left', () => {
    assert.equal(nextPendingIndex(states('done', 'partial', 'done'), 0), 1);
  });

  test('skips over the ones deliberately skipped', () => {
    assert.equal(nextPendingIndex(states('done', 'skipped', 'skipped', 'todo'), 0), 3);
  });

  test('is -1 when every exercise is done or skipped', () => {
    assert.equal(nextPendingIndex(states('done', 'skipped', 'done'), 1), -1);
    assert.equal(nextPendingIndex(states('done'), 0), -1);
  });

  test('allSettled is the separate question, and is not "nowhere to go"', () => {
    // One exercise left, and you are on it: nowhere to move, but not finished.
    const left = states('done', 'todo', 'skipped');
    assert.equal(nextPendingIndex(left, 1), -1);
    assert.equal(allSettled(left), false, 'Finish must not become the normal end yet');

    assert.equal(allSettled(states('done', 'skipped')), true);
    assert.equal(allSettled([]), false, 'an empty session has not been finished');
  });

  test('never points back at the exercise you are on when it is the only one left', () => {
    // Current is index 1 and unfinished; there is nothing else to move to.
    assert.equal(nextPendingIndex(states('done', 'todo', 'skipped'), 1), -1);
  });

  test('an empty session has nowhere to go', () => {
    assert.equal(nextPendingIndex([], 0), -1);
  });

  test('settled means done or skipped, and nothing else', () => {
    assert.equal(isSettled('done'), true);
    assert.equal(isSettled('skipped'), true);
    assert.equal(isSettled('partial'), false);
    assert.equal(isSettled('todo'), false);
  });
});
