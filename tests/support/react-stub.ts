/** Repositories import hooks only for their `useX` helpers, which tests never call. */
export function useEffect(): void {}
export function useMemo<T>(fn: () => T): T {
  return fn();
}
export function useReducer(): [number, () => void] {
  return [0, () => {}];
}
