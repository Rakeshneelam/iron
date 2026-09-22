import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipRow, confirm, EmptyState, Icon, IconButton, ListCard, PrimaryButton, Screen, Sheet, Stepper, TextField, toast } from '@/components';
import { useLive } from '@/db/live';
import { updateExercise, type Exercise } from '@/db/repositories/exercises';
import { CATALOG_BY_ID } from '@/data/catalog';
import {
  addSlot,
  duplicateDay,
  getDay,
  getRoutine,
  getSlots,
  moveSlot,
  removeDay,
  removeSlot,
  renameDay,
  restoreSlot,
  swapSlotExercise,
  updateSlot,
  type SlotWithExercise,
} from '@/db/repositories/program';
import { useSettings } from '@/db/repositories/settings';
import { estimateSeconds } from '@/engine/planner';
import { WARMUP_BUDGET_S } from '@/engine/warmup';
import { ExerciseInfoSheet } from '@/features/exercises/ExerciseInfoSheet';
import { ExercisePicker } from '@/features/exercises/ExercisePicker';
import { fmtClock } from '@/lib/date';
import { kgNum } from '@/lib/format';
import { color, font, hit, radius, space } from '@/theme/tokens';

const RIR = [0, 1, 2, 3, 4].map((n) => ({ label: String(n), value: n }));
const GROUPS = ['—', 'A', 'B', 'C', 'D'].map((g) => ({ label: g, value: g }));

type Picker = { mode: 'add' } | { mode: 'swap'; slot: SlotWithExercise };

export default function DayEditor() {
  const params = useLocalSearchParams<{ dayId: string }>();
  const dayId = String(params.dayId);
  const day = useLive(() => getDay(dayId), ['routine_day'], [dayId]);
  const slots = useLive(() => getSlots(dayId), ['routine_slot', 'exercise'], [dayId]);
  const plan = useLive(() => (day ? getRoutine(day.routineId) : undefined), ['routine'], [day?.routineId]);
  const settings = useSettings();
  const [renaming, setRenaming] = useState(false);

  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [swap, setSwap] = useState<{ slot: SlotWithExercise; to: Exercise } | null>(null);
  const [ratio, setRatio] = useState(1);
  const [info, setInfo] = useState<Exercise | null>(null);

  if (!day) {
    return (
      <Screen title="Day">
        <EmptyState message="This day no longer exists." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const remove = (s: SlotWithExercise) => {
    const row = removeSlot(s.id);
    if (row) toast(`Removed ${s.exercise.name}`, { label: 'Undo', onPress: () => restoreSlot(row) });
  };

  const sets = slots.reduce((n, sl) => n + sl.targetSets, 0);
  const minutes =
    Math.round(
      (estimateSeconds(
        slots.map((sl) => {
          const c = CATALOG_BY_ID.get(sl.exerciseId);
          return { exerciseId: sl.exerciseId, sets: sl.targetSets, restSeconds: sl.restSeconds, compound: c?.compound ?? true, repHi: sl.repHi, measure: c?.measure };
        }),
      ) +
        WARMUP_BUDGET_S[settings.warmupMode]) /
        60 /
        5,
    ) * 5;

  const duplicate = () => {
    const copy = duplicateDay(dayId);
    if (!copy) return;
    toast(`Added ${copy.label}`, { label: 'Undo', onPress: () => removeDay(copy.id) });
  };

  return (
    <Screen
      title={day.label}
      subtitle={plan?.name}
      back
      right={<IconButton icon="edit" accessibilityLabel={renaming ? 'Done renaming' : 'Rename this day'} onPress={() => setRenaming(!renaming)} />}
      dock={
        <View style={styles.pair}>
          <PrimaryButton label="Duplicate day" tone="neutral" icon={<Icon name="copy" size={18} />} style={styles.flex1} onPress={duplicate} />
          <PrimaryButton label="Add exercise" icon={<Icon name="plus" size={18} color={color.onAccent} />} style={styles.flex1} onPress={() => setPicker({ mode: 'add' })} />
        </View>
      }
    >
      {renaming ? (
        <TextField
          value={day.label}
          autoFocus
          onCommit={(v) => v && renameDay(dayId, v)}
          onBlur={() => setRenaming(false)}
          style={styles.nameInput}
          placeholder="Day name"
          accessibilityLabel="Day name"
        />
      ) : null}
      <Text style={styles.lead}>Tap an exercise to change its sets, reps and rest, reorder it, or swap it. Changes save as you go.</Text>

      <ListCard>
        {slots.length === 0 ? <Text style={styles.empty}>No exercises yet. Add the first one below.</Text> : null}
        {slots.map((sl, i) => {
          const isOpen = open === sl.id;
          return (
            <View key={sl.id} style={i > 0 && styles.divider}>
              <Pressable
                onPress={() => setOpen(isOpen ? null : sl.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${sl.exercise.name}, ${sl.targetSets} sets of ${sl.repLo} to ${sl.repHi}. ${isOpen ? 'Close' : 'Edit'}.`}
                style={({ pressed }) => [styles.slotHead, pressed && styles.dim]}
              >
                <View style={styles.flex1}>
                  <Text style={styles.name}>{sl.exercise.name}</Text>
                  <Text style={styles.muted}>
                    {sl.targetSets} × {sl.repLo}–{sl.repHi} · {sl.supersetGroup ? `pair with ${sl.supersetGroup}` : `rest ${fmtClock(sl.restSeconds)}`}
                  </Text>
                </View>
                <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={18} color={color.textFaint} />
              </Pressable>
              {isOpen ? (
                <SlotEditor
                  slot={sl}
                  first={i === 0}
                  last={i === slots.length - 1}
                  onSwap={() => setPicker({ mode: 'swap', slot: sl })}
                  onInfo={() => setInfo(sl.exercise)}
                  onRemove={() => remove(sl)}
                />
              ) : null}
            </View>
          );
        })}
      </ListCard>

      {slots.length ? (
        <View style={styles.estimate}>
          <Text style={styles.estimateLabel}>Estimated</Text>
          <Text style={styles.estimateValue}>
            {sets} sets · about {minutes} min
          </Text>
        </View>
      ) : null}

      <PrimaryButton
        label="Delete day"
        tone="dangerOutline"
        icon={<Icon name="trash" size={18} color={color.danger} />}
        style={styles.gapTop}
        onPress={() =>
          confirm({
            title: `Delete ${day.label}?`,
            message: slots.length ? `Its ${slots.length} exercises go with it. Past workouts are kept.` : undefined,
            confirmLabel: 'Delete',
            destructive: true,
            onConfirm: () => {
              removeDay(dayId);
              router.back();
            },
          })
        }
      />

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker?.mode === 'swap' ? `Swap ${picker.slot.exercise.name}` : 'Add exercise'}>
        <ExercisePicker
          excludeIds={slots.map((s) => s.exerciseId)}
          initialMuscle={picker?.mode === 'swap' ? picker.slot.exercise.primaryMuscles[0] : undefined}
          onPick={(ex) => {
            if (picker?.mode === 'swap') {
              setRatio(1);
              setSwap({ slot: picker.slot, to: ex });
            } else {
              const row = addSlot(dayId, ex.id);
              setOpen(row.id);
            }
            setPicker(null);
          }}
        />
      </Sheet>

      <Sheet visible={swap !== null} onClose={() => setSwap(null)} title="Carry history across?">
        {swap ? (
          <View style={styles.stack}>
            <Text style={styles.body}>
              {`Start ${swap.to.name} from your ${swap.slot.exercise.name} numbers so progress doesn't reset. Adjust the ratio if they don't load the same.`}
            </Text>
            <Stepper label="Load ratio" value={ratio} step={0.05} min={0.3} max={2} onChange={setRatio} />
            <Text style={styles.muted}>
              60 kg on {swap.slot.exercise.name} → {kgNum(Math.round(60 * ratio * 10) / 10)} kg on {swap.to.name}
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

      <ExerciseInfoSheet exercise={info} onClose={() => setInfo(null)} />
    </Screen>
  );
}

function SlotEditor({
  slot,
  first,
  last,
  onSwap,
  onInfo,
  onRemove,
}: {
  slot: SlotWithExercise;
  first: boolean;
  last: boolean;
  onSwap: () => void;
  onInfo: () => void;
  onRemove: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
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
      <View style={styles.pair}>
        <Stepper
          label="Starting weight (kg)"
          value={slot.startWeight ?? 0}
          step={slot.exercise.loadStep}
          min={0}
          max={500}
          onChange={(v) => updateSlot(slot.id, { startWeight: v > 0 ? v : null })}
        />
      </View>
      <Text style={styles.hint}>Used only for your first session of it — after that, targets come from what you log.</Text>
      <Text style={styles.label}>Target reps left in the tank (RIR)</Text>
      <ChipRow options={RIR} value={slot.targetRir} onChange={(v) => updateSlot(slot.id, { targetRir: v })} />
      <Text style={styles.label}>Superset group</Text>
      <ChipRow options={GROUPS} value={slot.supersetGroup ?? '—'} onChange={(v) => updateSlot(slot.id, { supersetGroup: v === '—' ? null : v })} />
      <Text style={styles.label}>Note</Text>
      <TextField
        value={slot.notes ?? ''}
        onCommit={(v) => updateSlot(slot.id, { notes: v || null })}
        placeholder="Setup, cue, seat height…"
        style={styles.noteInput}
      />
      {renaming ? (
        <TextField
          value={slot.exercise.name}
          autoFocus
          onCommit={(v) => v && v !== slot.exercise.name && updateExercise(slot.exerciseId, { name: v })}
          onBlur={() => setRenaming(false)}
          style={[styles.nameInput, styles.renameInput]}
        />
      ) : null}
      <View style={styles.actions}>
        <IconButton icon="chevronUp" label="Up" tone="neutral" accessibilityLabel="Move up" disabled={first} onPress={() => moveSlot(slot.id, -1)} />
        <IconButton icon="chevronDown" label="Down" tone="neutral" accessibilityLabel="Move down" disabled={last} onPress={() => moveSlot(slot.id, 1)} />
        <IconButton icon="swap" label="Swap" tone="neutral" accessibilityLabel="Swap exercise" onPress={onSwap} />
        <IconButton icon="edit" label="Rename" tone="neutral" accessibilityLabel="Rename exercise (keeps history)" onPress={() => setRenaming(true)} />
        <IconButton icon="info" label="How-to" tone="neutral" accessibilityLabel="How to do it" onPress={onInfo} />
        <IconButton icon="trash" label="Remove" tone="neutral" accessibilityLabel="Remove from this day" onPress={onRemove} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  noteInput: { ...font.body, color: color.text, backgroundColor: color.surfaceHigh, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: hit.default },
  nameInput: {
    marginBottom: space.md,
    ...font.heading,
    color: color.text,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: hit.gym,
  },
  renameInput: { ...font.body, minHeight: hit.default, marginTop: space.md },
  slotHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  dim: { opacity: 0.6 },
  lead: { ...font.caption, color: color.textMuted, marginBottom: space.md },
  empty: { ...font.caption, color: color.textMuted, paddingVertical: space.lg },
  estimate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: space.lg,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  estimateLabel: { ...font.caption, color: color.textMuted },
  estimateValue: { ...font.label, fontSize: 16, fontWeight: '700', ...font.numeric, color: color.text },
  gapTop: { marginTop: space.md },
  name: { ...font.label, color: color.text, fontWeight: '600' },
  body: { ...font.body, color: color.text },
  muted: { ...font.caption, fontSize: 12, ...font.numeric, color: color.textFaint, marginTop: 2 },
  hint: { ...font.caption, color: color.textFaint },
  label: { ...font.caption, color: color.textMuted, marginTop: space.md, marginBottom: space.xs },
  editor: { gap: space.sm, paddingBottom: space.lg },
  pair: { flexDirection: 'row', gap: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.sm, marginTop: space.md },
  stack: { gap: space.md, paddingBottom: space.lg },
});
