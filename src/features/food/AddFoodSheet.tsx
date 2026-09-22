import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { Icon } from '@/components/Icon';
import { SectionHeader } from '@/components/SectionHeader';
import { SegmentTabs } from '@/components/SegmentTabs';
import { IconButton } from '@/components/IconButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { toast } from '@/components/Toast';
import {
  createFood,
  createRecipe,
  deleteEntries,
  foodMacros,
  getRecipeMacros,
  listRecipes,
  logFood,
  logRecipe,
  MEAL_SLOTS,
  quickAddFoods,
  searchFoods,
  type Food,
  type MealSlot,
  type Recipe,
} from '@/db/repositories/food';
import { fmtDayLabel, todayISO } from '@/lib/date';
import { color, font, hit, radius, space } from '@/theme/tokens';

type Tab = 'frequent' | 'search' | 'recipes' | 'newFood' | 'newRecipe';
/** Search is not a tab of its own: the field sits above your usual foods and replaces them as you type. */
const TABS: { label: string; value: Tab }[] = [
  { label: 'Foods', value: 'frequent' },
  { label: 'Recipes', value: 'recipes' },
  { label: 'New food', value: 'newFood' },
  { label: 'New recipe', value: 'newRecipe' },
];
const SLOT_CHIPS = MEAL_SLOTS.map((m) => ({ label: m[0]?.toUpperCase() + m.slice(1), value: m }));

const unit = (label: string | null) => (label ?? 'serving').replace(/^1\s+/, '');

/** An ingredient being assembled. Held by the sheet, not by the recipe form. */
export interface DraftItem {
  food: Food;
  grams: number;
}
export interface RecipeDraft {
  name: string;
  servings: number;
  items: DraftItem[];
}
const EMPTY_DRAFT: RecipeDraft = { name: '', servings: 1, items: [] };

export interface AddFoodSheetProps {
  visible: boolean;
  /**
   * The meal to log into. `null` means the sheet was opened without one — from
   * "Saved meals & recipes", say — and it asks before logging instead of assuming.
   * Opening the recipe creator used to pass 'breakfast', so making a recipe at
   * 9pm offered to log it to breakfast (UX-07).
   */
  slot: MealSlot | null;
  dateISO: string;
  /** Which tab to land on. Creating a recipe and logging a meal are different jobs. */
  start?: Tab;
  /** "1,840 / 2,650 kcal" for the day being logged to. */
  soFar?: string;
  onClose: () => void;
}

/**
 * The one food and recipe picker, and the one place either is created.
 *
 * Every entry point opens this: a meal's Add food, the saved-recipes link, the
 * empty diary. What changes between them is the tab it starts on and whether a
 * meal is already known — never the flow itself.
 */
export function AddFoodSheet({ visible, slot, dateISO, start = 'frequent', soFar, onClose }: AddFoodSheetProps) {
  const [tab, setTab] = useState<Tab>(start);
  // Re-apply on each open: useState only runs once, so opening from the recipes
  // link after opening from "Add food" would otherwise land on the wrong tab.
  // Adjusted during render, on the open itself, rather than in an effect a frame later.
  const [q, setQ] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState<MealSlot>(slot ?? 'breakfast');
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setTab(start);
      // The sheet stays mounted between opens, so the meal must follow each one:
      // Add food under Dinner after an earlier Lunch was still logging to lunch.
      setMeal(slot ?? 'breakfast');
    }
  }
  /**
   * The recipe draft lives here, above the tabs. It used to live inside the recipe
   * form, which unmounts the moment you switch to New food — and the form itself
   * told you to go there for a missing ingredient, so following its own advice
   * threw away the name, the servings and every ingredient so far (UX-07).
   */
  const [draft, setDraft] = useState<RecipeDraft>(EMPTY_DRAFT);

  const close = () => {
    setFood(null);
    setRecipe(null);
    setServings(1);
    setQ('');
    setDraft(EMPTY_DRAFT);
    onClose();
  };

  const searching = q.trim() !== '';
  const list = useMemo(
    () => (!visible || (tab !== 'frequent' && tab !== 'search') ? [] : searching ? searchFoods(q) : quickAddFoods(15)),
    [visible, tab, q, searching],
  );

  /** One tap from the list when the meal is known; otherwise the amount step asks which meal. */
  const quickAdd = (f: Food) => {
    if (slot === null) {
      setFood(f);
      setServings(1);
      return;
    }
    const id = logFood({ dateISO, mealSlot: meal, foodId: f.id, grams: f.servingG });
    if (id) toast(`${unit(f.servingLabel)} ${f.name} → ${meal}`, { label: 'Undo', onPress: () => deleteEntries([id]) });
  };
  const recipes = useMemo(() => (visible && tab === 'recipes' ? listRecipes() : []), [visible, tab, recipe]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --------------------------- confirm and log --------------------------- */
  if (food || recipe) {
    const per = food ? foodMacros(food, food.servingG) : getRecipeMacros(recipe?.id ?? '');
    const name = food?.name ?? recipe?.name ?? '';
    const amount = food ? `${servings} × ${unit(food.servingLabel)}` : `${servings} ${servings === 1 ? 'serving' : 'servings'}`;
    const when = dateISO === todayISO() ? '' : ` on ${fmtDayLabel(dateISO)}`;

    const commit = () => {
      const id = food
        ? logFood({ dateISO, mealSlot: meal, foodId: food.id, grams: servings * food.servingG })
        : recipe
          ? logRecipe({ dateISO, mealSlot: meal, recipeId: recipe.id, servings })
          : null;
      // What, how much, and where it went — with a way back (UX-07).
      if (id) toast(`${amount} ${name} → ${meal}${when}`, { label: 'Undo', onPress: () => deleteEntries([id]) });
      close();
    };

    return (
      <Sheet visible={visible} onClose={close} title={name}>
        <Stepper label={food ? unit(food.servingLabel) : 'servings'} value={servings} step={0.5} min={0.5} max={20} size="gym" onChange={setServings} />
        <Text style={styles.macro}>
          {Math.round(per.kcal * servings)} kcal · {Math.round(per.protein * servings)} g protein · {Math.round(per.carb * servings)} g carbs ·{' '}
          {Math.round(per.fat * servings)} g fat
        </Text>
        {/* Opened without a meal: ask, rather than quietly picking breakfast. */}
        {slot === null ? (
          <View style={styles.mealPick}>
            <Text style={styles.label}>Which meal?</Text>
            <ChipRow options={SLOT_CHIPS} value={meal} onChange={setMeal} fill={false} />
            <Text style={styles.muted}>Logging to {fmtDayLabel(dateISO)}.</Text>
          </View>
        ) : null}
        <PrimaryButton label={`Log to ${meal}`} size="gym" style={styles.gap} onPress={commit} />
        <PrimaryButton
          label="Back"
          tone="ghost"
          style={styles.gap}
          onPress={() => {
            setFood(null);
            setRecipe(null);
          }}
        />
      </Sheet>
    );
  }

  /* ------------------------------- picker -------------------------------- */
  const mealName = meal[0]?.toUpperCase() + meal.slice(1);
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={slot ? 'Add food' : 'Food & recipes'}
      subtitle={[slot ? mealName : null, fmtDayLabel(dateISO), soFar ? `so far ${soFar}` : null].filter(Boolean).join(' · ')}
    >
      {slot !== null ? (
        <View style={styles.block}>
          <ChipRow options={SLOT_CHIPS} value={meal} onChange={setMeal} columns={4} />
        </View>
      ) : null}
      <View style={styles.block}>
        <SegmentTabs options={TABS} value={tab === 'search' ? 'frequent' : tab} onChange={setTab} />
      </View>
      {tab === 'frequent' || tab === 'search' ? (
        <>
          <View style={styles.search}>
            <Icon name="search" size={20} color={color.textFaint} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search foods"
              placeholderTextColor={color.textFaint}
              style={styles.searchInput}
              accessibilityLabel="Search foods"
              returnKeyType="search"
            />
            {searching ? <IconButton icon="close" accessibilityLabel="Clear search" onPress={() => setQ('')} /> : null}
          </View>
          <SectionHeader title={searching ? 'Results' : 'Your usual foods'} action={{ label: 'Custom food', onPress: () => setTab('newFood') }} />
          {searching && list.length === 0 ? <Text style={styles.muted}>Nothing matches “{q.trim()}”. Add it as a custom food.</Text> : null}
          <View style={styles.list}>
            {list.map((f, i) => (
              <Pressable
                key={f.id}
                style={({ pressed }) => [styles.foodRow, i > 0 && styles.divider, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${f.name}, ${Math.round(f.kcal)} kcal. Choose an amount.`}
                onPress={() => {
                  setFood(f);
                  setServings(1);
                }}
              >
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={2}>
                    {f.name}
                  </Text>
                  <Text style={styles.portion}>{f.servingLabel ?? `${f.servingG} g`}</Text>
                </View>
                <View style={styles.nums}>
                  <Text style={styles.kcal}>{Math.round(f.kcal)}</Text>
                  <Text style={styles.portion}>{Math.round(f.protein)} g P</Text>
                </View>
                <Pressable
                  onPress={() => quickAdd(f)}
                  accessibilityRole="button"
                  accessibilityLabel={slot ? `Add ${f.name} to ${meal}` : `Add ${f.name}`}
                  style={({ pressed }) => [styles.plus, pressed && styles.plusPressed]}
                >
                  <Icon name="plus" size={20} color={color.text} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {tab === 'recipes' ? (
        recipes.length === 0 ? (
          <>
            <Text style={styles.muted}>Nothing saved yet.</Text>
            <PrimaryButton label="Create a recipe" tone="neutral" style={styles.gap} onPress={() => setTab('newRecipe')} />
          </>
        ) : (
          recipes.map((r) => (
            <Pressable
              key={r.id}
              style={styles.item}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}, ${Math.round(getRecipeMacros(r.id).kcal)} kcal per serving`}
              onPress={() => {
                setRecipe(r);
                setServings(1);
              }}
            >
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.muted}>{Math.round(getRecipeMacros(r.id).kcal)} kcal per serving</Text>
            </Pressable>
          ))
        )
      ) : null}
      {tab === 'newFood' ? (
        <NewFood
          // Mid-recipe: the new ingredient goes back into the draft, not into a meal.
          forRecipe={draft.items.length > 0 || draft.name.trim() !== ''}
          onCreated={(f) => {
            if (draft.items.length > 0 || draft.name.trim() !== '') {
              setDraft((d) => ({ ...d, items: [...d.items, { food: f, grams: f.servingG }] }));
              setTab('newRecipe');
              return;
            }
            setFood(f);
            setServings(1);
          }}
        />
      ) : null}
      {tab === 'newRecipe' ? (
        <NewRecipe
          draft={draft}
          onDraft={setDraft}
          onCreateIngredient={() => setTab('newFood')}
          onCreated={(r) => {
            setDraft(EMPTY_DRAFT);
            // Saving a recipe is not logging a meal. It goes to the list; logging it
            // is a separate choice, with its own meal and date.
            toast(`Saved ${r.name}`);
            setTab('recipes');
          }}
        />
      ) : null}
    </Sheet>
  );
}

function num(s: string): number {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function Field({ label, value, onChange, numeric = true }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.muted}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'} style={styles.input} accessibilityLabel={label} />
    </View>
  );
}

function NewFood({ onCreated, forRecipe }: { onCreated: (f: Food) => void; forRecipe: boolean }) {
  const [f, setF] = useState({ name: '', servingLabel: '1 serving', servingG: '100', kcal: '', protein: '', carb: '', fat: '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <View>
      {forRecipe ? <Text style={styles.muted}>Your recipe is kept as it was. Saving this takes you straight back to it.</Text> : null}
      <Field label="Name" value={f.name} onChange={set('name')} numeric={false} />
      <Field label='Serving, as you say it ("1 roti", "1 katori")' value={f.servingLabel} onChange={set('servingLabel')} numeric={false} />
      <View style={styles.pair}>
        <Field label="Grams per serving" value={f.servingG} onChange={set('servingG')} />
        <Field label="kcal" value={f.kcal} onChange={set('kcal')} />
      </View>
      <View style={styles.pair}>
        <Field label="Protein g" value={f.protein} onChange={set('protein')} />
        <Field label="Carbs g" value={f.carb} onChange={set('carb')} />
        <Field label="Fat g" value={f.fat} onChange={set('fat')} />
      </View>
      <PrimaryButton
        label={forRecipe ? 'Save and add to the recipe' : 'Save food'}
        size="gym"
        style={styles.gap}
        disabled={!f.name.trim() || num(f.servingG) <= 0}
        onPress={() =>
          onCreated(
            createFood({
              name: f.name.trim(),
              servingLabel: f.servingLabel.trim() || null,
              servingG: num(f.servingG),
              kcal: num(f.kcal),
              protein: num(f.protein),
              carb: num(f.carb),
              fat: num(f.fat),
              fiber: null,
              barcode: null,
              brand: null,
            }),
          )
        }
      />
    </View>
  );
}

function NewRecipe({
  draft,
  onDraft,
  onCreateIngredient,
  onCreated,
}: {
  draft: RecipeDraft;
  onDraft: (d: RecipeDraft) => void;
  onCreateIngredient: () => void;
  onCreated: (r: Recipe) => void;
}) {
  const [q, setQ] = useState('');
  // Something to tap before you have typed anything. Requiring a search first made
  // the whole screen look broken when the search happened to match nothing.
  const results = useMemo(() => (q.trim() ? searchFoods(q, 8) : quickAddFoods(6)), [q]);
  const add = (f: Food) => {
    onDraft({ ...draft, items: [...draft.items, { food: f, grams: f.servingG }] });
    setQ('');
  };
  const blocker = !draft.name.trim() ? 'Name the recipe to save it.' : draft.items.length === 0 ? 'Add at least one ingredient.' : null;

  return (
    <View>
      <Field label="Recipe name" value={draft.name} onChange={(v) => onDraft({ ...draft, name: v })} numeric={false} />
      <Stepper label="Makes servings" value={draft.servings} step={1} min={1} max={20} onChange={(v) => onDraft({ ...draft, servings: v })} />
      <Text style={[styles.muted, styles.gap]}>{draft.items.length === 0 ? 'Ingredients — none yet' : `Ingredients · ${draft.items.length}`}</Text>
      {draft.items.map((it, i) => (
        <View key={`${it.food.id}-${i}`} style={styles.pair}>
          <Text style={[styles.name, styles.flex]} numberOfLines={1}>
            {it.food.name}
          </Text>
          <View style={styles.flex}>
            <Stepper
              value={it.grams}
              step={10}
              min={0}
              max={2000}
              suffix="g"
              onChange={(g) => onDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, grams: g } : x)) })}
            />
          </View>
          {/* Removing an ingredient, rather than setting it to zero grams and hoping. */}
          <IconButton
            icon="close"
            accessibilityLabel={`Remove ${it.food.name} from the recipe`}
            onPress={() => onDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
          />
        </View>
      ))}
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search for an ingredient"
        placeholderTextColor={color.textFaint}
        style={[styles.input, styles.gap]}
        accessibilityLabel="Search for an ingredient"
      />
      {results.length === 0 ? <Text style={[styles.muted, styles.gap]}>Nothing matches “{q.trim()}”.</Text> : null}
      {results.map((f) => (
        <Pressable key={f.id} style={styles.item} onPress={() => add(f)} accessibilityRole="button" accessibilityLabel={`Add ${f.name}`}>
          <Text style={styles.name}>{f.name}</Text>
          <Text style={styles.muted}>{f.servingLabel ?? `${f.servingG} g`}</Text>
        </Pressable>
      ))}
      <PrimaryButton label="Create a new ingredient" tone="neutral" style={styles.gap} onPress={onCreateIngredient} />

      {/* Says what is missing instead of leaving a grey button and no explanation. */}
      {blocker ? <Text style={[styles.muted, styles.gap]}>{blocker}</Text> : null}
      <PrimaryButton
        label="Save recipe"
        size="gym"
        style={styles.gap}
        disabled={blocker !== null}
        onPress={() => onCreated(createRecipe(draft.name, draft.servings, draft.items.map((it) => ({ foodId: it.food.id, grams: it.grams }))))}
      />
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
  item: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.border, minHeight: hit.default },
  block: { marginBottom: space.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 2,
    minHeight: hit.gym,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    backgroundColor: color.surfaceHigh,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchInput: { ...font.body, color: color.text, flex: 1, minHeight: hit.gym },
  list: { backgroundColor: color.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border, paddingHorizontal: space.lg },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingVertical: space.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  pressed: { opacity: 0.7 },
  portion: { ...font.caption, fontSize: 12, color: color.textFaint },
  nums: { alignItems: 'flex-end' },
  kcal: { ...font.label, fontWeight: '700', ...font.numeric, color: color.text },
  plus: { width: hit.default, height: hit.default, borderRadius: radius.pill, backgroundColor: color.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  plusPressed: { backgroundColor: color.border },
  name: { ...font.label, fontWeight: '600', color: color.text },
  strong: { color: color.text, fontWeight: '600' },
  label: { ...font.label, color: color.text, fontWeight: '600', marginBottom: space.sm },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  macro: { ...font.label, ...font.numeric, color: color.textMuted, marginVertical: space.lg },
  mealPick: { marginBottom: space.md },
  gap: { marginTop: space.md },
  field: { flex: 1, marginTop: space.sm },
  pair: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  flex: { flex: 1 },
});
