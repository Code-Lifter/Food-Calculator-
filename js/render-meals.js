// render-meals.js — Step 3, Meals: the meal builder (portion targets, ingredients) and the meal cards.

function draftServings() {
  const n = parseFloat($('mb-servings').value);
  return n > 0 ? n : 1;
}

// Raw/cooked switch: a cooked-mode mistake is a 2-3× calorie error, so cooked mode is loud everywhere it applies.
// A small switch beside the Ingredients heading; the amber warning only appears in cooked mode.
function renderWeightMode() {
  const cooked = isCooked();
  const btn = (value, label) => `
    <button data-action="set-weight-mode" data-value="${value}" aria-pressed="${state.weightMode === value}"
      class="px-2.5 py-1 rounded-md font-semibold transition-colors ${state.weightMode === value ? (value === 'cooked' ? 'bg-amber-400 text-slate-950' : 'bg-emerald-500 text-slate-900') : 'text-slate-400 hover:text-white'}">${label}</button>`;
  $('weight-mode').innerHTML = `
    <div class="flex items-center gap-2 text-xs" title="Raw/dry weights are the most accurate; cooked factors are approximate.">
      <span class="text-slate-400">Weights are</span>
      <div class="flex bg-slate-900 rounded-lg p-0.5 border ${cooked ? 'border-amber-500' : 'border-slate-700'}" role="group" aria-label="Raw or cooked weights">
        ${btn('raw', '🥩 Raw')}${btn('cooked', '🍳 Cooked')}
      </div>
    </div>`;
  $('weight-mode-note').innerHTML = cooked ? `
    <p class="text-xs text-amber-200 bg-amber-950/40 border border-amber-600/70 rounded-lg px-3 py-2">⚠️ <b>Cooked weights:</b> type what you weigh <b>after</b> cooking. Rice, pasta, meat and fish are converted back to raw for calories and shopping (rice ×2.9, pasta ×2.2, chicken ×0.73).</p>` : '';
  const batch = draftServings() > 1;
  $('mb-grams-label').textContent = `${batch ? 'Batch g' : 'Grams'}${cooked ? ' cooked' : ''}`;
  $('mb-grams-label').className = `block text-[11px] font-semibold uppercase tracking-wide mb-1 ${cooked ? 'text-amber-400' : 'text-brand'}`;
  $('mb-grams').className = `w-full bg-slate-900 border rounded-lg px-3 py-2 text-slate-100 focus:outline-none ${cooked ? 'border-amber-500 focus:border-amber-400' : 'border-brand/50 focus:border-brand'}`;
}

// Portions & storage: one line saying what will actually happen to this meal, and the fridge/freezer
// settings dimmed when they don't apply (they stay editable)
function renderMealStorage() {
  const servings = draftServings();
  const prepAhead = $('mb-prep-ahead').checked;
  const batch = isBatchMeal({ servings, prepAhead, items: draft.items });
  const days = Math.min(7, Math.max(1, Math.round(parseFloat($('mb-fridge').value)) || 3));
  const freezes = $('mb-freezes').checked;
  ['mb-fridge-field', 'mb-freezes-field'].forEach(id => $(id).classList.toggle('mb-muted', !batch));
  const [tone, text] = !batch
    ? ['slate', servings > 1
      ? 'Makes several portions, but has no 🔗 Ratio ingredients, so nothing is batch cooked. Each portion is made fresh on the day.'
      : "Cooked fresh on the day, so fridge and freezer settings aren't used. Making a lot at once? Tick 🍱 Make ahead, or set more portions."]
    : freezes
      ? ['sky', `${prepAhead ? 'Made' : 'Batch cooked'} on prep day. Boxes eaten within ${plural(days, 'day')} stay in the fridge; later ones go in the freezer, with a 🌙 reminder the night before to move them to the fridge.`]
      : ['amber', `${prepAhead ? 'Made' : 'Batch cooked'} on prep day and kept in the fridge. Boxes eaten more than ${plural(days, 'day')} after prep get a ⚠ warning: tick 🧊 Freezes well if it can be frozen.`];
  const tones = { slate: 'text-slate-400 bg-slate-900/60 border-slate-700/50', sky: 'text-sky-200 bg-sky-950/40 border-sky-800/50', amber: 'text-amber-200 bg-amber-950/30 border-amber-700/50' };
  $('mb-storage-hint').className = `text-xs rounded-lg px-3 py-2 border ${tones[tone]}`;
  $('mb-storage-hint').textContent = text;
}

// Protein per meal: spread evenly over the mains (each at least ≈0.4 g/kg of reference weight, but never
// more than the day split evenly) instead of by calorie share; the snack gets whatever is left
function mealProteinTarget(type) {
  const daily = state.daily.protein;
  if (!daily) return 0;
  const { body } = bodyFromStats(state.stats);
  const n = state.mealsPerDay;
  const perMain = Math.min(daily / n, Math.max(body ? 0.4 * refWeight(body.kg, body.cm) : 0, daily / (n + 1)));
  return type === 'snack' ? Math.max(0, daily - n * perMain) : perMain;
}

// How big this meal should be: its share of the day (the step 1 split), per portion
function renderMealTarget() {
  const type = draftTypes()[0] || 'breakfast';
  const share = slotShare(type);
  const label = type === 'snack' ? 'Snacks' : MEAL_TYPES[type];
  if (!state.daily.cals) {
    $('mb-target').innerHTML = `<p class="text-xs text-slate-400">Set a daily target in step 1 to see how big a ${MEAL_TYPES[type].toLowerCase()} should be.</p>`;
    return;
  }
  const pt = portionTotals({ servings: draftServings(), items: draft.items });
  const row = (k, suffix, name, target) => {
    if (!target) return '';
    const left = target - pt[k];
    const tone = leftTone(left, target);
    return `
      <div class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="text-slate-300">${name}: <b class="${tone.text}">${fmt(pt[k])}</b> / ${fmt(target)}${suffix}</span>
          <span class="${tone.text} font-semibold">${left >= 0 ? `${fmt(left)}${suffix} left` : `${fmt(-left)}${suffix} over`}</span>
        </div>
        <div class="h-2 bg-slate-900 rounded-full overflow-hidden"><div class="h-full ${tone.bar} transition-all" style="width:${Math.min(100, pt[k] / target * 100)}%"></div></div>
      </div>`;
  };
  $('mb-target').innerHTML = `
    <div class="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 space-y-2">
      <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">${label} target · ${fmt1(share * 100)}% of your calories · protein spread evenly${draftServings() > 1 ? ' · per portion' : ''}</p>
      ${row('cals', ' kcal', 'Calories', state.daily.cals * share)}${row('protein', 'g', 'Protein', mealProteinTarget(type))}
    </div>`;
}

function renderMeals() {
  renderWeightMode();
  renderMealTarget();
  renderMealStorage();
  $('builder-title').textContent = draft.id ? 'Edit Meal' : 'Create a Meal or Snack';

  const servings = draftServings();
  const draftMeal = { servings, items: draft.items };
  const pt = portionTotals(draftMeal);
  const dt = mealTotals(draftMeal);
  const perPortion = Object.fromEntries(slotItems(draftMeal).map(p => [p.item.foodId, p]));
  const numCls = 'w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100 text-right text-sm focus:outline-none focus:border-brand';
  const amountInput = (i, idx, f, field, label) => `<input type="number" step="any" min="0" value="${Math.round(shownGrams(f, field === 'grams' ? i.grams : rangeOf(i)[field === 'min' ? 0 : 1]))}"
    data-action="draft-amount" data-idx="${idx}" data-field="${field}" aria-label="${label} for ${esc(f.name)}" class="${numCls}">`;
  $('draft-list').innerHTML = draft.items.length ? `
    <div class="space-y-1.5">
      ${draft.items.map((i, idx) => {
        const f = itemFood(i);
        if (!f) return '';
        const mode = modeOf(i);
        const unit = isCooked() && cookedFactorOf(f) !== 1 ? 'g cooked' : 'g';
        const amount = mode === 'range'
          ? `${amountInput(i, idx, f, 'min', 'Minimum grams')}<span class="text-slate-400">–</span>${amountInput(i, idx, f, 'max', 'Maximum grams')}<span class="text-xs text-slate-400">${unit} each</span>`
          : `${amountInput(i, idx, f, 'grams', 'Grams')}<span class="text-xs text-slate-400">${unit}${mode === 'fixed' ? ' each' : servings > 1 ? ' batch' : ''}</span>`;
        const p = perPortion[i.foodId];
        return `<div class="text-sm bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 space-y-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="min-w-0 truncate">${esc(f.name)}${foodById(i.foodId) ? '' : ' <span class="text-xs text-amber-400">not in basket</span>'}</span>
            <span class="flex items-center gap-3 shrink-0"><span class="text-xs text-slate-400">${p ? `${fmt(p.food.cals * p.grams / 100)} kcal${mode === 'range' ? ' at default' : ''}${servings > 1 ? ' / portion' : ''}` : ''}</span>
            <button data-action="remove-ingredient" data-idx="${idx}" class="text-slate-400 hover:text-rose-400" aria-label="Remove ${esc(f.name)}">✕</button></span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex bg-slate-950 rounded-md p-0.5 border border-slate-700 text-xs" role="group" aria-label="How ${esc(f.name)} behaves">
              ${Object.entries(ITEM_MODES).map(([key, m]) => `<button data-action="draft-mode" data-idx="${idx}" data-mode="${key}" aria-pressed="${mode === key}" title="${m.help}"
                class="px-2 py-0.5 rounded font-semibold transition-colors ${mode === key ? 'bg-slate-600 text-slate-50' : 'text-slate-400 hover:text-white'}">${m.icon} ${m.label}</button>`).join('')}
            </div>
            <div class="flex items-center gap-1 ml-auto">${amount}</div>
          </div>
        </div>`;
      }).join('')}
      <div class="text-right text-sm pt-1"><span class="text-slate-400">Total: </span><span class="font-bold text-brand">${fmt(pt.cals)} kcal${servings > 1 ? ' per portion' : ''}</span> <span class="text-slate-400">· ${macroLine(pt)}</span></div>
      ${servings > 1 ? `<div class="text-right text-xs text-slate-400">Whole batch (${plural(servings, 'portion')}): ${fmt(dt.cals)} kcal · ${macroLine(dt)}</div>` : ''}
    </div>` : '<p class="text-sm text-slate-400 text-center bg-slate-900/40 border border-dashed border-slate-700 rounded-lg px-3 py-5">No ingredients yet. Search for a food above, pick it, type the grams and press Add.</p>';

  if (!state.meals.length) {
    $('meal-list').innerHTML = emptyNote('No meals yet — create one with the button above.');
    return;
  }
  const counts = mealCounts();
  $('meal-list').innerHTML = Object.entries(MEAL_TYPES).map(([type, label]) => {
    const meals = state.meals.filter(m => m.type === type);
    if (!meals.length) return '';
    return `
      <div class="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md space-y-2">
        <h3 class="text-sm font-bold uppercase tracking-wider text-slate-400">${label}${type === 'snack' ? 's' : ''}</h3>
        <div class="grid lg:grid-cols-2 gap-2">
        ${meals.map(m => {
          const mt = mealTotals(m);
          const pt = portionTotals(m);
          const s = servingsOf(m);
          return `
            <div class="bg-slate-900 border border-slate-700 rounded-lg p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 space-y-1">
                  <div class="font-bold text-slate-200 text-sm">${esc(m.name)}${typesOf(m).length > 1 ? ` <span class="text-[11px] font-normal text-brand">· also ${typesOf(m).slice(1).map(t => MEAL_TYPES[t]).join(', ')}</span>` : ''}${counts[m.id] ? ` <span class="text-xs font-normal text-slate-400">· ${plural(counts[m.id], 'portion')} this week</span>` : ''}</div>
                  <div class="text-[11px] text-slate-400 flex flex-wrap gap-x-4">
                    <span class="text-emerald-400 font-bold">${fmt(pt.cals)} kcal${s > 1 ? ' / portion' : ''}</span>
                    <span>P: ${fmt(pt.protein)}</span> <span>C: ${fmt(pt.carbs)}</span> <span>F: ${fmt(pt.fat)}</span>
                  </div>
                  ${s > 1 ? `<div class="text-[11px] text-slate-400">Batch makes ${plural(s, 'portion')} · ${fmt(mt.cals)} kcal total · ${macroLine(mt)}</div>` : ''}
                  ${m.prepAhead ? '<div class="text-[11px] text-sky-300">🍱 Made ahead on prep day, one box per portion</div>' : ''}
                  ${isBatchMeal(m) ? `<div class="text-[11px] text-slate-400">${freezesOf(m) ? '🧊 Freezes' : "Doesn't freeze"} · keeps ${plural(fridgeDaysOf(m), 'day')} in the fridge</div>` : ''}
                  ${portionCost(m) != null ? `<div class="text-[11px] text-slate-400">≈ ${money(portionCost(m))} per portion</div>` : ''}
                  ${richestLine(m)}
                  <div class="text-xs text-slate-400">${m.items.map(ingredientText).filter(Boolean).join(', ')}</div>
                  ${Object.keys(missingFoods([m])).length ? `<button data-action="re-add-meal" data-id="${m.id}" class="text-[11px] text-amber-400 underline">Put missing foods back in the basket</button>` : ''}
                </div>
                <div class="flex gap-3 text-xs shrink-0">
                  <button data-action="edit-meal" data-id="${m.id}" class="text-slate-400 hover:text-brand">Edit</button>
                  <button data-action="delete-meal" data-id="${m.id}" class="text-slate-400 hover:text-rose-400">Delete</button>
                </div>
              </div>
            </div>`;
        }).join('')}
        </div>
      </div>`;
  }).join('');
}

function mealOptions(type, selected, emptyLabel) {
  const opt = m => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)} (${fmt(portionTotals(m).cals)} kcal${servingsOf(m) > 1 ? ' / portion' : ''})</option>`;
  const match = state.meals.filter(m => hasType(m, type));
  const other = state.meals.filter(m => !hasType(m, type));
  return `<option value="">${emptyLabel}</option>` + match.map(opt).join('') +
    (other.length ? `<optgroup label="Other meals">${other.map(opt).join('')}</optgroup>` : '');
}
