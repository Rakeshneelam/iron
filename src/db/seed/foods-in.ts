/**
 * Staple foods, in the units he actually thinks in. This table exists because
 * generic databases handle Indian home cooking badly — a roti in MyFitnessPal
 * ranges from 70 to 150 kcal depending on whose entry you tap, and dal has no
 * barcode. Seeding his real meals is what keeps daily logging under 30 seconds.
 *
 * Values are reasonable reference figures per the stated serving. They are
 * approximations for home cooking (oil and portion size vary a lot) — he should
 * correct them once against his own kitchen and then never think about it again.
 * Macros in grams, energy in kcal.
 */
export interface SeedFood {
  id: string;
  name: string;
  servingG: number;
  servingLabel: string;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fiber?: number;
}

export const FOODS_IN: SeedFood[] = [
  // ---- Grains
  { id: 'roti', name: 'Roti / Chapati (whole wheat)', servingG: 40, servingLabel: '1 roti', kcal: 110, protein: 3.5, carb: 20, fat: 2, fiber: 3 },
  { id: 'rice-cooked', name: 'Rice, cooked', servingG: 150, servingLabel: '1 cup', kcal: 195, protein: 4, carb: 43, fat: 0.4 },
  { id: 'idli', name: 'Idli', servingG: 40, servingLabel: '1 idli', kcal: 58, protein: 2, carb: 12, fat: 0.2 },
  { id: 'dosa', name: 'Dosa, plain', servingG: 80, servingLabel: '1 dosa', kcal: 133, protein: 3, carb: 20, fat: 4 },
  { id: 'poha', name: 'Poha', servingG: 200, servingLabel: '1 plate', kcal: 250, protein: 5, carb: 45, fat: 6 },
  { id: 'upma', name: 'Upma', servingG: 200, servingLabel: '1 plate', kcal: 270, protein: 6, carb: 42, fat: 8 },
  { id: 'oats-dry', name: 'Oats, dry', servingG: 40, servingLabel: '40 g', kcal: 152, protein: 5, carb: 27, fat: 3, fiber: 4 },

  // ---- Dals & legumes
  { id: 'dal-toor', name: 'Toor dal, cooked', servingG: 150, servingLabel: '1 katori', kcal: 145, protein: 8, carb: 22, fat: 3, fiber: 5 },
  { id: 'rajma', name: 'Rajma curry', servingG: 150, servingLabel: '1 katori', kcal: 175, protein: 8, carb: 25, fat: 5, fiber: 7 },
  { id: 'chole', name: 'Chole', servingG: 150, servingLabel: '1 katori', kcal: 200, protein: 8, carb: 27, fat: 7, fiber: 7 },
  { id: 'sambar', name: 'Sambar', servingG: 150, servingLabel: '1 katori', kcal: 120, protein: 5, carb: 17, fat: 4 },

  // ---- Protein
  { id: 'chicken-breast', name: 'Chicken breast, cooked', servingG: 100, servingLabel: '100 g', kcal: 165, protein: 31, carb: 0, fat: 3.6 },
  { id: 'chicken-curry', name: 'Chicken curry (home)', servingG: 200, servingLabel: '1 bowl', kcal: 300, protein: 26, carb: 8, fat: 18 },
  { id: 'egg-whole', name: 'Egg, whole', servingG: 50, servingLabel: '1 egg', kcal: 72, protein: 6.3, carb: 0.4, fat: 5 },
  { id: 'egg-white', name: 'Egg white', servingG: 33, servingLabel: '1 white', kcal: 17, protein: 3.6, carb: 0.2, fat: 0 },
  { id: 'paneer', name: 'Paneer', servingG: 100, servingLabel: '100 g', kcal: 296, protein: 20, carb: 4, fat: 22 },
  { id: 'curd', name: 'Curd / dahi', servingG: 150, servingLabel: '1 katori', kcal: 90, protein: 5, carb: 7, fat: 5 },
  { id: 'whey', name: 'Whey protein', servingG: 30, servingLabel: '1 scoop', kcal: 120, protein: 24, carb: 3, fat: 1.5 },
  { id: 'soya-chunks', name: 'Soya chunks, dry', servingG: 50, servingLabel: '50 g', kcal: 172, protein: 26, carb: 16, fat: 0.5 },
  { id: 'fish-curry', name: 'Fish curry', servingG: 200, servingLabel: '1 bowl', kcal: 250, protein: 25, carb: 6, fat: 14 },

  // ---- Fats & extras
  { id: 'ghee', name: 'Ghee', servingG: 10, servingLabel: '1 tsp', kcal: 90, protein: 0, carb: 0, fat: 10 },
  { id: 'peanut-butter', name: 'Peanut butter', servingG: 32, servingLabel: '2 tbsp', kcal: 190, protein: 8, carb: 6, fat: 16 },
  { id: 'almonds', name: 'Almonds', servingG: 28, servingLabel: '~23 nuts', kcal: 164, protein: 6, carb: 6, fat: 14, fiber: 3.5 },
  { id: 'milk-toned', name: 'Milk, toned', servingG: 200, servingLabel: '1 glass', kcal: 116, protein: 6.4, carb: 9.8, fat: 6 },
  { id: 'banana', name: 'Banana', servingG: 118, servingLabel: '1 medium', kcal: 105, protein: 1.3, carb: 27, fat: 0.4, fiber: 3 },
  { id: 'sabzi-mixed', name: 'Mixed vegetable sabzi', servingG: 150, servingLabel: '1 katori', kcal: 130, protein: 3, carb: 14, fat: 7, fiber: 4 },
];
