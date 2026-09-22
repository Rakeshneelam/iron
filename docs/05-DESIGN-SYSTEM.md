# 05 — Design system

The brief was "clean and smooth as butter". That is a performance requirement as
much as a visual one.

## Tokens

`src/theme/tokens.ts` is the only place colours, spacing, radii, type sizes and
motion constants are defined. A hardcoded hex or magic number in a screen is a bug.

Dark-first — this app is used under gym lighting, often at night. Light theme is
optional and comes last.

## Type

Two faces, embedded at build time by the `expo-font` config plugin (`app.json`),
so nothing loads at runtime: **IBM Plex Sans** for everything you read, **Archivo**
for titles, headings, filled buttons and every number that changes. Both are OFL;
the files and licences are in `assets/fonts/`. The family names live in
`family` in the tokens — never write one in a screen. Numbers use tabular figures
so weights don't jitter when they change during a countdown or a stepper hold.

The logged number is the hero: weight and reps are the largest text on the screen,
larger than any heading.

## Colour

Near-black background, one warm accent for action, semantic colours reserved for
meaning:

- accent — the primary action (log set, quick add)
- positive — progression, a new e1RM high
- warning — stalled, approaching MRV
- danger — pain flag, backoff (never used for "you missed a day")

Never colour a missed day red. Never use red for bodyweight going up.

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

- Trend line thick and opaque; raw data thin and 30% opacity
- No gridlines unless they carry information
- Touch to scrub, with a value readout — no tooltip that requires precision
- Downsample beyond ~200 points

## Empty states

Say what to do, in one sentence, with the action attached. Never an illustration
with "Nothing here yet!". Never guilt.
