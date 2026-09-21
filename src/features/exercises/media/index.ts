/**
 * Demonstration media for the how-to.
 *
 * A real photographic or illustrated loop beats a stick figure for showing a
 * movement, and hasaneyldrm/exercises-dataset has 1,324 of them. Its JSON is MIT;
 * its images and GIFs are NOT. They are © Gym visual, included in that repo "with
 * permission" for that repo, and its own NOTICE is explicit: "cloning this repo is
 * not a license" — reuse needs a licence obtained directly from Gym visual, keeps
 * the "© Gym visual — https://gymvisual.com/" credit, and stays at the distributed
 * 180×180.
 *
 * So Iron ships none of it. What Iron ships is the whole integration with an empty
 * registry: `npm run media:import` matches the catalogue against a local clone,
 * copies the matched frames in and regenerates `registry.generated.ts`. Until then
 * `hasMedia` is false everywhere and the drawn figure is what you see — which is
 * why that figure stays, rather than leaving an empty box for everyone without a
 * Gym visual licence.
 *
 * Nothing here fetches anything. A bundled asset or nothing.
 */
import { MEDIA, MEDIA_CREDIT } from './registry.generated';
import type { MediaEntry } from './types';

export type { MediaEntry };

export function exerciseMedia(exerciseId: string): MediaEntry | undefined {
  return MEDIA[exerciseId];
}

export function hasMedia(exerciseId: string): boolean {
  return MEDIA[exerciseId] !== undefined;
}

/** Non-null only when media is actually bundled, so the credit cannot be orphaned. */
export const mediaCredit = (): string | null => (Object.keys(MEDIA).length > 0 ? MEDIA_CREDIT : null);
