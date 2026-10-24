import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { router } from 'expo-router';

import { Icon, IconButton, ListCard, ListRow, Press, PrimaryButton, Screen, Sheet, Stepper } from '@/components';
import { DateStepper, useSelectedDate } from '@/components/DateStepper';
import { toast } from '@/components/Toast';
import { useLive } from '@/db/live';
import {
  deleteEntries,
  deleteEntry,
  getDay,
  logUsual,
  MEAL_SLOTS,
  repeatDay,
  repeatMeal,
  restoreEntry,
  updateEntryGrams,
  usualFor,
  type DayEntry,
  type MealSlot,
  type UsualMeal,
} from '@/db/repositories/food';
import { AddFoodSheet } from '@/features/food/AddFoodSheet';
import { IntakeBar } from '@/features/food/IntakeBar';
import { FoodTargetSheet } from '@/features/food/TargetSheet';
import { computeTargets, confidenceLabel } from '@/features/food/targets';
import { getDayTotal } from '@/db/repositories/water';
import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { ml } from '@/lib/format';
import { hydrationTarget } from '@/services/hydration';
import { color, font, hit, radius, space } from '@/theme/tokens';

const cap = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);
const SHORT: Record<MealSlot, string> = { breakfast: 'B', lunch: 'L', snack: 'S', dinner: 'D' };
const fmtServings = (n: number) => (Math.round(n * 2) / 2).toString();
const unit = (label: string | null) => (label ?? 'serving').replace(/^1\s+/, '');

/** Target: a normal day in under 30 seconds. Repeat is the primary action; search is the fallback. */
export default function FoodScreen() {
  // Shared with Water, midnight rule included (components/DateStepper).
  const [date, setDate] = useSelectedDate();
  const yesterday = addDays(date, -1);

  const day = useLive(() => getDay(date), ['meal_log', 'food', 'recipe', 'recipe_item'], [date]);
  const prev = useLive(() => getDay(yesterday), ['meal_log', 'food', 'recipe', 'recipe_item'], [yesterday]);
  const t = useLive(() => computeTargets(date), ['meal_log', 'food', 'recipe', 'recipe_item', 'weigh_in', 'setting', 'session'], [date]);
  // The day on screen, not today: browsing yesterday's meals must not show today's
  // water, and must not hand today's date to the Water screen either (UX-07).
  const water = useLive(() => ({ ml: getDayTotal(date), target: hydrationTarget().ml }), ['water_log', 'setting', 'weigh_in', 'session'], [date]);

  // What you usually eat, per meal — one lookup for all four slots, since hooks
  // cannot run inside the render loop below.
  const usual = useLive(
    () => Object.fromEntries(MEAL_SLOTS.map((m) => [m, usualFor(m, 4, 60, date)])) as Record<MealSlot, UsualMeal[]>,
    ['meal_log', 'food', 'recipe'],
    [date],
  );

  const addUsual = (slot: MealSlot, u: UsualMeal) => {
    const id = logUsual(date, slot, u);
    if (id) toast(`Added ${u.label}`, { label: 'Undo', onPress: () => deleteEntries([id]) });
  };

  /** `null` slot means "opened without a meal" — the sheet asks before logging. */
  const [adding, setAdding] = useState<{ slot: MealSlot | null; start?: 'frequent' | 'recipes' } | null>(null);
  const [targetSheet, setTargetSheet] = useState(false);
  const [editing, setEditing] = useState<DayEntry | null>(null);
  const [servings, setServings] = useState(1);

  const soFar = `${Math.round(day.totals.kcal).toLocaleString()} / ${t.kcal.toLocaleString()} kcal`;
  /** A target is an estimate until your own logging measures it, or you set it. */
  const estimated = !t.manual && t.basis === 'estimated';

  return (
    <Screen
      title="Food"
      subtitle={fmtDayLabel(date)}
      tab
      right={<IconButton icon="target" accessibilityLabel="Change your calorie and protein targets" onPress={() => setTargetSheet(true)} />}
    >
      {/* Labelled controls, and a way back to today — the bare ‹ › said nothing to
          a screen reader and left no exit from three days ago. */}
      <DateStepper value={date} onChange={setDate} />
      {/*
        The day's intake as composition: one segment per meal inside the target's
        outline, dashed while that target is still an estimate (features/food/IntakeBar).
        Protein leads because it is the number this app plans training around.
      */}
      <View style={styles.intake}>
        <IntakeBar
          label="Calories"
          unit="kcal"
          target={t.kcal}
          estimated={estimated}
          segments={MEAL_SLOTS.map((m) => ({ key: m, short: SHORT[m], name: cap(m), value: day.bySlot[m].reduce((a, e) => a + e.macros.kcal, 0) }))}
        />
        <IntakeBar
          label="Protein"
          unit="g"
          target={t.proteinG}
          estimated={estimated}
          segments={MEAL_SLOTS.map((m) => ({ key: m, short: SHORT[m], name: cap(m), value: day.bySlot[m].reduce((a, e) => a + e.macros.protein, 0) }))}
        />
        {/* Carbs and fat follow from the two above; they are a line, not two more bars. */}
        <View style={styles.minor}>
          <Text style={styles.secondary}>
            Carbs <Text style={styles.secondaryStrong}>{Math.round(day.totals.carb)}</Text> of {t.carbG} g
          </Text>
          <Text style={styles.secondary}>
            Fat <Text style={styles.secondaryStrong}>{Math.round(day.totals.fat)}</Text> of {t.fatG} g
          </Text>
        </View>
        <Text style={styles.note}>
          {t.manual ? 'Targets you set.' : t.basis === 'estimated' ? `Targets are Iron's estimate (dashed) — ${confidenceLabel(t).toLowerCase()}.` : `Targets measured from your own logging — ${confidenceLabel(t).toLowerCase()}.`}
        </Text>
      </View>

      {/* A link to the Water screen, on the day being browsed — not a second copy of it. */}
      <Press
        onPress={() => router.push(`/water?date=${date}`)}
        accessibilityRole="button"
        accessibilityLabel={`Water: ${ml(water.ml)} of ${ml(water.target)} on ${fmtDayLabel(date)}. Opens the water screen.`}
        feedback="highlight"
        style={styles.waterRow}
        pressedStyle={styles.pressed}
      >
        <Icon name="water" size={18} color={color.cold} />
        <Text style={[styles.body, styles.flex1]}>Water</Text>
        <Text style={styles.waterValue}>
          {ml(water.ml)} <Text style={styles.waterOf}>of {ml(water.target)}</Text>
        </Text>
        <Icon name="chevronRight" size={18} color={color.textFaint} />
      </Press>

      {prev.entries.length > 0 && day.entries.length === 0 ? (
        <PrimaryButton
          label={`Repeat ${date === todayISO() ? 'yesterday' : fmtDayLabel(yesterday)} (${prev.entries.length} items)`}
          size="gym"
          style={styles.gap}
          onPress={() => {
            const ids = repeatDay(yesterday, date);
            toast(`Copied ${ids.length} ${ids.length === 1 ? 'item' : 'items'}`, { label: 'Undo', onPress: () => deleteEntries(ids) });
          }}
        />
      ) : null}

      {MEAL_SLOTS.map((slot) => {
        const entries = day.bySlot[slot];
        const prevSlot = prev.bySlot[slot];
        const kcal = entries.reduce((a, e) => a + e.macros.kcal, 0);
        const repeat = prevSlot.length > 0 && entries.length === 0;
        return (
          <View key={slot}>
            <View style={styles.mealHead}>
              <Text style={styles.mealTitle} accessibilityRole="header">
                {cap(slot)}
              </Text>
              {entries.length ? <Text style={styles.mealKcal}>{Math.round(kcal)} kcal</Text> : null}
              <View style={styles.flex1} />
              {repeat ? (
                <Press
                  onPress={() => {
                    const ids = repeatMeal(yesterday, slot, date);
                    toast(`Copied ${ids.length} ${ids.length === 1 ? 'item' : 'items'}`, { label: 'Undo', onPress: () => deleteEntries(ids) });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Repeat ${date === todayISO() ? "yesterday's" : `${fmtDayLabel(yesterday)}'s`} ${slot}`}
                  hitSlop={{ top: space.md, bottom: space.md, left: space.sm, right: space.sm }}
                >
                  <Text style={styles.link}>Repeat {date === todayISO() ? 'yesterday' : fmtDayLabel(yesterday)}</Text>
                </Press>
              ) : null}
            </View>
            <View style={styles.meal}>
              {entries.map((e, i) => (
                <Press
                  key={e.id}
                  feedback="highlight"
                  style={[styles.entry, i > 0 && styles.divider]}
                  pressedStyle={styles.entryHeld}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${e.label}`}
                  onPress={() => {
                    setServings(Math.max(0.5, Math.round(e.servings * 2) / 2));
                    setEditing(e);
                  }}
                >
                  <View style={styles.flex1}>
                    <Text style={styles.entryName} numberOfLines={2}>
                      {e.label}
                    </Text>
                    <Text style={styles.entryAmount}>
                      {fmtServings(e.servings)} × {unit(e.servingLabel)}
                    </Text>
                  </View>
                  <View style={styles.entryRight}>
                    <Text style={styles.entryKcal}>{Math.round(e.macros.kcal)}</Text>
                    <Text style={styles.entryMacro}>{Math.round(e.macros.protein)} g protein</Text>
                  </View>
                </Press>
              ))}
              {usual[slot].length > 0 ? (
                <View style={[styles.usual, entries.length > 0 && styles.usualAfter]}>
                  {usual[slot].map((u) => (
                    <Press
                      key={`${u.foodId ?? ''}:${u.recipeId ?? ''}`}
                      onPress={() => addUsual(slot, u)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add your usual ${u.label} to ${slot}`}
                      hitSlop={{ top: space.xs, bottom: space.xs }}
                      style={styles.pill}
                      pressedStyle={styles.pressed}
                    >
                      <Icon name="plus" size={14} color={color.text} />
                      <Text style={styles.pillText} numberOfLines={1}>
                        {u.label}
                      </Text>
                    </Press>
                  ))}
                </View>
              ) : null}
              <PrimaryButton label="Add food" tone="neutral" style={styles.addFood} onPress={() => setAdding({ slot })} />
            </View>
          </View>
        );
      })}

      <ListCard style={styles.gap}>
        <ListRow
          left={<Icon name="book" size={20} color={color.textMuted} />}
          title="Saved meals & recipes"
          sub="Log something you cook often, or save a new one."
          onPress={() => setAdding({ slot: null, start: 'recipes' })}
        />
      </ListCard>

      {/*
        The big "New recipe" card that used to sit below the entire diary is gone.
        It opened the sheet with breakfast as the meal, so creating a recipe at 9pm
        offered to log it to breakfast; saved meals are a destination at the top
        now, and creating one is a tab inside the one picker (UX-07).
      */}
      <AddFoodSheet
        visible={adding !== null}
        slot={adding?.slot ?? null}
        start={adding?.start}
        dateISO={date}
        soFar={soFar}
        onClose={() => setAdding(null)}
      />

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing?.label}>
        {editing ? (
          <View style={styles.stack}>
            <Stepper label={unit(editing.servingLabel)} value={servings} step={0.5} min={0.5} max={20} size="gym" onChange={setServings} />
            <PrimaryButton
              label="Save"
              size="gym"
              onPress={() => {
                const perServing = editing.servings > 0 ? editing.grams / editing.servings : editing.grams;
                updateEntryGrams(editing.id, servings * perServing);
                setEditing(null);
              }}
            />
            <PrimaryButton
              label="Remove"
              tone="danger"
              onPress={() => {
                const row = deleteEntry(editing.id);
                toast('Removed', { label: 'Undo', onPress: () => restoreEntry(row) });
                setEditing(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>
      <FoodTargetSheet visible={targetSheet} onClose={() => setTargetSheet(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  intake: { gap: space.lg, marginTop: space.lg },
  minor: { flexDirection: 'row', gap: space.xl, marginTop: -space.xs },
  secondary: { ...font.caption, fontVariant: ['tabular-nums'], color: color.textMuted },
  secondaryStrong: { color: color.text, fontWeight: '600' },
  note: { ...font.caption, fontSize: 12, color: color.textFaint, marginTop: -space.sm },
  waterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 2,
    minHeight: hit.gym,
    marginTop: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: { backgroundColor: color.surfaceHigh },
  body: { ...font.label, color: color.text, fontWeight: '500' },
  waterValue: { ...font.label, fontWeight: '700', fontVariant: ['tabular-nums'], color: color.cold },
  waterOf: { fontWeight: '400', color: color.textMuted },
  gap: { marginTop: space.lg },
  mealHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: space.xl, marginBottom: space.sm, minHeight: 28 },
  mealTitle: { ...font.heading, fontSize: 19, fontWeight: '700', color: color.text },
  mealKcal: { ...font.caption, fontVariant: ['tabular-nums'], color: color.textMuted },
  link: { ...font.caption, fontSize: 14, fontWeight: '600', color: color.text, textDecorationLine: 'underline' },
  meal: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border, paddingBottom: space.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.gym, paddingVertical: space.sm, paddingHorizontal: space.xs, borderRadius: radius.sm },
  entryHeld: { backgroundColor: color.surface },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  entryName: { ...font.label, fontSize: 15, fontWeight: '500', color: color.text },
  entryAmount: { ...font.caption, fontVariant: ['tabular-nums'], color: color.textMuted },
  entryRight: { alignItems: 'flex-end' },
  entryKcal: { ...font.measure, fontSize: 20, lineHeight: 24, color: color.text },
  entryMacro: { ...font.caption, fontSize: 12, fontVariant: ['tabular-nums'], color: color.textMuted },
  usual: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2, paddingTop: space.md },
  usualAfter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.border,
    maxWidth: '100%',
  },
  pillText: { ...font.caption, fontWeight: '500', color: color.text, flexShrink: 1 },
  addFood: { marginTop: space.md },
  stack: { gap: space.md, paddingBottom: space.lg },
});
