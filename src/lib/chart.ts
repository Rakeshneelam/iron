/**
 * Chart maths: thin out a series without lying about its shape, then turn it into an
 * SVG path. docs/02 caps a chart at ~200 points; two years of daily weigh-ins is
 * ~700, and naive every-nth sampling drops exactly the peaks the eye is looking for.
 *
 * Pure module: no React, no DB. Coordinates are SVG user units, y growing downward.
 */

export interface Pt {
  x: number;
  y: number;
}

/** The data-space window a path is drawn in. Share one across series to align them. */
export interface Domain {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Largest-triangle-three-buckets. Keeps the first and last points and, in between,
 * the point in each bucket forming the largest triangle with its neighbours — which
 * is what preserves visible peaks and troughs at a fraction of the vertices.
 */
export function downsample(pts: Pt[], max: number): Pt[] {
  const n = pts.length;
  if (!Number.isFinite(max) || max <= 0) return [];
  const limit = Math.floor(max);
  if (n === 0) return [];
  if (n <= limit) return pts.slice();

  const first = pts[0];
  const last = pts[n - 1];
  if (!first || !last) return pts.slice();
  if (limit === 1) return [last];
  if (limit === 2) return [first, last];

  const sampled: Pt[] = [first];
  const every = (n - 2) / (limit - 2);
  let a = 0;

  for (let i = 0; i < limit - 2; i++) {
    // Average of the NEXT bucket — the third corner of the triangle.
    const avgStart = Math.floor((i + 1) * every) + 1;
    const avgEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = avgStart; j < avgEnd; j++) {
      const p = pts[j];
      if (!p) continue;
      avgX += p.x;
      avgY += p.y;
      avgCount++;
    }
    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    } else {
      avgX = last.x;
      avgY = last.y;
    }

    const rangeFrom = Math.floor(i * every) + 1;
    const rangeTo = Math.min(Math.floor((i + 1) * every) + 1, n);
    const pointA = pts[a] ?? first;

    let maxArea = -1;
    let chosen: Pt = pts[rangeFrom] ?? last;
    let chosenIndex = rangeFrom;
    for (let j = rangeFrom; j < rangeTo; j++) {
      const p = pts[j];
      if (!p) continue;
      const area =
        Math.abs(
          (pointA.x - avgX) * (p.y - pointA.y) - (pointA.x - p.x) * (avgY - pointA.y),
        ) / 2;
      if (area > maxArea) {
        maxArea = area;
        chosen = p;
        chosenIndex = j;
      }
    }

    sampled.push(chosen);
    a = chosenIndex;
  }

  sampled.push(last);
  return sampled;
}

/** Data-space extent of one or more series. Empty input gives a unit box. */
export function bounds(...series: Pt[][]): Domain {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const pts of series) {
    for (const p of pts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  return { minX, maxX, minY, maxY };
}

/** Data x -> svg x, inside `pad`. A zero-width domain centres. */
export function scaleX(v: number, min: number, max: number, w: number, pad: number): number {
  const inner = Math.max(0, w - pad * 2);
  if (!(max > min)) return pad + inner / 2;
  return pad + ((v - min) / (max - min)) * inner;
}

/** Data y -> svg y, inverted so bigger is higher. A zero-height domain centres. */
export function scaleY(v: number, min: number, max: number, h: number, pad: number): number {
  const inner = Math.max(0, h - pad * 2);
  if (!(max > min)) return pad + inner / 2;
  return pad + (1 - (v - min) / (max - min)) * inner;
}

/**
 * Polyline path through `pts`, fitted to a `w`x`h` box with `pad` breathing room.
 * Pass `domain` to pin two series (trend + raw dots) to the same scale; omit it and
 * the series scales to itself.
 */
export function linePath(pts: Pt[], w: number, h: number, pad: number, domain?: Domain): string {
  if (pts.length === 0) return '';
  const d = domain ?? bounds(pts);

  const first = pts[0];
  if (pts.length === 1 && first) {
    const x = round2(scaleX(first.x, d.minX, d.maxX, w, pad));
    const y = round2(scaleY(first.y, d.minY, d.maxY, h, pad));
    // Degenerate segment: a round line cap renders it as the single dot it is.
    return `M${x} ${y}L${x} ${y}`;
  }

  let out = '';
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const x = round2(scaleX(p.x, d.minX, d.maxX, w, pad));
    const y = round2(scaleY(p.y, d.minY, d.maxY, h, pad));
    out += `${out === '' ? 'M' : 'L'}${x} ${y}`;
  }
  return out;
}
