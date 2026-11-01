import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, Icon, IconButton, ListCard, ListRow, Press, PrimaryButton, Ring, Screen, SectionHeader, Sheet, Stepper } from '@/components';
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
import { getDayTotal } from '@/db/repositories/water';
import { AddFoodSheet } from '@/features/food/AddFoodSheet';
import { FoodTargetSheet } from '@/features/food/TargetSheet';
import { computeTargets } from '@/features/food/targets';
import { addDays, fmtDayLabel, todayISO } from '@/lib/date';
import { ml } from '@/lib/format';
import { hydrationTarget } from '@/services/hydration';
import { color, font, gap, hit, radius, space } from '@/theme/tokens';

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

  // Today's food tile opens this screen with `?add=<nonce>`: open the picker once per
  // tap. Adjusted during render rather than in an effect, so it never flashes closed.
  const { add } = useLocalSearchParams<{ add?: string }>();
  const [seenAdd, setSeenAdd] = useState<string | undefined>(undefined);
  if (typeof add === 'string' && add !== seenAdd) {
    setSeenAdd(add);
    setAdding({ slot: null });
  }

  const eaten = Math.round(day.totals.kcal);
  const over = eaten > t.kcal;
  const soFar = `${eaten} / ${t.kcal} kcal`;
  /** A target is an estimate until your own logging measures it, or you set it. */
  const estimated = !t.manual && t.basis === 'estimated';
  const isToday = date === todayISO();
  const prevName = isToday ? 'yesterday' : fmtDayLabel(yesterday);

  return (
    <Screen title="Food" tab right={<IconButton icon="target" accessibilityLabel="Change your calorie and protein targets" onPress={() => setTargetSheet(true)} />}>
      <DateStepper value={date} onChange={setDate} />

      {/* The day's calories as one ring: what is left, with the two numbers it comes from beside it. */}
      <Card style={styles.kcalCard}>
        <Ring progress={t.kcal > 0 ? eaten / t.kcal : 0} size={148} thickness={16} tone="peach">
          <Text style={styles.ringValue} numberOfLines={1} adjustsFontSizeToFit>
            {Math.abs(t.kcal - eaten)}
          </Text>
          <Text style={styles.ringLabel}>{over ? 'kcal over' : 'kcal left'}</Text>
        </Ring>
        <View style={styles.kcalSide}>
          <Text style={styles.sideLabel}>Eaten</Text>
          <Text style={styles.sideValue}>{eaten}</Text>
          <Text style={[styles.sideLabel, styles.sideGap]}>{estimated ? 'Target, estimated' : 'Target'}</Text>
          <Text style={styles.sideValue}>{t.kcal}</Text>
        </View>
      </Card>

      {/* Protein leads because it is the number this app plans training around. */}
      <View style={styles.macros}>
        <Macro label="Protein" value={day.totals.protein} target={t.proteinG} ink={color.accent} />
        <Macro label="Carbs" value={day.totals.carb} target={t.carbG} ink={color.cold} />
        <Macro label="Fat" value={day.totals.fat} target={t.fatG} ink={color.pink} />
      </View>

      {/* A link to the Water screen, on the day being browsed — not a second copy of it. */}
      <Press
        onPress={() => router.push(`/water?date=${date}`)}
        accessibilityRole="button"
        accessibilityLabel={`Water: ${ml(water.ml)} of ${ml(water.target)} on ${fmtDayLabel(date)}. Opens the water screen.`}
        style={styles.waterRow}
        pressedStyle={styles.pressed}
      >
        <View style={styles.waterIcon}>
          <Icon name="water" size={18} color={color.onTile} />
        </View>
        <Text style={[styles.waterTitle, styles.flex1]}>Water</Text>
        <Text style={styles.waterValue}>
          {ml(water.ml)} <Text style={styles.waterOf}>of {ml(water.target)}</Text>
        </Text>
        <Icon name="chevronRight" size={18} color={color.textFaint} />
      </Press>

      {prev.entries.length > 0 && day.entries.length === 0 ? (
        <PrimaryButton
          label={`Repeat ${prevName}, ${prev.entries.length} ${prev.entries.length === 1 ? 'item' : 'items'}`}
          size="gym"
          icon={<Icon name="copy" size={20} color={color.onAccent} />}
          style={styles.repeatDay}
          onPress={() => {
            const ids = repeatDay(yesterday, date);
            toast(`Copied ${ids.length} ${ids.length === 1 ? 'item' : 'items'}`, { label: 'Undo', onPress: () => deleteEntries(ids) });
          }}
        />
      ) : null}

      <SectionHeader title="Meals" />
      {MEAL_SLOTS.map((slot) => {
        const entries = day.bySlot[slot];
        const kcal = entries.reduce((a, e) => a + e.macros.kcal, 0);
        const protein = entries.reduce((a, e) => a + e.macros.protein, 0);
        const repeat = prev.bySlot[slot].length > 0 && entries.length === 0;
        return (
          <View key={slot} style={styles.meal}>
            <View style={styles.mealHead}>
              <View style={styles.flex1}>
                <Text style={styles.mealTitle} accessibilityRole="header">
                  {cap(slot)}
                </Text>
                <Text style={styles.mealSub}>{entries.length ? `${Math.round(kcal)} kcal, ${Math.round(protein)} g protein` : 'Nothing yet'}</Text>
              </View>
              <Press onPress={() => setAdding({ slot })} accessibilityRole="button" accessibilityLabel={`Add food to ${slot}`} hitSlop={6} style={styles.add}>
                <Icon name="plus" size={20} color={color.onTile} strokeWidth={2.6} />
              </Press>
            </View>

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
                  <Text style={styles.entryKcal}>{Math.round(e.macros.kcal)} kcal</Text>
                  <Text style={styles.entryMacro}>{Math.round(e.macros.protein)} g protein</Text>
                </View>
              </Press>
            ))}

            {usual[slot].length > 0 || repeat ? (
              <View style={styles.usual}>
                {repeat ? (
                  <Press
                    onPress={() => {
                      const ids = repeatMeal(yesterday, slot, date);
                      toast(`Copied ${ids.length} ${ids.length === 1 ? 'item' : 'items'}`, { label: 'Undo', onPress: () => deleteEntries(ids) });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Repeat ${isToday ? "yesterday's" : `${fmtDayLabel(yesterday)}'s`} ${slot}`}
                    hitSlop={{ top: space.xs, bottom: space.xs }}
                    style={[styles.chip, styles.chipRepeat]}
                  >
                    <Icon name="copy" size={14} color={color.peach} />
                    <Text style={[styles.chipText, styles.chipRepeatText]} numberOfLines={1}>
                      Repeat {prevName}
                    </Text>
                  </Press>
                ) : null}
                {usual[slot].map((u) => (
                  <Press
                    key={`${u.foodId ?? ''}:${u.recipeId ?? ''}`}
                    onPress={() => addUsual(slot, u)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add your usual ${u.label} to ${slot}`}
                    hitSlop={{ top: space.xs, bottom: space.xs }}
                    style={styles.chip}
                    pressedStyle={styles.pressed}
                  >
                    <Icon name="plus" size={14} color={color.text} />
                    <Text style={styles.chipText} numberOfLines={1}>
                      {u.label}
                    </Text>
                  </Press>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      <ListCard>
        <ListRow
          left={<Icon name="book" size={20} color={color.peach} />}
          title="Saved meals & recipes"
          sub="Log something you cook often, or save a new one."
          onPress={() => setAdding({ slot: null, start: 'recipes' })}
        />
      </ListCard>

      <AddFoodSheet visible={adding !== null} slot={adding?.slot ?? null} start={adding?.start} dateISO={date} soFar={soFar} onClose={() => setAdding(null)} />

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

/** One macro as a small dark tile: grams eaten of the target, and a bar in its colour. */
function Macro({ label, value, target, ink }: { label: string; value: number; target: number; ink: string }) {
  const v = Math.round(value);
  return (
    <View style={styles.macro} accessible accessibilityLabel={`${label}: ${v} of ${target} grams`}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue} numberOfLines={1}>
        {v}
        <Text style={styles.macroOf}> / {target} g</Text>
      </Text>
      <View style={styles.macroTrack}>
        <View style={[styles.macroFill, { width: `${Math.round(Math.min(1, target > 0 ? v / target : 0) * 100)}%`, backgroundColor: ink }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  pressed: { backgroundColor: color.surfaceHigh },

  kcalCard: { flexDirection: 'row', alignItems: 'center', gap: space.lg + 2, marginTop: space.lg, marginBottom: 0, borderRadius: radius.xl },
  ringValue: { ...font.measure, fontWeight: '900', fontSize: 34, lineHeight: 38, color: color.text, paddingRight: 2 },
  ringLabel: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '700', color: color.textMuted },
  kcalSide: { flex: 1, minWidth: 0 },
  sideLabel: { ...font.eyebrow, color: color.textMuted },
  sideGap: { marginTop: space.sm },
  sideValue: { ...font.measure, fontWeight: '900', fontSize: 30, lineHeight: 34, color: color.text, paddingRight: 2 },

  macros: { flexDirection: 'row', gap: space.sm + 2, marginTop: gap.between },
  macro: { flex: 1, minWidth: 0, backgroundColor: color.surface, borderRadius: radius.md + 4, padding: space.md },
  macroLabel: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '700', color: color.textMuted },
  macroValue: { ...font.label, fontSize: 17, lineHeight: 22, fontWeight: '800', color: color.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  macroOf: { fontSize: 12, fontWeight: '600', color: color.textFaint },
  macroTrack: { height: 6, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, marginTop: space.sm, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: radius.pill },

  waterRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.gym + 8, marginTop: space.lg, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: color.surface },
  waterIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.cold, alignItems: 'center', justifyContent: 'center' },
  waterTitle: { ...font.label, color: color.text },
  waterValue: { ...font.label, fontVariant: ['tabular-nums'], color: color.text },
  waterOf: { fontWeight: '500', color: color.textMuted },
  repeatDay: { marginTop: space.lg },

  meal: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm + 2 },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mealTitle: { ...font.heading, fontSize: 16, lineHeight: 22, color: color.text },
  mealSub: { ...font.caption, fontSize: 12, lineHeight: 16, fontWeight: '600', color: color.textFaint, fontVariant: ['tabular-nums'] },
  add: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.peach, alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hit.default + 4, paddingVertical: space.sm },
  entryHeld: { backgroundColor: color.surfaceHigh },
  divider: { borderTopWidth: 1, borderTopColor: color.border },
  entryName: { ...font.label, fontSize: 14, fontWeight: '600', color: color.text },
  entryAmount: { ...font.caption, fontSize: 12, fontVariant: ['tabular-nums'], color: color.textMuted },
  entryRight: { alignItems: 'flex-end' },
  entryKcal: { ...font.label, fontSize: 14, fontVariant: ['tabular-nums'], color: color.textMuted },
  entryMacro: { ...font.caption, fontSize: 12, fontVariant: ['tabular-nums'], color: color.textFaint },
  usual: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2, marginTop: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, height: 38, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, maxWidth: '100%' },
  chipRepeat: { backgroundColor: color.peachSoft },
  chipText: { ...font.caption, fontWeight: '700', color: color.text, flexShrink: 1 },
  chipRepeatText: { color: color.peach },
  stack: { gap: space.md, paddingBottom: space.lg },
});
