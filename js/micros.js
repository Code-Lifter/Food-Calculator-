// micros.js — Micronutrient maths: totals with data coverage, per day and week averages, targets, upper-level warnings.

// --- Micronutrient maths ---
// A food's amount of a nutrient per 100 g, or null when it's unknown
const microOf = (food, k) => k === 'fibre' ? toNum(food.fibre) : food.micros ? toNum(food.micros[k]) : null;

// Like totalsOfSlot, for micronutrients. `coverage` is the share of the grams eaten that came from foods WITH
// a value for that nutrient. Grams rather than kcal: fruit and veg carry most of the vitamins and minerals but
// few calories, so a kcal share would call a day "covered" while its veg had no data at all.
function microTotals(parts) {
  const amount = {}, known = {};
  let grams = 0;
  parts.forEach(({ food, grams: g }) => {
    if (!food || !(g > 0)) return;
    grams += g;
    NUTRIENTS.forEach(([k]) => {
      const v = microOf(food, k);
      if (v == null) return;
      amount[k] = (amount[k] || 0) + v * g / 100;
      known[k] = (known[k] || 0) + g;
    });
  });
  const coverage = Object.fromEntries(NUTRIENTS.map(([k]) => [k, grams ? (known[k] || 0) / grams : 0]));
  return { amount, coverage, grams };
}
const dayParts = day => dayPortions(day).flatMap(p => slotItems(p.meal, p.size, p.flex));
// Supplements' micros on day d: amounts are per dose, one dose a day
function suppMicros(d) {
  const out = {};
  suppsOn(d).forEach(x => Object.entries(x.micros).forEach(([k, v]) => { out[k] = (out[k] || 0) + v; }));
  return out;
}
// Food and supplement amounts are kept apart so the bars can show both
function dayMicros(day, d) {
  const t = microTotals(dayParts(day));
  return { food: t.amount, supp: suppMicros(d), coverage: t.coverage };
}
// Daily average over the days with food planned. Supplements are averaged over the same days, so a half-planned
// week isn't swamped by a daily multivitamin.
function weekMicros() {
  const days = state.plan.map((day, d) => [day, d]).filter(([day]) => dayPortions(day).length);
  const n = days.length;
  const t = microTotals(days.flatMap(([day]) => dayParts(day)));
  const supp = {};
  days.forEach(([, d]) => Object.entries(suppMicros(d)).forEach(([k, v]) => { supp[k] = (supp[k] || 0) + v; }));
  const avg = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / n]));
  const kcal = n ? days.reduce((sumKcal, [day, d]) => sumKcal + dayTotals(day, d).cals, 0) / n : 0;
  return { days: n, food: n ? avg(t.amount) : {}, supp: n ? avg(supp) : {}, coverage: t.coverage, kcal };
}

// Targets for the person in step 1. Without complete stats: the adult male 19–50 values, and `assumed` says so.
function microTargets() {
  const { body } = bodyFromStats(state.stats);
  const sex = body ? body.sex : 'male';
  const age = body ? body.age : 31;
  const band = age >= 71 ? '71+' : age >= 51 ? '51-70' : '19-50';
  const targets = { ...NRV[sex][band] };
  if (age < 31) targets.magnesium = MAGNESIUM_19_30[sex];
  return { targets, sex, band, assumed: !body };
}

const fmtMicro = n => n < 1 ? (Math.round(n * 100) / 100).toLocaleString() : n < 10 ? fmt1(n) : fmt(n);

// Every day where food + supplements go over an upper level → [{ d, k, amount, text }]
function ulWarnings() {
  const out = [];
  state.plan.forEach((day, d) => {
    const m = dayMicros(day, d);
    Object.entries(UL).forEach(([k, limit]) => {
      const amount = (UL_SUPPLEMENTS_ONLY.has(k) ? 0 : m.food[k] || 0) + (m.supp[k] || 0);
      if (amount <= limit) return;
      const [, label, unit] = nutrient(k);
      out.push({ d, k, amount, text: `${label} ${fmtMicro(amount)} ${unit}${UL_SUPPLEMENTS_ONLY.has(k) ? ' from supplements' : ''} on ${DAYS[d].slice(0, 3)} — above the upper level (${fmtMicro(limit)} ${unit}). Check with a GP or pharmacist.` });
    });
  });
  return out;
}

// Grams of each food the week uses, for everyone in the house: each slot's portions' share of the batch
function plannedGrams() {
  const used = {};
  allPlans().forEach(({ plan, n }) => plan.forEach(day => dayPortions(day, n).forEach(({ meal, size, flex }) => slotItems(meal, size, flex).forEach(({ item: i, grams }) => {
    used[i.foodId] = (used[i.foodId] || 0) + grams;
  }))));
  return used;
}

// Portions of each meal the week eats (everyone's)
function mealCounts() {
  const counts = {};
  allPlans().forEach(({ plan, n }) => plan.forEach(day => dayPortions(day, n).forEach(({ meal, size }) => { counts[meal.id] = (counts[meal.id] || 0) + size; })));
  return counts;
}
