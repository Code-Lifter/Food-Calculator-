// rules.js — Food-group tags, weekly rules, and the solver that spreads meals across the week.

// --- Tags & weekly rules ---
// Food-group tags come from what's actually in a meal
const FOOD_TAG_PATTERNS = [
  ['legume', /lentil|chickpea|beans?\b|hummus|edamame/i, /green beans?|coffee/i],
  ['oily-fish', /salmon|mackerel|sardine|trout|herring|kipper|pilchard|anchov/i],
  ['fish', /tuna|cod\b|haddock|pollock|prawn|shrimp|fish|salmon|mackerel|sardine|trout|herring|kipper|pilchard|anchov/i],
  ['red-meat', /beef|lamb|pork|steak|bacon|\bham\b|sausage|venison|chorizo/i],
  ['poultry', /chicken|turkey|duck/i],
  ['egg', /\beggs?\b/i],
  ['dairy', /milk|yog(h)?urt|cheese|cheddar|cream|(?<!peanut )butter|kefir|skyr|quark|whey/i]
];
const tagsForFood = name => FOOD_TAG_PATTERNS.filter(([, yes, no]) => yes.test(name) && !(no && no.test(name))).map(([tag]) => tag);

// A meal's tags: food groups from its ingredients
function mealTags(m) {
  const tags = new Set(m.items.flatMap(i => { const f = itemFood(i); return f ? tagsForFood(f.name) : []; }));
  if (isBatchMeal(m)) tags.add('batch');
  return [...tags];
}

// How the plan stands against each rule: main slots only, one count per filled slot
function ruleStats(plan = state.plan) {
  const uses = {}, tags = {};
  plan.forEach(day => mainSlots().forEach(([slot]) => {
    const m = mealById(day[slot]);
    if (!m) return;
    uses[m.id] = (uses[m.id] || 0) + 1;
    mealTags(m).forEach(t => { tags[t] = (tags[t] || 0) + 1; });
  }));
  const [topId, top] = Object.entries(uses).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const counts = Object.fromEntries(RULE_DEFS.map(def => [def.key, def.tag ? tags[def.tag] || 0 : top]));
  return { counts, topMeal: mealById(topId), filled: Object.values(uses).reduce((a, b) => a + b, 0) };
}

const PROTEIN_TAGS = ['legume', 'fish', 'red-meat', 'poultry', 'egg'];
const ruleMet = (def, count, target) => def.kind === 'min' ? count >= target : count <= target;

// Fills each main slot from `options` ({ breakfast: [{ id, tags, fit, batch, fridgeDays, freezes }], ... }) so every rule in `rules` holds.
// Greedy: each slot tries the candidate that best moves unmet quotas forward first, and only
// backtracks when the rest of the week could no longer meet a rule. Gives up after `budget` steps.
function solveWeek(options, rules, budget = 4000) {
  const slots = [];
  DAYS.forEach((_, d) => mainSlots().forEach(([slot]) => { if (options[slot] && options[slot].length) slots.push({ d, slot }); }));
  const uses = {}, tagCount = {}, pick = [];
  const tagRules = RULE_DEFS.filter(def => def.tag && rules[def.key] != null);
  const mins = tagRules.filter(def => def.kind === 'min');
  const maxes = tagRules.filter(def => def.kind === 'max');
  const cap = rules.maxRepeats ?? Infinity;
  const afterPrep = DAYS.map((_, d) => daysAfterPrep(d));
  let steps = 0;

  // Could the slots from i onwards still meet every minimum and fit within the repeat cap?
  function feasible(i) {
    const left = {};
    for (let j = i; j < slots.length; j++) left[slots[j].slot] = (left[slots[j].slot] || 0) + 1;
    for (const [type, n] of Object.entries(left)) {
      if (options[type].reduce((s, o) => s + Math.max(0, cap - (uses[o.id] || 0)), 0) < n) return false;
    }
    return mins.every(def => {
      const need = rules[def.key] - (tagCount[def.tag] || 0);
      if (need <= 0) return true;
      const room = Object.entries(left).reduce((s, [type, n]) => s + Math.min(n, options[type]
        .filter(o => o.tags.includes(def.tag))
        .reduce((t, o) => t + Math.max(0, cap - (uses[o.id] || 0)), 0)), 0);
      return need <= room;
    });
  }

  function place(i) {
    if (i === slots.length) return true;
    if (++steps > budget) return false;
    const { d, slot } = slots[i];
    const remaining = slots.length - i;
    const prev = d > 0 ? pick[i - mainSlots().filter(([s]) => options[s] && options[s].length).length] : null;
    const scored = options[slot]
      .filter(o => (uses[o.id] || 0) < cap && maxes.every(def => !o.tags.includes(def.tag) || (tagCount[def.tag] || 0) < rules[def.key]))
      .map(o => {
        const quota = mins.reduce((s, def) => {
          const need = rules[def.key] - (tagCount[def.tag] || 0);
          return s + (need > 0 && o.tags.includes(def.tag) ? 3 * need / remaining + 0.5 : 0);
        }, 0);
        // A batch already being cooked is worth eating again (not two days running); single meals rotate
        const again = uses[o.id] ? (o.tags.includes('batch') ? -0.3 : 0.2) : 0;
        // Mild nudge away from protein groups the week already has plenty of
        const spread = o.tags.filter(t => PROTEIN_TAGS.includes(t)).reduce((s, t) => s + 0.12 * (tagCount[t] || 0), 0);
        // A batch that doesn't freeze belongs inside its fridge window after the prep day (a strong preference, not a rule)
        const stale = o.batch && !o.freezes && afterPrep[d] > o.fridgeDays ? 3 : 0;
        return { o, score: 2 * o.fit + (prev && prev.id === o.id ? 1.5 : 0) + again + spread + stale - quota };
      })
      .sort((a, b) => a.score - b.score);
    for (const { o } of scored) {
      uses[o.id] = (uses[o.id] || 0) + 1;
      o.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
      pick[i] = o;
      if (feasible(i + 1) && place(i + 1)) return true;
      uses[o.id]--;
      o.tags.forEach(t => { tagCount[t]--; });
      if (steps > budget) return false;
    }
    return false;
  }

  if (!feasible(0) || !place(0)) return null;
  const plan = DAYS.map(() => ({}));
  slots.forEach(({ d, slot }, i) => { plan[d][slot] = pick[i].id; });
  return plan;
}

// Tries the rules as set; if no week fits, loosens them in RULE_DEFS order one step at a time,
// then tightens earlier ones back as far as the later change allows. Returns the plan and what was relaxed.
function planWithRules(options, rules) {
  const used = { ...rules };
  let plan = solveWeek(options, used);
  const loosened = [];
  for (const def of RULE_DEFS) {
    if (plan) break;
    if (used[def.key] == null) continue;
    const step = def.kind === 'max' ? 1 : -1;
    while (!plan && used[def.key] !== def.limit) {
      used[def.key] += step;
      plan = solveWeek(options, used);
    }
    if (used[def.key] !== rules[def.key]) loosened.push(def);
  }
  if (!plan) return { plan: null, relaxed: [] };
  loosened.slice(0, -1).forEach(def => {
    const step = def.kind === 'max' ? -1 : 1;
    while (used[def.key] !== rules[def.key]) {
      const tighter = solveWeek(options, { ...used, [def.key]: used[def.key] + step });
      if (!tighter) break;
      used[def.key] += step;
      plan = tighter;
    }
  });
  const relaxed = RULE_DEFS.filter(def => used[def.key] !== rules[def.key])
    .map(def => `${def.label.toLowerCase()} ${def.kind === 'max' ? 'up' : 'down'} to ${used[def.key]} (you set ${rules[def.key]})`);
  return { plan, relaxed };
}
