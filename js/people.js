// people.js — One or two people sharing a household: each has their own stats, targets, macro balance,
// supplements and week plan (portion sizes and snacks); the main meals are the same for both.

// The app works on one person at a time: state.stats / daily / plan / macroLean / supplements are the
// person being viewed (state.person). state.people holds everyone; stashPerson() copies the viewed
// person's fields back into it, and it runs before every save, snapshot and partner sync.
const PERSON_KEYS = ['stats', 'daily', 'plan', 'macroLean', 'supplements', 'mealsPerDay'];
const MAX_PEOPLE = 2;
const twoPeople = () => state.people.length > 1;
const personName = i => (state.people[i] && String(state.people[i].name || '').trim()) || `Person ${i + 1}`;
const everyone = () => state.people.map((_, i) => i);

function stashPerson() {
  const p = state.people[state.person];
  PERSON_KEYS.forEach(k => { p[k] = state[k]; });
}
function loadPerson(i) {
  state.person = i;
  PERSON_KEYS.forEach(k => { state[k] = state.people[i][k]; });
}
// Runs fn with person i as the one the app works on (their targets, plan, supplements), then switches back
function withPerson(i, fn) {
  if (i === state.person) return fn();
  const was = state.person;
  stashPerson();
  loadPerson(i);
  try { return fn(); } finally { stashPerson(); loadPerson(was); }
}
const planOf = i => (i === state.person ? state.plan : state.people[i].plan);
// Everyone's plan, for the things the household shares (shopping, boxes, cooking)
// `n` is that person's meals a day: pass it to dayPortions(day, n)
const allPlans = () => everyone().map(who => ({ who, plan: planOf(who), n: who === state.person ? state.mealsPerDay : state.people[who].mealsPerDay }));
const slotsOf = i => mainSlots(i === state.person ? state.mealsPerDay : state.people[i].mealsPerDay).map(([slot]) => slot);
// Two people normally eat the same main meal; a split slot is one where each has picked their own
const isSplit = (d, slot) => state.split[`${d}|${slot}`] === true;

// Everyone's supplements, for the shopping list and cost; `owner` is " (Sam)" when two people are listed together
const allSupplements = () => everyone().flatMap(i => (i === state.person ? state.supplements : state.people[i].supplements)
  .map(x => ({ ...x, owner: twoPeople() ? ` (${personName(i)})` : '' })));

// The person switch: step 1's inputs and every per-person view follow
function viewPerson(i) {
  if (i === state.person || !state.people[i]) return;
  stashPerson();
  loadPerson(i);
  fillInputs();
  save();
  renderAll();
}

const newPerson = name => {
  const base = defaultState();
  return { name, stats: base.stats, daily: base.daily, plan: emptyPlan(), macroLean: base.macroLean, supplements: [], mealsPerDay: state.mealsPerDay, dislikes: noDislikes() };
};

// By default everyone eats the same main meals. After a change to the viewed person's week, the other person's
// main slots are brought in line — except slots marked "own meal" (state.split) and slots only one of them has
// (different meals a day) — and any day that changed is re-sized for their own targets. Snacks stay theirs.
function syncPartners() {
  stashPerson();
  if (!twoPeople()) return;
  const mine = state.plan, mySlots = slotsOf(state.person);
  everyone().filter(i => i !== state.person).forEach(i => {
    const shared = slotsOf(i).filter(slot => mySlots.includes(slot));
    const dirty = [], refill = [];
    state.people[i].plan.forEach((day, d) => {
      let changed = false;
      shared.forEach(slot => {
        const id = mine[d][slot] || '';
        if (isSplit(d, slot) || (day[slot] || '') === id) return;
        // A meal they won't eat (👎) isn't copied: the slot becomes their own, and an empty one gets a meal they eat
        if (!eats(i, mealById(id))) {
          state.split[`${d}|${slot}`] = true;
          if (!day[slot] || !eats(i, mealById(day[slot]))) refill.push([d, slot]);
          return;
        }
        day[slot] = id;
        delete day.sizes[slot];
        delete day.flex[slot];
        changed = true;
      });
      day.snacks = day.snacks.filter(id => mealById(id));
      if (changed) dirty.push(d);
    });
    if (dirty.length || refill.length) withPerson(i, () => {
      refill.forEach(([d, slot]) => {
        const best = bestFor(state.plan[d], d, slot);
        if (best) { state.plan[d] = best.day; if (!dirty.includes(d)) dirty.push(d); }
      });
      if (state.daily.cals) dirty.forEach(d => fitMains(state.plan[d], state.daily.cals, d));
    });
  });
}

// Step 1's prep week: the plan starts on weekday `start` and runs `n` days. Everyone's plan keeps its days by
// position (day 1 stays day 1 when the start moves); added days start empty and dropped ones go
function setWeek(start, n) {
  const oldN = DAYS.length;
  stashPerson();
  state.week = { start, days: n };
  setWeekShape(start, n);
  state.people.forEach(p => {
    p.plan = DAYS.map((_, d) => p.plan[d] || emptyDay());
    // An every-day supplement stays every day; a picked set keeps the days still in the plan
    p.supplements.forEach(x => { x.days = x.days.length === oldN ? [...ALL_DAYS] : x.days.filter(d => d < n); });
  });
  Object.keys(state.split).forEach(k => { if (Number(k.split('|')[0]) >= n) delete state.split[k]; });
  if (n < 2) state.prep.mode = 'freezer';
  state.prep.second = Math.min(state.prep.second, lastSecondPrep());
  state.viewDay = Math.min(state.viewDay, n - 1);
  loadPerson(state.person);
}

// Empties everyone's week (a new week, or Clear)
function clearAllPlans() {
  stashPerson();
  state.people.forEach(p => { p.plan = emptyPlan(); });
  state.split = {};
  loadPerson(state.person);
}

// --- Rendering ---
// The switch under the status bar (two people only): whose targets, week and day-by-day are on screen
function renderPersonBar() {
  const bar = $('person-bar');
  bar.classList.toggle('hidden', !twoPeople());
  if (!twoPeople()) { bar.innerHTML = ''; return; }
  bar.innerHTML = `
    <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">👥 Viewing</span>
    <div class="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700 text-sm font-bold" role="group" aria-label="Person being viewed">
      ${everyone().map(i => `<button data-action="view-person" data-person="${i}" aria-pressed="${i === state.person}"
        class="px-3 py-1 rounded-md transition-colors max-w-[10rem] truncate ${i === state.person ? 'bg-brand text-slate-950' : 'text-slate-400 hover:text-white'}">${esc(personName(i))}</button>`).join('')}
    </div>
    <span class="text-[11px] text-slate-400 hidden sm:inline">Same meals for both · portions, snacks and targets are each person's own · 👎 on a food or meal keeps it off someone's plate</span>`;
}

// Step 1: one person or two, and their names
function renderPeople() {
  const on = 'bg-emerald-500 text-slate-900', off = 'text-slate-400 hover:text-white';
  $('people-card').innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-sm font-bold uppercase tracking-wider text-slate-400">Who's Eating?</h2>
        <p class="text-xs text-slate-400 mt-1">${twoPeople()
          ? 'Two people, one kitchen: the same meals and one shopping list, with portions sized for each of you.'
          : 'Planning for a couple or housemate too? Switch to 2 people: same meals, one shopping list, portions sized for each.'}</p>
      </div>
      <div class="flex bg-slate-900 rounded-lg p-1 border border-slate-700 text-xs font-bold" role="group" aria-label="Number of people">
        ${[1, 2].map(n => `<button data-action="set-people" data-value="${n}" aria-pressed="${state.people.length === n}"
          class="px-3 py-1 rounded-md transition-colors ${state.people.length === n ? on : off}">${n === 1 ? '1 person' : '2 people'}</button>`).join('')}
      </div>
    </div>
    ${twoPeople() ? `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      ${everyone().map(i => `
        <div class="p-3 rounded-lg border ${i === state.person ? 'border-brand bg-emerald-950/20' : 'border-slate-700 bg-slate-900/40'}">
          <label for="person-name-${i}" class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Person ${i + 1}</label>
          <div class="flex gap-2">
            <input id="person-name-${i}" data-person-name="${i}" value="${esc(state.people[i].name || '')}" placeholder="Name" maxlength="20" autocomplete="off"
              class="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-bold focus:outline-none focus:border-brand placeholder-slate-600">
            ${i === state.person
              ? '<span class="shrink-0 self-center text-xs font-semibold text-brand">Editing below ↓</span>'
              : `<button data-action="view-person" data-person="${i}" class="shrink-0 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-1.5 px-3 rounded-lg border border-slate-600 transition-colors">Edit their stats</button>`}
          </div>
          <span class="block text-[11px] text-slate-400 mt-1">${withPerson(i, () => (state.daily.cals ? `${fmt(state.daily.cals)} kcal · ${fmt(state.daily.protein)}g protein a day` : 'No targets yet'))}</span>
        </div>`).join('')}
    </div>
    <p class="text-xs text-slate-300">Everything below on this step — stats, daily targets and supplements — is for <b class="text-brand" data-person-label>${esc(personName(state.person))}</b>.</p>` : ''}`;
}
