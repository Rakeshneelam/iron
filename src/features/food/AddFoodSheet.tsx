import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChipRow } from '@/components/ChipRow';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import {
  createFood,
  createRecipe,
  foodMacros,
  getRecipeMacros,
  listRecipes,
  logFood,
  logRecipe,
  quickAddFoods,
  searchFoods,
  type Food,
  type MealSlot,
  type Recipe,
} from '@/db/repositories/food';
import { color, font, hit, radius, space } from '@/theme/tokens';

type Tab = 'frequent' | 'search' | 'recipes' | 'newFood' | 'newRecipe';
const TABS: { label: string; value: Tab }[] = [
  { label: 'Frequent', value: 'frequent' },
  { label: 'Search', value: 'search' },
  { label: 'Recipes', value: 'recipes' },
  { label: 'New food', value: 'newFood' },
  { label: 'New recipe', value: 'newRecipe' },
];

const unit = (label: string | null) => (label ?? 'serving').replace(/^1\s+/, '');

export function AddFoodSheet({
  visible,
  slot,
  dateISO,
  startOnRecipe = false,
  onClose,
}: {
  visible: boolean;
  slot: MealSlot;
  dateISO: string;
  /** Opened from the Recipes card rather than "Add to breakfast". */
  startOnRecipe?: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(startOnRecipe ? 'newRecipe' : 'frequent');
  // Re-apply on each open: useState only runs once, so opening from the Recipes card
  // after opening from "Add to breakfast" would otherwise land on the wrong tab.
  useEffect(() => {
    if (visible) setTab(startOnRecipe ? 'newRecipe' : 'frequent');
  }, [visible, startOnRecipe]);
  const [q, setQ] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(1);

  const close = () => {
    setFood(null);
    setRecipe(null);
    setServings(1);
    setQ('');
    onClose();
  };

  const list = useMemo(
    () => (!visible ? [] : tab === 'search' ? searchFoods(q) : tab === 'frequent' ? quickAddFoods(15) : []),
    [visible, tab, q],
  );
  const recipes = useMemo(() => (visible && tab === 'recipes' ? listRecipes() : []), [visible, tab]);

  if (food || recipe) {
    const per = food ? foodMacros(food, food.servingG) : getRecipeMacros(recipe?.id ?? '');
    return (
      <Sheet visible={visible} onClose={close} title={food?.name ?? recipe?.name ?? ''}>
        <Stepper label={food ? unit(food.servingLabel) : 'servings'} value={servings} step={0.5} min={0.5} max={20} size="gym" onChange={setServings} />
        <Text style={styles.macro}>
          {Math.round(per.kcal * servings)} kcal · {Math.round(per.protein * servings)} g protein · {Math.round(per.carb * servings)} g carbs ·{' '}
          {Math.round(per.fat * servings)} g fat
        </Text>
        <PrimaryButton
          label={`Log to ${slot}`}
          size="gym"
          onPress={() => {
            if (food) logFood({ dateISO, mealSlot: slot, foodId: food.id, grams: servings * food.servingG });
            else if (recipe) logRecipe({ dateISO, mealSlot: slot, recipeId: recipe.id, servings });
            close();
          }}
        />
        <PrimaryButton label="Back" tone="ghost" style={styles.gap} onPress={() => { setFood(null); setRecipe(null); }} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={close} title={`Add to ${slot}`}>
      <ChipRow options={TABS} value={tab} onChange={setTab} fill={false} />
      <View style={styles.gap} />
      {tab === 'search' ? (
        <TextInput value={q} onChangeText={setQ} placeholder="Search foods" placeholderTextColor={color.textFaint} style={styles.input} autoFocus />
      ) : null}
      {(tab === 'frequent' || tab === 'search') &&
        list.map((f) => (
          <Pressable key={f.id} style={styles.item} onPress={() => { setFood(f); setServings(1); }}>
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.muted}>
              <Text style={styles.strong}>{Math.round(f.kcal)} kcal</Text>
              {'   '}
              {Math.round(f.protein)} g protein
              {'   '}
              {f.servingLabel ?? `${f.servingG} g`}
            </Text>
          </Pressable>
        ))}
      {tab === 'recipes' ? (
        recipes.length === 0 ? (
          <Text style={styles.muted}>Save a meal you make often under "New recipe".</Text>
        ) : (
          recipes.map((r) => (
            <Pressable key={r.id} style={styles.item} onPress={() => { setRecipe(r); setServings(1); }}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.muted}>{Math.round(getRecipeMacros(r.id).kcal)} kcal per serving</Text>
            </Pressable>
          ))
        )
      ) : null}
      {tab === 'newFood' ? <NewFood onCreated={(f) => { setFood(f); setServings(1); }} /> : null}
      {tab === 'newRecipe' ? <NewRecipe onCreated={(r) => { setRecipe(r); setServings(1); }} /> : null}
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
      <TextInput value={value} onChangeText={onChange} keyboardType={numeric ? 'decimal-pad' : 'default'} style={styles.input} />
    </View>
  );
}

function NewFood({ onCreated }: { onCreated: (f: Food) => void }) {
  const [f, setF] = useState({ name: '', servingLabel: '1 serving', servingG: '100', kcal: '', protein: '', carb: '', fat: '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <View>
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
        label="Save food"
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

function NewRecipe({ onCreated }: { onCreated: (r: Recipe) => void }) {
  const [name, setName] = useState('');
  const [servings, setServings] = useState(1);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ food: Food; grams: number }[]>([]);
  // Something to tap before you have typed anything. Requiring a search first made
  // the whole screen look broken when the search happened to match nothing.
  const results = useMemo(() => (q.trim() ? searchFoods(q, 8) : quickAddFoods(6)), [q]);
  const add = (f: Food) => { setItems((prev) => [...prev, { food: f, grams: f.servingG }]); setQ(''); };
  const blocker = !name.trim() ? 'Name the recipe to save it.' : items.length === 0 ? 'Add at least one ingredient.' : null;

  return (
    <View>
      <Field label="Recipe name" value={name} onChange={setName} numeric={false} />
      <Stepper label="Makes servings" value={servings} step={1} min={1} max={20} onChange={setServings} />
      <Text style={[styles.muted, styles.gap]}>
        {items.length === 0 ? 'Ingredients — none yet' : `Ingredients · ${items.length}`}
      </Text>
      {items.map((it, i) => (
        <View key={`${it.food.id}-${i}`} style={styles.pair}>
          <Text style={[styles.name, styles.flex]} numberOfLines={1}>
            {it.food.name}
          </Text>
          <View style={styles.flex}>
            <Stepper value={it.grams} step={10} min={0} max={2000} suffix="g" onChange={(g) => setItems(items.map((x, j) => (j === i ? { ...x, grams: g } : x)))} />
          </View>
        </View>
      ))}
      <TextInput value={q} onChangeText={setQ} placeholder="Search for an ingredient" placeholderTextColor={color.textFaint} style={styles.input} />
      {results.length === 0 ? (
        <Text style={[styles.muted, styles.gap]}>Nothing matches "{q.trim()}". Add it under New food first.</Text>
      ) : (
        results.map((f) => (
          <Pressable key={f.id} style={styles.item} onPress={() => add(f)} accessibilityRole="button" accessibilityLabel={`Add ${f.name}`}>
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.muted}>{f.servingLabel ?? `${f.servingG} g`}</Text>
          </Pressable>
        ))
      )}
      {/* Says what is missing instead of leaving a grey button and no explanation. */}
      {blocker ? <Text style={[styles.muted, styles.gap]}>{blocker}</Text> : null}
      <PrimaryButton
        label="Save recipe"
        size="gym"
        style={styles.gap}
        disabled={blocker !== null}
        onPress={() => onCreated(createRecipe(name, servings, items.map((it) => ({ foodId: it.food.id, grams: it.grams }))))}
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
  name: { ...font.body, color: color.text },
  strong: { color: color.text, fontWeight: '600' },
  muted: { ...font.caption, color: color.textMuted, marginTop: space.xs },
  macro: { ...font.label, ...font.numeric, color: color.textMuted, marginVertical: space.lg },
  gap: { marginTop: space.md },
  field: { flex: 1, marginTop: space.sm },
  pair: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  flex: { flex: 1 },
});
