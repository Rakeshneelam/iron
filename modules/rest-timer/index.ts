/**
 * JS face of the native rest timer. `requireOptionalNativeModule` returns null where
 * the module is not compiled in (iOS, Expo Go), and callers fall back to the
 * expo-notifications path in src/services/restTimer.ts.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

interface RestTimerNative {
  start(endsAtEpochMs: number, label: string): void;
  cancel(): void;
  isRunning(): boolean;
  getEndsAt(): number | null;
}

const native = requireOptionalNativeModule<RestTimerNative>('RestTimer');

export const isNativeRestTimerAvailable: boolean = native !== null;

export function start(endsAtEpochMs: number, label: string): void {
  native?.start(endsAtEpochMs, label);
}

export function cancel(): void {
  native?.cancel();
}

export function isRunning(): boolean {
  return native?.isRunning() ?? false;
}

export function getEndsAt(): number | null {
  return native?.getEndsAt() ?? null;
}
