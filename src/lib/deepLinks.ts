/**
 * Where a tapped notification should land, normalised at the routing boundary.
 *
 * Notifications outlive the app version that scheduled them: one written last week
 * still carries /daily, and /body used to mean measurements. The reminder engine
 * keeps emitting the URLs it always did — it is pure, and rewriting it for a
 * navigation change would be the wrong place to do it (AGENTS §2) — so the
 * translation happens here, once, on the way in:
 *
 *   /daily               → Body → Weight        (the weigh-in it was about)
 *   type 'measurements'  → Body → Measurements
 *   /body with no type   → Body → Weight        (the tab's own default)
 *
 * Pure and dependency-free on purpose, so the mapping can be checked without an
 * OS notification, a router or a device in the loop.
 */
export function destinationFor(data: Record<string, unknown> | null): string | null {
  if (data?.type === 'measurements') return '/body?section=measurements';
  const url = typeof data?.url === 'string' ? data.url : null;
  if (url === null) return null;
  const path = url.split('?')[0];
  if (path === '/daily' || path === '/body') return '/body?section=weight';
  return url;
}
