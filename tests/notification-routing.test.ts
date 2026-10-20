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

import { destinationFor, parseAmountMl } from '../src/lib/deepLinks.ts';

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

/**
 * What someone typed into the water notification (§7).
 *
 * The field in the notification shade is a plain text input on both platforms —
 * no number pad, no validation — so this is the only thing standing between a
 * thumb and the daily total.
 */
describe('a custom water amount typed into the notification', () => {
  test('a bare number is millilitres, because the button says ml', () => {
    assert.equal(parseAmountMl('500'), 500);
    assert.equal(parseAmountMl('750'), 750);
    assert.equal(parseAmountMl(' 240 '), 240);
  });

  test('a unit is read if one is given, in either decimal convention', () => {
    assert.equal(parseAmountMl('500ml'), 500);
    assert.equal(parseAmountMl('500 ML'), 500);
    assert.equal(parseAmountMl('0.5l'), 500);
    assert.equal(parseAmountMl('1,5 l'), 1500);
    assert.equal(parseAmountMl('2 litres'), 2000);
  });

  test('nonsense is refused rather than guessed at', () => {
    for (const bad of ['', '   ', 'abc', 'a lot', '500ml of water', '-200', '0', 'ml', null, undefined]) {
      assert.equal(parseAmountMl(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });

  test('implausible amounts are refused — a typo must not become the day', () => {
    assert.equal(parseAmountMl('50000'), null);
    assert.equal(parseAmountMl('9'), null);
    // The edges themselves are fine.
    assert.equal(parseAmountMl('10'), 10);
    assert.equal(parseAmountMl('5000'), 5000);
  });
});
