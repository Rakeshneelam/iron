import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, ChipRow, EmptyState, PrimaryButton, Screen, SectionHeader, Sheet, Stepper } from '@/components';
import { useLive } from '@/db/live';
import { updateExercise, type Exercise } from '@/db/repositories/exercises';
import {
  addSlot,
  getDay,
  getSlots,
  moveSlot,
  removeDay,
  removeSlot,
  renameDay,
  swapSlotExercise,
  updateSlot,
  type SlotWithExercise,
} from '@/db/repositories/program';
import { ExercisePicker } from '@/features/exercises/ExercisePicker';
import { fmtClock } from '@/lib/date';
import { color, font, hit, radius, space } from '@/theme/tokens';

const RIR = [0, 1, 2, 3, 4].map((n) => ({ label: String(n), value: n }));
const GROUPS = ['—', 'A', 'B', 'C', 'D'].map((g) => ({ label: g, value: g }));

type Picker = { mode: 'add' } | { mode: 'swap'; slot: SlotWithExercise };

export default function DayEditor() {
  const params = useLocalSearchParams<{ dayId: string }>();
  const dayId = String(params.dayId);
  const day = useLive(() => getDay(dayId), ['routine_day'], [dayId]);
  const slots = useLive(() => getSlots(dayId), ['routine_slot', 'exercise'], [dayId]);

  const [label, setLabel] = useState('');
  useEffect(() => setLabel(day?.label ?? ''), [day?.label]);
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [swap, setSwap] = useState<{ slot: SlotWithExercise; to: Exercise } | null>(null);
  const [ratio, setRatio] = useState(1);

  if (!day) {
    return (
      <Screen title="Day">
        <EmptyState message="This day no longer exists." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title={day.label} right={<PrimaryButton label="Done" tone="ghost" onPress={() => router.back()} />}>
      <TextInput
        value={label}
        onChangeText={setLabel}
        onEndEditing={() => label.trim() && renameDay(dayId, label.trim())}
        style={styles.input}
        placeholder="Day name"
        placeholderTextColor={color.textFaint}
      />

      <SectionHeader title={`${slots.length} exercises`} />
      {slots.map((s, i) => (
        <Card key={s.id} onPress={() => setOpen(open === s.id ? null : s.id)}>
          <Text style={styles.name}>{s.exercise.name}</Text>
          <Text style={styles.muted}>
            {s.targetSets} × {s.repLo}–{s.repHi} @ RIR {s.targetRir} · rest {fmtClock(s.restSeconds)}
            {s.supersetGroup ? ` · superset ${s.supersetGroup}` : ''}
          </Text>
          {open === s.id ? (
            <SlotEditor
              slot={s}
              first={i === 0}
              last={i === slots.length - 1}
              onSwap={() => setPicker({ mode: 'swap', slot: s })}
            />
          ) : null}
        </Card>
      ))}
      <PrimaryButton label="Add exercise" onPress={() => setPicker({ mode: 'add' })} />

      <PrimaryButton
        label="Remove this day"
        tone="ghost"
        style={styles.gap}
        onPress={() => {
          removeDay(dayId);
          router.back();
        }}
      />

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? `Swap ${picker.slot.exercise.name}` : 'Add exercise'}>
        <ExercisePicker
          excludeIds={slots.map((s) => s.exerciseId)}
          onPick={(ex) => {
            if (picker?.mode === 'swap') {
              setRatio(1);
              setSwap({ slot: picker.slot, to: ex });
            } else {
              addSlot(dayId, ex.id);
            }
            setPicker(null);
          }}
        />
      </Sheet>

      <Sheet visible={swap !== null} onClose={() => setSwap(null)} title="Carry history across?">
        {swap ? (
          <View style={styles.stack}>
            <Text style={styles.body}>
              {swap.to.name} can start from your {swap.slot.exercise.name} numbers instead of from zero, so the change doesn't reset
              your progression. Set the ratio if the two don't load the same.
            </Text>
            <Stepper label="Load ratio" value={ratio} step={0.05} min={0.3} max={2} onChange={setRatio} />
            <Text style={styles.muted}>
              e.g. 60 kg on {swap.slot.exercise.name} → {Math.round(60 * ratio * 10) / 10} kg on {swap.to.name}
            </Text>
            <PrimaryButton
              label="Swap and carry history"
              size="gym"
              onPress={() => {
                swapSlotExercise(swap.slot.id, swap.to.id, { carryHistory: true, ratio });
                setSwap(null);
              }}
            />
            <PrimaryButton
              label="Swap and start fresh"
              tone="neutral"
              onPress={() => {
                swapSlotExercise(swap.slot.id, swap.to.id, { carryHistory: false });
                setSwap(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function SlotEditor({ slot, first, last, onSwap }: { slot: SlotWithExercise; first: boolean; last: boolean; onSwap: () => void }) {
  const [name, setName] = useState(slot.exercise.name);
  return (
    <View style={styles.editor}>
      <View style={styles.pair}>
        <Stepper label="Sets" value={slot.targetSets} step={1} min={1} max={10} onChange={(v) => updateSlot(slot.id, { targetSets: v })} />
        <Stepper label="Rest (s)" value={slot.restSeconds} step={15} min={30} max={600} onChange={(v) => updateSlot(slot.id, { restSeconds: v })} />
      </View>
      <View style={styles.pair}>
        <Stepper label="Reps from" value={slot.repLo} step={1} min={1} max={50} onChange={(v) => updateSlot(slot.id, { repLo: v })} />
        <Stepper label="to" value={slot.repHi} step={1} min={1} max={50} onChange={(v) => updateSlot(slot.id, { repHi: v })} />
      </View>
      <Text style={styles.label}>Target RIR</Text>
      <ChipRow options={RIR} value={slot.targetRir} onChange={(v) => updateSlot(slot.id, { targetRir: v })} />
      <Text style={styles.label}>Superset</Text>
      <ChipRow options={GROUPS} value={slot.supersetGroup ?? '—'} onChange={(v) => updateSlot(slot.id, { supersetGroup: v === '—' ? null : v })} />
      <Text style={styles.label}>Exercise name (renaming keeps all history)</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        onEndEditing={() => name.trim() && name.trim() !== slot.exercise.name && updateExercise(slot.exerciseId, { name: name.trim() })}
        style={styles.input}
      />
      <View style={styles.actions}>
        <PrimaryButton label="↑" tone="neutral" disabled={first} onPress={() => moveSlot(slot.id, -1)} />
        <PrimaryButton label="↓" tone="neutral" disabled={last} onPress={() => moveSlot(slot.id, 1)} />
        <PrimaryButton label="Swap" tone="neutral" onPress={onSwap} />
        <PrimaryButton label="Remove" tone="ghost" onPress={() => removeSlot(slot.id)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    ...font.body,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.default,
  },
  name: { ...font.body, color: color.text, fontWeight: '600' },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  editor: { marginTop: space.md, gap: space.sm },
  pair: { flexDirection: 'row', gap: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  stack: { gap: space.md, paddingBottom: space.lg },
  gap: { marginTop: space.xl },
});
