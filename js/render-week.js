// render-week.js — Step 4, Week: weekly rules card and the plan (1–10 days from the chosen start day).

// Weekly food rules: same traffic light as the cards above — green met, amber at the limit or one short, red broken
function renderRules() {
  const { counts, topMeal, filled } = ruleStats();
  const tone = (def, count, target) => {
    if (!filled) return { ...TONES.none, words: 'nothing planned yet' };
    if (def.kind === 'max') {
      if (count > target) return { ...TONES.over, words: `${count - target} over the limit` };
      return count === target ? { ...TONES.close, words: 'at the limit' } : { ...TONES.room, words: 'within the limit' };
    }
    if (count >= target) return { ...TONES.room, words: 'met' };
    return { ...(target - count === 1 ? TONES.close : TONES.over), icon: '▼', words: `${target - count} short` };
  };
  $('plan-rules').innerHTML = `
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Weekly food rule <span class="normal-case font-normal">· breakfasts, lunches &amp; dinners · edit the limit</span></h3>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${RULE_DEFS.map(def => {
          const count = counts[def.key], target = state.rules[def.key];
          const t = tone(def, count, target);
          const detail = def.key === 'maxRepeats' && topMeal && count > 1 ? `<span class="block text-[10px] text-slate-400 truncate" title="${esc(topMeal.name)}">${esc(topMeal.name)}</span>` : '';
          return `
            <div class="p-2.5 rounded-lg border transition-colors duration-300 ${t.card}">
              <span class="block text-[11px] font-semibold text-slate-300/80 uppercase tracking-wider">${def.label}</span>
              <div class="flex flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
                <span class="text-lg font-bold ${t.text}">${t.icon ? `<span aria-hidden="true">${t.icon}</span> ` : ''}${count}${def.key === 'maxRepeats' ? '×' : ''}<span class="sr-only"> — ${t.words}</span></span>
                <label class="flex items-center gap-1 text-[10px] text-slate-400">${def.unit}
                  <input type="number" min="${def.key === 'maxRepeats' ? 1 : 0}" max="${def.key === 'maxRepeats' ? WEEK_DAYS_MAX * MEALS_MAX : 21}" step="1" value="${target}" data-action="set-rule" data-rule="${def.key}"
                    aria-label="${def.label}: ${def.unit}" class="w-11 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100 text-center focus:outline-none focus:border-brand">
                </label>
              </div>
              ${detail}
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// The macro sliders: lean each macro up to 20% above or below its target. Auto-fill, ⚖️ and 🎲 aim there.
const LEAN_MACROS = [['protein', 'Protein', 4], ['carbs', 'Carbs', 4], ['fat', 'Fat', 9]];
const leanWords = v => (v === 0 ? 'on target' : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`);
function leanKcal() {
  return LEAN_MACROS.reduce((s, [k, , kcal]) => s + kcal * (state.daily[k] || 0) * (state.macroLean[k] || 0), 0);
}
function leanNote() {
  const extra = Math.round(leanKcal());
  if (Math.abs(extra) < 40) return 'Calories stay on target, so leaning one macro up works best with another leaning down.';
  return `These leans add up to ${extra > 0 ? '+' : '−'}${Math.abs(extra)} kcal a day. Calories still win, so the planner will land somewhere between: ${extra > 0 ? 'lean something else down' : 'lean something else up'} to get closer.`;
}
function renderMacroLean() {
  const any = LEAN_MACROS.some(([k]) => state.macroLean[k]);
  $('macro-lean').innerHTML = `
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Macro balance <span class="normal-case font-normal">· aim each macro up to 20% above or below its target</span></h3>
        ${any ? '<button data-action="reset-lean" class="text-[11px] text-slate-400 hover:text-slate-200 underline">Reset</button>' : ''}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        ${LEAN_MACROS.map(([k, label]) => {
          const v = state.macroLean[k] || 0, base = state.daily[k] || 0;
          return `
            <label class="block p-2.5 rounded-lg border border-slate-700 bg-slate-900/40">
              <span class="flex items-baseline justify-between gap-2 text-[11px] font-semibold text-slate-300/80 uppercase tracking-wider">${label}
                <span class="normal-case text-xs font-bold ${v ? 'text-brand' : 'text-slate-300'}" data-lean-label="${k}">${leanWords(v)}${base ? ` · ${Math.round(base * (1 + v))} g` : ''}</span></span>
              <input type="range" min="-20" max="20" step="5" value="${Math.round(v * 100)}" data-action="set-lean" data-lean="${k}"
                aria-label="${label}: aim below or above target" aria-valuetext="${leanWords(v)}" class="w-full mt-1 accent-emerald-400 cursor-pointer">
              <span class="flex justify-between text-[10px] text-slate-500"><span>less</span><span>target</span><span>more</span></span>
            </label>`;
        }).join('')}
      </div>
      <p class="text-[11px] text-slate-400" id="lean-note">${leanNote()}</p>
    </div>`;
}

function renderPlan() {
  $('plan-left').innerHTML = leftCards(planTotals(), weekly());
  const mealNums = [];
  for (let n = MEALS_MIN; n <= MEALS_MAX; n++) mealNums.push(n);
  $('meals-per-day').innerHTML = `<span class="font-semibold uppercase tracking-wide text-slate-400">${twoPeople() ? `${esc(personName(state.person))}'s meals a day` : 'Meals a day'}</span>
    <div role="group" aria-label="Meals a day" class="flex bg-slate-900 rounded p-0.5 border border-slate-700 font-bold">
      ${mealNums.map(n => `<button data-action="set-meals-per-day" data-value="${n}" aria-pressed="${state.mealsPerDay === n}"
        class="px-2.5 py-1 rounded transition-colors ${state.mealsPerDay === n ? 'bg-emerald-500 text-slate-900' : 'text-slate-400 hover:text-white'}">${n}</button>`).join('')}
    </div>
    <span class="text-slate-400">${mainSlots().map(([, label]) => label).join(', ')} · plus 0–${MAX_SNACKS} snacks</span>`;
  renderRules();
  renderMacroLean();
  $('plan-people-note').innerHTML = twoPeople() ? `
    <p class="text-xs text-slate-300 bg-emerald-950/30 border border-emerald-800/50 rounded-lg px-3 py-2">👥 You're planning <b class="text-brand">${esc(personName(state.person))}</b>'s week. You both eat the same main meals unless you say otherwise: change one here and ${esc(personName(1 - state.person))}'s changes too, re-sized for them. Want different meals somewhere? Press <b>👥 Same</b> on that meal to make it <b>👤 Own</b>, then each pick your own. Meals a day, portion sizes, snacks and the macro balance are each person's own.</p>` : '';

  const target = state.daily.cals;
  const selectCls = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-brand';

  const counts = mealCounts();
  const plannedMissing = missingFoods(state.meals.filter(m => counts[m.id]));
  const { boxes } = storagePlan();
  const boxAt = boxesBySlot(boxes);
  const ul = ulWarnings();
  const over = boxes.filter(b => b.place === 'over');
  const storageNote = over.length ? `
      <div class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1 mb-2">
        <div>⚠ ${plural(over.length, 'box', 'boxes')} would sit in the fridge past their shelf life, and the meal doesn't freeze: ${over.map(b => `<b>${esc(b.meal.name)}</b> (${shortDay(b.d)} ${b.label.toLowerCase()}, ${b.after} days after prep)`).join(', ')}.</div>
        <div>Move ${over.length === 1 ? 'it' : 'them'} earlier in the week${state.prep.mode === 'two' ? '' : ', switch to two prep days in step 1'}, or re-run Auto-fill week.</div>
      </div>` : '';
  const missingNote = Object.keys(plannedMissing).length ? `
      <div class="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1 mb-2">
        <div>Planned meals use foods that aren't in your pantry, so they won't be on your shopping list: ${Object.values(plannedMissing).map(s => `<b>${esc(s.name)}</b>`).join(', ')}.</div>
        <button data-action="re-add-missing" class="underline font-semibold">Put them back in the pantry</button>
      </div>` : '';
  $('plan-warnings').innerHTML = missingNote + storageNote + (!state.meals.length
    ? emptyNote('No meals yet — create your own meals in step 3.') : '');

  // Phones see one day at a time; md+ sees the whole week
  const view = state.viewDay;
  $('day-picker').innerHTML = `
    <div class="flex items-center gap-1">
      <button data-action="view-day" data-day="${(view + DAYS.length - 1) % DAYS.length}" aria-label="Previous day" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">‹</button>
      <div class="grid gap-1 flex-1" style="grid-template-columns: repeat(${DAYS.length}, minmax(0, 1fr))" role="tablist" aria-label="Day">
        ${DAYS.map((name, d) => {
          const cals = dayTotals(state.plan[d], d).cals;
          const words = !cals ? 'nothing planned' : !target ? `${fmt(cals)} kcal` : tolerance(cals, target).words;
          return `<button data-action="view-day" data-day="${d}" role="tab" aria-selected="${d === view}" aria-label="${name}, ${words}"
            class="py-1.5 rounded-lg text-xs font-semibold ${d === view ? 'bg-brand text-slate-950' : 'bg-slate-800 text-slate-300 border border-slate-700'}">
            ${dayShort(d)}<span class="block mx-auto mt-1 w-1.5 h-1.5 rounded-full ${cals ? barColor(cals, target) : 'bg-slate-600'}"></span>
          </button>`;
        }).join('')}
      </div>
      <button data-action="view-day" data-day="${(view + 1) % DAYS.length}" aria-label="Next day" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">›</button>
    </div>`;

  const search = state.meals.length >= MEAL_SEARCH_AT;
  const miniBtn = 'bg-slate-700 hover:bg-slate-600 text-slate-200 py-1 px-2 rounded border border-slate-600 transition-colors';
  // A meal picker: a dropdown, or a search box once the meal list is long
  const picker = (d, slot, type, selected, emptyLabel) => {
    if (!search) {
      const action = slot === 'snack' ? 'add-snack' : 'set-slot';
      return `<select data-action="${action}" data-day="${d}" ${slot === 'snack' ? '' : `data-slot="${slot}"`} class="${selectCls} flex-1 min-w-0">${mealOptions(type, selected, emptyLabel)}</select>`;
    }
    const m = mealById(selected);
    return `
      <div class="relative flex-1 min-w-0">
        <input type="search" autocomplete="off" spellcheck="false" data-slot-search data-day="${d}" data-slot="${slot}" data-type="${type}"
          value="${m ? esc(m.name) : ''}" placeholder="🔍 ${emptyLabel}" role="combobox" aria-autocomplete="list" aria-expanded="false"
          aria-controls="pick-${d}-${slot}" aria-label="${DAYS[d]} ${slot}" class="${selectCls} placeholder-slate-500">
        <ul id="pick-${d}-${slot}" role="listbox" class="hidden absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-slate-900 border border-slate-600 rounded-lg shadow-xl"></ul>
      </div>
      ${m && slot !== 'snack' ? `<button data-action="clear-slot" data-day="${d}" data-slot="${slot}" class="shrink-0 text-slate-400 hover:text-rose-400 px-1" aria-label="Clear ${DAYS[d]} ${slot}">✕</button>` : ''}`;
  };

  $('plan-grid').innerHTML = state.plan.map((day, d) => {
    const dt = dayTotals(day, d);
    return `
      <div class="${d === view ? '' : 'hidden md:block'} bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-md space-y-3">
        <div class="flex items-baseline justify-between">
          <h3 class="font-bold text-slate-100">${DAYS[d]}${d === todayIndex() ? ' <span class="text-xs font-semibold text-brand">· today</span>' : ''}</h3>
          <span class="text-sm font-bold ${statusColor(dt.cals, target)}">${statusMark(dt.cals, target)}${fmt(dt.cals)}${target ? ` / ${fmt(target)}` : ''} kcal</span>
        </div>
        ${progressBar(dt.cals, target)}
        <div class="text-[11px] text-slate-400 flex gap-4">
          <span class="${statusColor(dt.protein, state.daily.protein)}">P: ${fmt(dt.protein)}${state.daily.protein ? `/${fmt(state.daily.protein)}` : ''}</span>
          <span class="${statusColor(dt.carbs, state.daily.carbs)}">C: ${fmt(dt.carbs)}${state.daily.carbs ? `/${fmt(state.daily.carbs)}` : ''}</span>
          <span class="${statusColor(dt.fat, state.daily.fat)}">F: ${fmt(dt.fat)}${state.daily.fat ? `/${fmt(state.daily.fat)}` : ''}</span>
        </div>
        ${mainSlots().map(([slot, label]) => {
          const size = sizeOf(day, slot);
          // Two people: is this meal shared, each person's own, or one the other person doesn't have?
          const other = twoPeople() ? 1 - state.person : -1;
          const theyEat = other >= 0 && slotsOf(other).includes(slot);
          const own = theyEat && isSplit(d, slot);
          const theirs = own ? mealById(planOf(other)[d][slot]) : null;
          const share = other < 0 ? '' : !theyEat
            ? `<span class="normal-case font-normal text-slate-500">· just ${esc(personName(state.person))}</span>`
            : `<button data-action="toggle-split" data-day="${d}" data-slot="${slot}" aria-pressed="${own}"
                title="${own ? `Each of you has your own ${label.toLowerCase()} today. Press to go back to the same meal for both.` : `You both eat the same ${label.toLowerCase()}. Press to pick different meals for this one.`}"
                class="normal-case font-semibold px-1.5 py-0.5 rounded border transition-colors ${own ? 'border-amber-600/70 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40' : 'border-slate-700 text-slate-400 hover:text-slate-200'}">${own ? '👤 Own' : '👥 Same'}</button>`;
          return `
          <div>
            <div class="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1"><span>${label}${day[slot] && size !== 1 ? ` <span class="normal-case text-brand">· ${plural(size, 'portion')}</span>` : ''}</span>${share}</div>
            ${own ? `<div class="mb-1 text-[11px] text-amber-200/80">${esc(personName(other))} has: <b>${theirs ? esc(theirs.name) : 'nothing picked'}</b></div>` : ''}
            ${(() => {
              // 👎 a meal someone eating it has marked as one they won't eat (picked by hand, or marked since)
              const m = mealById(day[slot]);
              const who = m ? [state.person, ...(theyEat && !own ? [other] : [])].filter(i => !eats(i, m)) : [];
              return who.length ? `<div class="mb-1 text-[11px] font-semibold text-rose-300">👎 ${who.map(i => `${esc(personName(i))} doesn't eat ${esc(wontEat(i, m))}`).join(' · ')}</div>` : '';
            })()}
            <div class="flex gap-2 items-center">
              ${picker(d, slot, slot, day[slot], search ? `pick a ${label.toLowerCase()}` : '— none —')}
              ${day[slot] ? `<input type="number" min="0.25" max="3" step="0.05" value="${size}" data-action="set-size" data-day="${d}" data-slot="${slot}"
                aria-label="${label} portions" title="Portions eaten"
                class="w-16 shrink-0 bg-slate-900 border border-slate-700 rounded-lg px-1 py-1.5 text-sm text-slate-100 text-center focus:outline-none focus:border-brand">
              <button data-action="reroll" data-day="${d}" data-slot="${slot}" title="Re-roll: swap in a different ${label.toLowerCase()} that fits the day" aria-label="Re-roll ${DAYS[d]} ${label}"
                class="shrink-0 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg px-2 py-1.5 text-sm transition-colors">🎲</button>` : ''}
            </div>
            ${(() => {
              const m = mealById(day[slot]);
              const picks = m ? slotItems(m, size, flexOf(day, slot)).filter(p => p.mode === 'range') : [];
              return picks.length ? `<div class="mt-1 text-[11px] text-slate-400">↕ ${picks.map(p => `${esc(p.food.name)} <b class="text-slate-300">${fmt(p.grams)}g</b>`).join(' · ')}</div>` : '';
            })()}
            ${(() => {
              const b = boxAt.get(`${d}|${slot}`);
              if (!b || b.place === 'fridge') return '';
              return b.place === 'freezer'
                ? `<div class="mt-1 text-[11px] text-sky-300">🧊 Freezer box · ${b.after} days after prep</div>`
                : `<div class="mt-1 text-[11px] font-semibold text-amber-300">⚠ ${b.after} days after prep — doesn't freeze (keeps ${plural(fridgeDaysOf(b.meal), 'day')})</div>`;
            })()}
          </div>`;
        }).join('')}
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Snacks <span class="normal-case font-normal">· ${day.snacks.length}/${MAX_SNACKS}</span></label>
          <div class="flex flex-wrap gap-1 mb-1">
            ${day.snacks.map((id, s) => {
              const m = mealById(id);
              const b = boxAt.get(`${d}|snack${s}`);
              const stale = b && b.place === 'over';
              const no = m ? wontEat(state.person, m) : '';
              return m ? `<span class="inline-flex items-center gap-1 text-xs bg-slate-700 border ${no ? 'border-rose-500' : stale ? 'border-amber-500' : 'border-slate-600'} rounded-full pl-2 pr-1 py-0.5"${no ? ` title="${esc(personName(state.person))} doesn't eat ${esc(no)}"` : stale ? ` title="${b.after} days after prep — doesn't freeze"` : ''}>${no ? '👎 ' : stale ? '⚠ ' : ''}${esc(m.name)}
                <button data-action="reroll" data-day="${d}" data-slot="snack" data-idx="${s}" class="hover:scale-110 transition-transform px-0.5" title="Re-roll this snack" aria-label="Re-roll snack ${esc(m.name)}">🎲</button>
                <button data-action="remove-snack" data-day="${d}" data-idx="${s}" class="text-slate-400 hover:text-rose-400 px-1" aria-label="Remove snack">✕</button></span>` : '';
            }).join('')}
          </div>
          ${day.snacks.length < MAX_SNACKS ? `<div class="flex gap-2 items-center">${picker(d, 'snack', 'snack', '', '+ add a snack')}</div>` : `<p class="text-[11px] text-slate-500">${MAX_SNACKS} snacks is the most for one day</p>`}
        </div>
        ${dayExtrasHtml(day, d, dt, ul)}
        <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-700/60 text-xs">
          ${d > 0 ? `<button data-action="same-as-yesterday" data-day="${d}" class="${miniBtn}">⇐ Same as ${dayShort(d - 1)}</button>` : ''}
          <button data-action="copy-to-weekdays" data-day="${d}" class="${miniBtn}">Copy to weekdays</button>
          <select data-action="swap-day" data-day="${d}" aria-label="Swap ${DAYS[d]} with another day" class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-300">
            <option value="">⇄ Swap with…</option>
            ${DAYS.map((name, i) => i === d ? '' : `<option value="${i}">${name}</option>`).join('')}
          </select>
          <button data-action="toggle-day-micros" data-day="${d}" aria-expanded="${openMicroDays.has(d)}" title="${DAYS[d]}'s vitamins and minerals" aria-label="${DAYS[d]}'s nutrients" class="${miniBtn}">🥗</button>
        </div>
      </div>`;
  }).join('');

  if (search) attachSlotSearches();
}

// Wires each slot's search box; picking a meal fills the slot (or adds the snack)
function attachSlotSearches() {
  $('plan-grid').querySelectorAll('[data-slot-search]').forEach(input => {
    const { day, slot, type } = input.dataset;
    const current = input.value;
    // Focusing clears the box so the list shows every meal; leaving puts the name back
    input.addEventListener('focus', () => {
      input.placeholder = current || input.placeholder;
      input.value = '';
    });
    input.addEventListener('blur', () => { input.value = current; });
    searchPicker({
      input,
      list: input.nextElementSibling,
      showAllOnEmpty: true,
      items: () => [...state.meals.filter(m => hasType(m, type)), ...state.meals.filter(m => !hasType(m, type))]
        .map(m => ({ name: m.name, cals: portionTotals(m).cals, tag: esc((hasType(m, type) ? '' : MEAL_TYPES[m.type]) + dislikeTag(m)).replace(/^ · /, ''), value: m.id })),
      emptyText: 'No meals match.',
      onPick: ({ value }) => {
        const plan = state.plan[day];
        if (slot === 'snack') { if (plan.snacks.length < MAX_SNACKS) plan.snacks.push(value); }
        else {
          plan[slot] = value;
          delete plan.sizes[slot];
          delete plan.flex[slot];
        }
        commit();
      }
    });
  });
}
