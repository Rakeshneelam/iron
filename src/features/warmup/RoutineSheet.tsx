import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { Icon } from '@/components/Icon';
import { IconButton } from '@/components/IconButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { doseLabel } from '@/data/drills';
import { alternativesFor } from '@/engine/recovery';
import { makeItem, type Routine, type RoutineItem } from '@/engine/warmup';
import { drillDemo } from '@/features/exercises/demo';
import { FigureDemo } from '@/features/exercises/ExerciseDemo';
import { color, font, hit, radius, space } from '@/theme/tokens';

import { DrillPlayer } from './DrillPlayer';
import { minutesLabel, PHASE_LABEL } from './labels';

export interface RoutineSheetProps<M extends string> {
  visible: boolean;
  title: string;
  routine: Routine;
  /** Drill equipment on hand, for "replace". */
  available: ReadonlySet<string>;
  onClose: () => void;
  modes?: { options: readonly { label: string; value: M }[]; value: M; onChange: (v: M) => void };
  doneLabel?: string;
  onDone?: () => void;
  onSkip?: () => void;
}

/**
 * Warm-up, cooldown or recovery routine: see it, trim it, swap items, or run it
 * guided. Nothing here is forced — Skip is always one tap.
 */
export function RoutineSheet<M extends string>(p: RoutineSheetProps<M>) {
  const [items, setItems] = useState<RoutineItem[]>(p.routine.items);
  const [open, setOpen] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setItems(p.routine.items);
    setPlaying(false);
    setOpen(null);
  }, [p.routine, p.visible]);

  const total = items.reduce((t, i) => t + i.seconds, 0);
  const replace = (index: number) => {
    const it = items[index];
    if (!it) return;
    const alt = alternativesFor(it, new Set(items.map((x) => x.drill.id)), p.available)[0];
    if (alt) setItems(items.map((x, j) => (j === index ? makeItem(alt, x.phase, x.why) : x)));
  };

  return (
    <Sheet visible={p.visible} onClose={p.onClose} title={`${p.title} · ${minutesLabel(total)}`}>
      {playing ? (
        <DrillPlayer
          items={items}
          onFinish={() => {
            setPlaying(false);
            p.onDone?.();
          }}
          onExit={() => setPlaying(false)}
        />
      ) : (
        <View style={styles.stack}>
          {p.modes ? <ChipRow options={p.modes.options} value={p.modes.value} onChange={p.modes.onChange} /> : null}
          {items.length === 0 ? <Text style={styles.muted}>Nothing needed today.</Text> : null}
          {items.map((it, i) => {
            const header = i === 0 || items[i - 1]?.phase !== it.phase;
            const demo = drillDemo(it.drill.demo);
            return (
              <View key={it.drill.id}>
                {header ? <Text style={styles.phase}>{PHASE_LABEL[it.phase].toUpperCase()}</Text> : null}
                <View style={styles.row}>
                  <Pressable style={styles.flex} onPress={() => setOpen(open === it.drill.id ? null : it.drill.id)} accessibilityHint="Shows how to do it">
                    <Text style={styles.name}>{it.drill.name}</Text>
                    <Text style={styles.muted}>
                      {doseLabel(it.dose)} · {it.why}
                    </Text>
                  </Pressable>
                  <IconButton icon="swap" accessibilityLabel={`Replace ${it.drill.name}`} onPress={() => replace(i)} />
                  <IconButton icon="close" accessibilityLabel={`Remove ${it.drill.name}`} onPress={() => setItems(items.filter((_, j) => j !== i))} />
                </View>
                {open === it.drill.id ? (
                  <View style={styles.cues}>
                    {demo ? <FigureDemo pattern={demo} size={120} /> : null}
                    {it.drill.cues.map((c) => (
                      <View key={c} style={styles.cueRow}>
                        <Icon name="check" size={14} color={color.textMuted} />
                        <Text style={styles.cue}>{c}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          {items.length ? (
            <PrimaryButton label="Start guided" size="gym" icon={<Icon name="play" size={18} color={color.onAccent} />} style={styles.gap} onPress={() => setPlaying(true)} />
          ) : null}
          <View style={styles.actions}>
            {p.onDone ? <PrimaryButton label={p.doneLabel ?? 'Mark done'} tone="neutral" style={styles.flex} onPress={p.onDone} /> : null}
            {p.onSkip ? <PrimaryButton label="Skip" tone="ghost" style={styles.flex} onPress={p.onSkip} /> : null}
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs, paddingBottom: space.lg },
  flex: { flex: 1 },
  phase: { ...font.caption, color: color.textMuted, letterSpacing: 1, marginTop: space.md, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: hit.gym },
  name: { ...font.body, color: color.text, fontWeight: '600' },
  muted: { ...font.caption, color: color.textMuted, marginTop: 2 },
  cues: { gap: space.xs, backgroundColor: color.bg, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  cueRow: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' },
  cue: { ...font.label, color: color.text, flex: 1 },
  gap: { marginTop: space.lg },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
