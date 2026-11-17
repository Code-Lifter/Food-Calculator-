// autofill.js — Auto-fill and portion fitting: sizes meals so each day hits its calories and macros.

// Portion sizes stay between these (same limits as the portion box) and round to 0.05
const SIZE_MIN = 0.25, SIZE_MAX = 3;
const roundSize = x => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(x * 20) / 20));
const snackCalsOf = day => day.snacks.reduce((s, id) => { const m = mealById(id); return s + (m ? portionTotals(m).cals : 0); }, 0);

// How far a day is from its targets, each as a share of its target. Calories come first (30×); then carbs
// and fat. Protein over its goal counts for less than under it: extra protein is the least harmful miss.
// Each macro's goal can be leaned up or down by the person (state.macroLean, the sliders on the Week tab),
// within MACRO_RANGE of the target. Past that range a steep extra cost pulls it back in.
const MISS_WEIGHTS = { cals: 30, protein: 1, carbs: 1, fat: 1 };
const PROTEIN_OVER_WEIGHT = 0.3, MACRO_RANGE = 0.2, RANGE_WEIGHT = 60;
const leanOf = k => (k === 'cals' ? 0 : Math.min(MACRO_RANGE, Math.max(-MACRO_RANGE, (state.macroLean || {})[k] || 0)));
// e = share over the plain target; lean = where the person wants it
// (unless the person has leaned protein down: then going over is a full miss)
const missWeight = (k, w, e, lean) => (k === 'protein' && lean >= 0 && e > lean ? PROTEIN_OVER_WEIGHT : w);
const outOfRange = (k, e) => (k === 'cals' ? 0 : e > MACRO_RANGE ? e - MACRO_RANGE : e < -MACRO_RANGE ? e + MACRO_RANGE : 0);
const missOf = (k, w, e, lean) => missWeight(k, w, e, lean) * (e - lean) ** 2 + RANGE_WEIGHT * outOfRange(k, e) ** 2;
// [key, plain target, weight, lean] for each goal that's set
function dayGoals(target) {
  const g = { cals: target, protein: state.daily.protein, carbs: state.daily.carbs, fat: state.daily.fat };
  return Object.keys(MISS_WEIGHTS).filter(k => g[k] > 0).map(k => [k, g[k], MISS_WEIGHTS[k], leanOf(k)]);
}
// The daily macro targets with the person's leans applied (what meal choice aims for)
const leanedDaily = () => ({ ...state.daily, ...Object.fromEntries(['protein', 'carbs', 'fat'].map(k => [k, (state.daily[k] || 0) * (1 + leanOf(k))])) });
function dayMiss(day, d, target) {
  const t = dayTotals(day, d);
  return dayGoals(target).reduce((c, [k, g, w, lean]) => c + missOf(k, w, t[k] / g - 1, lean), 0);
}

// The fitter never shrinks a main below half a portion (the portion box still allows a quarter)
const FIT_SIZE_MIN = 0.5;
// How strongly sizes are kept near each meal's share of the day, and ↕ amounts near their defaults.
// Small enough that hitting the targets always wins; they only stop silly answers (¼ chilli, 3× oats).
const SHARE_PULL = 0.3, RANGE_PULL = 0.002;

// Sizes every main and sets every ↕ range ingredient so the day lands on its calories and macros.
// A day's totals are linear in the levers (portion size scales the 🔗 part; ↕ grams add their own),
// so this solves for the best values directly instead of nudging: coordinate descent on the squared miss,
// then rounding to the grid people can weigh (0.05 portions, whole grams) and a last nudge on that grid.
// Snacks are eaten as they are. Returns false when the day has no main meals to size.
function fitMains(day, target, d) {
  const mains = mainSlots().map(([slot]) => slot).filter(slot => { const m = mealById(day[slot]); return m && portionTotals(m).cals > 0; });
  if (!target || !mains.length) return false;
  day.flex = {};
  day.sizes = {};
  const goals = dayGoals(target);
  const forMains = Math.max(0, target - snackCalsOf(day) - suppTotals(d).cals);
  const shareSum = mains.reduce((s, slot) => s + slotShare(slot), 0);

  // Levers: { per: totals per unit, lo, hi, step, x (value), pref (where it would rather be), pull, set }
  const levers = [];
  mains.forEach(slot => {
    const m = mealById(day[slot]);
    const items = slotItems(m, 1);
    const ratio = items.filter(p => p.mode === 'ratio');
    if (ratio.length) {
      const per = totalsOfSlot(ratio);
      const rest = totalsOfSlot(items.filter(p => p.mode !== 'ratio')).cals;
      const pref = per.cals > 0 ? Math.min(SIZE_MAX, Math.max(FIT_SIZE_MIN, (forMains * slotShare(slot) / shareSum - rest) / per.cals)) : 1;
      levers.push({ per, lo: FIT_SIZE_MIN, hi: SIZE_MAX, step: 0.05, x: pref, pref, pull: SHARE_PULL * (per.cals / target) ** 2,
        set: v => { if (Math.abs(v - 1) < 1e-9) delete day.sizes[slot]; else day.sizes[slot] = v; } });
    }
    m.items.filter(i => modeOf(i) === 'range').forEach(i => {
      const [lo, hi] = rangeOf(i);
      const f = itemFood(i);
      if (!f || hi <= lo) return;
      const per = Object.fromEntries(MACROS.map(([k]) => [k, (f[k] || 0) / 100]));
      const pref = clampRange(i, i.grams);
      levers.push({ per, lo, hi, step: 1, x: pref, pref, pull: RANGE_PULL / (hi - lo) ** 2,
        set: v => { (day.flex[slot] = day.flex[slot] || {})[i.foodId] = v; } });
    });
  });
  if (!levers.length) return true;

  // Everything that doesn't move (fixed items, snacks, supplements), from the day as it stands at the preferred values
  levers.forEach(l => l.set(l.x));
  const now = dayTotals(day, d);
  const base = Object.fromEntries(goals.map(([k]) => [k, now[k] - levers.reduce((s, l) => s + l.per[k] * l.x, 0)]));
  const err = () => goals.map(([k, g]) => (base[k] + levers.reduce((s, l) => s + l.per[k] * l.x, 0)) / g - 1);
  const cost = e => goals.reduce((c, [k, , w, lean], j) => c + missOf(k, w, e[j], lean), 0) + levers.reduce((c, l) => c + l.pull * (l.x - l.pref) ** 2, 0);

  // Exact minimum along one lever at a time, within its limits, until nothing moves
  let e = err();
  for (let sweep = 0; sweep < 400; sweep++) {
    let moved = 0;
    levers.forEach(l => {
      const a = goals.map(([k, g]) => l.per[k] / g);
      // Weights follow which side of each goal the day is on now (protein over counts less)
      const ws = goals.map(([k, , w, lean], j) => missWeight(k, w, e[j], lean));
      // …plus the steep part while a macro is outside its range
      const out = goals.map(([k], j) => outOfRange(k, e[j]));
      const den = ws.reduce((s, w, j) => s + (w + (out[j] ? RANGE_WEIGHT : 0)) * a[j] ** 2, 0) + l.pull;
      if (!(den > 0)) return;
      const num = ws.reduce((s, w, j) => s + w * (e[j] - goals[j][3]) * a[j] + RANGE_WEIGHT * out[j] * a[j], 0) + l.pull * (l.x - l.pref);
      const next = Math.min(l.hi, Math.max(l.lo, l.x - num / den));
      const dx = next - l.x;
      if (!dx) return;
      e = e.map((v, j) => v + a[j] * dx);
      l.x = next;
      moved = Math.max(moved, Math.abs(dx) / (l.hi - l.lo));
    });
    if (moved < 1e-7) break;
  }

  // Round to what can be weighed, then nudge on that grid while it helps
  levers.forEach(l => { l.x = Math.min(l.hi, Math.max(l.lo, Math.round(l.x / l.step) * l.step)); });
  let best = cost(err());
  for (let n = 0; n < 200; n++) {
    let better = false;
    for (const l of levers) for (const move of [l.step, -l.step, 4 * l.step, -4 * l.step]) {
      const was = l.x;
      const next = Math.min(l.hi, Math.max(l.lo, Math.round((was + move) / l.step) * l.step));
      if (next === was) continue;
      l.x = next;
      const c = cost(err());
      if (c < best - 1e-12) { best = c; better = true; } else l.x = was;
    }
    if (!better) break;
  }
  levers.forEach(l => l.set(+l.x.toFixed(2)));
  return true;
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
  const goal = macroShares(leanedDaily()), mine = macroShares(t);
  const mixOff = goal && mine ? mine.reduce((s, x, i) => s + Math.abs(x - goal[i]), 0) : 0;
  return 0.4 * sizeOff + 2 * mixOff;
}


// Applies a solved week to the plan (days with no meal for a slot stay empty), then balances each day
function fillPlan(picks, target, snacks) {
  state.plan = DAYS.map((_, d) => {
    const day = emptyDay();
    mainSlots().forEach(([slot]) => { if (picks[d][slot]) day[slot] = picks[d][slot]; }); // only the slots this person eats
    balanceDay(day, target, snacks, d);
    return day;
  });
}

// Swapping: could this meal go in this slot on day d? (its type, the repeat limit, and a batch that doesn't
// freeze staying inside its fridge life after prep)
const repeatCap = () => state.rules.maxRepeats ?? Infinity;
function mainUses(plan = state.plan) {
  const uses = {};
  plan.forEach(day => mainSlots().forEach(([slot]) => { if (day[slot]) uses[day[slot]] = (uses[day[slot]] || 0) + 1; }));
  return uses;
}
const keepsUntil = (m, d) => !isBatchMeal(m) || freezesOf(m) || daysAfterPrep(d) <= fridgeDaysOf(m);
const sameDay = day => JSON.parse(JSON.stringify(day));

// A copy of day d with one slot (or snack `idx`) swapped to meal `id`, re-fitted; and how far it misses
function trySwap(day, d, slot, idx, id, target) {
  const trial = sameDay(day);
  if (slot === 'snack') trial.snacks[idx] = id; else trial[slot] = id;
  if (target) fitMains(trial, target, d);
  return { day: trial, miss: target ? dayMiss(trial, d, target) : 0 };
}

// After auto-fill picks a week, tries other meals in each slot (and other snacks) and keeps any swap that
// brings the day clearly closer to its calories and macros, within the repeat limit. Two passes.
// With two people a shared main meal is swapped for both at once and judged on both people's days together;
// "own meal" slots, slots only one person has, and snacks are each person's own. `mains: 'rescue'`
// (🎲 Shuffle week) keeps the new layout and only swaps a main meal on days that can't reach their calories.
function improveWeek({ mains = true } = {}) {
  const who = everyone().filter(i => withPerson(i, () => state.daily.cals > 0));
  if (!who.length) return;
  const cap = repeatCap();
  const snacks = state.meals.filter(m => hasType(m, 'snack'));
  for (let pass = 0; pass < 2; pass++) {
    DAYS.forEach((_, d) => {
      // Each person's day and how far it misses
      const best = {};
      who.forEach(i => { best[i] = withPerson(i, () => ({ day: state.plan[d], miss: dayMiss(state.plan[d], d, state.daily.cals) })); });
      // 'rescue' only touches the main meals of a day that is still more than 3% off someone's calories
      const swapMains = mains === true || (mains === 'rescue'
        && who.some(i => withPerson(i, () => Math.abs(dayTotals(best[i].day, d).cals / state.daily.cals - 1) > 0.03)));
      if (swapMains) MAIN_SLOTS.forEach(([slot]) => {
        const holders = who.filter(i => slotsOf(i).includes(slot) && best[i].day[slot]);
        if (!holders.length) return;
        const together = !isSplit(d, slot) && holders.every(i => best[i].day[slot] === best[holders[0]].day[slot]);
        (together ? [holders] : holders.map(i => [i])).forEach(group => {
          const current = best[group[0]].day[slot];
          const underCap = m => group.every(i => withPerson(i, () => (mainUses(state.plan.map((x, n) => (n === d ? best[i].day : x)))[m.id] || 0) < cap));
          state.meals.filter(m => hasType(m, slot) && m.id !== current && keepsUntil(m, d) && underCap(m)).forEach(m => {
            const trial = group.map(i => withPerson(i, () => trySwap(best[i].day, d, slot, 0, m.id, state.daily.cals)));
            const now = group.reduce((s, i) => s + best[i].miss, 0);
            if (trial.reduce((s, t) => s + t.miss, 0) < now * 0.97) group.forEach((i, n) => { best[i] = trial[n]; });
          });
        });
      });
      who.forEach(i => withPerson(i, () => {
        const target = state.daily.cals;
        let mine = best[i];
        mine.day.snacks.forEach((_, idx) => {
          snacks.filter(m => !mine.day.snacks.includes(m.id)).forEach(m => {
            const t = trySwap(mine.day, d, 'snack', idx, m.id, target);
            if (t.miss < mine.miss * 0.97) mine = t;
          });
        });
        // A day that still can't get there (e.g. protein over its cap with calories short) may need an extra snack
        for (let extra = 0; extra < 2 && mine.day.snacks.length < MAX_SNACKS; extra++) {
          let add = null;
          snacks.filter(m => !mine.day.snacks.includes(m.id)).forEach(m => {
            const t = trySwap(mine.day, d, 'snack', mine.day.snacks.length, m.id, target);
            if (t.miss < (add || mine).miss * 0.9) add = t;
          });
          if (!add) break;
          mine = add;
        }
        state.plan[d] = mine.day;
      }));
    });
  }
}

// 🎲 on the Week tab: a different meal for one slot (or one snack), chosen from those that best fit the
// day once re-sized, with a little chance so pressing again gives something new. Each press skips meals
// it has already offered for that slot, until it runs out and starts over.
const rerollSeen = new Map();
function rerollSlot(d, slot, idx = 0) {
  const day = state.plan[d];
  const target = state.daily.cals;
  const current = slot === 'snack' ? day.snacks[idx] : day[slot];
  const key = `${d}|${slot}|${idx}`;
  const seen = rerollSeen.get(key) || new Set();
  seen.add(current);
  const uses = mainUses();
  const allowed = m => hasType(m, slot) && m.id !== current
    && (slot === 'snack' ? !day.snacks.includes(m.id) : (uses[m.id] || 0) < repeatCap() && keepsUntil(m, d));
  let pool = state.meals.filter(m => allowed(m) && !seen.has(m.id));
  if (!pool.length) { seen.clear(); seen.add(current); pool = state.meals.filter(allowed); }
  if (!pool.length) pool = state.meals.filter(m => hasType(m, slot) && m.id !== current); // over the repeat limit beats nothing
  if (!pool.length) { toast(`No other ${slot === 'snack' ? 'snacks' : 'meals'} to swap in — create another on the Meals tab`); return; }
  const tries = pool.map(m => ({ m, ...trySwap(day, d, slot, idx, m.id, target) })).sort((a, b) => a.miss - b.miss);
  // Mostly the best fit, sometimes the 2nd or 3rd, so a re-roll isn't always the same answer
  const top = tries.slice(0, Math.min(3, tries.length));
  const pick = top[Math.random() < 0.6 ? 0 : Math.floor(Math.random() * top.length)];
  seen.add(pick.m.id);
  rerollSeen.set(key, seen);
  state.plan[d] = pick.day;
  commit();
  const label = slot === 'snack' ? 'snack' : (MAIN_SLOTS.find(([s]) => s === slot) || [, slot])[1].toLowerCase();
  toast(`🎲 ${DAYS[d]} ${label}: ${pick.m.name}${target ? ' — portions re-fitted' : ''}`, { undoable: true });
}

const relaxedNote = relaxed => relaxed.length ? ` — couldn't meet every rule, so relaxed ${relaxed.join('; ')}` : '';

// Your own meals across the week, sized to the day; only the repeat limit applies here.
// Two people get the same main meals (chosen for how well they suit both), each sized for their own targets;
// someone with more meals a day gets the extra slots to themselves. Any "own meal" slots go back to shared.
// `shuffle` (🎲 Shuffle week) adds chance to the choice, so each press lays the week out differently.
const SHUFFLE_NOISE = 0.6;
function autoFill({ shuffle = false } = {}) {
  if (!state.meals.length) { toast('Create some meals first'); return; }
  const fitFor = (m, slot) => {
    const eats = everyone().filter(i => slotsOf(i).includes(slot));
    return eats.reduce((s, i) => s + withPerson(i, () => fitScore(portionTotals(m), slot, state.daily.cals)), 0) / eats.length
      + (shuffle ? Math.random() * SHUFFLE_NOISE : 0);
  };
  // The person with the most meals a day has every slot anyone eats, so the week is solved as them
  const most = everyone().reduce((a, i) => (slotsOf(i).length > slotsOf(a).length ? i : a), state.person);
  const { plan, relaxed } = withPerson(most, () => {
    const options = Object.fromEntries(mainSlots().map(([slot]) => [slot, state.meals.filter(m => hasType(m, slot)).map(m => ({
      id: m.id, tags: mealTags(m), fit: fitFor(m, slot),
      batch: isBatchMeal(m), fridgeDays: fridgeDaysOf(m), freezes: freezesOf(m)
    }))]));
    return planWithRules(options, { maxRepeats: state.rules.maxRepeats });
  });
  if (!plan) { toast('Could not fill the week — try fewer rules'); return; }
  const snacks = state.meals.filter(m => hasType(m, 'snack'));
  state.split = {};
  everyone().forEach(i => withPerson(i, () => fillPlan(plan, state.daily.cals, snacks)));
  improveWeek({ mains: shuffle ? 'rescue' : true });
  commit();
  const done = shuffle ? '🎲 Week shuffled' : 'Week filled';
  toast(`${done}${twoPeople() ? ' for both of you' : ''}${relaxed.length ? relaxedNote(relaxed) : shuffle ? ' — press again for another layout' : ' — tweak any day you like'}`, { undoable: true });
}
