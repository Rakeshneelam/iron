/**
 * Nutrition. The PRD target is a normal day logged in under 30 seconds, so
 * repeatDay / repeatMeal / quickAddFoods are the primary paths and search is the
 * fallback. Food macros in the table are PER SERVING (`serving_g` grams).
 */
import { and, asc, desc, eq, gte, like, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import type { IntakeDay } from '@/engine/metabolic';
import { lastNDays, nowISO, todayISO } from '@/lib/date';
import { newId } from '@/lib/ids';

export type Food = typeof schema.food.$inferSelect;
export type Recipe = typeof schema.recipe.$inferSelect;
export type MealSlot = 'breakfast' | 'lunch' | 'snack' | 'dinner';
export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];

export interface Macros {
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fiber: number;
}

export interface DayEntry {
  id: string;
  mealSlot: MealSlot;
  label: string;
  servingLabel: string | null;
  grams: number;
  servings: number;
  macros: Macros;
  foodId: string | null;
  recipeId: string | null;
}

export const ZERO: Macros = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 };

function add(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carb: a.carb + b.carb, fat: a.fat + b.fat, fiber: a.fiber + b.fiber };
}

function scale(m: Macros, k: number): Macros {
  return { kcal: m.kcal * k, protein: m.protein * k, carb: m.carb * k, fat: m.fat * k, fiber: m.fiber * k };
}

function perServing(f: Food): Macros {
  return { kcal: f.kcal, protein: f.protein, carb: f.carb, fat: f.fat, fiber: f.fiber ?? 0 };
}

export function foodMacros(f: Food, grams: number): Macros {
  return scale(perServing(f), f.servingG > 0 ? grams / f.servingG : 0);
}

/* =============================== foods ================================== */

export function getFood(id: string): Food | undefined {
  return db.select().from(schema.food).where(eq(schema.food.id, id)).get();
}

export function searchFoods(q: string, limit = 30): Food[] {
  const term = q.trim();
  const base = db.select().from(schema.food);
  const filtered = term ? base.where(like(schema.food.name, `%${term}%`)) : base;
  return filtered.orderBy(desc(schema.food.timesUsed), asc(schema.food.name)).limit(limit).all();
}

/** The list reorders itself around what he actually eats. */
export function quickAddFoods(limit = 12): Food[] {
  return db.select().from(schema.food).orderBy(desc(schema.food.timesUsed), asc(schema.food.name)).limit(limit).all();
}

export function createFood(input: Omit<Food, 'id' | 'timesUsed' | 'isCustom'>): Food {
  const row: Food = { ...input, id: `custom-${newId()}`, isCustom: 1, timesUsed: 0 };
  db.insert(schema.food).values(row).run();
  return row;
}

export function updateFood(id: string, patch: Partial<Omit<Food, 'id'>>): void {
  db.update(schema.food).set(patch).where(eq(schema.food.id, id)).run();
}

/* ============================== recipes ================================= */

export function listRecipes(): Recipe[] {
  return db.select().from(schema.recipe).orderBy(desc(schema.recipe.timesUsed), asc(schema.recipe.name)).all();
}

export function createRecipe(name: string, servings: number, items: { foodId: string; grams: number }[]): Recipe {
  const row: Recipe = { id: newId(), name: name.trim() || 'Recipe', servings: servings > 0 ? servings : 1, timesUsed: 0 };
  db.transaction((tx) => {
    tx.insert(schema.recipe).values(row).run();
    for (const it of items) {
      if (it.grams > 0) tx.insert(schema.recipeItem).values({ id: newId(), recipeId: row.id, foodId: it.foodId, grams: it.grams }).run();
    }
  });
  return row;
}

/** Per-serving macros plus the grams one serving weighs. */
function recipeInfo(recipeId: string): { perServing: Macros; gramsPerServing: number; recipe: Recipe } | undefined {
  const recipe = db.select().from(schema.recipe).where(eq(schema.recipe.id, recipeId)).get();
  if (!recipe) return undefined;
  const items = db
    .select({ grams: schema.recipeItem.grams, food: schema.food })
    .from(schema.recipeItem)
    .innerJoin(schema.food, eq(schema.recipeItem.foodId, schema.food.id))
    .where(eq(schema.recipeItem.recipeId, recipeId))
    .all();
  const total = items.reduce((m, it) => add(m, foodMacros(it.food, it.grams)), ZERO);
  const totalGrams = items.reduce((g, it) => g + it.grams, 0);
  const n = recipe.servings > 0 ? recipe.servings : 1;
  return { perServing: scale(total, 1 / n), gramsPerServing: totalGrams / n, recipe };
}

export function getRecipeMacros(recipeId: string): Macros {
  return recipeInfo(recipeId)?.perServing ?? ZERO;
}

/* =============================== logging ================================ */

export function logFood(input: { dateISO: string; mealSlot: MealSlot; foodId: string; grams: number }): void {
  if (!(input.grams > 0)) return;
  db.transaction((tx) => {
    tx.insert(schema.mealLog)
      .values({ id: newId(), date: input.dateISO, mealSlot: input.mealSlot, foodId: input.foodId, recipeId: null, grams: input.grams, loggedAt: nowISO() })
      .run();
    tx.update(schema.food).set({ timesUsed: sql`${schema.food.timesUsed} + 1` }).where(eq(schema.food.id, input.foodId)).run();
  });
}

export function logRecipe(input: { dateISO: string; mealSlot: MealSlot; recipeId: string; servings: number }): void {
  const info = recipeInfo(input.recipeId);
  if (!info || !(input.servings > 0)) return;
  db.transaction((tx) => {
    tx.insert(schema.mealLog)
      .values({
        id: newId(),
        date: input.dateISO,
        mealSlot: input.mealSlot,
        foodId: null,
        recipeId: input.recipeId,
        grams: input.servings * info.gramsPerServing,
        loggedAt: nowISO(),
      })
      .run();
    tx.update(schema.recipe).set({ timesUsed: sql`${schema.recipe.timesUsed} + 1` }).where(eq(schema.recipe.id, input.recipeId)).run();
  });
}

export function updateEntryGrams(id: string, grams: number): void {
  if (grams > 0) db.update(schema.mealLog).set({ grams }).where(eq(schema.mealLog.id, id)).run();
}

export function deleteEntry(id: string): void {
  db.delete(schema.mealLog).where(eq(schema.mealLog.id, id)).run();
}

type EntryRow = { log: typeof schema.mealLog.$inferSelect; food: Food | null; recipe: Recipe | null };

function entriesBetween(from: string, to: string): EntryRow[] {
  return db
    .select({ log: schema.mealLog, food: schema.food, recipe: schema.recipe })
    .from(schema.mealLog)
    .leftJoin(schema.food, eq(schema.mealLog.foodId, schema.food.id))
    .leftJoin(schema.recipe, eq(schema.mealLog.recipeId, schema.recipe.id))
    .where(and(gte(schema.mealLog.date, from), lte(schema.mealLog.date, to)))
    .orderBy(asc(schema.mealLog.loggedAt))
    .all();
}

function toEntries(rows: EntryRow[]): (DayEntry & { date: string })[] {
  const recipeCache = new Map<string, ReturnType<typeof recipeInfo>>();
  const out: (DayEntry & { date: string })[] = [];
  for (const r of rows) {
    const { log } = r;
    if (r.food) {
      const servings = r.food.servingG > 0 ? log.grams / r.food.servingG : 0;
      out.push({
        id: log.id, date: log.date, mealSlot: log.mealSlot, label: r.food.name, servingLabel: r.food.servingLabel,
        grams: log.grams, servings, macros: foodMacros(r.food, log.grams), foodId: r.food.id, recipeId: null,
      });
    } else if (r.recipe) {
      if (!recipeCache.has(r.recipe.id)) recipeCache.set(r.recipe.id, recipeInfo(r.recipe.id));
      const info = recipeCache.get(r.recipe.id);
      const servings = info && info.gramsPerServing > 0 ? log.grams / info.gramsPerServing : 0;
      out.push({
        id: log.id, date: log.date, mealSlot: log.mealSlot, label: r.recipe.name, servingLabel: '1 serving',
        grams: log.grams, servings, macros: info ? scale(info.perServing, servings) : ZERO, foodId: null, recipeId: r.recipe.id,
      });
    }
  }
  return out;
}

/** Entries, totals and per-slot grouping from ONE joined query. */
export function getDay(dateISO: string): { entries: DayEntry[]; totals: Macros; bySlot: Record<MealSlot, DayEntry[]> } {
  const entries = toEntries(entriesBetween(dateISO, dateISO));
  const bySlot: Record<MealSlot, DayEntry[]> = { breakfast: [], lunch: [], snack: [], dinner: [] };
  let totals = ZERO;
  for (const e of entries) {
    bySlot[e.mealSlot].push(e);
    totals = add(totals, e.macros);
  }
  return { entries, totals, bySlot };
}

export function getDayTotals(dateISO: string): Macros {
  return getDay(dateISO).totals;
}

function copyEntries(fromISO: string, toISO: string, slot?: MealSlot): number {
  const src = db
    .select()
    .from(schema.mealLog)
    .where(slot ? and(eq(schema.mealLog.date, fromISO), eq(schema.mealLog.mealSlot, slot)) : eq(schema.mealLog.date, fromISO))
    .orderBy(asc(schema.mealLog.loggedAt))
    .all();
  if (src.length === 0) return 0;
  db.transaction((tx) => {
    for (const e of src) {
      tx.insert(schema.mealLog).values({ ...e, id: newId(), date: toISO, loggedAt: nowISO() }).run();
      if (e.foodId) tx.update(schema.food).set({ timesUsed: sql`${schema.food.timesUsed} + 1` }).where(eq(schema.food.id, e.foodId)).run();
      if (e.recipeId) tx.update(schema.recipe).set({ timesUsed: sql`${schema.recipe.timesUsed} + 1` }).where(eq(schema.recipe.id, e.recipeId)).run();
    }
  });
  return src.length;
}

/** One tap: yesterday's whole day onto today. Returns rows copied. */
export function repeatDay(fromISO: string, toISO: string): number {
  return copyEntries(fromISO, toISO);
}

export function repeatMeal(fromISO: string, slot: MealSlot, toISO: string): number {
  return copyEntries(fromISO, toISO, slot);
}

/* ============================ engine inputs ============================= */

/** Engine IntakeDay[] for days with at least one entry. Blank days are absent, never zero. */
export function intakeBetween(fromISO: string, toISO: string): IntakeDay[] {
  const byDate = new Map<string, Macros>();
  for (const e of toEntries(entriesBetween(fromISO, toISO))) byDate.set(e.date, add(byDate.get(e.date) ?? ZERO, e.macros));
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, m]) => ({ date, kcal: Math.round(m.kcal), proteinG: Math.round(m.protein) }));
}

export function intakeHistory(days = 28, endISO: string = todayISO()): IntakeDay[] {
  const dates = lastNDays(days, endISO);
  const first = dates[0];
  return first ? intakeBetween(first, endISO) : [];
}
