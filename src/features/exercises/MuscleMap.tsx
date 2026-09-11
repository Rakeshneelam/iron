import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color, font, space } from '@/theme/tokens';

import { BODY, type BodyKind, type BodyView } from './anatomy/bodyPaths';

/** Catalogue muscle keys → anatomy slugs (react-native-body-highlighter data, MIT). */
const SLUGS: Record<string, readonly string[]> = {
  chest: ['chest'],
  back: ['upper-back'],
  lowerBack: ['lower-back'],
  shoulders: ['deltoids'],
  traps: ['trapezius'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  abs: ['abs'],
  obliques: ['obliques'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  adductors: ['adductors'],
  calves: ['calves'],
};

function fillsFor(primary: readonly string[], secondary: readonly string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const k of secondary) for (const s of SLUGS[k] ?? []) m.set(s, color.accentSoft);
  for (const k of primary) for (const s of SLUGS[k] ?? []) m.set(s, color.accent);
  return m;
}

function Figure({ view, fills, height }: { view: BodyView; fills: Map<string, string>; height: number }) {
  return (
    <Svg viewBox={view.viewBox} height={height} width={height / 2}>
      {view.parts.map((p) =>
        p.paths.map((d, i) => <Path key={`${p.slug}-${i}`} d={d} fill={fills.get(p.slug) ?? (p.slug === 'hair' ? color.border : color.surfaceHigh)} />),
      )}
      {view.outline.map((d, i) => (
        <Path key={`o${i}`} d={d} fill="none" stroke={color.border} strokeWidth={2} />
      ))}
    </Svg>
  );
}

/** Front and back anatomy with the exercise's muscles lit: primary solid, secondary soft. */
export function MuscleMap({
  primary,
  secondary = [],
  body = 'male',
  height = 190,
}: {
  primary: readonly string[];
  secondary?: readonly string[] | null;
  body?: BodyKind;
  height?: number;
}) {
  const fills = fillsFor(primary, secondary ?? []);
  const views = BODY[body];
  return (
    <View style={styles.row} accessibilityLabel={`Muscles: ${primary.join(', ')}`}>
      <View style={styles.col}>
        <Figure view={views.front} fills={fills} height={height} />
        <Text style={styles.cap}>Front</Text>
      </View>
      <View style={styles.col}>
        <Figure view={views.back} fills={fills} height={height} />
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
