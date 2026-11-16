// render-ready.js — Step 5, Ready: box labels, storage/cooking/cost/today cards, shopping list, day by day.

// Calendar date of a plan day in the current week (Monday = 0; -1 = the Sunday before)
function planDate(d) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - todayIndex() + d);
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// One printable label per box: where it goes, what it is, when it's eaten, how much, when it was made
function labelsHtml() {
  const { preps, boxes } = storagePlan();
  return [...boxes].sort((a, b) => a.session - b.session || a.place.localeCompare(b.place) || a.d - b.d).map(b => `
    <div class="box-label">
      <span class="box-label-place">${b.place === 'freezer' ? 'FREEZER' : 'FRIDGE'}</span>
      <b class="box-label-name">${esc(b.meal.name)}</b>
      <span>${DAYS[b.d]} · ${b.label} · ${planDate(b.d)}</span>
      <span>≈ ${fmtWeight(b.weight)} cooked</span>
      <span>Made ${planDate(preps[b.session])}${b.place === 'over' ? ' · ⚠ past its fridge life' : ''}</span>
    </div>`).join('');
}

// Box counts, the busiest night for fridge space, and boxes that break their shelf life
function storageCard() {
  const { preps, boxes } = storagePlan();
  if (!boxes.length) return '';
  const count = place => boxes.filter(b => b.place === place).length;
  // A fridge box waits from its prep night until the night before it's eaten; a frozen one only that last night
  let peak = 0, peakNight = -1;
  for (let n = -1; n < DAYS.length - 1; n++) {
    const inFridge = boxes.filter(b => b.place === 'freezer' ? n === b.d - 1 : preps[b.session] <= n && n < b.d).length;
    if (inFridge > peak) { peak = inFridge; peakNight = n; }
  }
  const over = boxes.filter(b => b.place === 'over');
  const cell = (label, value, note) => `
    <div class="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50">
      <span class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">${label}</span>
      <span class="text-lg font-bold text-slate-100">${value}</span>
      ${note ? `<span class="block text-[11px] text-slate-400">${note}</span>` : ''}
    </div>`;
  return `
    <div class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-bold text-slate-100">📦 Boxes &amp; storage</h2>
        <button data-action="print-labels" class="no-print text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-1.5 px-3 rounded border border-slate-600 transition-colors">🏷️ Print box labels</button>
      </div>
      <p class="text-xs text-slate-400">${state.prep.mode === 'two'
        ? `Two prep days: Sunday, and ${DAYS[state.prep.second]} evening.`
        : 'One prep day on Sunday: boxes eaten after their fridge life go in the freezer.'}
        <button data-goto="target" class="no-print underline">Change prep style</button></p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        ${cell('Fridge boxes', count('fridge') + over.length, 'from the prep session')}
        ${cell('Freezer boxes', count('freezer'), count('freezer') ? 'thaw in the fridge the night before' : '')}
        ${cell('Most in the fridge', `${peak} at once`, `${peakNight < 0 ? 'Sunday' : DAYS[peakNight]} night`)}
      </div>
      ${over.length ? `<div class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">⚠ Past their fridge life and the meal doesn't freeze: ${over.map(b => `<b>${esc(b.meal.name)}</b> (${DAYS[b.d]} ${b.label.toLowerCase()}, ${b.after} days after prep)`).join(', ')}. Move them earlier in the week on the Week tab${state.prep.mode === 'two' ? '' : ', or switch to two prep days'}.</div>` : ''}
    </div>`;
}

function cookingCard() {
  const sessions = cookingSessions();
  if (!sessions.length) return '';
  const line = l => {
    const factor = cookedFactorOf(l.food);
    const cooked = l.group !== 'none' && l.group !== 'pantry' && factor !== 1 ? ` <span class="text-slate-400">(≈ ${fmtWeight(l.grams * factor)} cooked)</span>` : '';
    return `<li>${l.verb ? `${l.verb} ` : ''}<b>${fmtWeight(l.grams)}</b> ${esc(l.food.name)}${cooked}</li>`;
  };
  return `
    <div class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md space-y-3">
      <h2 class="text-lg font-bold text-slate-100">👩‍🍳 Cooking plan</h2>
      <p class="text-xs text-slate-400">What to cook in each session, added up across meals. Weights are raw.</p>
      ${sessions.map(session => `
        <div class="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50 space-y-2">
          <h3 class="font-bold text-slate-100">${session.title}</h3>
          ${PREP_GROUPS.map(([group, label]) => {
            const lines = Object.values(session.lines).filter(l => l.group === group).sort((a, b) => b.grams - a.grams);
            return lines.length ? `<div><p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">${label}</p><ul class="text-sm text-slate-200 list-disc pl-5">${lines.map(line).join('')}</ul></div>` : '';
          }).join('')}
          ${session.splits.length ? `<div><p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">📦 Then portion out</p><ul class="text-sm text-slate-200 list-disc pl-5">
            ${session.splits.map(s => `<li><b>${esc(s.meal.name)}</b>: ${esc(boxPlacesText(s.boxes))}</li>`).join('')}</ul></div>` : ''}
        </div>`).join('')}
    </div>`;
}

// Just today's meals
function todayCard() {
  const d = todayIndex();
  const day = state.plan[d];
  const target = state.daily.cals;
  const rows = dayPortions(day);
  const dt = dayTotals(day, d);
  const { boxes } = storagePlan();
  const boxAt = boxesBySlot(boxes);
  return `
    <div class="bg-gradient-to-r from-emerald-950/50 to-slate-800 p-5 rounded-xl border border-emerald-800/50 shadow-md space-y-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-lg font-bold text-slate-100">📍 Today · ${DAYS[d]}</h2>
        ${rows.length ? `<span class="text-sm font-bold ${statusColor(dt.cals, target)}">${statusMark(dt.cals, target)}${fmt(dt.cals)}${target ? ` / ${fmt(target)}` : ''} kcal · ${fmt(dt.protein)}g protein</span>` : ''}
      </div>
      ${rows.length ? `<ul class="divide-y divide-slate-700/60">${rows.map(({ key, label, meal: m, size, flex }) => {
        const t = slotTotals(m, size, flex);
        return `<li class="flex items-center justify-between gap-3 py-2">
          <span class="min-w-0"><span class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">${label}</span><b class="text-slate-100">${esc(m.name)}</b>${size !== 1 ? ` <span class="text-xs text-slate-400">· ${plural(size, 'portion')}</span>` : ''}${portionItemsHtml(m, size, flex, boxAt.get(`${d}|${key}`))}</span>
          <span class="text-sm text-slate-300 shrink-0 text-right">${fmt(t.cals)} kcal<br><span class="text-xs text-slate-400">${fmt(t.protein)}g protein</span></span>
        </li>`;
      }).join('')}</ul>` : '<p class="text-sm text-slate-400">Nothing planned for today yet.</p>'}
      ${thawHtml(boxes, d)}
      ${remindersHtml(eveningReminders(boxes, { thaw: false })[d])}
    </div>`;
}

function costCard() {
  const shop = shopCost();
  const supp = suppWeekCost();
  if (!shop.priced && !supp.priced) return '';
  const used = plannedGrams();
  let eaten = 0, unpriced = 0;
  Object.entries(used).forEach(([id, grams]) => {
    const f = foodById(id);
    const ppg = f && pricePerGram(f);
    if (ppg == null) unpriced++; else eaten += ppg * grams;
  });
  const meals = state.plan.reduce((n, day) => n + dayPortions(day).length, 0);
  const cell = (label, value, note) => `
    <div class="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50">
      <span class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">${label}</span>
      <span class="text-lg font-bold text-slate-100">${value}</span>
      ${note ? `<span class="block text-[11px] text-slate-400">${note}</span>` : ''}
    </div>`;
  return `
    <div class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md space-y-3">
      <h2 class="text-lg font-bold text-slate-100">💷 Cost</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${shop.priced ? `
        ${cell('This shop', money(shop.total), 'whole packs')}
        ${cell('Food eaten', money(eaten), 'this week')}
        ${cell('Per day', money(eaten / 7))}
        ${cell('Per meal', meals ? money(eaten / meals) : '—', meals ? `average of ${meals} meals & snacks` : 'plan your week first')}` : ''}
        ${supp.priced ? cell('💊 Supplements', money(supp.total), 'per week, on top of food') : ''}
      </div>
      <p class="text-xs text-slate-400">Rough supermarket prices. The shop costs more than the food eaten because packs are whole — leftovers (oil, oats, peanut butter) carry into next week.${shop.priced < shop.items || unpriced ? ' Foods without a price are left out.' : ''}</p>
    </div>`;
}

// Ready-tab shopping list for some foods; `suffix` keeps the top-up's ticks apart from the main shop's
function shopListHtml(foods, suffix, used) {
  return byAisle(foods).map(([label, list]) => `
    <div>
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 pt-1">${label}</h3>
      <ul class="divide-y divide-slate-700/60">
        ${list.map(f => {
          const key = f.id + suffix;
          const b = buyInfo(f);
          return `
          <li class="flex items-center gap-3 py-2">
            <input type="checkbox" data-action="toggle-check" data-id="${key}" ${state.checked[key] ? 'checked' : ''} class="w-5 h-5 accent-emerald-400 shrink-0" aria-label="Got ${esc(f.name)}">
            <span class="flex-1 ${state.checked[key] ? 'line-through text-slate-400' : 'text-slate-100'}">
              <b>${esc(f.name)}</b> — ${b.text ? `<b>${b.text}</b> <span class="text-xs text-slate-400">(${fmt(f.grams)}g)</span>` : `${fmt(f.grams)}g`}${f.have > 0 ? ` <span class="text-xs text-sky-300">· 🏠 ${countUnit(f) ? plural(Math.round(f.have / countUnit(f).grams * 10) / 10, countUnit(f).word) : fmtWeight(f.have)} at home</span>` : ''}
            </span>
            <span class="text-xs text-slate-400 shrink-0 text-right">${b.cost != null ? `${money(b.cost)}<br>` : ''}${fmt(f.cals * f.grams / 100)} kcal</span>
          </li>`;
        }).join('')}
      </ul>
    </div>`).join('');
}

// Foods fully covered by what's at home, listed under the shopping list
function atHomeNote() {
  const got = state.foods.filter(f => f.grams > 0 && haveOf(f) >= f.grams);
  if (!got.length) return '';
  return `<p class="text-xs text-slate-400 pt-2 border-t border-slate-700/60"><span class="text-sky-300 font-semibold">🏠 Already at home (${got.length}):</span> ${got.sort((a, b) => a.name.localeCompare(b.name)).map(f => esc(f.name)).join(', ')}. <button data-goto="stock" class="underline hover:text-slate-200">Change</button></p>`;
}

function renderSummary() {
  const wt = weekly(), pt = planTotals();
  const { main, topUp } = shopLists();
  const { boxes } = storagePlan();
  const boxAt = boxesBySlot(boxes);
  const evenings = eveningReminders(boxes, { thaw: false }); // freezer moves get tick boxes instead (thawHtml)
  const counts = mealCounts();
  const usedMeals = state.meals.filter(m => counts[m.id]);
  const card = 'bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md space-y-3';
  const used = plannedGrams();

  $('summary-content').innerHTML = `
    ${todayCard()}

    <div class="${card}">
      <h2 class="text-lg font-bold text-slate-100">Your week at a glance</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-xs sm:text-sm text-right whitespace-nowrap">
          <thead class="text-[11px] uppercase tracking-wider text-slate-400">
            <tr><th class="text-left font-semibold py-1"></th>${MACROS.map(([k, , label]) => `<th class="font-semibold py-1 pl-2"><span class="sm:hidden">${{ cals: 'kcal', protein: 'Prot', carbs: 'Carb', fat: 'Fat' }[k]}</span><span class="hidden sm:inline">${label}</span></th>`).join('')}</tr>
          </thead>
          <tbody class="divide-y divide-slate-700/60">
            <tr><td class="text-left py-1.5 text-slate-400">Target</td>${MACROS.map(([k, s]) => `<td class="font-bold">${fmt(wt[k])}${s === 'g' ? 'g' : ''}</td>`).join('')}</tr>
            <tr><td class="text-left py-1.5 text-slate-400">Meal plan</td>${MACROS.map(([k, s]) => `<td class="font-bold ${statusColor(pt[k], wt[k])}">${statusMark(pt[k], wt[k])}${fmt(pt[k])}${s === 'g' ? 'g' : ''}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>
    </div>

    ${microCard()}

    <div class="${card}">
      <h2 class="text-lg font-bold text-slate-100">🛒 Shopping list</h2>
      ${topUp.length ? '<h3 class="text-sm font-bold text-brand">Main shop — before prep 1 (Sunday)</h3>' : ''}
      ${main.length ? shopListHtml(main, '', used) : emptyNote('Nothing on your shopping list yet.')}
      ${topUp.length ? `
        <div class="pt-3 border-t border-slate-700/60 space-y-2">
          <h3 class="text-sm font-bold text-brand">🥬 Mid-week top-up — ${DAYS[state.prep.second]}, before prep 2</h3>
          <p class="text-xs text-slate-400">Short-life fresh food needed only for prep 2 or later fresh meals, so it's bought fresh.</p>
          ${shopListHtml(topUp, ':top', used)}
        </div>` : ''}
      ${atHomeNote()}
      ${suppShopHtml()}
    </div>

    ${costCard()}

    ${storageCard()}

    ${cookingCard()}

    <div class="${card}">
      <h2 class="text-lg font-bold text-slate-100">🍽️ Meals & snacks</h2>
      ${usedMeals.length ? Object.entries(MEAL_TYPES).map(([type, label]) => {
        const meals = usedMeals.filter(m => m.type === type);
        if (!meals.length) return '';
        return `<div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">${label}${type === 'snack' ? 's' : ''}</h3>
          <ul class="space-y-2">${meals.map(m => {
            const pt = portionTotals(m);
            const s = servingsOf(m);
            return `<li class="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50">
              <div class="flex justify-between gap-2"><b>${esc(m.name)}</b><span class="text-sm text-slate-400 shrink-0">${plural(counts[m.id], 'portion')} · ${fmt(pt.cals)} kcal each</span></div>
              <div class="text-xs text-slate-400">Per portion: ${macroLine(pt)}${portionCost(m) != null ? ` · ≈ ${money(portionCost(m))}` : ''}</div>
              ${s > 1 ? `<div class="text-xs text-slate-400">Batch makes ${plural(s, 'portion')} — this week needs ${plural(counts[m.id] / s, 'batch', 'batches')}</div>` : ''}
              <div class="text-sm text-slate-300 mt-1">${s > 1 ? '<span class="text-slate-400">Whole batch:</span> ' : ''}${m.items.map(ingredientText).filter(Boolean).join(' · ')}</div>
            </li>`;
          }).join('')}</ul>
        </div>`;
      }).join('') : emptyNote('Plan your week in step 4 to see your meals here.')}
    </div>

    <div class="${card}">
      <h2 class="text-lg font-bold text-slate-100">📅 Day by day — what to eat</h2>
      <p class="text-xs text-slate-400">Fresh meals list what to weigh out. Batch meals are one pre-portioned box each. 🌙 marks what to do that evening — tick off each 🧊 freezer → fridge move once it's done.</p>
      ${noThawNote(boxes)}
      <div class="space-y-2">
        ${state.plan.map((day, d) => {
          const dt = dayTotals(day, d);
          const row = (label, m, size = 1, flex = {}, box = null, extra = '') => `
            <div>
              <span class="text-slate-400">${label}:</span> ${m ? `${esc(m.name)}${size !== 1 ? ` <span class="text-slate-400">(${plural(size, 'portion')})</span>` : ''} <span class="text-xs text-slate-400">· ${fmt(slotTotals(m, size, flex).cals)} kcal</span>${portionItemsHtml(m, size, flex, box)}` : '<span class="text-slate-500">—</span>'}${extra}
            </div>`;
          return `<div class="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50">
            <div class="flex flex-wrap justify-between gap-x-2"><b>${DAYS[d]}</b><span class="text-sm font-semibold ${statusColor(dt.cals, state.daily.cals)}">${statusMark(dt.cals, state.daily.cals)}${fmt(dt.cals)} kcal <span class="font-normal text-slate-400">· ${macroLine(dt)}</span></span></div>
            <div class="text-sm text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-1">
              ${mainSlots().map(([slot, label]) => row(label, mealById(day[slot]), sizeOf(day, slot), flexOf(day, slot), boxAt.get(`${d}|${slot}`), suppLine(suppsOn(d).filter(x => x.timing === slot)))).join('')}
              ${day.snacks.map((id, i) => [mealById(id), i]).filter(([m]) => m).map(([m, i]) => row('Snack', m, 1, {}, boxAt.get(`${d}|snack${i}`))).join('') || row('Snacks', null)}
              ${otherSuppRows(d)}
            </div>
            ${thawHtml(boxes, d)}
            ${remindersHtml(evenings[d])}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}
