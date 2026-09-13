import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { bounds, downsample, linePath, scaleX, scaleY, type Pt } from '@/lib/chart';
import { color, font, space } from '@/theme/tokens';

export interface TrendChartProps {
  /** The smoothed series. Drawn THICK and OPAQUE — the thing to read. */
  trend: Pt[];
  /** Raw observations. Drawn as faint dots, never the other way round (docs/05). */
  raw?: Pt[];
  /** Highlighted points, e.g. stall markers on an e1RM chart. */
  markers?: Pt[];
  height?: number;
  onScrub?: (p: Pt | null) => void;
  format?: (y: number) => string;
  formatX?: (x: number) => string;
  /** The value line above the plot. Off where the number is already shown beside it. */
  readout?: boolean;
}

const PAD = space.md;
const MAX_POINTS = 200;

export function TrendChart({ trend, raw = [], markers = [], height = 180, onScrub, format, formatX, readout = true }: TrendChartProps) {
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<Pt | null>(null);

  const t = useMemo(() => downsample(trend, MAX_POINTS), [trend]);
  const r = useMemo(() => downsample(raw, MAX_POINTS), [raw]);
  const domain = useMemo(() => {
    const d = bounds(t, r, markers);
    // A little headroom so the line never kisses the edge.
    const span = d.maxY - d.minY || Math.abs(d.maxY) * 0.05 || 1;
    return { ...d, minY: d.minY - span * 0.1, maxY: d.maxY + span * 0.1 };
  }, [t, r, markers]);

  const trendPath = width > 0 ? linePath(t, width, height, PAD, domain) : '';
  const fmt = format ?? ((y: number) => y.toFixed(1));

  const pick = (x: number) => {
    if (t.length === 0 || width <= 0) return;
    let best: Pt | null = null;
    let bestDx = Number.POSITIVE_INFINITY;
    for (const p of t) {
      const dx = Math.abs(scaleX(p.x, domain.minX, domain.maxX, width, PAD) - x);
      if (dx < bestDx) {
        bestDx = dx;
        best = p;
      }
    }
    setScrub(best);
    onScrub?.(best);
  };

  const end = () => {
    setScrub(null);
    onScrub?.(null);
  };

  const sx = (v: number) => scaleX(v, domain.minX, domain.maxX, width, PAD);
  const sy = (v: number) => scaleY(v, domain.minY, domain.maxY, height, PAD);
  const last = t[t.length - 1];
  const shown = scrub ?? last ?? null;

  return (
    <View>
      {readout ? (
        <View style={styles.readout}>
          <Text style={styles.readValue}>{shown ? fmt(shown.y) : '—'}</Text>
          {shown && formatX ? <Text style={styles.readLabel}>{formatX(shown.x)}</Text> : null}
        </View>
      ) : null}
      <View
        style={{ height }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderRelease={end}
        onResponderTerminate={end}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            {r.map((p, i) => (
              <Circle key={`r${i}`} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={color.chartFaint} />
            ))}
            {t.length > 1 ? (
              <Path d={trendPath} stroke={color.chart} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ) : null}
            {t.length === 1 && last ? <Circle cx={sx(last.x)} cy={sy(last.y)} r={4} fill={color.chart} /> : null}
            {markers.map((p, i) => (
              <Circle key={`m${i}`} cx={sx(p.x)} cy={sy(p.y)} r={5} fill="none" stroke={color.warning} strokeWidth={2} />
            ))}
            {scrub ? (
              <>
                <Line x1={sx(scrub.x)} x2={sx(scrub.x)} y1={PAD} y2={height - PAD} stroke={color.border} strokeWidth={1} />
                <Circle cx={sx(scrub.x)} cy={sy(scrub.y)} r={5} fill={color.chart} />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginBottom: space.xs },
  readValue: { ...font.heading, ...font.numeric, color: color.text },
  readLabel: { ...font.caption, color: color.textMuted },
});
