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

/** Nothing below this is a drink; nothing above it is one either. */
const ML_RANGE = { min: 10, max: 5000 } as const;

/**
 * The amount someone typed into the water notification, in millilitres.
 *
 * Android renders a `textInput` action as a RemoteInput — a real text field in
 * the notification shade — and iOS as a text-input action, so what comes back is
 * whatever a thumb typed next to a glass of water: `500`, `500ml`, `0.5 l`,
 * `1,5l`, or nothing at all. The field cannot be a number pad on either platform
 * and there is no validation in the shade, so the parsing has to live here.
 *
 * Returns null for anything it cannot read as an amount, which the caller turns
 * into "open the app on the Water screen with the custom sheet up" rather than
 * into a silently wrong row. Guessing on a number the user will see in their
 * daily total is worse than asking again.
 *
 * Pure, so every one of those spellings can be checked without a device.
 */
export function parseAmountMl(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null;
  const cleaned = text.trim().toLowerCase().replace(',', '.');
  const match = /^([0-9]*\.?[0-9]+)\s*(ml|l|litres?|liters?)?$/.exec(cleaned);
  if (!match?.[1]) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  // A bare number is millilitres: the button says "ml" and that is what people type.
  const litres = match[2] !== undefined && match[2] !== 'ml';
  const amount = Math.round(litres ? n * 1000 : n);
  return amount >= ML_RANGE.min && amount <= ML_RANGE.max ? amount : null;
}
