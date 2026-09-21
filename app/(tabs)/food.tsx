import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { router } from 'expo-router';

import { Card, Icon, IconButton, PrimaryButton, Screen, SectionHeader, Sheet, StatTile, Stepper } from '@/components';
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
import { FoodTargetSheet } from '@/features/food/TargetSheet';
import { computeTargets, confidenceLabel } from '@/features/food/targets';
import { getDayTotal } from '@/db/repositories/water';
import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { ml } from '@/lib/format';
import { hydrationTarget } from '@/services/hydration';
import { color, font, hit, radius, space } from '@/theme/tokens';

const cap = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);
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

  return (
    <Screen
      title="Food"
      subtitle={fmtDayLabel(date)}
      right={
        <IconButton
          icon="edit"
          tone="neutral"
          accessibilityLabel="Change your calorie and protein targets"
          onPress={() => setTargetSheet(true)}
        />
      }
    >
      {/* Labelled controls, and a way back to today — the bare ‹ › said nothing to
          a screen reader and left no exit from three days ago. */}
      <DateStepper value={date} onChange={setDate} />
      <View style={styles.tiles}>
        <StatTile label="Protein" value={`${Math.round(day.totals.protein)} / ${t.proteinG} g`} tone="accent" />
        <StatTile label="Calories" value={`${Math.round(day.totals.kcal)} / ${t.kcal}`} />
      </View>
      {/* Carbs and fat follow from the two above; they are a line, not a second pair of tiles. */}
      <Text style={styles.secondary}>
        Carbs {Math.round(day.totals.carb)} / {t.carbG} g{'   ·   '}Fat {Math.round(day.totals.fat)} / {t.fatG} g
      </Text>
      <Text style={styles.note}>
        {t.manual ? 'Your own targets' : t.basis === 'estimated' ? `Estimate · ${confidenceLabel(t)}` : `Measured · ${confidenceLabel(t)}`}
      </Text>

      {/* A link to the Water screen, on the day being browsed — not a second copy of it. */}
      <Pressable
        onPress={() => router.push(`/water?date=${date}`)}
        accessibilityRole="button"
        accessibilityLabel={`Water: ${ml(water.ml)} of ${ml(water.target)} on ${fmtDayLabel(date)}. Opens the water screen.`}
        style={({ pressed }) => [styles.waterRow, pressed && styles.pressed]}
      >
        <Icon name="water" size={18} color={color.textMuted} />
        <Text style={[styles.body, styles.flex1]}>Water</Text>
        <Text style={styles.waterValue}>
          {ml(water.ml)} <Text style={styles.note}>of {ml(water.target)}</Text>
        </Text>
        <Icon name="chevronRight" size={18} color={color.textMuted} />
      </Pressable>

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

      <SectionHeader
        title="Saved meals & recipes"
        hint="Log something you cook often, or save a new one."
        right={<PrimaryButton label="Open" tone="ghost" onPress={() => setAdding({ slot: null, start: 'recipes' })} />}
      />

      {MEAL_SLOTS.map((slot) => {
        const entries = day.bySlot[slot];
        const prevSlot = prev.bySlot[slot];
        const kcal = entries.reduce((a, e) => a + e.macros.kcal, 0);
        return (
          <View key={slot}>
            <SectionHeader
              title={cap(slot)}
              hint={entries.length ? `${Math.round(kcal)} kcal logged` : undefined}
              right={
                prevSlot.length > 0 && entries.length === 0 ? (
                  <PrimaryButton
                    label="Repeat"
                    tone="ghost"
                    onPress={() => {
                      const ids = repeatMeal(yesterday, slot, date);
                      toast(`Copied ${ids.length} ${ids.length === 1 ? 'item' : 'items'}`, { label: 'Undo', onPress: () => deleteEntries(ids) });
                    }}
                  />
                ) : undefined
              }
            />
            <Card>
              {entries.map((e) => (
                <Pressable
                  key={e.id}
                  style={styles.entry}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${e.label}`}
                  onPress={() => {
                    setServings(Math.max(0.5, Math.round(e.servings * 2) / 2));
                    setEditing(e);
                  }}
                >
                  <Text style={styles.entryName} numberOfLines={1}>
                    {fmtServings(e.servings)} × {unit(e.servingLabel)} · {e.label}
                  </Text>
                  <Text style={styles.entryMacro}>
                    {Math.round(e.macros.kcal)} kcal
                    <Text style={styles.entryProtein}>  {Math.round(e.macros.protein)} g protein</Text>
                  </Text>
                </Pressable>
              ))}
              {usual[slot].length > 0 ? (
                <View style={styles.usual}>
                  {usual[slot].map((u) => (
                    <PrimaryButton
                      key={`${u.foodId ?? ''}:${u.recipeId ?? ''}`}
                      label={u.label}
                      tone="ghost"
                      accessibilityLabel={`Add your usual ${u.label} to ${slot}`}
                      onPress={() => addUsual(slot, u)}
                    />
                  ))}
                </View>
              ) : null}
              <PrimaryButton label="Add food" tone="neutral" onPress={() => setAdding({ slot })} />
            </Card>
          </View>
        );
      })}

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
  entryProtein: { color: color.textMuted },
  usual: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  flex1: { flex: 1 },
  tiles: { flexDirection: 'row', gap: space.sm },
  secondary: { ...font.caption, ...font.numeric, color: color.textMuted, marginTop: space.sm, textAlign: 'center' },
  waterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: hit.default,
    marginTop: space.md,
    paddingHorizontal: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  pressed: { backgroundColor: color.surfaceHigh },
  body: { ...font.body, color: color.text },
  waterValue: { ...font.body, ...font.numeric, color: color.text, fontWeight: '600' },
  gap: { marginTop: space.lg },
  note: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  entry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, minHeight: hit.default },
  entryName: { ...font.body, color: color.text, flex: 1 },
  entryMacro: { ...font.caption, ...font.numeric, color: color.textMuted },
  stack: { gap: space.md, paddingBottom: space.lg },
});
