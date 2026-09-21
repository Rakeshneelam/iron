/**
 * Readability of the palette, measured rather than eyeballed (UX-11).
 *
 * textFaint was #5C5C68 — 2.79 : 1 on surface, 2.55 : 1 on surfaceHigh — and it was
 * carrying real content: deltas, dates, set counts. White on the accent was
 * 3.64 : 1, which is what every filled button was. WCAG's 4.5 : 1 for normal text
 * is used here as a measurable target, so a future palette tweak that quietly
 * drops below it fails here instead of on someone's phone.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { color } from '../src/theme/tokens.ts';

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Every ground meaningful text is ever set on. */
const GROUNDS: [string, string][] = [
  ['bg', color.bg],
  ['surface', color.surface],
  ['surfaceHigh', color.surfaceHigh],
];
const TARGET = 4.5;

describe('text contrast', () => {
  for (const [name, fg] of [
    ['text', color.text],
    ['textMuted', color.textMuted],
    ['textFaint', color.textFaint],
  ] as [string, string][]) {
    test(`${name} is readable on every surface`, () => {
      for (const [groundName, ground] of GROUNDS) {
        const ratio = contrast(fg, ground);
        assert.ok(ratio >= TARGET, `${name} on ${groundName} is ${ratio.toFixed(2)} : 1, below ${TARGET}`);
      }
    });
  }

  test('textFaint stays quieter than textMuted, or the two tokens mean nothing', () => {
    assert.ok(contrast(color.textFaint, color.bg) < contrast(color.textMuted, color.bg));
  });
});

describe('filled controls', () => {
  test('the filled-action pairing carries its own label', () => {
    const ratio = contrast(color.onAccent, color.accentFill);
    assert.ok(ratio >= TARGET, `onAccent on accentFill is ${ratio.toFixed(2)} : 1`);
  });

  test('the pressed state does not drop below it', () => {
    assert.ok(contrast(color.onAccent, color.accentFillPressed) >= TARGET);
  });

  test('danger and its label too', () => {
    assert.ok(contrast(color.onAccent, color.danger) >= 3, 'danger is a background for white text');
  });

  test('accent stays usable as text on a dark ground — that is what it is for', () => {
    assert.ok(contrast(color.accent, color.bg) >= TARGET);
  });
});
