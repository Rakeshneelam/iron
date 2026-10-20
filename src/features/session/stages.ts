/**
 * The order the workout runs in, and what to do when a stage has nothing in it.
 *
 *   check-in  →  warm-up  →  the lifts  →  cool-down  →  summary
 *
 * Pure, so the walk can be checked without a database or a device. The screen
 * only ever asks "where do I go from here", which keeps the empty-stage rules —
 * no drills today, no lifts logged, so nothing to stretch — in one place instead
 * of spread across four `onDone` handlers.
 *
 * Every stage is skippable by hand (AGENTS §1.4: never trap the user), and a
 * stage with nothing to show is skipped for you: offering an empty warm-up is a
 * tap that asks a question with one answer.
 */
import type { SessionStage } from '@/db/repositories/sessions';

export type { SessionStage };

/** A stage worth showing, per session. Recomputed as the workout changes. */
export interface StageContent {
  /** Session warm-up drills exist for today's lifts. */
  warmup: boolean;
  /** Something was logged, so there is something to cool down from. */
  cooldown: boolean;
}

export const STAGE_ORDER: readonly SessionStage[] = ['checkin', 'warmup', 'main', 'cooldown'];

/** Short label for the progress strip. 'main' is named by the day, so the screen supplies that. */
export const STAGE_LABEL: Record<SessionStage, string> = {
  checkin: 'Check-in',
  warmup: 'Warm-up',
  main: 'Workout',
  cooldown: 'Cool-down',
};

const hasContent = (stage: SessionStage, c: StageContent): boolean =>
  stage === 'warmup' ? c.warmup : stage === 'cooldown' ? c.cooldown : true;

/**
 * Where leaving `from` lands. `'finish'` means there is nothing after it: close
 * the workout and show the summary.
 *
 * Empty stages are stepped over rather than shown, so a day with no drills goes
 * from the check-in straight to the first lift.
 */
export function nextStage(from: SessionStage, content: StageContent): SessionStage | 'finish' {
  const i = STAGE_ORDER.indexOf(from);
  if (i < 0) return 'finish';
  for (const stage of STAGE_ORDER.slice(i + 1)) {
    if (hasContent(stage, content)) return stage;
  }
  return 'finish';
}

/**
 * The stage a session should open on. Resuming a workout whose stage has since
 * emptied out — every drill removed, say — must not strand it on a blank screen.
 */
export function resolveStage(saved: SessionStage, content: StageContent): SessionStage | 'finish' {
  return hasContent(saved, content) ? saved : nextStage(saved, content);
}

/** How far through the workout, for the stage strip: 0-based index among the stages shown. */
export function stagesShown(content: StageContent): SessionStage[] {
  return STAGE_ORDER.filter((s) => hasContent(s, content));
}
