import type { Phase, WarmupMode } from '@/engine/warmup';

export const PHASE_LABEL: Record<Phase, string> = {
  general: 'Warm up',
  mobility: 'Mobility',
  activation: 'Activation',
  prep: 'Movement prep',
  stretch: 'Stretch',
  breathing: 'Breathe',
};

export const MODE_OPTIONS: { label: string; value: WarmupMode }[] = [
  { label: 'Quick', value: 'quick' },
  { label: 'Standard', value: 'standard' },
  { label: 'Full', value: 'full' },
];

export const minutesLabel = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;
