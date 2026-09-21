#!/usr/bin/env node
/**
 * Imports exercise demonstration media into Iron from a local clone of
 * hasaneyldrm/exercises-dataset (or anything with the same shape).
 *
 * WHY THIS IS A SCRIPT AND NOT A COMMITTED FOLDER
 *
 * That dataset's JSON is MIT. Its images and GIFs are not: they are © Gym visual,
 * redistributed in that repo with permission FOR that repo, and its NOTICE.md says
 * so in as many words — "cloning this repo is not a license". Reuse means getting
 * a licence from Gym visual directly, keeping the credit, and staying at the
 * distributed 180×180. Iron is handed to friends as an APK, so shipping media it
 * has no right to would be a licence violation in every install.
 *
 * So the integration is written and the artwork is not committed. Run this once
 * you hold the rights and the how-to uses real frames; until then it draws its
 * own figure.
 *
 * WHAT A LICENCE COSTS (checked 21 Sep 2026 — verify, these move)
 *
 *   Gym visual   ~$0.90 per animated GIF at 10+ in the cart, ~$0.75 per still.
 *                A la carte, so Iron's 95 exercises land near $85 — and you buy
 *                only the movements this catalogue actually has.
 *   ExerciseDB   $199 one-time (Starter: 1,394 exercises, 180×180 + 360×360) or
 *                $599 (Pro: adds 720/1080 and a movement taxonomy). Perpetual,
 *                self-hosted, commercial — but you would use ~7% of it.
 *
 * Per-exercise buying is the cheaper route for a catalogue this size. Both end up
 * here: get the files, then run this.
 *
 * USAGE
 *   git clone https://github.com/hasaneyldrm/exercises-dataset /tmp/ex
 *   npm run media:import -- --from /tmp/ex --i-have-a-gymvisual-licence
 *
 *   --from <dir>   the dataset clone (expects data/exercises.json + videos/)
 *   --dry-run      report the matching and write nothing
 *   --images       take the still thumbnails instead of the animated GIFs
 *   --threshold N  match confidence cut-off, default 0.6 (see THRESHOLD below)
 *
 * WHAT IT WRITES
 *   assets/exercise-media/<catalogue-id>.gif      (git-ignored)
 *   src/features/exercises/media/registry.generated.ts
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'assets/exercise-media');
const REGISTRY = join(ROOT, 'src/features/exercises/media/registry.generated.ts');
const CREDIT = '© Gym visual — https://gymvisual.com/';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const from = value('from');
const dryRun = flag('dry-run');
const useImages = flag('images');

if (!from) {
  console.error('Missing --from <dataset dir>. See the header of this file.');
  process.exit(1);
}
if (!flag('i-have-a-gymvisual-licence') && !dryRun) {
  console.error(
    [
      '',
      'Refusing to copy media.',
      '',
      "The artwork in this dataset is © Gym visual and its own NOTICE.md says cloning",
      'the repo is not a licence. Before bundling it into an app you hand to anyone:',
      '',
      '  https://gymvisual.com/content/3-terms-and-conditions-of-use',
      '',
      'Re-run with --i-have-a-gymvisual-licence once you do, or --dry-run to see the',
      'matching without copying anything.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/* ------------------------------ the catalogue ----------------------------- */

/**
 * Read Iron's catalogue without importing it: it is TypeScript with `@/` aliases,
 * and a regex over the source is a great deal less machinery than a TS pipeline
 * for four fields.
 */
function readCatalogue() {
  const dir = join(ROOT, 'src/data/catalog');
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'types.ts' && f !== 'index.ts')) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const m of src.matchAll(/id:\s*'([^']+)',\s*name:\s*'([^']+)'/g)) {
      const [, id, name] = m;
      const after = src.slice(m.index, m.index + 600);
      const aka = [...after.matchAll(/aka:\s*\[([^\]]*)\]/g)].flatMap((a) =>
        [...a[1].matchAll(/'([^']+)'/g)].map((x) => x[1]),
      );
      const equipment = /equipment:\s*'([^']+)'/.exec(after)?.[1] ?? '';
      out.push({ id, name, aka, equipment });
    }
  }
  return out;
}

/* -------------------------------- matching -------------------------------- */

/** Lower-case, strip punctuation and the words that say nothing about the movement. */
const NOISE = new Set(['the', 'a', 'with', 'on', 'and', 'exercise', 'version', 'variation', 'alternate', 'alternating']);
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .join(' ');
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


/**
 * Words that change WHICH movement it is, not just how it is described.
 *
 * Without this "Incline Barbell Bench Press" scores 0.90 against plain "Barbell
 * Bench Press" — three of four words shared — and close-grip bench gets the demo
 * for flat bench. A missing qualifier is a different exercise, so it costs much
 * more than an ordinary missing word.
 */
const QUALIFIERS = new Set([
  'incline', 'decline', 'flat', 'close', 'wide', 'narrow', 'grip', 'front', 'back', 'goblet', 'sumo',
  'reverse', 'single', 'one', 'seated', 'standing', 'lying', 'bent', 'overhead', 'romanian', 'bulgarian',
  'hammer', 'preacher', 'concentration', 'pause', 'deficit', 'pendlay', 'zercher', 'hack', 'sissy',
  'split', 'walking', 'side', 'lateral', 'rear', 'assisted', 'weighted', 'neutral', 'underhand', 'overhand',
]);

/** Jaccard over word sets, nudged up when the equipment agrees. */
function score(catalogueEntry, datasetEntry) {
  const names = [catalogueEntry.name, ...catalogueEntry.aka];
  let best = 0;
  for (const n of names) {
    const a = tokens(n);
    const b = tokens(datasetEntry.name ?? '');
    if (a.size === 0 || b.size === 0) continue;
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    let jaccard = shared / (a.size + b.size - shared);
    // A qualifier on either side that the other lacks means these are probably
    // different lifts, however much of the rest of the name they share.
    for (const w of a) if (QUALIFIERS.has(w) && !b.has(w)) jaccard -= 0.35;
    for (const w of b) if (QUALIFIERS.has(w) && !a.has(w)) jaccard -= 0.35;
    if (equipmentClash(catalogueEntry.equipment, b)) jaccard -= 0.5;
    if (jaccard > best) best = jaccard;
  }
  const equip = norm(String(datasetEntry.equipment ?? ''));
  const wanted = norm(catalogueEntry.equipment);
  // "barbell" vs "barbell", "dumbbell" vs "dumbbell": a real signal, not a decider.
  if (wanted && equip && (equip.includes(wanted) || wanted.includes(equip))) best += 0.15;
  return best;
}

/**
 * Below this, a name match is a coincidence — and a confidently wrong
 * demonstration is worse than no demonstration, because the drawn figure it
 * replaces was at least right.
 *
 * Name matching against someone else's naming scheme never lands first time, so
 * this is a knob: run --dry-run, read the weakest matches, move it. Lower catches
 * more and risks showing flat bench for incline; higher leaves more exercises on
 * the drawn figure, which is a safe place to leave them.
 */
const THRESHOLD = Number(value('threshold') ?? 0.6);

/* ---------------------------------- run ----------------------------------- */

const dataPath = join(from, 'data/exercises.json');
if (!existsSync(dataPath)) {
  console.error(`No data/exercises.json under ${from}.`);
  process.exit(1);
}

const dataset = JSON.parse(readFileSync(dataPath, 'utf8'));
const catalogue = readCatalogue();
if (catalogue.length === 0) {
  console.error('Read no exercises out of src/data/catalog — has its shape changed?');
  process.exit(1);
}

const mediaDir = join(from, useImages ? 'images' : 'videos');
const matches = [];
const misses = [];

for (const entry of catalogue) {
  let best = null;
  let bestScore = 0;
  for (const d of dataset) {
    const sc = score(entry, d);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  if (!best || bestScore < THRESHOLD) {
    misses.push(entry);
    continue;
  }
  // The dataset names its files by media_id or by the image/gif_url basename.
  const candidates = [
    best.media_id ? `${best.media_id}.${useImages ? 'jpg' : 'gif'}` : null,
    best.gif_url ? basename(String(best.gif_url)) : null,
    best.image ? basename(String(best.image)) : null,
  ].filter(Boolean);
  const file = candidates.map((c) => join(mediaDir, c)).find((p) => existsSync(p));
  if (!file) {
    misses.push(entry);
    continue;
  }
  matches.push({ entry, dataset: best, file, score: bestScore });
}

console.log(`Catalogue: ${catalogue.length} exercises`);
console.log(`Matched:   ${matches.length}`);
console.log(`No match:  ${misses.length}${misses.length ? ` (${misses.slice(0, 12).map((m) => m.id).join(', ')}${misses.length > 12 ? ', …' : ''})` : ''}`);
console.log('These keep the drawn figure, which is the point of keeping it.');

if (dryRun) {
  // Printed so the matching can be audited before any of it is trusted: a
  // confidently wrong demonstration is worse than the drawn figure.
  console.log('\nMatches, weakest first — check the bottom of this list:');
  for (const m of [...matches].sort((a, b) => a.score - b.score)) {
    console.log(`  ${m.score.toFixed(2)}  ${m.entry.id.padEnd(24)} -> ${m.dataset.name}`);
  }
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const ext = useImages ? 'jpg' : 'gif';
const lines = [];
for (const m of matches) {
  const target = join(OUT_DIR, `${m.entry.id}.${ext}`);
  copyFileSync(m.file, target);
  const name = String(m.dataset.name ?? m.entry.name).replace(/'/g, "\\'");
  lines.push(`  '${m.entry.id}': { source: require('../../../../assets/exercise-media/${m.entry.id}.${ext}'), name: '${name}', size: 180 },`);
}

writeFileSync(
  REGISTRY,
  `/**
 * GENERATED — do not edit by hand. Rewritten by \`npm run media:import\`.
 *
 * Maps Iron catalogue ids to bundled demonstration media. Committed empty; the
 * artwork it points at is NOT redistributable (see ./index.ts).
 */
import type { MediaEntry } from './types';

export const MEDIA: Readonly<Record<string, MediaEntry>> = {
${lines.join('\n')}
};

/** Who owns the artwork in MEDIA. Rendered under every frame that uses it. */
export const MEDIA_CREDIT: string | null = ${lines.length ? `'${CREDIT}'` : 'null'};
`,
);

console.log(`\nWrote ${matches.length} files to assets/exercise-media/ and regenerated the registry.`);
console.log(`Credit rendered under every frame: ${CREDIT}`);
console.log('assets/exercise-media/ is git-ignored — the artwork stays out of the repo.');
