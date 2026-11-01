# 05 — Design system

The brief was "clean and smooth as butter". That is a performance requirement as
much as a visual one.

## Tokens

`src/theme/tokens.ts` is the only place colours, spacing, radii, type sizes and
motion constants are defined. A hardcoded hex or magic number in a screen is a bug.

Dark-first — this app is used under gym lighting, often at night. Light theme is
optional and comes last.

## Type

Two families, embedded at build time by the `expo-font` config plugin (`app.json`),
so nothing loads at runtime: **Plus Jakarta Sans** for everything you read and tap,
**Archivo Condensed italic** for titles, the workout's name and every big number. All
OFL; the files and licences are in `assets/fonts/`. The family names live in `family`
in the tokens — never write one in a screen. Numbers use tabular figures so weights
don't jitter during a countdown or a stepper hold. `font.hero`, `font.display` and
`font.measure` carry their own family — never spread `font.numeric` after them, it
resets the face.

The logged number is the hero: weight and reps are the largest text on the screen,
larger than any heading.

## Colour

"Volt" — see `docs/13-VOLT.md` for the full table and why:

- a near-black stage (`bg`, `surface`, `surfaceHigh`)
- **volt** (`accent`) for training, the one action on a screen and a new best
- a colour per tracker: `cold` water, `peach` food, `lav` body, `pink` the third macro
- near-black ink (`onTile`) on every coloured tile, never white
- `warning` worth a look, `danger` pain and nothing else

Never colour a missed day red. Never use red for bodyweight going up, or for eating
over a target.

## Drawing conventions

Every control is a pill and every card a rounded slab without an outline; a border
means state (selected, live, pain). Bars are rounded with one lit in its tracker's
colour; trends are lines; an estimate is labelled as one and never drawn as a lift.
Targets are dashed.

## Gym usability rules (non-negotiable)

- Minimum tap target 56dp on the logging screen, 48dp elsewhere
- Primary actions in the **bottom third**; nothing critical in the top corners
- One-handed: the whole log-a-set flow completes with a right thumb without
  repositioning the phone
- High contrast; text stays readable at arm's length on a bench
- Haptics on every commit (`expo-haptics`), so he knows a set landed without looking
- No modal dialogs during a session. Use bottom sheets that don't block the timer.
- No text input for weight or reps by default — steppers only, keyboard on long-press

## Motion

- All animation on the UI thread via Reanimated worklets. Never
  `useNativeDriver: false`.
- Durations 150–250ms. Spring for anything that follows a gesture, timing for
  everything else.
- Animate `transform` and `opacity` only. No layout animation on the logging list.
- Skeletons are banned. Local SQLite reads are sub-frame; if a screen feels slow,
  fix the query, don't add a spinner.
- Respect `prefers-reduced-motion`.

## Charts

- Trend line thick and opaque; raw data small solid dots at ~30% opacity
- One unit per chart: sets, kilograms and calories never share a scale
- No gridlines unless they carry information
- Touch to scrub, with a value readout — no tooltip that requires precision
- Downsample beyond ~200 points

## Empty states

Say what to do, in one sentence, with the action attached. Never an illustration
with "Nothing here yet!". Never guilt.
