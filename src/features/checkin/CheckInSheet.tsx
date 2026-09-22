import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { DateStepper } from '@/components/DateStepper';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Toast';
import { deleteCheckIn, getCheckIn, getWeighIn, saveCheckIn, upsertWeighIn } from '@/db/repositories/body';
import { syncReadiness } from '@/db/repositories/sessions';
import { WeightField, weightDraftFor, type WeightDraft } from '@/features/body/WeightField';
import { fmtDayLabel, todayISO } from '@/lib/date';
import { success } from '@/lib/haptics';
import { color, font, space } from '@/theme/tokens';

const SLEEP = [
  { label: '≤5h', value: 5 },
  { label: '6h', value: 6 },
  { label: '7h', value: 7 },
  { label: '8h', value: 8 },
  { label: '9h+', value: 9 },
];
const SCALE = [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n }));

export const sleepLabel = (h: number) => (h <= 5 ? '≤5 h' : h >= 9 ? '9+ h' : `${h} h`);

export interface CheckInSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The day being answered for. Defaults to today; Body passes a past date to fix one. */
  date?: string;
  /** Let the user move to another day from inside the sheet. */
  datePicker?: boolean;
  /** Opened from Start: still optional, and both buttons carry on to the workout. */
  onStart?: () => void;
}

/**
 * The daily check-in, and the one editor for a check-in on any day.
 *
 * Every answer is optional, every answer can go back to "Not recorded", and only
 * answers are saved. The weight field is the shared one (features/body/WeightField):
 * an untouched number is not an answer, and the sheet no longer claims "Saved as
 * today's weigh-in" before its own Save handler has run (UX-03).
 */
export function CheckInSheet({ visible, onClose, date, datePicker = false, onStart }: CheckInSheetProps) {
  const day = date ?? todayISO();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={onStart ? 'Before you start' : day === todayISO() ? 'Daily check-in' : `Check-in · ${fmtDayLabel(day)}`}
    >
      {/* Mounted per opening and per day, so the answers are read fresh without an effect. */}
      {visible ? <Form key={day} date={day} datePicker={datePicker} onClose={onClose} onStart={onStart} /> : null}
    </Sheet>
  );
}

function Form({ date, datePicker, onClose, onStart }: { date: string; datePicker: boolean } & Omit<CheckInSheetProps, 'visible' | 'date' | 'datePicker'>) {
  const [day, setDay] = useState(date);
  const [existing, setExisting] = useState(() => getCheckIn(date));
  const [weight, setWeight] = useState<WeightDraft>(() => weightDraftFor(date));
  const [sleep, setSleep] = useState<number | null>(existing?.sleepHours ?? null);
  const [soreness, setSoreness] = useState<number | null>(existing?.soreness ?? null);
  const [stress, setStress] = useState<number | null>(existing?.stress ?? null);
  const answered = weight.given || sleep !== null || soreness !== null || stress !== null;

  /** Moving day re-reads that day's answers: this is one editor, not one form per day. */
  const goTo = (iso: string) => {
    setDay(iso);
    const c = getCheckIn(iso);
    setExisting(c);
    setWeight(weightDraftFor(iso));
    setSleep(c?.sleepHours ?? null);
    setSoreness(c?.soreness ?? null);
    setStress(c?.stress ?? null);
  };

  const save = () => {
    if (weight.given) upsertWeighIn(day, weight.kg);
    saveCheckIn({ date: day, sleepHours: sleep, soreness, stress });
    syncReadiness();
    success();
  };

  /** Tapping the selected chip again clears it — an answer you can't take back isn't optional. */
  const toggle = (current: number | null, set: (v: number | null) => void) => (v: number) => set(current === v ? null : v);
  const recorded = (v: number | null) => (v === null ? 'Not recorded' : null);

  return (
    <View style={styles.stack}>
      {datePicker ? <DateStepper value={day} onChange={goTo} /> : null}
      <Text style={styles.hint}>
        {onStart
          ? "Optional. A rough night lowers today's targets; nothing here raises them. Tap an answer again to clear it."
          : 'Optional. Only what you answer is saved. Tap an answer again to clear it.'}
      </Text>

      <Answer label="Morning weight" hint={weight.given ? null : 'Saves with the check-in'}>
        <WeightField draft={weight} onChange={setWeight} pendingLabel="Will save with the check-in" size="gym" />
      </Answer>
      <Answer label="Sleep last night" hint={recorded(sleep)}>
        <ChipRow options={SLEEP} value={sleep} onChange={toggle(sleep, setSleep)} />
      </Answer>
      <Answer label="Soreness" hint={recorded(soreness) ?? '1 fresh · 5 wrecked'}>
        <ChipRow options={SCALE} value={soreness} onChange={toggle(soreness, setSoreness)} />
      </Answer>
      <Answer label="Stress" hint={recorded(stress) ?? '1 calm · 5 stressed'}>
        <ChipRow options={SCALE} value={stress} onChange={toggle(stress, setStress)} />
      </Answer>

      {onStart ? (
        <View style={styles.pair}>
          <PrimaryButton
            label="Save"
            tone="neutral"
            size="gym"
            disabled={!answered}
            style={styles.flex}
            onPress={() => {
              save();
              toast(`Check-in saved for ${fmtDayLabel(day)}`);
              onClose();
            }}
          />
          {/* Nothing answered is not a reason to stop someone starting. */}
          <PrimaryButton
            label="Save and start"
            size="gym"
            style={styles.flex2}
            onPress={() => {
              if (answered) save();
              onStart();
            }}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <PrimaryButton
            label={answered ? 'Save' : 'Nothing to save yet'}
            size="gym"
            disabled={!answered}
            onPress={() => {
              save();
              toast(`Check-in saved for ${fmtDayLabel(day)}`);
              onClose();
            }}
          />
          {existing ? (
            <>
              <PrimaryButton
                label="Clear this check-in"
                tone="ghost"
                onPress={() => {
                  const was = existing;
                  deleteCheckIn(day);
                  syncReadiness();
                  toast('Check-in cleared', {
                    label: 'Undo',
                    onPress: () => {
                      saveCheckIn(was);
                      syncReadiness();
                    },
                  });
                  onClose();
                }}
              />
              {/* Two different records. Clearing one must not imply the other went. */}
              {getWeighIn(day) ? (
                <Text style={styles.hint}>
                  Clearing removes the sleep, soreness and stress answers. The weigh-in for this day is a separate
                  record and stays — delete it from Body → Weight.
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** A question: its label, a faint hint beside it (the scale, or "Not recorded"), then the answers. */
function Answer({ label, hint, children }: { label: string; hint: string | null; children: React.ReactNode }) {
  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.note}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg, paddingBottom: space.lg },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginBottom: space.sm },
  hint: { ...font.caption, color: color.textMuted },
  label: { ...font.caption, fontWeight: '600', color: color.textMuted },
  note: { ...font.caption, fontSize: 12, color: color.textFaint, flexShrink: 1 },
  actions: { gap: space.xs, marginTop: space.sm },
  pair: { flexDirection: 'row', gap: space.md - 2, marginTop: space.sm },
});
