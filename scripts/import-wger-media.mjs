#!/usr/bin/env node
/**
 * Imports exercise demonstration images from wger — the one source in this space
 * that is actually free to use commercially, and can prove it.
 *
 * WHY THIS ONE
 *
 * Nearly every "1,300 exercise GIFs, MIT licensed" repo on GitHub is the same
 * artwork relabelled. exercises-dataset is honest about it (© Gym visual, "cloning
 * this repo is not a license"); exercise-library credits "ExerciseDB" and calls the
 * GIFs "community-contributed"; exercises-gifs says in its own README "I do not own
 * any of the content in this repository". An MIT notice applied by someone who does
 * not hold the rights conveys nothing, and ExerciseDB — which does claim to own its
 * GIFs — sells a perpetual licence that specifically forbids redistributing the raw
 * files. That is what those repos are doing.
 *
 * wger is different. It is an AGPL project that records a licence, an author and a
 * source URL against every single image, and its licence table is CC0, CC-BY 4,
 * CC-BY-SA 3, CC-BY-SA 4 and ODbL. All of those permit commercial use. The cost is
 * attribution, which this script bakes into the registry so it cannot be forgotten.
 *
 * WHAT YOU GIVE UP
 *
 * Coverage, mostly. wger has ~374 images over ~909 exercises, 97 of which record no
 * author and so cannot be attributed under the licence they carry. Against Iron's
 * 95-exercise, barbell-heavy catalogue that yields FOUR trustworthy matches:
 * pallof-press, db-rdl, dips, chin-up. wger's set skews dumbbell and bodyweight,
 * and it does not have a barbell back squat or bench press to give you.
 *
 * They are also stills — usually a start/end pair — not animation. The demo
 * cross-fades a pair, which is the same two-pose idiom the drawn figure already
 * uses, so it reads as a movement rather than a photo.
 *
 * Four is not a reason to skip this: those four are real, free, and correctly
 * credited. It is a reason not to expect it to replace a paid set.
 *
 * USAGE
 *   npm run media:import:wger                  # pull from wger.de
 *   npm run media:import:wger -- --dry-run     # report the matching, write nothing
 *   npm run media:import:wger -- --threshold 0.7
 *
 * Network is used HERE, at build time, by you. The app itself never fetches
 * anything: what ships is a bundled asset or nothing (AGENTS.md §1).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'assets/exercise-media');
const REGISTRY = join(ROOT, 'src/features/exercises/media/registry.generated.ts');
const API = 'https://wger.de/api/v2';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dryRun = flag('dry-run');

/**
 * Only licences that permit commercial use. wger's table is entirely made of them
 * today, but it is a table someone can add rows to, so this allow-lists rather
 * than assuming.
 */
const ALLOWED = new Map([
  [1, 'CC BY-SA 3.0'],
  [2, 'CC BY-SA 4.0'],
  [3, 'CC0'],
  [4, 'CC BY 4.0'],
  [5, 'ODbL'],
]);
/** CC0 waives attribution; everything else here requires it. */
const NEEDS_AUTHOR = new Set([1, 2, 4, 5]);

async function getAll(path) {
  const out = [];
  let url = `${API}/${path}${path.includes('?') ? '&' : '?'}format=json&limit=100`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    const page = await res.json();
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

/* ------------------------------ the catalogue ----------------------------- */

function readCatalogue() {
  const dir = join(ROOT, 'src/data/catalog');
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'types.ts' && f !== 'index.ts')) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const m of src.matchAll(/id:\s*'([^']+)',\s*name:\s*'([^']+)'/g)) {
      const [, id, name] = m;
      const after = src.slice(m.index, m.index + 600);
      const aka = [...after.matchAll(/aka:\s*\[([^\]]*)\]/g)].flatMap((a) => [...a[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
      out.push({ id, name, aka, equipment: /equipment:\s*'([^']+)'/.exec(after)?.[1] ?? '' });
    }
  }
  return out;
}

/* -------------------------------- matching -------------------------------- */

const NOISE = new Set(['the', 'a', 'with', 'on', 'and', 'exercise', 'version', 'variation', 'alternate', 'alternating']);
const QUALIFIERS = new Set([
  'incline', 'decline', 'flat', 'close', 'wide', 'narrow', 'grip', 'front', 'back', 'goblet', 'sumo',
  'reverse', 'single', 'one', 'seated', 'standing', 'lying', 'bent', 'overhead', 'romanian', 'bulgarian',
  'hammer', 'preacher', 'concentration', 'pause', 'deficit', 'pendlay', 'zercher', 'hack', 'sissy',
  'split', 'walking', 'side', 'lateral', 'rear', 'assisted', 'weighted', 'neutral', 'underhand', 'overhand',
]);
const norm = (s) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !NOISE.has(w)).join(' ');
const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean));

/**
 * Equipment words are qualifiers with teeth. "Dumbbell Front Squat" shares three of
 * four words with a barbell front squat, and "Incline bench pulldown" shares three
 * with an incline bench press — both scored 0.67 and both are a different exercise.
 * A conflicting implement is close to disqualifying.
 */
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'smith', 'bodyweight']);

/** Penalty for the other name naming an implement this exercise does not use. */
function equipmentClash(entryEquipment, nameTokens) {
  const mine = norm(entryEquipment);
  for (const w of nameTokens) {
    if (!EQUIPMENT.has(w)) continue;
    if (w !== mine) return true;
  }
  return false;
}


/** Same scorer as the licensed-set importer: a missing qualifier is a different lift. */
function score(entry, name) {
  let best = 0;
  for (const candidate of [entry.name, ...entry.aka]) {
    const a = tokens(candidate);
    const b = tokens(name ?? '');
    if (a.size === 0 || b.size === 0) continue;
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    let jaccard = shared / (a.size + b.size - shared);
    for (const w of a) if (QUALIFIERS.has(w) && !b.has(w)) jaccard -= 0.35;
    for (const w of b) if (QUALIFIERS.has(w) && !a.has(w)) jaccard -= 0.35;
    if (equipmentClash(entry.equipment, b)) jaccard -= 0.5;
    if (jaccard > best) best = jaccard;
  }
  return best;
}

/**
 * Strict by default — 0.9 is effectively "the names agree".
 *
 * At 0.6 this matched 14 of Iron's 95 and about half were wrong: close-grip bench
 * press → "Close-grip Press-ups", incline bench press → "Incline bench pulldown",
 * push-up → "Clap Push-UP". Word overlap cannot tell those apart, and a confidently
 * wrong demonstration is worse than the drawn figure it replaces. Lower it if you
 * like, but read the --dry-run list before you trust the result.
 */
const THRESHOLD = Number(value('threshold') ?? 0.9);

/* ---------------------------------- run ----------------------------------- */

console.log('Fetching wger exercises and images…');
const [images, translations] = await Promise.all([getAll('exerciseimage/'), getAll('exercise-translation/?language=2')]);

/** exercise id -> English name. */
const names = new Map();
for (const t of translations) if (!names.has(t.exercise) && t.name) names.set(t.exercise, t.name);

/** exercise id -> its usable images, main one first. */
const byExercise = new Map();
let rejectedLicence = 0;
let rejectedAuthor = 0;
for (const img of images) {
  const licence = ALLOWED.get(img.license);
  if (!licence) {
    rejectedLicence++;
    continue;
  }
  const author = (img.license_author ?? '').trim();
  // Attribution is the price of these licences. An image whose author wger does
  // not record cannot be attributed, so it cannot be used — 88 of them at the time
  // of writing, and that is exactly the kind of gap the other repos paper over.
  if (NEEDS_AUTHOR.has(img.license) && !author) {
    rejectedAuthor++;
    continue;
  }
  const list = byExercise.get(img.exercise) ?? [];
  list.push({ url: img.image, licence, author, isMain: img.is_main });
  byExercise.set(img.exercise, list);
}
for (const list of byExercise.values()) list.sort((a, b) => Number(b.isMain) - Number(a.isMain));

console.log(`wger images: ${images.length} (${rejectedLicence} on a licence we do not allow, ${rejectedAuthor} with no author to credit)`);

const catalogue = readCatalogue();
const matches = [];
const misses = [];

for (const entry of catalogue) {
  let best = null;
  let bestScore = 0;
  for (const [exerciseId, list] of byExercise) {
    const name = names.get(exerciseId);
    if (!name) continue;
    const sc = score(entry, name);
    if (sc > bestScore) {
      bestScore = sc;
      best = { name, list };
    }
  }
  if (!best || bestScore < THRESHOLD) misses.push(entry);
  else matches.push({ entry, ...best, score: bestScore });
}

console.log(`\nCatalogue: ${catalogue.length} exercises`);
console.log(`Matched:   ${matches.length}`);
console.log(`No match:  ${misses.length} — these keep the drawn figure, which is the point of keeping it.`);

if (dryRun) {
  console.log('\nMatches, weakest first — check the bottom of this list:');
  for (const m of [...matches].sort((a, b) => a.score - b.score)) {
    console.log(`  ${m.score.toFixed(2)}  ${m.entry.id.padEnd(24)} -> ${m.name}  [${m.list[0].licence}, ${m.list[0].author || 'no author'}]`);
  }
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const ext = (url) => (/\.(png|jpe?g|webp|gif)/i.exec(url)?.[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg');

async function download(url, target) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

const lines = [];
const credits = new Set();
for (const m of matches) {
  const [start, end] = m.list;
  const startExt = ext(start.url);
  const startFile = `${m.entry.id}.${startExt}`;
  try {
    await download(start.url, join(OUT_DIR, startFile));
  } catch (e) {
    console.warn(`  skipped ${m.entry.id}: ${e.message}`);
    continue;
  }
  let endRef = '';
  if (end) {
    const endFile = `${m.entry.id}-end.${ext(end.url)}`;
    try {
      await download(end.url, join(OUT_DIR, endFile));
      endRef = `, end: require('../../../../assets/exercise-media/${endFile}')`;
    } catch {
      /* the start frame alone is still a demonstration */
    }
  }
  const credit = `${start.author || 'wger'} · ${start.licence}`;
  credits.add(credit);
  const name = String(m.name).replace(/'/g, "\\'");
  lines.push(
    `  '${m.entry.id}': { source: require('../../../../assets/exercise-media/${startFile}')${endRef}, name: '${name}', size: 400, credit: '${credit.replace(/'/g, "\\'")}' },`,
  );
}

writeFileSync(
  REGISTRY,
  `/**
 * GENERATED — do not edit by hand. Rewritten by \`npm run media:import:wger\`.
 *
 * Images from wger (https://wger.de), used under the Creative Commons licences
 * recorded against each one. Every entry carries its own author and licence,
 * because a community set has a different one on every image — that credit is
 * rendered under the frame it belongs to.
 */
import type { MediaEntry } from './types';

export const MEDIA: Readonly<Record<string, MediaEntry>> = {
${lines.join('\n')}
};

/** Per-entry credit is used instead; this stays null. */
export const MEDIA_CREDIT: string | null = null;
`,
);

console.log(`\nWrote ${lines.length} exercises' media to assets/exercise-media/ and regenerated the registry.`);
console.log('Credits rendered under each frame:');
for (const c of [...credits].sort()) console.log(`  ${c}`);
console.log('\nassets/exercise-media/ is git-ignored. Re-run this after a clone.');
console.log('Licences: https://wger.de/api/v2/license/ — all of these permit commercial use with attribution.');
