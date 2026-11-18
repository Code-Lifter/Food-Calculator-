// storage.js — Prep and storage: cooking sessions, boxes (fridge/freezer), freezer → fridge reminders.

// Spend = whole packs bought; eaten = what the plan uses, priced per gram
// How a meal's ingredient is prepared
function prepOf(meal, food) {
  const prep = meta(food).prep;
  return PREP_METHODS[prep] ? prep : '';
}

// Cooking sessions: the prep session(s) for meals that make several portions, then each day's cook-fresh meals.
// Lines are per food and method, summed across meals: "Boil 660g rice", not "rice for chilli, rice for bowls".
// With two prep days, each batch is split by the boxes each session fills, and prep 2 sits after that day's fresh cooking.
function cookingSessions() {
  const { preps, boxes } = storagePlan();
  const add = (session, meal, food, grams) => {
    if (!food || !(grams > 0)) return;
    const prep = prepOf(meal, food);
    const key = `${prep}|${food.name.toLowerCase()}`;
    session.lines[key] = session.lines[key] || { group: prep ? PREP_METHODS[prep][0] : 'none', verb: prep ? PREP_METHODS[prep][1] : '', food, grams: 0 };
    session.lines[key].grams += grams;
  };

  // Batches cook only their 🔗 ratio ingredients; 📌 fixed and ↕ range extras are added on the day
  const prepSessions = preps.map((_, i) => ({ title: `🗓️ ${prepTitle(i, preps)} — batch cooking`, lines: {}, splits: [] }));
  boxGroups(boxes).forEach(({ session, meal, boxes: group }) => {
    const portions = group.reduce((n, b) => n + b.size, 0);
    // 🍱 make-ahead meals cook every ingredient, box by box (each box keeps its own day's ↕ amounts)
    if (meal.prepAhead) group.forEach(b => slotItems(meal, b.size, b.flex).forEach(p => add(prepSessions[session], meal, p.food, p.grams)));
    else slotItems(meal, portions).filter(p => p.mode === 'ratio').forEach(p => add(prepSessions[session], meal, p.food, p.grams));
    prepSessions[session].splits.push({ meal, boxes: group });
  });

  const hasLines = session => Object.keys(session.lines).length > 0;
  const sessions = hasLines(prepSessions[0]) ? [prepSessions[0]] : [];
  DAYS.forEach((_, d) => {
    const session = { title: `${DAYS[d]}${d === todayIndex() ? ' · today' : ''}`, lines: {}, splits: [] };
    allPlans().forEach(({ plan, n }) => dayPortions(plan[d], n).forEach(({ meal, size, flex }) => slotItems(meal, size, flex)
      .filter(p => !meal.prepAhead && (servingsOf(meal) === 1 || p.mode !== 'ratio'))
      .forEach(p => { if (prepOf(meal, p.food)) add(session, meal, p.food, p.grams); })));
    if (hasLines(session)) sessions.push(session);
    if (preps.length > 1 && d === preps[1] && hasLines(prepSessions[1])) sessions.push(prepSessions[1]);
  });
  return sessions;
}

// What goes on the plate for one slot: each ingredient's raw grams, plus cooked weight where it changes
function portionItems(meal, size = 1, flex = {}) {
  return slotItems(meal, size, flex).map(p => {
    const factor = cookedFactorOf(p.food);
    return { food: p.food, mode: p.mode, raw: p.grams, cooked: factor !== 1 ? p.grams * factor : null };
  }).filter(p => p.raw > 0);
}
const portionItemText = p => `${p.food.name} ${fmt(p.raw)}g${p.cooked != null ? ` raw (≈${fmt(p.cooked)}g cooked)` : ''}`;
// Batch meals: the 🔗 part is one box from the batch (its cooked weight), extras are added on the day
function portionParts(meal, size, flex) {
  const items = portionItems(meal, size, flex);
  // 🍱 make-ahead: the whole portion is in the box
  if (meal.prepAhead) return { box: items.reduce((s, p) => s + (p.cooked ?? p.raw), 0) || null, extras: [] };
  if (servingsOf(meal) === 1) return { box: null, extras: items };
  const ratio = items.filter(p => p.mode === 'ratio');
  return { box: ratio.length ? ratio.reduce((s, p) => s + (p.cooked ?? p.raw), 0) : null, extras: items.filter(p => p.mode !== 'ratio') };
}
// `box` (from storagePlan) adds where a batch box comes from when it isn't simply the fridge
const portionItemsHtml = (meal, size, flex, box = null) => {
  const { box: boxWeight, extras } = portionParts(meal, size, flex);
  const where = !box || box.place === 'fridge' ? ''
    : box.place === 'freezer' ? ' · 🧊 from the freezer (thawed overnight)'
    : ` · <span class="text-amber-400">⚠ ${box.after} days after prep</span>`;
  const parts = [
    ...(boxWeight ? [`📦 One box of ≈ <b class="text-slate-300">${fmtWeight(boxWeight)}</b> from the batch${where}`] : []),
    ...extras.map(p => `${boxWeight ? '+ ' : ''}${esc(p.food.name)} <b class="text-slate-300">${fmt(p.raw)}g</b>${p.cooked != null ? ` raw (≈${fmt(p.cooked)}g cooked)` : ''}`)
  ];
  return parts.length ? `<div class="text-xs text-slate-400">${parts.join(' · ')}</div>` : '';
};

// --- Storage: prep sessions, batch boxes, fridge or freezer ---
// Prep 1 is the day before the plan starts (day -1, Sunday for a Monday start); "Two prep days" adds a session on the evening of state.prep.second.
// A box eaten on day d comes from the latest session before d, and has sat in the fridge d − (prep day) days by then.
const fridgeDaysOf = m => m.fridgeDays >= 1 ? Math.min(7, Math.round(m.fridgeDays)) : 3;
const freezesOf = m => m.freezes === true;
// Batch meals are cooked ahead (their 🔗 ratio part) and boxed; single portions are cooked fresh on the day
// Batch meals are cooked on a prep day and boxed: a multi-portion recipe with 🔗 ratio ingredients,
// or a 🍱 make-ahead meal (a one-portion recipe made for the whole week, each box holding everything)
const isBatchMeal = m => m.prepAhead === true || (servingsOf(m) > 1 && m.items.some(i => modeOf(i) === 'ratio'));
// The second session is the evening of one of the plan's days, never the last (nothing is left to cook for)
const lastSecondPrep = () => Math.max(0, DAYS.length - 2);
const twoPrepDays = () => state.prep.mode === 'two' && DAYS.length > 1;
const prepDays = () => twoPrepDays() ? [-1, Math.min(state.prep.second, lastSecondPrep())] : [-1];
const sessionFor = d => prepDays().reduce((best, day, i) => day < d ? i : best, 0);
const daysAfterPrep = d => d - prepDays()[sessionFor(d)];
const shortDay = d => d < 0 ? prepDayName().slice(0, 3) : dayShort(d);
const prepTitle = (i, preps) => preps.length > 1
  ? `Prep ${i + 1} — ${preps[i] < 0 ? `${prepDayName()}, before the week` : `${DAYS[preps[i]]} evening`}`
  : `Prep day — ${prepDayName()}, before the week`;
const STORAGE_PLACES = { fridge: 'fridge', freezer: 'freezer', over: "⚠ past fridge life, doesn't freeze" };

// Every batch box the week eats: which session cooks it, days from prep to plate, and where it waits:
// 'fridge' within its fridge life, 'freezer' after that if the meal freezes, otherwise 'over' (flagged, not blocked)
function storagePlan() {
  const preps = prepDays();
  const boxes = [];
  // One box per person per slot: `who` is whose box it is
  allPlans().forEach(({ who, plan, n }) => plan.forEach((day, d) => dayPortions(day, n).forEach(({ key, label, meal, size, flex }) => {
    if (!isBatchMeal(meal)) return;
    const session = sessionFor(d);
    const after = d - preps[session];
    const place = after <= fridgeDaysOf(meal) ? 'fridge' : freezesOf(meal) ? 'freezer' : 'over';
    boxes.push({ meal, d, key, label, size, flex, session, after, place, who, weight: portionParts(meal, size, flex).box || 0 });
  })));
  return { preps, boxes };
}
// The viewed person's boxes by day and slot (or person `who`'s)
const boxesBySlot = (boxes, who = state.person) => new Map(boxes.filter(b => b.who === who).map(b => [`${b.d}|${b.key}`, b]));
// " (Sam)" after a box when two people's boxes are listed together
const whoTag = b => (twoPeople() ? ` (${personName(b.who)})` : '');

// Boxes grouped by the session that cooks them and their meal → [{ session, meal, boxes }]
function boxGroups(boxes) {
  const groups = {};
  boxes.forEach(b => {
    const k = `${b.session}|${b.meal.id}`;
    (groups[k] = groups[k] || { session: b.session, meal: b.meal, boxes: [] }).boxes.push(b);
  });
  return Object.values(groups);
}

// "2 boxes fridge (Mon, Tue) · 2 boxes freezer (Thu, Sat) — each ≈ 450g cooked"; weights go per day when they differ
function boxPlacesText(boxes) {
  const weights = [...new Set(boxes.map(b => fmtWeight(b.weight)))];
  const twice = d => boxes.filter(b => b.d === d && b.who === boxes[0].who).length > 1;
  const when = b => `${shortDay(b.d)}${twice(b.d) ? ` ${b.label.toLowerCase()}` : ''}${whoTag(b)}${weights.length > 1 ? ` ≈${fmtWeight(b.weight)}` : ''}`;
  const parts = Object.entries(STORAGE_PLACES).map(([place, label]) => {
    const list = boxes.filter(b => b.place === place);
    return list.length ? `${plural(list.length, 'box', 'boxes')} ${label} (${list.map(when).join(', ')})` : '';
  }).filter(Boolean);
  return `${parts.join(' · ')}${weights.length === 1 ? ` — each ≈ ${weights[0]} cooked` : ' — cooked weights'}`;
}

// Evening reminders by the day they fall on: a frozen box moves to the fridge the night before it's eaten
function eveningReminders(boxes, { thaw = true } = {}) {
  const byDay = DAYS.map(() => []);
  const groups = {};
  boxes.filter(b => thaw && b.place === 'freezer').forEach(b => {
    const k = `${b.d}|${b.meal.id}`;
    (groups[k] = groups[k] || { d: b.d, meal: b.meal, n: 0 }).n++;
  });
  Object.values(groups).forEach(({ d, meal, n }) => byDay[d - 1].push(
    `Tonight: move ${DAYS[d]}'s ${n > 1 ? `${n} ${meal.name} boxes` : `${meal.name} box`} from freezer to fridge`));
  if (state.prep.mode === 'two' && boxes.some(b => b.session === 1)) byDay[state.prep.second].push('Tonight: prep session 2 — see the cooking plan');
  return byDay;
}
const remindersHtml = list => list.length
  ? `<div class="mt-2 text-xs text-sky-200 bg-sky-950/40 border border-sky-800/50 rounded-lg px-3 py-2 space-y-0.5">${list.map(r => `<div>🌙 ${esc(r)}</div>`).join('')}</div>` : '';

// Step 5, Day by day: tonight's freezer → fridge moves for the next day, one tick per meal
// (grouped by meal, listing the slots each box is for). Ticks live in state.checked['thaw:<day eaten>|<mealId>'].
function thawHtml(boxes, n) {
  const groups = {};
  boxes.filter(b => b.place === 'freezer' && b.d - 1 === n).forEach(b => {
    (groups[b.meal.id] = groups[b.meal.id] || { meal: b.meal, d: b.d, boxes: [] }).boxes.push(b);
  });
  const list = Object.values(groups);
  if (!list.length) return '';
  const tonight = n === todayIndex();
  return `
    <div class="mt-2 rounded-lg border px-3 py-2 space-y-2 ${tonight ? 'bg-sky-950/60 border-sky-500/70' : 'bg-sky-950/40 border-sky-800/50'}">
      <div class="text-xs font-semibold text-sky-200">🌙 ${DAYS[n]} night${tonight ? ' (tonight)' : ''}: 🧊 freezer → fridge for ${DAYS[n + 1]}</div>
      ${list.map(g => {
        const key = `thaw:${g.d}|${g.meal.id}`;
        const done = !!state.checked[key];
        const slots = g.boxes.map(b => `${b.label.toLowerCase()}${whoTag(b)}`).join(', ');
        const weights = [...new Set(g.boxes.map(b => fmtWeight(b.weight)))];
        return `<label class="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" data-action="toggle-check" data-id="${esc(key)}" ${done ? 'checked' : ''} class="w-5 h-5 mt-0.5 accent-emerald-400 shrink-0" aria-label="Moved ${esc(g.meal.name)} to the fridge">
          <span class="${done ? 'line-through text-slate-400' : 'text-slate-100'}">Move <b>${plural(g.boxes.length, 'box', 'boxes')} of ${esc(g.meal.name)}</b> to the fridge
            <span class="block text-xs ${done ? 'text-slate-500' : 'text-sky-200/80'}">For ${DAYS[g.d]}'s ${slots}${weights.length === 1 ? ` · each ≈ ${weights[0]} cooked` : ''}</span></span>
        </label>`;
      }).join('')}
    </div>`;
}

// Day by day, when there's nothing to thaw: say why, so the freezer → fridge reminders aren't a mystery
function noThawNote(boxes) {
  if (boxes.some(b => b.place === 'freezer')) return '';
  const planned = state.meals.filter(m => mealCounts()[m.id]);
  if (!planned.length) return '';
  const batches = planned.filter(isBatchMeal);
  const multi = planned.filter(m => servingsOf(m) > 1);
  const why = !batches.length && multi.length
    ? `${multi.map(m => esc(m.name)).join(', ')} ${multi.length > 1 ? 'make' : 'makes'} several portions but ${multi.length > 1 ? 'have' : 'has'} no 🔗 ratio ingredients, so there's nothing to batch cook`
    : !batches.length
    ? "every planned meal is cooked fresh on the day. Making a one-portion recipe in bulk (like burritos)? Edit it on the Meals tab and tick 🍱 Make ahead on prep day"
    : !batches.some(freezesOf)
      ? `none of your batch meals (${batches.map(m => esc(m.name)).join(', ')}) is set to 🧊 Freezes well — tick it in the meal editor`
      : state.prep.mode === 'two'
        ? 'with two prep days every box is eaten within its fridge life'
        : 'every box is eaten within its fridge life, so nothing needs the freezer';
  return `<p class="text-xs text-sky-200/80 bg-sky-950/30 border border-sky-800/40 rounded-lg px-3 py-2">🧊 No freezer → fridge moves this week: ${why}.</p>`;
}
