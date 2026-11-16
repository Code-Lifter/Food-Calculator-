// autofill.js — Auto-fill and portion fitting: sizes meals so each day hits its calories and macros.

// Portion sizes stay between these (same limits as the portion box) and round to 0.05
const SIZE_MIN = 0.25, SIZE_MAX = 3;
const roundSize = x => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(x * 20) / 20));
const snackCalsOf = day => day.snacks.reduce((s, id) => { const m = mealById(id); return s + (m ? portionTotals(m).cals : 0); }, 0);

// Sizes every breakfast, lunch and dinner so the day lands on its calorie target, then fine-tunes
// sizes and ↕ range ingredients for protein, carbs and fat. Snacks are eaten as they are.
// Returns false when the day has no main meals to size.
function fitMains(day, target, d) {
  const mains = mainSlots().map(([slot]) => slot).filter(slot => { const m = mealById(day[slot]); return m && portionTotals(m).cals > 0; });
  if (!target || !mains.length) return false;
  day.flex = {}; // range ingredients start from their defaults
  const meal = slot => mealById(day[slot]);
  const fixedCals = slot => slotTotals(meal(slot), 0).cals;          // fixed + range at default
  const ratioCals = slot => slotTotals(meal(slot), 1).cals - fixedCals(slot); // what one size step scales
  const slotCals = (slot, size) => fixedCals(slot) + ratioCals(slot) * size;
  // Supplement kcal (a whey shake) come off the day first, like snacks
  const forMains = Math.max(0, target - snackCalsOf(day) - suppTotals(d).cals);
  const shareSum = mains.reduce((s, slot) => s + slotShare(slot), 0);
  const sizes = Object.fromEntries(mains.map(slot => {
    const r = ratioCals(slot);
    return [slot, r > 0 ? (forMains * slotShare(slot) / shareSum - fixedCals(slot)) / r : 1];
  }));
  // Rounding and the size limits leave a gap: spread it over the meals that can still move
  for (let pass = 0; pass < 4; pass++) {
    mains.forEach(slot => { sizes[slot] = roundSize(sizes[slot]); });
    const gap = forMains - mains.reduce((s, slot) => s + slotCals(slot, sizes[slot]), 0);
    const movable = mains.filter(slot => ratioCals(slot) > 0 && (gap > 0 ? sizes[slot] < SIZE_MAX : sizes[slot] > SIZE_MIN));
    const movableCals = movable.reduce((s, slot) => s + ratioCals(slot) * sizes[slot], 0);
    if (Math.abs(gap) <= target * 0.01 || !movableCals) break;
    movable.forEach(slot => { sizes[slot] *= 1 + gap / movableCals; });
  }
  day.sizes = {};
  mains.forEach(slot => { const size = roundSize(sizes[slot]); if (size !== 1) day.sizes[slot] = size; });
  tuneDay(day, target, mains, d);
  return true;
}

// Small steps on each lever — portion sizes (0.05) and ↕ range ingredients (1–5g, within their limits) —
// keeping any step that brings the day closer to its calories and macros. Calories weigh most.
function tuneDay(day, target, mains, d) {
  const goal = state.daily;
  const levers = [];
  mains.forEach(slot => {
    const m = mealById(day[slot]);
    if (m.items.some(i => modeOf(i) === 'ratio')) levers.push({
      step: 0.05, lo: SIZE_MIN, hi: SIZE_MAX,
      get: () => sizeOf(day, slot),
      set: v => { v = Math.round(v * 20) / 20; if (v === 1) delete day.sizes[slot]; else day.sizes[slot] = v; }
    });
    m.items.filter(i => modeOf(i) === 'range').forEach(i => {
      const [lo, hi] = rangeOf(i);
      if (hi <= lo) return;
      levers.push({
        step: hi - lo >= 20 ? 5 : 1, lo, hi,
        get: () => clampRange(i, flexOf(day, slot)[i.foodId] ?? i.grams),
        set: v => { (day.flex[slot] = day.flex[slot] || {})[i.foodId] = Math.round(v); }
      });
    });
  });
  if (!levers.length) return;
  const miss = () => {
    const t = dayTotals(day, d);
    let c = 10 * ((t.cals - target) / target) ** 2;
    ['protein', 'carbs', 'fat'].forEach(k => { if (goal[k]) c += ((t[k] - goal[k]) / goal[k]) ** 2; });
    return c;
  };
  let best = miss();
  for (let n = 0; n < 300; n++) {
    let better = false;
    for (const l of levers) for (const move of [l.step, -l.step, 4 * l.step, -4 * l.step]) {
      const was = l.get();
      const next = Math.min(l.hi, Math.max(l.lo, was + move));
      if (next === was) continue;
      l.set(next);
      const c = miss();
      if (c < best - 1e-9) { best = c; better = true; } else l.set(was);
    }
    if (!better) break;
  }
}

// Brings a day to its calorie target: snacks up to their share of the day, then sizes the mains to fill the rest
function balanceDay(day, target, snacks, d) {
  if (!target) return;
  const hasMains = mainSlots().some(([slot]) => mealById(day[slot]));
  // Supplement kcal are already eaten, so snacks work from what's left
  const room = Math.max(0, target - suppTotals(d).cals);
  // With mains to size, snacks only take their ~10%; a day with no mains is filled with snacks
  const budget = hasMains ? room * SPLIT.snack * 1.3 : room * 1.03;
  for (let n = 0; n < 4; n++) {
    const have = snackCalsOf(day);
    if (have >= (hasMains ? room * SPLIT.snack * 0.6 : room * 0.95)) break;
    if (day.snacks.length >= MAX_SNACKS) break;
    const fits = snacks.filter(s => { const c = portionTotals(s).cals; return c > 0 && have + c <= budget; });
    if (!fits.length) break;
    day.snacks.push(fits[(d + n) % fits.length].id);
  }
  fitMains(day, target, d);
}

// Share of a meal's (or target's) energy from protein, carbs and fat
const macroShares = t => {
  const e = [t.protein * 4, t.carbs * 4, t.fat * 9];
  const total = e[0] + e[1] + e[2];
  return total > 0 ? e.map(x => x / total) : null;
};

// How well a meal suits a slot: a protein/carb/fat mix close to the daily target matters most
// (portions and ingredient amounts get adjusted anyway), with a mild pull towards meals near the right size
function fitScore(t, slot, target) {
  if (!target || !(t.cals > 0)) return 0;
  const sizeOff = Math.abs(Math.log(t.cals / (target * slotShare(slot))));
  const goal = macroShares(state.daily), mine = macroShares(t);
  const mixOff = goal && mine ? mine.reduce((s, x, i) => s + Math.abs(x - goal[i]), 0) : 0;
  return 0.4 * sizeOff + 2 * mixOff;
}


// Applies a solved week to the plan (days with no meal for a slot stay empty), then balances each day
function fillPlan(picks, target, snacks) {
  state.plan = DAYS.map((_, d) => {
    const day = emptyDay();
    Object.assign(day, picks[d]);
    balanceDay(day, target, snacks, d);
    return day;
  });
}

const relaxedNote = relaxed => relaxed.length ? ` — couldn't meet every rule, so relaxed ${relaxed.join('; ')}` : '';

// Your own meals across the week, sized to the day; only the repeat limit applies here
function autoFill() {
  if (!state.meals.length) { toast('Create some meals first'); return; }
  const target = state.daily.cals;
  const options = Object.fromEntries(mainSlots().map(([slot]) => [slot, state.meals.filter(m => hasType(m, slot)).map(m => ({
    id: m.id, tags: mealTags(m), fit: fitScore(portionTotals(m), slot, target),
    batch: isBatchMeal(m), fridgeDays: fridgeDaysOf(m), freezes: freezesOf(m)
  }))]));
  const { plan, relaxed } = planWithRules(options, { maxRepeats: state.rules.maxRepeats });
  if (!plan) { toast('Could not fill the week — try fewer rules'); return; }
  fillPlan(plan, target, state.meals.filter(m => hasType(m, 'snack')));
  commit();
  toast(`Week filled${relaxed.length ? relaxedNote(relaxed) : ' — tweak any day you like'}`, { undoable: relaxed.length > 0 });
}
