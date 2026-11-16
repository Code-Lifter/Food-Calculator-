// helpers.js — Small helpers, loading/saving/migrating saved data, toasts, lookups, and meal/day/plan nutrition totals.

// --- Helpers ---
const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = n => Math.round(n).toLocaleString();
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const macroLine = t => `P ${fmt(t.protein)}g · C ${fmt(t.carbs)}g · F ${fmt(t.fat)}g`;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applyState(JSON.parse(raw));
  } catch (e) {}
}
function applyState(data) {
  const base = defaultState();
  state = { ...base, ...data, stats: { ...base.stats, ...data.stats }, daily: { ...base.daily, ...data.daily } };
  migrateStats(state.stats, data.stats || {});
  state.energyUnit = ['kJ', 'kcal'].includes(data.energyUnit) ? data.energyUnit : base.energyUnit;
  state.currency = CURRENCIES[data.currency] ? data.currency : base.currency;
  // Sessions saved before the meals-a-day setting had three
  const mpd = Number(data.mealsPerDay);
  state.mealsPerDay = Number.isInteger(mpd) && mpd >= MEALS_MIN && mpd <= MEALS_MAX ? mpd : base.mealsPerDay;
  // Sessions saved before supplements have none
  state.supplements = (Array.isArray(data.supplements) ? data.supplements : []).filter(x => x && typeof x === 'object').map(normaliseSupplement);
  // Saved daily targets stay as they are; they only change when Calculate is pressed
  // Sessions saved before the lock toggle keep the amounts people typed
  // Food lists written by hand or by other tools are read too: duplicate ids keep the first one
  const seen = new Set();
  state.foods = (Array.isArray(data.foods) ? data.foods : [])
    .filter(f => f && f.id != null && !seen.has(f.id) && seen.add(f.id))
    .map(f => normaliseFood({ ...f, locked: f.locked ?? true }));
  // Meals saved before batch cooking were a single portion; before storage planning they get the
  // defaults (3 days, doesn't freeze)
  state.meals = (Array.isArray(data.meals) ? data.meals : []).map(m => {
    return {
      ...m, servings: m.servings > 0 ? m.servings : 1,
      fridgeDays: m.fridgeDays >= 1 ? Math.min(7, Math.round(m.fridgeDays)) : 3,
      freezes: typeof m.freezes === 'boolean' ? m.freezes : false,
      prepAhead: m.prepAhead === true
    };
  });
  // Each ingredient's snapshot is refreshed from its basket food (meals saved before snapshots get one)
  state.meals.forEach(m => m.items.forEach(i => {
    const f = state.foods.find(f => f.id === i.foodId);
    if (f) i.snap = snapOf(f);
  }));
  const plan = Array.isArray(data.plan) && data.plan.length === DAYS.length ? data.plan : emptyPlan();
  state.plan = plan.map(d => ({ ...emptyDay(), ...d, snacks: Array.isArray(d.snacks) ? d.snacks : [], sizes: d.sizes || {}, flex: d.flex || {} }));
  // Sessions saved before weekly rules get the defaults; bad values fall back one by one
  state.rules = { ...DEFAULT_RULES };
  RULE_DEFS.forEach(({ key }) => {
    const n = Number(data.rules && data.rules[key]);
    if (Number.isFinite(n) && n >= 0) state.rules[key] = Math.round(n);
  });
  // Sessions saved before prep styles use one prep day; a bad second day falls back to Wednesday
  const prep = data.prep || {};
  const second = Number(prep.second);
  state.prep = { mode: prep.mode === 'two' ? 'two' : 'freezer', second: Number.isInteger(second) && second >= 0 && second <= 5 ? second : 2 };
}
// Other names for food fields (kcal, pack, price, unitWeight, simple aisle names) map onto this planner's
const ALT_AISLES = { protein: 'meat & fish', meat: 'meat & fish', fish: 'meat & fish', carbs: 'dry goods', fats: 'dry goods',
  pantry: 'dry goods', fruit: 'produce', veg: 'produce', vegetables: 'produce', extras: 'other' };
const toNum = v => typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
// Keeps known nutrient keys holding real, non-negative numbers; anything else is dropped (unknown, not 0)
function cleanMicros(m) {
  const out = {};
  if (m && typeof m === 'object') Object.entries(m).forEach(([k, v]) => {
    const n = toNum(v);
    if (NUTRIENT_KEYS.has(k) && n != null && n >= 0) out[k] = n;
  });
  return out;
}
// Supplements typed in by hand or saved by an older version: every field falls back to a safe default
function normaliseSupplement(x) {
  const num = (v, fallback) => { const n = toNum(v); return n != null && n >= 0 ? n : fallback; };
  return {
    id: x.id != null ? String(x.id) : uid(), name: String(x.name || 'Supplement'),
    dose: num(x.dose, 1) || 1, doseUnit: DOSE_UNITS.includes(x.doseUnit) ? x.doseUnit : 'g',
    timing: TIMINGS.some(([t]) => t === x.timing) ? x.timing : 'any',
    days: Array.isArray(x.days) ? [...new Set(x.days.map(Number))].filter(d => ALL_DAYS.includes(d)).sort((a, b) => a - b) : [...ALL_DAYS],
    servingsPerPack: num(x.servingsPerPack, 0) || null, pricePerPack: num(x.pricePerPack, null),
    kcal: num(x.kcal, 0), protein: num(x.protein, 0), carbs: num(x.carbs, 0), fat: num(x.fat, 0),
    micros: cleanMicros(x.micros)
  };
}
function normaliseFood(f) {
  const num = toNum;
  MACROS.forEach(([k]) => { if (k !== 'cals') f[k] = num(f[k]) ?? 0; });
  // Energy: cals, else kcal, else worked out from the macros
  f.cals = num(f.cals) ?? num(f.kcal) ?? 4 * f.protein + 4 * f.carbs + 9 * f.fat;
  delete f.kcal;
  if (f.packGrams == null && num(f.pack) > 0) f.packGrams = num(f.pack);
  if (f.pricePerPack == null && num(f.price) != null) f.pricePerPack = num(f.price);
  if (f.unitGrams == null && num(f.unitWeight) > 0) { f.unitGrams = num(f.unitWeight); f.unit = 'item'; }
  delete f.pack; delete f.price; delete f.unitWeight;
  if (['g', 'ml', 'kg', 'l'].includes(String(f.unit).toLowerCase())) delete f.unit; // a weight, not a count
  if (ALT_AISLES[f.category]) f.category = ALT_AISLES[f.category];
  // Micronutrients: only real numbers are kept, so a blank stays "unknown" rather than becoming 0
  if (f.fibre != null) { const n = num(f.fibre); if (n == null || n < 0) delete f.fibre; else f.fibre = n; }
  const micros = cleanMicros(f.micros);
  if (micros.fibre != null && f.fibre == null) f.fibre = micros.fibre;
  delete micros.fibre;
  if (Object.keys(micros).length) f.micros = micros; else delete f.micros;
  f.grams = num(f.grams) ?? 0;
  return f;
}
// Sessions saved before the job/training split and goal speeds: the old activity level maps to the
// nearest job + training hours, and an old Cut/Bulk becomes the standard speed
const OLD_ACTIVITY = { '1.2': ['desk', 0], '1.375': ['desk', 2], '1.55': ['onFeet', 3], '1.725': ['onFeet', 6], '1.9': ['manual', 5] };
function migrateStats(st, saved) {
  if (!JOB_PAL[saved.job]) {
    const [job, hrs] = OLD_ACTIVITY[String(parseFloat(saved.activity))] || ['desk', 0];
    st.job = job;
    if (saved.trainingHrs == null) st.trainingHrs = String(hrs);
  }
  delete st.activity;
  if (!['cut', 'maintain', 'bulk'].includes(st.goal)) st.goal = 'maintain';
  Object.keys(SPEEDS).forEach(g => { if (!SPEEDS[g].some(([v]) => v === st[`${g}Speed`])) st[`${g}Speed`] = 'standard'; });
  if (st.bfPct == null) st.bfPct = '';
  if (st.fatPct == null || st.fatPct === '') st.fatPct = '25';
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}

// `undoable` adds an Undo button that reverses the change this toast is about
let toastUndoDepth = -1;
function toast(msg, { undoable = false } = {}) {
  const t = $('toast');
  // An open modal sits above the page, so the toast moves inside it to stay visible
  const host = document.querySelector('dialog[open]') || document.body;
  if (t.parentNode !== host) host.appendChild(t);
  toastUndoDepth = undoable ? undoStack.length : -1;
  t.innerHTML = `<span>${esc(msg)}</span>${undoable ? '<button data-action="toast-undo" class="underline font-bold shrink-0">Undo</button>' : ''}`;
  t.classList.toggle('pointer-events-none', !undoable);
  t.classList.remove('opacity-0');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('opacity-0', 'pointer-events-none'), undoable ? 6000 : 1800);
}

const foodById = id => state.foods.find(f => f.id === id);
const mealById = id => state.meals.find(m => m.id === id);

function sum(a, b) {
  const t = zero();
  MACROS.forEach(([k]) => { t[k] = a[k] + b[k]; });
  return t;
}
function weekly() {
  const t = zero();
  MACROS.forEach(([k]) => { t[k] = state.daily[k] * 7; });
  return t;
}
// An ingredient's data: the basket food, or the snapshot kept on the meal if that food was removed
const itemFood = i => foodById(i.foodId) || i.snap || null;
const snapOf = f => ({
  name: f.name, ...Object.fromEntries(MACROS.map(([k]) => [k, f[k] || 0])),
  ...(f.fibre != null ? { fibre: f.fibre } : {}),
  ...(f.micros && Object.keys(f.micros).length ? { micros: { ...f.micros } } : {})
});
const mealsUsing = foodId => state.meals.filter(m => m.items.some(i => i.foodId === foodId));

// Keeps every meal's snapshot in step with its basket food
function refreshSnapshots() {
  [...state.meals, draft].forEach(m => m.items.forEach(i => {
    const f = foodById(i.foodId);
    if (f) i.snap = snapOf(f);
  }));
}

// Removed foods that meals still use: { foodId: snapshot }
function missingFoods(meals = state.meals) {
  const missing = {};
  meals.forEach(m => m.items.forEach(i => { if (!foodById(i.foodId) && i.snap) missing[i.foodId] = i.snap; }));
  return missing;
}

// Puts removed foods back in the basket under their old id, so meals link up again
function reAddFoods(missing) {
  Object.entries(missing).forEach(([id, snap]) => {
    const food = { id, name: snap.name, grams: 0, locked: false };
    MACROS.forEach(([k]) => { food[k] = snap[k] || 0; });
    if (snap.fibre != null) food.fibre = snap.fibre;
    if (snap.micros) food.micros = { ...snap.micros };
    state.foods.push(food);
  });
}

// A new food reuses the id of a removed one with the same name, relinking meals that kept it
function idForNewFood(name) {
  const key = String(name).toLowerCase();
  const match = Object.entries(missingFoods([...state.meals, draft])).find(([, snap]) => snap.name.toLowerCase() === key);
  return match ? match[0] : uid();
}

// How an ingredient behaves in its meal:
//  ratio — grams are for the whole batch; scales with the portion, always in step with the other ratio ingredients
//  fixed — grams per portion, the same however big the portion is (1 banana)
//  range — grams per portion, the planner picks anything from min to max (peanut butter 0–30g); grams is the default
const ITEM_MODES = {
  ratio: { icon: '🔗', label: 'Ratio', help: 'Locked to the other 🔗 ingredients; scales with the portion. Weight is for the whole batch.' },
  fixed: { icon: '📌', label: 'Fixed', help: 'Same amount every portion, whatever its size.' },
  range: { icon: '↕', label: 'Range', help: 'The planner picks an amount between min and max per portion to hit your targets.' }
};
const modeOf = i => ITEM_MODES[i.mode] ? i.mode : 'ratio';
const rangeOf = i => {
  const lo = Math.max(0, Number(i.min) || 0);
  const hi = Number(i.max) >= lo ? Number(i.max) : Math.max(lo, i.grams * 2);
  return [lo, hi];
};
const clampRange = (i, g) => { const [lo, hi] = rangeOf(i); return Math.min(hi, Math.max(lo, g)); };

function ingredientText(i) {
  const f = itemFood(i);
  if (!f) return '';
  const mode = modeOf(i);
  const amount = mode === 'range'
    ? `${fmt(shownGrams(f, rangeOf(i)[0]))}–${fmt(shownGrams(f, rangeOf(i)[1]))}g`
    : gramsText(f, i.grams);
  const tag = mode === 'ratio' ? '' : ` <span class="text-slate-500">${ITEM_MODES[mode].icon}${mode === 'fixed' ? ' each' : ''}</span>`;
  return `${esc(f.name)} ${amount}${tag}${!i.foodId || foodById(i.foodId) ? '' : ' <span class="text-amber-400">(not in basket)</span>'}`;
}

function totalsOf(items) {
  return items.reduce((t, i) => {
    const f = itemFood(i);
    if (f) MACROS.forEach(([k]) => { t[k] += (f[k] || 0) * i.grams / 100; });
    return t;
  }, zero());
}
const scaled = (t, factor) => Object.fromEntries(MACROS.map(([k]) => [k, t[k] * factor]));
const servingsOf = meal => meal.servings > 0 ? meal.servings : 1;
// What one slot eats, ingredient by ingredient (raw grams): 🔗 ratio items scale with `size`,
// 📌 fixed items don't, ↕ range items use the planner's pick from `flex` ({ foodId: grams }) or their default
function slotItems(meal, size = 1, flex = {}) {
  return meal.items.map(i => {
    const food = itemFood(i);
    if (!food) return null;
    const mode = modeOf(i);
    const grams = mode === 'ratio' ? i.grams / servingsOf(meal) * size
      : mode === 'fixed' ? i.grams
      : clampRange(i, flex[i.foodId] ?? i.grams);
    return { item: i, food, mode, grams };
  }).filter(Boolean);
}
const totalsOfSlot = parts => parts.reduce((t, p) => {
  MACROS.forEach(([k]) => { t[k] += (p.food[k] || 0) * p.grams / 100; });
  return t;
}, zero());
const slotTotals = (meal, size = 1, flex = {}) => totalsOfSlot(slotItems(meal, size, flex));
const portionTotals = meal => slotTotals(meal); // one standard portion
const mealTotals = meal => scaled(portionTotals(meal), servingsOf(meal)); // whole batch, extras included
const sizeOf = (day, slot) => day.sizes && day.sizes[slot] > 0 ? day.sizes[slot] : 1;
const flexOf = (day, slot) => (day.flex && day.flex[slot]) || {};
// Every filled slot of a day: main slots can be resized and have range picks, snacks are one standard portion
// `key` names the slot within the day (snacks by position), so storage can find each box
const dayPortions = day => [
  ...mainSlots().map(([slot, label]) => ({ slot, key: slot, label, meal: mealById(day[slot]), size: sizeOf(day, slot), flex: flexOf(day, slot) })),
  ...day.snacks.map((id, i) => ({ slot: 'snack', key: `snack${i}`, label: 'Snack', meal: mealById(id), size: 1, flex: {} }))
].filter(p => p.meal);
// Supplements taken on day d (Mon = 0) add their kcal and macros. d is the day's index; without it only food counts.
const suppsOn = d => d == null ? [] : state.supplements.filter(x => x.days.includes(d));
const suppTotals = d => suppsOn(d).reduce((t, x) => ({ cals: t.cals + x.kcal, protein: t.protein + x.protein, carbs: t.carbs + x.carbs, fat: t.fat + x.fat }), zero());
const dayTotals = (day, d) => sum(dayPortions(day).map(p => slotTotals(p.meal, p.size, p.flex)).reduce(sum, zero()), suppTotals(d));
const planTotals = () => state.plan.map(dayTotals).reduce(sum, zero());
const basketTotals = () => totalsOf(state.foods.map(f => ({ foodId: f.id, grams: f.grams })));
