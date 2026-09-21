#!/usr/bin/env node
/**
 * Imports the whole of hasaneyldrm/exercises-dataset — 1,324 exercises and their
 * animation frames — into Iron's catalogue and media registry.
 *
 * LICENCE, PLAINLY
 *
 * The JSON is MIT. The GIFs are © Gym visual, and that repo's NOTICE.md says
 * "cloning this repo is not a license". Copyright turns on DISTRIBUTION, not on
 * whether money changes hands: building this for your own phone is fine, handing
 * the APK to someone is not, whether or not you charge for it. The artwork lands in
 * a git-ignored folder so it cannot be committed by accident, and `--personal-use`
 * has to be stated out loud.
 *
 * WHAT IT GENERATES (both git-ignored or clearly marked generated)
 *
 *   src/data/catalog/imported.generated.ts    the exercises
 *   src/features/exercises/media/registry.generated.ts
 *   assets/exercise-media/<id>.gif            the frames
 *
 * WHAT IT DOES NOT DO
 *
 * It does not touch the 95 hand-written entries in core/upper/lower.ts. Those have
 * real coaching cues, correct movement patterns and curated progressions; these
 * 1,324 have machine-mapped muscles and generic instructions. Where both describe
 * the same lift the curated one wins, and the imported duplicate is dropped.
 *
 * USAGE
 *   npm run import:catalog -- --from <dataset dir> --personal-use
 *   npm run import:catalog -- --from <dataset dir> --dry-run
 *   --stills   use the 180x180 JPGs (11 MB) instead of the GIFs (125 MB)
 *   --no-media catalogue only, no artwork at all
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT_DIR = join(ROOT, 'assets/exercise-media');
const CATALOG_OUT = join(ROOT, 'src/data/catalog/imported.generated.ts');
const REGISTRY = join(ROOT, 'src/features/exercises/media/registry.generated.ts');
const CREDIT = '© Gym visual — https://gymvisual.com/';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const value = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const from = value('from');
const dryRun = flag('dry-run');
const stills = flag('stills');
const noMedia = flag('no-media');

if (!from) {
  console.error('Missing --from <dataset dir>. See the header of this file.');
  process.exit(1);
}
if (!dryRun && !noMedia && !flag('personal-use') && !flag('i-have-a-gymvisual-licence')) {
  console.error(
    [
      '',
      'Refusing to copy artwork.',
      '',
      'The GIFs are © Gym visual; that repo\'s NOTICE says cloning it is not a licence.',
      'What matters is distribution, not money — a free APK handed to a friend needs a',
      'licence just as a paid one does. Building for your own device does not.',
      '',
      'Say which is true:',
      '  --personal-use                 stays on your own device',
      '  --i-have-a-gymvisual-licence   bought: https://gymvisual.com/',
      '  --no-media                     import the exercise data only',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/* ============================ the mappings ================================ */

/** 28 dataset implements onto Iron's 8. What you can actually load decides this. */
const EQUIPMENT = {
  'body weight': 'bodyweight', weighted: 'bodyweight', 'stability ball': 'bodyweight',
  'bosu ball': 'bodyweight', roller: 'bodyweight', 'wheel roller': 'bodyweight', tire: 'bodyweight',
  barbell: 'barbell', 'ez barbell': 'barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell',
  dumbbell: 'dumbbell', 'medicine ball': 'dumbbell',
  cable: 'cable', rope: 'cable',
  'leverage machine': 'machine', assisted: 'machine', 'sled machine': 'machine', hammer: 'machine',
  'upper body ergometer': 'machine', 'skierg machine': 'machine', 'stationary bike': 'machine',
  'elliptical machine': 'machine', 'stepmill machine': 'machine',
  kettlebell: 'kettlebell',
  band: 'band', 'resistance band': 'band',
  'smith machine': 'smith',
};

/** Smallest sensible jump per implement; the gym inventory refines it later. */
const LOAD_STEP = { barbell: 2.5, smith: 2.5, dumbbell: 2, cable: 2.5, machine: 5, kettlebell: 4, band: 1, bodyweight: 2.5 };

/** 19 `target` values and 29 `muscle_group` values onto Iron's 15 muscles. */
const MUSCLE = {
  abs: 'abs', abdominals: 'abs', core: 'abs', 'serratus anterior': 'abs',
  obliques: 'obliques', 'hip flexors': 'abs',
  pectorals: 'chest', chest: 'chest',
  biceps: 'biceps', triceps: 'triceps',
  delts: 'shoulders', deltoids: 'shoulders', shoulders: 'shoulders', 'rotator cuff': 'shoulders',
  'upper back': 'back', lats: 'back', 'latissimus dorsi': 'back', rhomboids: 'back',
  traps: 'traps', trapezius: 'traps', 'levator scapulae': 'traps',
  forearms: 'forearms', 'wrist flexors': 'forearms', 'wrist extensors': 'forearms', wrists: 'forearms', hands: 'forearms',
  quads: 'quads', quadriceps: 'quads',
  hamstrings: 'hamstrings', glutes: 'glutes',
  calves: 'calves', soleus: 'calves', ankles: 'calves', 'ankle stabilizers': 'calves',
  adductors: 'adductors', abductors: 'glutes',
  spine: 'lowerBack', 'lower back': 'lowerBack',
  'cardiovascular system': 'quads', // cardio has no muscle; pattern carries the meaning
};

/**
 * The movement pattern, inferred from the name and the target.
 *
 * This one matters more than the rest: the engine uses `pattern` for warm-up ramps,
 * substitutions, rest defaults and per-muscle volume. A wrong pattern produces a
 * wrong suggestion, so the name is checked before the muscle — "leg extension" is a
 * knee extension whatever its target says.
 */
function inferPattern(name, target, category) {
  const n = ` ${name.toLowerCase()} `;
  const has = (...words) => words.some((w) => n.includes(` ${w}`) || n.includes(`${w} `));

  if (category === 'cardio' || target === 'cardiovascular system') return 'conditioning';
  if (has('carry', 'farmer', "farmer's")) return 'carry';
  if (has('plank', 'hold', 'bridge', 'bird dog', 'dead bug', 'pallof', 'hollow')) return 'core_stability';
  if (has('shrug')) return 'shrug';
  if (has('calf', 'calve')) return 'calf';
  if (has('wrist', 'forearm')) return 'wrist';
  if (has('fly', 'flye', 'pec deck', 'crossover')) return 'fly';
  if (has('curl') && (target === 'biceps' || has('bicep', 'hammer', 'preacher', 'concentration'))) return 'elbow_flexion';
  if (has('leg curl', 'hamstring curl')) return 'knee_flexion';
  if (has('extension') && (target === 'quads' || has('leg', 'knee'))) return 'knee_extension';
  if (has('pushdown', 'skullcrusher', 'skull crusher', 'kickback', 'dip', 'overhead extension') && target === 'triceps') return 'elbow_extension';
  if (has('squat')) return 'squat';
  if (has('lunge', 'split squat', 'step-up', 'step up')) return 'lunge';
  if (has('deadlift', 'good morning', 'rdl', 'romanian')) return 'hinge';
  if (has('hip thrust', 'glute bridge', 'hyperextension', 'back extension', 'kickback')) return 'hip_extension';
  if (has('abduction', 'abductor')) return 'hip_abduction';
  if (has('adduction', 'adductor')) return 'hip_adduction';
  if (has('raise', 'lateral', 'reverse fly') && target === 'delts') return 'shoulder_isolation';
  if (has('pulldown', 'pull-up', 'pull up', 'pullup', 'chin-up', 'chin up', 'chinup')) return 'vertical_pull';
  if (has('row')) return 'horizontal_pull';
  if (has('overhead press', 'shoulder press', 'military', 'push press', 'arnold')) return 'vertical_push';
  if (has('bench', 'push-up', 'push up', 'pushup', 'press') && (target === 'pectorals' || target === 'triceps')) return 'horizontal_push';
  if (has('press') && target === 'delts') return 'vertical_push';
  if (has('crunch', 'sit-up', 'sit up', 'situp', 'leg raise', 'knee raise', 'v-up')) return 'core_flexion';

  // Nothing in the name settled it: fall back on what it trains.
  const byTarget = {
    abs: 'core_flexion', obliques: 'core_flexion', spine: 'core_stability',
    pectorals: 'horizontal_push', delts: 'shoulder_isolation', triceps: 'elbow_extension',
    biceps: 'elbow_flexion', forearms: 'wrist', traps: 'shrug',
    lats: 'vertical_pull', 'upper back': 'horizontal_pull',
    quads: 'squat', hamstrings: 'hinge', glutes: 'hip_extension', calves: 'calf',
    adductors: 'hip_adduction', abductors: 'hip_abduction',
  };
  return byTarget[target] ?? 'core_stability';
}

/** Multi-joint patterns. Drives rest defaults and warm-up ramps. */
const COMPOUND = new Set(['squat', 'lunge', 'hinge', 'hip_extension', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'carry', 'conditioning']);

/** Sets logged in seconds rather than reps. */
function inferMeasure(name, pattern) {
  const n = name.toLowerCase();
  if (pattern === 'conditioning' || pattern === 'carry' || pattern === 'core_stability') return 'time';
  if (/\b(hold|plank|hang|wall sit|isometric)\b/.test(n)) return 'time';
  return 'reps';
}

/** Areas a user can ask to go easy on; used to avoid exercises, never as advice. */
function inferStress(name, pattern) {
  const out = new Set();
  const n = name.toLowerCase();
  if (['squat', 'lunge', 'knee_extension'].includes(pattern)) out.add('knees');
  if (['hinge', 'hip_extension'].includes(pattern)) out.add('lowerBack');
  if (['vertical_push', 'fly', 'shoulder_isolation'].includes(pattern)) out.add('shoulders');
  if (pattern === 'wrist' || /\b(push-?up|dip|clean|snatch)\b/.test(n)) out.add('wrists');
  if (/\b(jump|hop|box|plyo|run|sprint|skip)\b/.test(n)) out.add('impact');
  return [...out];
}

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/* ================================= run ==================================== */

const dataPath = join(from, 'data/exercises.json');
if (!existsSync(dataPath)) {
  console.error(`No data/exercises.json under ${from}.`);
  process.exit(1);
}
const dataset = JSON.parse(readFileSync(dataPath, 'utf8'));

/** The curated entries, which always win. Read from source rather than imported. */
const curated = new Map();
for (const file of ['core.ts', 'upper.ts', 'lower.ts']) {
  const src = readFileSync(join(ROOT, 'src/data/catalog', file), 'utf8');
  for (const m of src.matchAll(/id:\s*'([^']+)',\s*name:\s*'([^']+)'/g)) curated.set(norm(m[2]), m[1]);
}
console.log(`Curated entries kept as-is: ${curated.size}`);

const mediaDir = join(from, stills ? 'images' : 'videos');
const ext = stills ? 'jpg' : 'gif';
const rows = [];
const media = [];
const seen = new Set(curated.values());
let duplicates = 0;
let noMediaFile = 0;

for (const d of dataset) {
  const name = String(d.name ?? '').trim();
  if (!name) continue;
  // The hand-written version of this lift is better than the generated one.
  if (curated.has(norm(name))) {
    duplicates++;
    continue;
  }

  const equipment = EQUIPMENT[String(d.equipment ?? '').toLowerCase()] ?? 'machine';
  const target = String(d.target ?? '').toLowerCase();
  const pattern = inferPattern(name, target, String(d.category ?? '').toLowerCase());
  const primary = MUSCLE[target] ?? 'abs';
  const secondary = [
    ...new Set((d.secondary_muscles ?? []).map((m) => MUSCLE[String(m).toLowerCase()]).filter((m) => m && m !== primary)),
  ];

  let id = slug(name);
  if (!id) continue;
  let n = 2;
  while (seen.has(id)) id = `${slug(name)}-${n++}`;
  seen.add(id);

  const steps = (d.instruction_steps?.en ?? []).map(String).filter(Boolean);
  const measure = inferMeasure(name, pattern);
  const stress = inferStress(name, pattern);

  rows.push({
    id, name, equipment, loadStep: LOAD_STEP[equipment] ?? 2.5,
    primary: [primary], secondary, pattern,
    compound: COMPOUND.has(pattern), level: 'intermediate',
    measure, stress,
    // The first step reads as the set-up; the rest are the movement.
    setup: steps[0] ?? `${name}.`,
    steps: steps.length > 1 ? steps.slice(1) : steps,
  });

  if (noMedia) continue;
  const file = [d.media_id ? `${d.media_id}.${ext}` : null, d.gif_url ? basename(String(d.gif_url)) : null, d.image ? basename(String(d.image)) : null]
    .filter(Boolean)
    .map((c) => join(mediaDir, stills ? c.replace(/\.gif$/, '.jpg') : c.replace(/\.jpg$/, '.gif')))
    .find((p) => existsSync(p));
  if (file) media.push({ id, name, file });
  else noMediaFile++;
}

console.log(`Imported:        ${rows.length}`);
console.log(`Dropped as dupes: ${duplicates} (the curated entry is better)`);
if (!noMedia) console.log(`With artwork:    ${media.length}${noMediaFile ? ` (${noMediaFile} had no file)` : ''}`);

const patterns = {};
for (const r of rows) patterns[r.pattern] = (patterns[r.pattern] ?? 0) + 1;
console.log('\nInferred movement patterns:');
for (const [p, n] of Object.entries(patterns).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${p}`);

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

/* ------------------------------- catalogue -------------------------------- */

const entries = rows
  .map((r) => {
    const parts = [
      `    id: '${esc(r.id)}', name: '${esc(r.name)}', equipment: '${r.equipment}', loadStep: ${r.loadStep},`,
      `    primary: ['${r.primary[0]}'],${r.secondary.length ? ` secondary: [${r.secondary.map((m) => `'${m}'`).join(', ')}],` : ''} pattern: '${r.pattern}', compound: ${r.compound}, level: '${r.level}',`,
      r.measure === 'time' ? `    measure: 'time',` : null,
      r.stress.length ? `    stress: [${r.stress.map((s) => `'${s}'`).join(', ')}],` : null,
      `    setup: '${esc(r.setup)}',`,
      `    steps: [${r.steps.map((s) => `'${esc(s)}'`).join(', ')}],`,
      `    mistakes: [],`,
    ].filter(Boolean);
    return `  {\n${parts.join('\n')}\n  },`;
  })
  .join('\n');

writeFileSync(
  CATALOG_OUT,
  `/**
 * GENERATED — do not edit by hand. Rewritten by \`npm run import:catalog\`.
 *
 * ${rows.length} exercises imported from hasaneyldrm/exercises-dataset (JSON: MIT).
 * Muscles, movement patterns and stress flags are MACHINE-INFERRED from each name
 * and target — they are good enough to search and log against, and they are not the
 * hand-written judgement in core/upper/lower.ts. Where both describe the same lift
 * the curated entry wins and the import is dropped (${duplicates} of them).
 *
 * \`mistakes\` is empty throughout: the source has instructions but no coaching
 * corrections, and inventing them would be worse than leaving the section out.
 */
import type { CatalogExercise } from './types.ts';

export const IMPORTED: readonly CatalogExercise[] = [
${entries}
];
`,
);
console.log(`\nWrote ${rows.length} exercises to src/data/catalog/imported.generated.ts`);

/* --------------------------------- media ---------------------------------- */

if (!noMedia) {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const lines = [];
  for (const m of media) {
    copyFileSync(m.file, join(OUT_DIR, `${m.id}.${ext}`));
    lines.push(`  '${esc(m.id)}': { source: require('../../../../assets/exercise-media/${m.id}.${ext}'), name: '${esc(m.name)}', size: 180 },`);
  }
  writeFileSync(
    REGISTRY,
    `/**
 * GENERATED — do not edit by hand. Rewritten by \`npm run import:catalog\`.
 *
 * ${lines.length} demonstration frames. The artwork is © Gym visual and lives in a
 * git-ignored folder: it is not redistributable, so do not ship or share a build
 * made with it unless you hold a licence. See ../index.ts.
 */
import type { MediaEntry } from './types';

export const MEDIA: Readonly<Record<string, MediaEntry>> = {
${lines.join('\n')}
};

/** Required wherever a frame is shown. */
export const MEDIA_CREDIT: string | null = '${CREDIT}';
`,
  );
  console.log(`Copied ${lines.length} frames to assets/exercise-media/ (git-ignored)`);
  console.log(`Credit rendered under every frame: ${CREDIT}`);
}
