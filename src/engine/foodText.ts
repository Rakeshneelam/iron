/**
 * Plain-English meal text → quantified food entries. PURE: text and a food list
 * in, matches out. No I/O, no network, no model.
 *
 * "2 rotis and a katori of dal, 1 scoop whey" is how someone actually describes
 * lunch, and typing it should be faster than three trips through a picker. The
 * macros are not invented here: every item resolves to a row that already exists
 * in the food table, with its own per-serving numbers, so the arithmetic is the
 * same arithmetic the rest of Food does (`foodMacros`).
 *
 * WHY NO LLM. The brief asked for "AI-powered" logging. A model call is a network
 * call to a third party carrying the user's food diary, and it needs an API key —
 * in an APK handed to friends, that is either a backend or a blank field. Both are
 * forbidden by AGENTS §1.1. It would also guess macros for foods that are already
 * in the table with corrected values, which is strictly worse than looking them up.
 * So the hard part here is understanding the SENTENCE, and that is a parser.
 *
 * WHAT IT WILL NOT DO. It never silently logs. Every item comes back with the
 * fragment it came from, the rule that produced the amount and a score, so the
 * screen can show "2 × Roti — from '2 rotis'" and let a wrong match be fixed in one
 * tap (AGENTS §1.5). Fragments it cannot place are returned in `unmatched` rather
 * than dropped, because quietly losing the dal is worse than saying so.
 *
 * Pass `foods` most-used first (what `quickAddFoods` and `searchFoods` already
 * return). Ties then resolve to the food you actually eat, which is free accuracy:
 * "tea" lands on whichever of chai or black tea you drink.
 */

export interface ParsableFood {
  id: string;
  name: string;
  /** Grams in one serving. Must be > 0 to be matchable. */
  servingG: number;
  /** "1 roti", "1 katori" — the unit the user says out loud. */
  servingLabel: string | null;
}

export interface ParsedItem {
  foodId: string;
  name: string;
  /** The fragment this came from, verbatim, so a wrong match is visible. */
  text: string;
  /** Portions of the food's own serving. */
  servings: number;
  grams: number;
  /** Plain-English account of how the amount was reached (AGENTS §1.5). */
  reason: string;
  /** 0–1 name-match quality. Below `UNSURE` the screen should prompt a check. */
  score: number;
}

export interface ParsedMeal {
  items: ParsedItem[];
  /** Fragments that matched nothing. Surfaced, never swallowed. */
  unmatched: string[];
  /**
   * The text described amounts, rather than naming one food. A bare "roti" is a
   * search box query; "2 rotis" is a thing to log. Callers use this to decide
   * whether to offer logging at all.
   */
  quantified: boolean;
}

/** Below this a match is a guess worth flagging in the UI. */
export const UNSURE = 0.6;
/** Below this it is not a match at all. */
const FLOOR = 0.34;

const EMPTY: ParsedMeal = { items: [], unmatched: [], quantified: false };

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, couple: 2, few: 3,
};

/** Grams per unit, for units that measure mass or (close enough) volume of liquid. */
const MASS_UNITS: Record<string, number> = {
  g: 1, gm: 1, gms: 1, gram: 1, grams: 1, gramme: 1, grammes: 1,
  kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  ml: 1, mls: 1, l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
};

/**
 * Words that count portions rather than mass. They resolve to the food's own
 * serving, because that is what the serving was defined as — "1 katori" of dal is
 * the row's serving, whatever 150 g means to anyone else.
 */
const PORTION_UNITS = new Set([
  'cup', 'cups', 'katori', 'katoris', 'bowl', 'bowls', 'plate', 'plates',
  'glass', 'glasses', 'scoop', 'scoops', 'serving', 'servings', 'portion', 'portions',
  'piece', 'pieces', 'slice', 'slices', 'handful', 'handfuls',
  'tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tsp', 'tsps', 'teaspoon', 'teaspoons',
]);

/** Spellings of one unit, singular. So "2 tablespoons" meets a row labelled "2 tbsp". */
const UNIT_ALIASES: Record<string, string> = { tablespoon: 'tbsp', teaspoon: 'tsp' };

/** Noise between the amount and the food. */
const FILLER = new Set(['of', 'a', 'an', 'some', 'the', 'my', 'with', 'and', 'plus']);

/** Words in food names that never help tell two foods apart. */
const NAME_NOISE = new Set([
  'cooked', 'raw', 'dry', 'home', 'homemade', 'plain', 'whole', 'fresh',
  'with', 'and', 'or', 'no', 'the', 'a', 'an', 'of', 'g', 'ml',
]);

const FRACTIONS: Record<string, string> = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3' };

function normalise(s: string): string {
  let out = s.toLowerCase();
  for (const [glyph, text] of Object.entries(FRACTIONS)) out = out.split(glyph).join(text);
  return out;
}

/** "rotis" → "roti", "berries" → "berry". Crude on purpose; it only feeds matching. */
function singular(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('hes'))) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function words(s: string): string[] {
  return normalise(s)
    .split(/[^a-z0-9/.]+/)
    .filter((w) => w.length > 0);
}

/** Words that negate the one after them. "Tea, black (no milk)" is the one tea
 * that is NOT milk, so "milk" must not match it. */
const NEGATORS = new Set(['no', 'without']);

/** A food's distinguishing words, singularised. */
function nameTokens(name: string): string[] {
  const out: string[] = [];
  let negated = false;
  for (const w of words(name)) {
    const t = singular(w.replace(/[^a-z0-9]/g, ''));
    if (t.length <= 1) continue;
    if (NEGATORS.has(t)) { negated = true; continue; }
    if (NAME_NOISE.has(t)) continue;
    // Marked, not dropped: it still counts toward the name's length (so the
    // chai-vs-black-tea gap stays inside AMBIGUOUS_BAND) but no query word can hit it.
    const tok = negated ? `!${t}` : t;
    negated = false;
    if (!out.includes(tok)) out.push(tok);
  }
  return out;
}

/** A number at the head of a fragment: "2", "2.5", "1/2", "1 1/2", "two", "a". */
function takeQuantity(tokens: string[]): { qty: number | null; rest: string[] } {
  const first = tokens[0];
  if (first === undefined) return { qty: null, rest: tokens };

  const asNumber = (w: string): number | null => {
    const frac = /^(\d+)\/(\d+)$/.exec(w);
    if (frac) {
      const top = Number(frac[1]);
      const bottom = Number(frac[2]);
      return bottom > 0 ? top / bottom : null;
    }
    // "200g" — a number with its unit stuck to it.
    const glued = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(w);
    if (glued?.[1] !== undefined) return Number(glued[1]);
    return /^\d+(?:\.\d+)?$/.test(w) ? Number(w) : null;
  };

  // Zero is a real answer ("0 rotis" means none) and must not fall through to the
  // no-amount branch, which would log one serving of something you did not eat.
  const head = asNumber(first) ?? WORD_NUMBERS[first] ?? null;
  if (head === null || !Number.isFinite(head) || head < 0) return { qty: null, rest: tokens };

  // "1 1/2 cups": a whole number followed by a bare fraction is one amount.
  const second = tokens[1];
  if (second !== undefined && Number.isInteger(head) && /^\d+\/\d+$/.test(second)) {
    const frac = asNumber(second);
    if (frac !== null) return { qty: head + frac, rest: tokens.slice(2) };
  }

  // "200g" keeps its unit as the next token so the unit step can read it.
  const glued = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(first);
  if (glued?.[2] !== undefined) return { qty: head, rest: [glued[2], ...tokens.slice(1)] };

  return { qty: head, rest: tokens.slice(1) };
}

/** Leading noise words. "half a katori" and "1 katori of dal" both have some. */
function dropFiller(tokens: string[]): string[] {
  let i = 0;
  while (i < tokens.length && FILLER.has(tokens[i] ?? '')) i++;
  return tokens.slice(i);
}

/**
 * A unit at the head, but only if a food name survives it. "2 rotis" must keep
 * "rotis" as the food; "2 katori dal" must not keep "katori".
 */
function takeUnit(tokens: string[]): { unit: string | null; rest: string[] } {
  const first = tokens[0];
  if (first === undefined) return { unit: null, rest: tokens };
  const known = MASS_UNITS[first] !== undefined || PORTION_UNITS.has(first);
  if (!known) return { unit: null, rest: tokens };
  const rest = dropFiller(tokens.slice(1));
  // Mass units are never a food, so they go even if nothing follows ("200 g" alone
  // is unmatchable either way). A portion word is kept when it is all there is.
  if (rest.length === 0 && MASS_UNITS[first] === undefined) return { unit: null, rest: tokens };
  return { unit: first, rest };
}

/**
 * The count and unit inside a serving label: "2 tbsp" → 2 tbsp, "1 roti" → 1 roti.
 * Without the count, "2 tbsp peanut butter" against a row whose serving IS two
 * tablespoons logs double.
 */
function servingUnit(food: ParsableFood): { count: number; unit: string } {
  const label = food.servingLabel?.trim().toLowerCase();
  if (!label) return { count: 1, unit: 'serving' };
  // Same reader the typed text gets, so "2tbsp", "~2 tbsp", "two tbsp" and "1/2 cup"
  // are all understood rather than silently counting as one.
  const { qty, rest } = takeQuantity(words(label));
  const unit = rest.join(' ');
  return { count: qty !== null && qty > 0 ? qty : 1, unit: unit || label };
}

const canonUnit = (w: string) => { const s = singular(w); return UNIT_ALIASES[s] ?? s; };
const sameUnit = (a: string, b: string) => canonUnit(a) === canonUnit(b);

/** 0–1: how well a typed name fits a catalogue name. */
function scoreMatch(query: readonly string[], food: readonly string[]): number {
  if (query.length === 0 || food.length === 0) return 0;
  const hit = (q: string) => food.some((f) => f === q || (q.length > 3 && f.startsWith(q)) || (f.length > 3 && q.startsWith(f)));
  const matched = query.filter(hit).length;
  if (matched === 0) return 0;
  if (matched === query.length) {
    // Every word placed. Prefer the food that says least besides them, so "dal"
    // picks "Toor dal" over "Dal makhani with cream".
    return query.length === food.length ? 1 : 0.6 + (0.4 * query.length) / food.length;
  }
  return (0.5 * matched) / query.length;
}

/**
 * Scores within this of the best are treated as equally good fits, and the tie
 * goes to the food highest in `foods` — i.e. the one eaten most often. "tea"
 * describes both chai and black tea about equally well; the difference between
 * them is 90 kcal, so guessing on name shape alone is the wrong kind of clever.
 */
const AMBIGUOUS_BAND = 0.08;

function bestFood(query: readonly string[], foods: readonly ParsableFood[]): { food: ParsableFood; score: number } | null {
  const candidates: { food: ParsableFood; score: number }[] = [];
  let top = 0;
  for (const food of foods) {
    if (!(food.servingG > 0)) continue;
    const score = scoreMatch(query, nameTokens(food.name));
    if (score <= FLOOR) continue;
    if (score > top) top = score;
    candidates.push({ food, score });
  }
  // First past the band, not highest: `candidates` keeps the order `foods` came in.
  return candidates.find((c) => c.score >= top - AMBIGUOUS_BAND) ?? null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Splits on the punctuation and conjunctions people actually use between foods.
 * " and " is a separator, but "dal and rice" inside one fragment is two foods too,
 * so it is treated the same way.
 */
function fragments(text: string): string[] {
  return normalise(text)
    .split(/\s*(?:,|;|\+|\band\b|\bwith\b|\bplus\b|\n)\s*/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

export function parseMeal(text: string, foods: readonly ParsableFood[]): ParsedMeal {
  if (text.trim() === '' || foods.length === 0) return EMPTY;

  const items: ParsedItem[] = [];
  const unmatched: string[] = [];
  let sawAmount = false;

  for (const fragment of fragments(text)) {
    const tokens = words(fragment);
    const { qty, rest: afterQty } = takeQuantity(tokens);
    // "half a katori of dal": the filler sits between the amount and the unit, so
    // it has to go before the unit is looked for, not after.
    const { unit, rest: afterUnit } = takeUnit(dropFiller(afterQty));
    const query = afterUnit.filter((w) => !FILLER.has(w)).map((w) => singular(w.replace(/[^a-z0-9]/g, ''))).filter((w) => w.length > 1);

    if (qty !== null || unit !== null) sawAmount = true;

    const match = bestFood(query, foods);
    if (!match) {
      unmatched.push(fragment);
      continue;
    }

    const { food, score } = match;
    const amount = qty ?? 1;
    const massPerUnit = unit === null ? undefined : MASS_UNITS[unit];
    const own = servingUnit(food);
    const per = `${round(food.servingG)} g`;

    let grams: number;
    let reason: string;
    if (massPerUnit !== undefined) {
      grams = amount * massPerUnit;
      reason = `${round(grams)} g, as typed`;
    } else if (unit !== null && sameUnit(unit, own.unit)) {
      // The row's own unit. Its label may already count several ("2 tbsp"), so the
      // amount is divided by that — otherwise "2 tbsp peanut butter" logs double.
      grams = (amount / own.count) * food.servingG;
      reason = own.count === 1
        ? `${round(amount)} × ${own.unit} (${per} each)`
        : `${round(amount)} ${own.unit}, and one serving is ${own.count} ${own.unit} (${per})`;
    } else if (unit !== null) {
      // A unit the row is not defined in ("1 bowl" of a row measured in katoris).
      // Counted one-for-one and said out loud, because there is no conversion to be had.
      grams = amount * food.servingG;
      reason = `${round(amount)} ${unit} counted as ${round(amount)} × ${own.unit} (${per} each)`;
    } else {
      grams = amount * food.servingG;
      reason = qty === null
        ? `one ${own.unit} (${per}) — no amount given`
        : `${round(amount)} × ${own.unit} (${per} each)`;
    }

    if (!(grams > 0)) {
      unmatched.push(fragment);
      continue;
    }

    items.push({
      foodId: food.id,
      name: food.name,
      text: fragment,
      servings: round(grams / food.servingG),
      grams: round(grams),
      reason,
      score: round(score),
    });
  }

  return { items, unmatched, quantified: sawAmount || items.length > 1 };
}
