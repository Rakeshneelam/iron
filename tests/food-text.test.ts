import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseMeal, UNSURE, type ParsableFood } from '../src/engine/foodText.ts';

/** The real seed rows this has to cope with, most-used first (as the repo returns them). */
const FOODS: ParsableFood[] = [
  { id: 'roti', name: 'Roti / Chapati (whole wheat)', servingG: 40, servingLabel: '1 roti' },
  { id: 'rice-cooked', name: 'Rice, cooked', servingG: 150, servingLabel: '1 cup' },
  { id: 'dal-toor', name: 'Toor dal, cooked', servingG: 150, servingLabel: '1 katori' },
  { id: 'chicken-breast', name: 'Chicken breast, cooked', servingG: 100, servingLabel: '100 g' },
  { id: 'chicken-curry', name: 'Chicken curry (home)', servingG: 200, servingLabel: '1 bowl' },
  { id: 'egg-whole', name: 'Egg, whole', servingG: 50, servingLabel: '1 egg' },
  { id: 'whey', name: 'Whey protein', servingG: 30, servingLabel: '1 scoop' },
  { id: 'curd', name: 'Curd / dahi', servingG: 150, servingLabel: '1 katori' },
  { id: 'milk-toned', name: 'Milk, toned', servingG: 200, servingLabel: '1 glass' },
  { id: 'banana', name: 'Banana', servingG: 118, servingLabel: '1 medium' },
  { id: 'peanut-butter', name: 'Peanut butter', servingG: 32, servingLabel: '2 tbsp' },
  { id: 'tea-chai', name: 'Tea / chai (milk, sugar)', servingG: 150, servingLabel: '1 cup' },
  { id: 'tea-black', name: 'Tea, black (no milk)', servingG: 240, servingLabel: '1 cup' },
];

const ids = (text: string) => parseMeal(text, FOODS).items.map((i) => i.foodId);
const one = (text: string) => {
  const { items } = parseMeal(text, FOODS);
  assert.equal(items.length, 1, `expected exactly one item from "${text}", got ${items.length}`);
  const item = items[0];
  assert.ok(item);
  return item;
};

describe('meal text → food entries', () => {
  test('a whole sentence becomes one entry per food, in the order typed', () => {
    const r = parseMeal('2 rotis and a katori of dal, 1 scoop whey', FOODS);
    assert.deepEqual(r.items.map((i) => i.foodId), ['roti', 'dal-toor', 'whey']);
    assert.deepEqual(r.items.map((i) => i.grams), [80, 150, 30]);
    assert.equal(r.unmatched.length, 0);
    assert.equal(r.quantified, true);
  });

  test('plural and singular both find the food', () => {
    assert.deepEqual(ids('3 rotis'), ['roti']);
    assert.deepEqual(ids('3 roti'), ['roti']);
    assert.equal(one('3 rotis').grams, 120);
  });

  test('a unit word that is also the food name is kept as the food', () => {
    // "2 eggs": `egg` is a portion-ish word AND the food. Dropping it would leave
    // nothing to match and silently lose the entry.
    const egg = one('2 eggs');
    assert.equal(egg.foodId, 'egg-whole');
    assert.equal(egg.grams, 100);
  });

  test('grams and kilos are taken literally, not multiplied by a serving', () => {
    assert.equal(one('200g chicken breast').grams, 200);
    assert.equal(one('200 g chicken breast').grams, 200);
    assert.equal(one('0.25 kg chicken breast').grams, 250);
    // 100 g serving: 200 g really is two servings.
    assert.equal(one('200g chicken breast').servings, 2);
  });

  test('millilitres count as grams for drinks', () => {
    assert.equal(one('300 ml milk').grams, 300);
  });

  test('word numbers, fractions and mixed fractions', () => {
    assert.equal(one('two rotis').grams, 80);
    assert.equal(one('half a katori of dal').grams, 75);
    assert.equal(one('1/2 katori dal').grams, 75);
    assert.equal(one('1 1/2 cups rice').grams, 225);
    assert.equal(one('½ katori dal').grams, 75);
  });

  test('no amount given falls back to one serving, and says so', () => {
    const r = one('banana');
    assert.equal(r.grams, 118);
    assert.match(r.reason, /no amount given/);
  });

  test('a bare food name is a search, not something to log', () => {
    assert.equal(parseMeal('roti', FOODS).quantified, false);
    assert.equal(parseMeal('chicken', FOODS).quantified, false);
    // Two foods named at once is a meal even with no numbers in it.
    assert.equal(parseMeal('roti and dal', FOODS).quantified, true);
    assert.equal(parseMeal('2 rotis', FOODS).quantified, true);
  });

  test('the more specific name wins over one that merely contains the word', () => {
    assert.equal(one('150g chicken breast').foodId, 'chicken-breast');
    assert.equal(one('1 bowl chicken curry').foodId, 'chicken-curry');
  });

  test('an ambiguous name resolves to the food you eat more often', () => {
    // Both tea rows match "tea"; FOODS is ordered most-used first, so chai wins.
    assert.equal(one('1 cup tea').foodId, 'tea-chai');
    // Naming the specific one still works.
    assert.equal(one('1 cup black tea').foodId, 'tea-black');
    assert.equal(one('2 chai').foodId, 'tea-chai');
    assert.equal(one('2 chai').grams, 300);
  });

  test('nothing it cannot place is silently dropped', () => {
    const r = parseMeal('2 rotis and a pizza', FOODS);
    assert.deepEqual(r.items.map((i) => i.foodId), ['roti']);
    assert.deepEqual(r.unmatched, ['a pizza']);
  });

  test('every item carries the text it came from and a reason for the amount', () => {
    const r = one('2 katori of curd');
    assert.equal(r.text, '2 katori of curd');
    assert.match(r.reason, /2 × katori/);
    assert.ok(r.score > UNSURE, `expected a confident match, got ${r.score}`);
  });

  test('a serving label that already counts several units is not double-counted', () => {
    // Peanut butter's serving IS "2 tbsp" (32 g). Two tablespoons is one serving,
    // not two — the naive reading logs 64 g for a normal spoonful.
    const r = one('2 tbsp peanut butter');
    assert.equal(r.grams, 32);
    assert.equal(r.servings, 1);
    assert.equal(one('4 tbsp peanut butter').grams, 64);
  });

  test('the double-count guard holds however the unit is spelled', () => {
    // Nobody types the abbreviation every time. Matching only "tbsp" let the
    // spelled-out forms through the guard and logged a double portion.
    for (const text of ['2 tablespoons peanut butter', '2 tablespoon peanut butter', '2 tbsps peanut butter']) {
      assert.equal(one(text).grams, 32, text);
    }
  });

  test('a serving label is read however it is written', () => {
    // "~23 nuts" is already in the seed, so the label reader cannot insist on
    // "<digits><space><unit>" — anything else silently counted as one.
    for (const servingLabel of ['2 tbsp', '2tbsp', '~2 tbsp', 'two tbsp']) {
      const { items } = parseMeal('2 tbsp peanut butter', [{ id: 'pb', name: 'Peanut butter', servingG: 32, servingLabel }]);
      assert.equal(items[0]?.grams, 32, servingLabel);
    }
  });

  test('a unit the row is not defined in is converted and the conversion is stated', () => {
    const r = one('2 bowls of dal'); // the row's serving is a katori
    assert.equal(r.foodId, 'dal-toor');
    assert.equal(r.grams, 300);
    assert.match(r.reason, /counted as/);
  });

  test('junk in, nothing out — never a crash and never a bogus entry', () => {
    for (const junk of ['', '   ', '!!!', '0 rotis', '...', '2', 'and and and']) {
      const r = parseMeal(junk, FOODS);
      assert.equal(r.items.length, 0, `"${junk}" should log nothing`);
    }
    assert.deepEqual(parseMeal('2 rotis', []).items, []);
  });

  test('a serving of zero grams can never produce an entry', () => {
    const broken: ParsableFood[] = [{ id: 'bad', name: 'Mystery', servingG: 0, servingLabel: null }];
    assert.deepEqual(parseMeal('2 mystery', broken).items, []);
  });

  test('servings and grams always agree with the food they matched', () => {
    for (const text of ['2 rotis', '300 ml milk', '1 1/2 cups rice', '2 tbsp peanut butter']) {
      const item = one(text);
      const food = FOODS.find((f) => f.id === item.foodId);
      assert.ok(food);
      assert.ok(Math.abs(item.servings * food.servingG - item.grams) < 0.5, `${text}: ${item.servings} × ${food.servingG} ≠ ${item.grams}`);
    }
  });
});
