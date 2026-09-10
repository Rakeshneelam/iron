/**
 * Row ids. Every table uses a text primary key generated here.
 *
 * expo-crypto's randomUUID is native, synchronous and collision-free enough for a
 * single-device app — writes are immediate (AGENTS.md §1.3), so an id must be
 * available in the same tick as the tap that caused it.
 */
import * as Crypto from 'expo-crypto';

/** A new v4 UUID. */
export function newId(): string {
  return Crypto.randomUUID();
}
