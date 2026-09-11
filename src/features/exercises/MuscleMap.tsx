import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { color, font, space } from '@/theme/tokens';

/**
 * Stylised front/back body with the exercise's muscles lit: primary solid,
 * secondary faint. Muscle keys match exercise.primaryMuscles / secondaryMuscles.
 */
type Shape = { kind: 'e'; cx: number; cy: number; rx: number; ry: number } | { kind: 'p'; d: string } | { kind: 'r'; x: number; y: number; w: number; h: number };

const e = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'e', cx, cy, rx, ry });
const pair = (cx: number, cy: number, rx: number, ry: number): Shape[] => [e(cx, cy, rx, ry), e(100 - cx, cy, rx, ry)];

const FRONT: Record<string, Shape[]> = {
  shoulders: pair(27, 28, 6, 5),
  chest: pair(42.5, 33, 7.5, 5.5),
  biceps: pair(25, 39, 3.8, 8),
  abs: [{ kind: 'r', x: 44, y: 41, w: 12, h: 19 }],
  quads: pair(43, 85, 5.5, 12),
  traps: pair(42, 22.5, 4, 2),
  calves: pair(43, 108, 3.5, 7),
};

const BACK: Record<string, Shape[]> = {
  traps: [{ kind: 'p', d: 'M50 18 L61 26 L50 40 L39 26 Z' }],
  shoulders: pair(27, 28, 6, 5),
  back: [
    { kind: 'p', d: 'M37 30 L46.5 33 L46.5 55 L41 57 L35.5 43 Z' },
    { kind: 'p', d: 'M63 30 L53.5 33 L53.5 55 L59 57 L64.5 43 Z' },
  ],
  triceps: pair(25, 39, 3.8, 8),
  glutes: pair(44, 68, 6.5, 5.5),
  hamstrings: pair(43, 87, 5.5, 11),
  calves: pair(43, 107, 4.5, 8),
};

function Silhouette() {
  const base = color.surfaceHigh;
  return (
    <>
      <Circle cx={50} cy={10} r={7} fill={base} />
      <Rect x={46} y={15} width={8} height={6} fill={base} />
      <Path d="M30 22 L70 22 L63 62 L37 62 Z" fill={base} />
      <Rect x={36} y={59} width={28} height={14} rx={5} fill={base} />
      <Rect x={20.5} y={24} width={9} height={25} rx={4.5} fill={base} />
      <Rect x={70.5} y={24} width={9} height={25} rx={4.5} fill={base} />
      <Rect x={19} y={48} width={8} height={23} rx={4} fill={base} />
      <Rect x={73} y={48} width={8} height={23} rx={4} fill={base} />
      <Rect x={37} y={70} width={12} height={30} rx={6} fill={base} />
      <Rect x={51} y={70} width={12} height={30} rx={6} fill={base} />
      <Rect x={38} y={98} width={10} height={20} rx={5} fill={base} />
      <Rect x={52} y={98} width={10} height={20} rx={5} fill={base} />
    </>
  );
}

function Figure({ map, primary, secondary }: { map: Record<string, Shape[]>; primary: readonly string[]; secondary: readonly string[] }) {
  return (
    <Svg width={96} height={116} viewBox="0 0 100 120">
      <Silhouette />
      {Object.entries(map).flatMap(([muscle, shapes]) => {
        const lit = primary.includes(muscle) ? 1 : secondary.includes(muscle) ? 0.4 : 0;
        const fill = lit ? color.accent : color.border;
        const opacity = lit || 1;
        return shapes.map((s, i) => {
          const key = `${muscle}-${i}`;
          if (s.kind === 'e') return <Ellipse key={key} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={fill} opacity={opacity} />;
          if (s.kind === 'r') return <Rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} rx={3} fill={fill} opacity={opacity} />;
          return <Path key={key} d={s.d} fill={fill} opacity={opacity} />;
        });
      })}
    </Svg>
  );
}

export function MuscleMap({ primary, secondary = [] }: { primary: readonly string[]; secondary?: readonly string[] | null }) {
  const sec = secondary ?? [];
  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <Figure map={FRONT} primary={primary} secondary={sec} />
        <Text style={styles.cap}>Front</Text>
      </View>
      <View style={styles.col}>
        <Figure map={BACK} primary={primary} secondary={sec} />
        <Text style={styles.cap}>Back</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: space.xl },
  col: { alignItems: 'center', gap: space.xs },
  cap: { ...font.caption, color: color.textFaint },
});
