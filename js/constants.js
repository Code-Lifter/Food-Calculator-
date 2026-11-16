// constants.js — Fixed lists: storage key, days, meal slots and types, macros, micronutrients and their targets, supplement options.

const STORAGE_KEY = 'weekly_meal_planner_v2';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Main meal slots. How many a day is a setting (2–6): 2 = lunch + dinner, 3 = breakfast, lunch, dinner,
// 4–6 add Meal 4…6, which take any main meal
const MAIN_SLOTS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['meal4', 'Meal 4'], ['meal5', 'Meal 5'], ['meal6', 'Meal 6']];
const EXTRA_SLOTS = ['meal4', 'meal5', 'meal6'];
const MEALS_MIN = 2, MEALS_MAX = 6, MAX_SNACKS = 6;
const mainSlots = (n = state.mealsPerDay) => n === 2 ? MAIN_SLOTS.slice(1, 3) : MAIN_SLOTS.slice(0, n);
const MEAL_TYPES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const SPLIT = { breakfast: 0.25, lunch: 0.30, dinner: 0.35, snack: 0.10 };
// A meal can suit several slots; `type` is its main one (first ticked, in breakfast→snack order), `types` all of them.
// Meals saved before multi-type only have `type`.
const typesOf = m => (Array.isArray(m.types) && m.types.length ? m.types : [m.type]);
const hasType = (m, type) => EXTRA_SLOTS.includes(type) ? typesOf(m).some(t => t !== 'snack') : typesOf(m).includes(type);
// Share of the day's calories for a slot or meal type: the usual split with three meals, otherwise the
// mains share 90% evenly; snacks always get 10%
const slotShare = slot => slot === 'snack' ? SPLIT.snack
  : state.mealsPerDay === 3 && SPLIT[slot] ? SPLIT[slot] : (1 - SPLIT.snack) / state.mealsPerDay;
const typeBoxes = () => [...document.querySelectorAll('[data-mb-type]')];
const draftTypes = () => typeBoxes().filter(b => b.checked).map(b => b.value);
const setDraftTypes = types => typeBoxes().forEach(b => { b.checked = types.includes(b.value); });
const MACROS = [['cals', 'kcal', 'Calories'], ['protein', 'g', 'Protein'], ['carbs', 'g', 'Carbs'], ['fat', 'g', 'Fat']];

// --- Micronutrients (optional) ---
// [key, label, unit, group]. Foods store these per 100 g in f.micros, only for the keys someone typed,
// so a missing key means "unknown", never 0. Fibre was there first and stays in f.fibre.
const NUTRIENTS = [
  ['fibre', 'Fibre', 'g', 'label'], ['satFat', 'Saturated fat', 'g', 'label'], ['sugars', 'Sugars', 'g', 'label'], ['sodium', 'Sodium', 'mg', 'label'],
  ['calcium', 'Calcium', 'mg', 'minerals'], ['iron', 'Iron', 'mg', 'minerals'], ['magnesium', 'Magnesium', 'mg', 'minerals'],
  ['potassium', 'Potassium', 'mg', 'minerals'], ['zinc', 'Zinc', 'mg', 'minerals'],
  ['vitA', 'Vitamin A', 'µg', 'vitamins'], ['vitC', 'Vitamin C', 'mg', 'vitamins'], ['vitD', 'Vitamin D', 'µg', 'vitamins'],
  ['vitB12', 'Vitamin B12', 'µg', 'vitamins'], ['folate', 'Folate', 'µg', 'vitamins'],
  ['omega3', 'Omega-3 (EPA+DHA)', 'g', 'fats']
];
const NUTRIENT_GROUPS = [['label', 'On the label'], ['minerals', 'Minerals'], ['vitamins', 'Vitamins'], ['fats', 'Fats']];
const NUTRIENT_KEYS = new Set(NUTRIENTS.map(([k]) => k));
const nutrient = k => NUTRIENTS.find(([key]) => key === k);

// Daily targets for adults: Australian/NZ NHMRC Nutrient Reference Values (the RDI, or the AI where there's no RDI:
// fibre, potassium, vitamin D and omega-3). Check against eatforhealth.gov.au NRV tables before publishing.
// Magnesium here is the 31+ value; 19–30 year olds get MAGNESIUM_19_30 (see microTargets).
// Omega-3 is the AI for long-chain omega-3s (DHA + EPA + DPA): 160 mg for men, 90 mg for women.
const NRV = {
  male: {
    '19-50': { fibre: 30, calcium: 1000, iron: 8, magnesium: 420, potassium: 3800, zinc: 14, vitA: 900, vitC: 45, vitD: 5, vitB12: 2.4, folate: 400, omega3: 0.16 },
    '51-70': { fibre: 30, calcium: 1000, iron: 8, magnesium: 420, potassium: 3800, zinc: 14, vitA: 900, vitC: 45, vitD: 10, vitB12: 2.4, folate: 400, omega3: 0.16 },
    '71+': { fibre: 30, calcium: 1300, iron: 8, magnesium: 420, potassium: 3800, zinc: 14, vitA: 900, vitC: 45, vitD: 15, vitB12: 2.4, folate: 400, omega3: 0.16 }
  },
  female: {
    '19-50': { fibre: 25, calcium: 1000, iron: 18, magnesium: 320, potassium: 2800, zinc: 8, vitA: 700, vitC: 45, vitD: 5, vitB12: 2.4, folate: 400, omega3: 0.09 },
    '51-70': { fibre: 25, calcium: 1300, iron: 8, magnesium: 320, potassium: 2800, zinc: 8, vitA: 700, vitC: 45, vitD: 10, vitB12: 2.4, folate: 400, omega3: 0.09 },
    '71+': { fibre: 25, calcium: 1300, iron: 8, magnesium: 320, potassium: 2800, zinc: 8, vitA: 700, vitC: 45, vitD: 15, vitB12: 2.4, folate: 400, omega3: 0.09 }
  }
};
const MAGNESIUM_19_30 = { male: 400, female: 310 };
// Sodium is a limit to stay under (the NHMRC suggested dietary target), not a target to reach.
// Sat fat has no target; under 10% of energy is the usual guide.
const SODIUM_LIMIT = 2000, SAT_FAT_PCT = 10;
// Upper levels, only used for warnings. Vitamin A's UL is for preformed vitamin A (retinol), but food data rarely
// splits that out, so the total is compared and it may over-warn. Magnesium's UL applies to supplements only.
const UL = { iron: 45, zinc: 40, vitD: 80, calcium: 2500, vitA: 3000, magnesium: 350 };
const UL_SUPPLEMENTS_ONLY = new Set(['magnesium']);
// When less of the food (by weight) than this has data for a nutrient, its total is too patchy to trust
const COVERAGE_MIN = 0.7;

// --- Supplements (optional) ---
const DOSE_UNITS = ['g', 'mg', 'µg', 'capsule', 'scoop', 'ml'];
const TIMINGS = [['breakfast', 'With breakfast'], ['lunch', 'With lunch'], ['dinner', 'With dinner'], ['pre-training', 'Pre-training'],
  ['post-training', 'Post-training'], ['bed', 'Before bed'], ['any', 'Any time']];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
