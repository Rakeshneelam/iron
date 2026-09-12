import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/IconButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { doseLabel } from '@/data/drills';
import type { RoutineItem } from '@/engine/warmup';
import { drillDemo } from '@/features/exercises/demo';
import { FigureDemo } from '@/features/exercises/ExerciseDemo';
import { fmtClock } from '@/lib/date';
import { color, font, radius, space } from '@/theme/tokens';

import { PHASE_LABEL } from './labels';

/**
 * Hands-free-ish guided routine: one drill at a time, a countdown for timed
 * drills (from a timestamp, so it survives re-renders), Next/Back, Finish.
 * The countdown starts on tap — you need a moment to get into position.
 */
export function DrillPlayer({ items, onFinish, onExit }: { items: readonly RoutineItem[]; onFinish: () => void; onExit: () => void }) {
  const [i, setI] = useState(0);
  const item = items[i];
  const sides = item?.dose.perSide ? 2 : 1;
  const total = item?.dose.seconds ? item.dose.seconds * sides : 0;
  const [left, setLeft] = useState(total);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : left;

  useEffect(() => {
    setLeft(total);
    setEndsAt(null);
  }, [i, total]);

  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);

  useEffect(() => {
    if (endsAt && remaining === 0) {
      setEndsAt(null);
      setLeft(0);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [endsAt, remaining]);

  if (!item) return null;
  const demo = drillDemo(item.drill.demo);
  const last = i === items.length - 1;
  const perSideSeconds = item.dose.seconds ?? 0;
  const sideLabel = item.dose.perSide && item.dose.seconds ? (remaining > perSideSeconds ? 'First side' : 'Switch sides') : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={styles.progress}>
          {i + 1} of {items.length} · {PHASE_LABEL[item.phase]}
        </Text>
        <IconButton icon="close" accessibilityLabel="Leave the guided routine" onPress={onExit} />
      </View>
      {demo ? (
        <View style={styles.stage}>
          <FigureDemo pattern={demo} size={150} />
        </View>
      ) : null}
      <Text style={styles.name}>{item.drill.name}</Text>
      <Text style={styles.dose}>{doseLabel(item.dose)}</Text>
      {item.drill.cues.map((c) => (
        <Text key={c} style={styles.cue}>
          {c}
        </Text>
      ))}
      {total > 0 ? (
        <View style={styles.timer}>
          <Text style={styles.clock}>{fmtClock(remaining)}</Text>
          {sideLabel && endsAt ? <Text style={styles.side}>{sideLabel}</Text> : null}
          <PrimaryButton
            label={endsAt ? 'Pause' : remaining === 0 ? 'Again' : 'Start'}
            tone="neutral"
            onPress={() => {
              if (endsAt) {
                setLeft(remaining);
                setEndsAt(null);
              } else {
                const from = remaining === 0 ? total : remaining;
                setNow(Date.now());
                setEndsAt(Date.now() + from * 1000);
              }
            }}
          />
        </View>
      ) : null}
      <View style={styles.nav}>
        <PrimaryButton label="Back" tone="ghost" disabled={i === 0} onPress={() => setI(i - 1)} />
        <PrimaryButton label={last ? 'Finish' : 'Next'} size="gym" style={styles.flex} onPress={() => (last ? onFinish() : setI(i + 1))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingBottom: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: { ...font.caption, color: color.textMuted, letterSpacing: 0.5 },
  stage: { alignItems: 'center', backgroundColor: color.bg, borderRadius: radius.lg, paddingVertical: space.sm },
  name: { ...font.heading, color: color.text },
  dose: { ...font.body, color: color.accent, fontWeight: '600' },
  cue: { ...font.label, color: color.textMuted },
  timer: { alignItems: 'center', gap: space.sm, marginVertical: space.md },
  // fontSize must not exceed the inherited lineHeight or the digits clip: display
  // carries lineHeight 48, so a 48px clock needs its own.
  clock: { ...font.display, ...font.numeric, fontSize: 48, lineHeight: 54, color: color.text },
  side: { ...font.label, color: color.textMuted },
  nav: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  flex: { flex: 1 },
});
