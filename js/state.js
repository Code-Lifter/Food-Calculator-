// state.js — Aisles, tags, rules, the default state, and the live app variables (state, draft, undo stacks, view-only toggles).

// Supermarket aisles in walking order; frozen last so it stays cold
const CATEGORIES = [
  ['produce', '🥦 Produce'], ['meat & fish', '🥩 Meat & fish'], ['dairy', '🥛 Dairy & eggs'],
  ['dry goods', '🥫 Dry goods'], ['frozen', '🧊 Frozen'], ['other', '🛒 Other']
];
// Shown before prices; picked on the shopping list
const CURRENCIES = { AUD: '$', GBP: '£' };
const currencySymbol = () => CURRENCIES[state.currency] || '£';

// Meal tags: one vocabulary for the weekly rules and the UI
const TAGS = {
  legume: 'Legume', fish: 'Fish', 'oily-fish': 'Oily fish', 'red-meat': 'Red meat', poultry: 'Poultry',
  egg: 'Egg', dairy: 'Dairy', 'veg-forward': 'Veg-forward', quick: 'Quick (under 15 min)', batch: 'Batch', treat: 'Treat'
};

// Weekly food rules. They count breakfasts, lunches and dinners (not snacks); `tag` rules count meals carrying that tag.
// When a week can't meet them all, they're relaxed in this order.
const RULE_DEFS = [
  { key: 'maxRepeats', kind: 'max', label: 'Same meal repeats', unit: 'at most', limit: 7 * MEALS_MAX }
];
const DEFAULT_RULES = { maxRepeats: 2 };

// `sizes` holds portions eaten per main slot when it isn't 1 (e.g. { dinner: 1.1 })
const MEAL_SEARCH_AT = 20; // from this many meals, week slots use a search box instead of a dropdown
const todayIndex = () => (new Date().getDay() + 6) % 7; // Monday = 0
const cloneDay = day => JSON.parse(JSON.stringify(day));

const emptyDay = () => ({ breakfast: '', lunch: '', dinner: '', meal4: '', meal5: '', meal6: '', snacks: [], sizes: {}, flex: {} });
const emptyPlan = () => DAYS.map(emptyDay);
const emptyDraft = () => ({ id: null, items: [] });
const zero = () => ({ cals: 0, protein: 0, carbs: 0, fat: 0 });
const defaultState = () => ({
  stats: {
    gender: 'male', unit: 'kg', weight: '', height: '', age: '', job: 'desk', trainingHrs: '0',
    bfPct: '', fatPct: '25', goal: 'maintain', cutSpeed: 'standard', bulkSpeed: 'standard'
  },
  daily: zero(),
  foods: [],   // { id, name, grams, cals, protein, carbs, fat, … } — the pantry library; macros per 100g; grams = what the week plan uses
  meals: [],   // { id, name, type, types, servings, fridgeDays, freezes, items: [{ foodId, grams }] } — grams are for the whole batch
  plan: emptyPlan(),
  mealsPerDay: 3,
  supplements: [], // { id, name, dose, doseUnit, timing, days, servingsPerPack, pricePerPack, kcal, protein, carbs, fat, micros } — nutrition per dose
  checked: {},
  weightMode: 'raw', // how meal weights are shown and typed: 'raw' or 'cooked'
  energyUnit: 'kJ', // how the food form takes energy: 'kJ' (AU labels) or 'kcal'; foods always store kcal
  currency: 'GBP',
  viewDay: todayIndex(), // the day shown on phones in the week grid
  rules: { ...DEFAULT_RULES },
  stock: {}, // { foodId: grams already at home } — taken off the shopping list
  macroLean: { protein: 0, carbs: 0, fat: 0 }, // how far auto-fill aims each macro off its target (−0.2 … +0.2)
  prep: { mode: 'freezer', second: 2 }, // 'freezer' = one prep day (Sunday) + freezer; 'two' = Sunday and the evening of day `second`
  tab: 'target'
});

let state = defaultState();
let draft = emptyDraft();
let mbPicked = null;
let pendingDelete = null; // basket food id waiting for "Remove anyway"
let eraseArmed = false; // first click on Erase everything arms it for 4 seconds
let eraseTimer = null;
let pantryQuery = ''; // view-only: the pantry search box
let editingFoodId = null; // the food modal edits this food in place instead of adding one
let editingSuppId = null;
let microCardOpen = false; // view-only: the Ready tab's micronutrient card stays open across re-renders
let microView = 'avg'; // view-only: the micronutrient card shows the daily average ('avg') or the week total ('week')
const openMicroDays = new Set(); // Week tab days showing their 🥗 nutrients

// Undo/redo history: a snapshot of state after each commit (the open tab isn't part of it)
const HISTORY_LIMIT = 50;
let undoStack = [];
let redoStack = [];
let lastSnapshot = '';
let lastGroup = null;
let lastGroupAt = 0;
