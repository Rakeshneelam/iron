/** Enough of expo-sqlite for the repositories to import under node:test. */
export function addDatabaseChangeListener(): { remove: () => void } {
  return { remove: () => {} };
}
export function openDatabaseSync(): never {
  throw new Error('tests use the in-memory client');
}
