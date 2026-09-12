/**
 * The recovery phrase is the only thing standing between a lost phone and lost
 * data, and it is transcribed by hand. These tests are about the transcriber.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  decodePhrase,
  encodePhrase,
  formatPhrase,
  normalisePhrase,
  phraseToKey,
  PHRASE_CHARS,
} from '../src/lib/recoveryPhrase.ts';

const bytes = (...n: number[]) => Uint8Array.from(n);
const sample = bytes(0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee);

describe('recovery phrase', () => {
  test('round-trips every byte', () => {
    assert.deepEqual([...decodePhrase(encodePhrase(sample))], [...sample]);
  });

  test('is six groups of four, so it can be read aloud and typed', () => {
    const p = encodePhrase(sample);
    assert.match(p, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){5}$/);
    assert.equal(normalisePhrase(p).length, PHRASE_CHARS);
  });

  test('covers the whole key space, not just the low bytes', () => {
    assert.notEqual(encodePhrase(bytes(...Array(15).fill(0))), encodePhrase(bytes(...Array(14).fill(0), 1)));
    assert.deepEqual([...decodePhrase(encodePhrase(bytes(...Array(15).fill(255))))], Array(15).fill(255));
  });

  test('accepts it back however the user types it', () => {
    const p = encodePhrase(sample);
    const typed = p.toLowerCase().replace(/-/g, ' ');
    assert.deepEqual([...decodePhrase(typed)], [...sample]);
    assert.deepEqual([...decodePhrase(p.replace(/-/g, ''))], [...sample]);
  });

  test('forgives the glyphs people confuse instead of refusing them', () => {
    // Someone reading 0 as O, or 1 as I or l, still gets their data back.
    assert.equal(normalisePhrase('O0I1L'), '00111');
    const p = encodePhrase(bytes(...Array(15).fill(0))); // all zeros -> all '0'
    assert.deepEqual([...decodePhrase(p.replace(/0/g, 'O'))], Array(15).fill(0));
  });

  test('says what is wrong in words a person can act on', () => {
    assert.throws(() => decodePhrase('TOO-SHORT'), /24 characters/);
    assert.throws(() => decodePhrase('U'.repeat(PHRASE_CHARS)), /not part of a recovery phrase/);
  });

  test('phraseToKey is stable and rejects a malformed phrase before SQLite sees it', () => {
    const p = encodePhrase(sample);
    assert.equal(phraseToKey(p), phraseToKey(p.toLowerCase()));
    assert.equal(phraseToKey(p), normalisePhrase(p));
    assert.throws(() => phraseToKey('nope'));
  });

  test('formatPhrase regroups something pasted without dashes', () => {
    const p = encodePhrase(sample);
    assert.equal(formatPhrase(p.replace(/-/g, '')), p);
  });
});
