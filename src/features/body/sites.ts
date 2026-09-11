/**
 * Measurement sites. The value lives in measurement.cm; `unit` says what it means.
 * Kept to measurements that track training or fat-loss progress — nothing cosmetic.
 */
export type SiteGroup = 'core' | 'upper' | 'arms' | 'legs';

export interface SiteDef {
  key: string;
  label: string;
  unit: 'cm' | '%';
  group: SiteGroup;
  /** Starting stepper value before the first reading. */
  fallback: number;
  /** Written by older versions; shown only if data exists. */
  legacy?: boolean;
}

export const SITES: readonly SiteDef[] = [
  { key: 'bodyFat', label: 'Body fat', unit: '%', group: 'core', fallback: 20 },
  { key: 'waist', label: 'Waist', unit: 'cm', group: 'core', fallback: 85 },
  { key: 'hips', label: 'Hips', unit: 'cm', group: 'core', fallback: 95 },
  { key: 'chest', label: 'Chest', unit: 'cm', group: 'upper', fallback: 100 },
  { key: 'shoulders', label: 'Shoulders', unit: 'cm', group: 'upper', fallback: 115 },
  { key: 'neck', label: 'Neck', unit: 'cm', group: 'upper', fallback: 38 },
  { key: 'bicepL', label: 'Biceps L', unit: 'cm', group: 'arms', fallback: 34 },
  { key: 'bicepR', label: 'Biceps R', unit: 'cm', group: 'arms', fallback: 34 },
  { key: 'forearmL', label: 'Forearm L', unit: 'cm', group: 'arms', fallback: 28 },
  { key: 'forearmR', label: 'Forearm R', unit: 'cm', group: 'arms', fallback: 28 },
  { key: 'thighL', label: 'Thigh L', unit: 'cm', group: 'legs', fallback: 56 },
  { key: 'thighR', label: 'Thigh R', unit: 'cm', group: 'legs', fallback: 56 },
  { key: 'calfL', label: 'Calf L', unit: 'cm', group: 'legs', fallback: 37 },
  { key: 'calfR', label: 'Calf R', unit: 'cm', group: 'legs', fallback: 37 },
  { key: 'arm', label: 'Arm', unit: 'cm', group: 'arms', fallback: 34, legacy: true },
  { key: 'thigh', label: 'Thigh', unit: 'cm', group: 'legs', fallback: 56, legacy: true },
];

export const GROUP_LABEL: Record<SiteGroup, string> = { core: 'Core', upper: 'Upper body', arms: 'Arms', legs: 'Legs' };

export function siteDef(key: string): SiteDef {
  return SITES.find((s) => s.key === key) ?? { key, label: key, unit: 'cm', group: 'core', fallback: 50 };
}
