import Svg, { Circle, Path } from 'react-native-svg';

import { color as palette } from '@/theme/tokens';

/**
 * A small line through recent values — a lift's last sessions, a weight's last
 * weeks — with its newest point marked. For a glance inside a row or a tile; the
 * exact numbers always sit beside it in text.
 */
export function Sparkline({ values, width = 80, height = 30, color = palette.accent, strokeWidth = 2.5 }: { values: readonly number[]; width?: number; height?: number; color?: string; strokeWidth?: number }) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const pad = strokeWidth + 2;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (width - pad * 2);
  const y = (v: number) => (hi === lo ? height / 2 : height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2));
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)} ${y(v)}`).join('');
  const last = pts[pts.length - 1] ?? 0;
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={x(pts.length - 1)} cy={y(last)} r={strokeWidth + 1} fill={color} />
    </Svg>
  );
}
