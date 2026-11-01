/** A cloud restore over a phone with its own data must ask first: what counts as data. */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

import { initDatabase, resetDatabase } from './support/client.ts';
import { upsertWeighIn } from '../src/db/repositories/body.ts';
import { hasOwnData } from '../src/db/repositories/restore.ts';
import { logWater } from '../src/db/repositories/water.ts';

before(async () => {
  await initDatabase();
});

beforeEach(() => {
  resetDatabase();
});

describe('hasOwnData', () => {
  test('a fresh install has none: the seeded plan and catalogue are not the user\'s', () => {
    assert.equal(hasOwnData(), false);
  });

  test('a weigh-in counts', () => {
    upsertWeighIn('2026-11-01', 80);
    assert.equal(hasOwnData(), true);
  });

  test('a single drink counts — a phone used only for water is not empty', () => {
    logWater(250);
    assert.equal(hasOwnData(), true);
  });
});
