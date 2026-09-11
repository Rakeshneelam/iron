/**
 * The user's training profile, derived from settings. One place turns "I train at
 * home with dumbbells, my knees don't like lunges" into what the engine needs.
 */
import type { Stress } from '@/data/catalog';
import type { EquipmentPreset, Goal } from '@/data/templates';
import type { AppSettings } from '@/db/repositories/settings';
import { PRESET_TOOLS, type Tool, type TrainingProfile } from '@/engine/planner';

export function toolsOf(s: Pick<AppSettings, 'tools' | 'equipmentPreset'>): Set<Tool> {
  return new Set((s.tools.length ? s.tools : PRESET_TOOLS[s.equipmentPreset]) as Tool[]);
}

export function profileOf(s: AppSettings): TrainingProfile {
  return {
    goal: s.goalFocus,
    level: s.experience,
    daysPerWeek: s.trainingDays.length || 3,
    minutes: s.trainingMinutes,
    tools: toolsOf(s),
    disliked: new Set(s.disliked),
    limitations: new Set(s.limitations as Stress[]),
  };
}

/** Drill equipment on hand, for warm-ups, cooldowns and recovery sessions. */
export function drillKit(s: AppSettings): Set<string> {
  const t = toolsOf(s);
  const out = new Set<string>();
  if (t.has('band')) out.add('band');
  if (t.has('cardio_machine')) out.add('cardio_machine');
  if (t.has('pullup_bar')) out.add('pullup_bar');
  return out;
}

export const GOAL_OPTIONS: { label: string; value: Goal }[] = [
  { label: 'Build muscle', value: 'hypertrophy' },
  { label: 'Get stronger', value: 'strength' },
  { label: 'General fitness', value: 'general' },
];

export const LEVEL_OPTIONS: { label: string; value: AppSettings['experience'] }[] = [
  { label: 'New', value: 'beginner' },
  { label: '1–3 years', value: 'intermediate' },
  { label: '3+ years', value: 'advanced' },
];

export const PRESET_OPTIONS: { label: string; value: EquipmentPreset }[] = [
  { label: 'Gym', value: 'gym' },
  { label: 'Home gym', value: 'home' },
  { label: 'Dumbbells', value: 'dumbbells' },
  { label: 'Bands', value: 'bands' },
  { label: 'No equipment', value: 'bodyweight' },
];

export const TOOL_OPTIONS: { label: string; value: Tool }[] = [
  { label: 'Barbell', value: 'barbell' },
  { label: 'Rack', value: 'rack' },
  { label: 'Bench', value: 'bench' },
  { label: 'Dumbbells', value: 'dumbbell' },
  { label: 'Kettlebell', value: 'kettlebell' },
  { label: 'Bands', value: 'band' },
  { label: 'Pull-up bar', value: 'pullup_bar' },
  { label: 'Dip bars', value: 'dip_station' },
  { label: 'Box / step', value: 'box' },
  { label: 'Cables', value: 'cable' },
  { label: 'Machines', value: 'machine' },
  { label: 'Smith', value: 'smith' },
  { label: 'Cardio machine', value: 'cardio_machine' },
];

/** Voluntary. Used only to avoid exercises that load these areas — not medical advice. */
export const LIMITATION_OPTIONS: { label: string; value: Stress }[] = [
  { label: 'Knees', value: 'knees' },
  { label: 'Lower back', value: 'lowerBack' },
  { label: 'Shoulders', value: 'shoulders' },
  { label: 'Wrists', value: 'wrists' },
  { label: 'No jumping', value: 'impact' },
];

export const WEEKDAYS: { label: string; value: number }[] = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

export function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}
