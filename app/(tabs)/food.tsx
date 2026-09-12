import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, Screen, SectionHeader, Sheet, StatTile, Stepper } from '@/components';
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
import { computeTargets, confidenceLabel } from '@/features/food/targets';
import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { color, font, hit, space } from '@/theme/tokens';

const cap = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s);
const fmtServings = (n: number) => (Math.round(n * 2) / 2).toString();
const unit = (label: string | null) => (label ?? 'serving').replace(/^1\s+/, '');

/** Target: a normal day in under 30 seconds. Repeat is the primary action; search is the fallback. */
export default function FoodScreen() {
  const [date, setDate] = useState(todayISO());
  const yesterday = addDays(date, -1);

  // Left open overnight, the screen would still be logging into yesterday. On
  // resume, move on only if the user was on the current day; browsing history stays.
  const shownToday = useRef(todayISO());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const now = todayISO();
      if (now === shownToday.current) return;
      if (date === shownToday.current) setDate(now);
      shownToday.current = now;
    });
    return () => sub.remove();
  }, [date]);

  const day = useLive(() => getDay(date), ['meal_log', 'food', 'recipe', 'recipe_item'], [date]);
  const prev = useLive(() => getDay(yesterday), ['meal_log', 'food', 'recipe', 'recipe_item'], [yesterday]);
  const t = useLive(() => computeTargets(date), ['meal_log', 'food', 'recipe', 'recipe_item', 'weigh_in', 'setting', 'session'], [date]);

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

  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [recipeTab, setRecipeTab] = useState(false);
  const [editing, setEditing] = useState<DayEntry | null>(null);
  const [servings, setServings] = useState(1);

  return (
    <Screen
      title="Food"
      subtitle={fmtDayLabel(date)}
      right={
        <View style={styles.dateNav}>
          <PrimaryButton label="‹" tone="ghost" onPress={() => setDate(addDays(date, -1))} />
          <PrimaryButton label="›" tone="ghost" disabled={date >= todayISO()} onPress={() => setDate(addDays(date, 1))} />
        </View>
      }
    >
      <View style={styles.tiles}>
        <StatTile label="Protein" value={`${Math.round(day.totals.protein)} / ${t.proteinG} g`} tone="accent" />
        <StatTile label="Calories" value={`${Math.round(day.totals.kcal)} / ${t.kcal}`} />
      </View>
      <View style={[styles.tiles, styles.gapSm]}>
        <StatTile label="Carbs" value={`${Math.round(day.totals.carb)} / ${t.carbG} g`} tone="muted" />
        <StatTile label="Fat" value={`${Math.round(day.totals.fat)} / ${t.fatG} g`} tone="muted" />
      </View>
      <Text style={styles.note}>
        {t.manual ? 'Your own targets' : t.basis === 'estimated' ? `Estimate · ${confidenceLabel(t)}` : `Measured · ${confidenceLabel(t)}`}
      </Text>

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
        return (
          <View key={slot}>
            <SectionHeader
              title={`${slot}${entries.length ? ` · ${Math.round(kcal)} kcal` : ''}`}
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
                    {Math.round(e.macros.protein)} g P · {Math.round(e.macros.kcal)}
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
              <PrimaryButton label={`Add to ${slot}`} tone="neutral" onPress={() => setAdding(slot)} />
            </Card>
          </View>
        );
      })}

      <SectionHeader title="Recipes" />
      <Card>
        <Text style={styles.note}>Save a meal you cook often, then log the whole thing in one tap.</Text>
        <PrimaryButton
          label="New recipe"
          size="gym"
          style={styles.gap}
          onPress={() => { setRecipeTab(true); setAdding('breakfast'); }}
        />
      </Card>

      <AddFoodSheet
        visible={adding !== null}
        slot={adding ?? 'breakfast'}
        dateISO={date}
        startOnRecipe={recipeTab}
        onClose={() => { setAdding(null); setRecipeTab(false); }}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  usual: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  dateNav: { flexDirection: 'row', gap: space.xs },
  tiles: { flexDirection: 'row', gap: space.sm },
  gapSm: { marginTop: space.sm },
  gap: { marginTop: space.lg },
  note: { ...font.caption, color: color.textMuted, marginTop: space.sm },
  entry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, minHeight: hit.default },
  entryName: { ...font.body, color: color.text, flex: 1 },
  entryMacro: { ...font.caption, ...font.numeric, color: color.textMuted },
  stack: { gap: space.md, paddingBottom: space.lg },
});
