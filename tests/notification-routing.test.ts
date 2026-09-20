/**
 * Where a tapped notification lands (UX-01).
 *
 * Notifications outlive the version that scheduled them. Daily stopped being a tab,
 * and Body stopped meaning measurements — but a weigh-in reminder written before
 * the change still carries /daily in its payload, and a measurement reminder still
 * carries /body. Both have to reach the thing they were about.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { destinationFor } from '../src/lib/deepLinks.ts';

describe('notification destinations', () => {
  test('an old weigh-in reminder reaches Body, on Weight', () => {
    assert.equal(destinationFor({ url: '/daily', type: 'weight' }), '/body?section=weight');
  });

  test('a measurement reminder still opens Measurements', () => {
    assert.equal(destinationFor({ url: '/body', type: 'measurements' }), '/body?section=measurements');
  });

  test('Body without a type defaults to Weight, as the tab itself does', () => {
    assert.equal(destinationFor({ url: '/body' }), '/body?section=weight');
  });

  test('the type decides even if the url was written before the section existed', () => {
    assert.equal(destinationFor({ url: '/daily', type: 'measurements' }), '/body?section=measurements');
  });

  test('every other destination is passed through untouched', () => {
    assert.equal(destinationFor({ url: '/review' }), '/review');
    assert.equal(destinationFor({ url: '/' }), '/');
  });

  test('a notification with no url navigates nowhere', () => {
    assert.equal(destinationFor({ tag: 'hydration' }), null);
    assert.equal(destinationFor(null), null);
  });
});
