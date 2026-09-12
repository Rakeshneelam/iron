/** node's crypto stands in for expo-crypto under node:test. */
import { randomUUID as uuid } from 'node:crypto';

export function randomUUID(): string {
  return uuid();
}
