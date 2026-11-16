// render-pantry.js — Step 2, Single Food Pantry: the food form preview and the pantry/basket list.

// The form's per-100g values; energy becomes kcal whatever unit was typed
function formPer100() {
  const val = id => Math.max(0, parseFloat($(id).value) || 0);
  const energy = val('ff-cals');
  return {
    energy, cals: state.energyUnit === 'kJ' ? energy / KJ_PER_KCAL : energy,
    protein: val('ff-protein'), carbs: val('ff-carbs'), fat: val('ff-fat'), fibre: val('ff-fibre')
  };
}

function renderFormPreview() {
  const grams = parseFloat($('ff-grams').value) || 0;
  const per = formPer100();
  const lines = [];
  if (per.cals && state.energyUnit === 'kJ') lines.push(`${fmt(per.energy)} kJ = <b class="text-slate-300">${fmt(per.cals)} kcal</b> per 100g`);
  if (grams && per.cals) lines.push(`${fmt(grams)}g = <span class="text-brand font-bold">${fmt(per.cals * grams / 100)} kcal</span> · ${macroLine(Object.fromEntries(MACROS.map(([k]) => [k, per[k] * grams / 100])))}`);
  // Fibre counts ≈2 kcal/g on labels. A gap over 10% is usually a typo, or kJ typed as kcal
  const fromMacros = 4 * per.protein + 4 * per.carbs + 9 * per.fat + 2 * per.fibre;
  if (per.cals && fromMacros && Math.abs(fromMacros - per.cals) / per.cals > 0.10) {
    lines.push(`<span class="text-amber-400">⚠ Label energy and macros don't match – check what you typed (${fmt(per.cals)} kcal vs ≈ ${fmt(fromMacros)} kcal from the macros)</span>`);
  }
  $('ff-preview').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
}

function renderEnergyUnit() {
  $('ff-energy-unit').innerHTML = ['kJ', 'kcal'].map(u => `<button type="button" data-action="set-energy-unit" data-value="${u}" aria-pressed="${state.energyUnit === u}"
    class="px-2.5 py-1 rounded-md transition-colors ${state.energyUnit === u ? 'bg-emerald-500 text-slate-900' : 'text-slate-400 hover:text-white'}">${u}</button>`).join('');
  $('ff-cals').placeholder = state.energyUnit === 'kJ' ? 'e.g. 1550' : 'e.g. 370';
  $('ff-cals-unit').textContent = state.energyUnit;
}

function renderShopping() {
  $('basket-left').innerHTML = leftCards(basketTotals(), weekly());

  if (!state.foods.length) {
    $('basket-list').innerHTML = emptyNote('Nothing to buy yet. Build meals in step 3 and plan your week — the basket fills itself. Or use + Add a food.');
    return;
  }
  const used = plannedGrams();
  const cost = shopCost();
  const topUpGrams = Object.fromEntries(shopLists().topUp.map(f => [f.id, f.grams]));
  const basketRow = f => {
    const users = pendingDelete === f.id ? mealsUsing(f.id) : [];
    const confirmRow = users.length ? `
      <div class="text-xs text-amber-200 bg-amber-950/40 border border-amber-600/60 rounded-lg p-3 space-y-2">
        <div><b>${esc(f.name)}</b> is used by ${users.map(m => `<b>${esc(m.name)}</b>`).join(', ')}. Those meals keep its calories, but it won't be on your shopping list.</div>
        <div class="flex gap-2">
          <button data-action="delete-food" data-id="${f.id}" class="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold py-1 px-3 rounded border border-rose-500/50">Remove anyway</button>
          <button data-action="cancel-delete" class="bg-slate-700 hover:bg-slate-600 text-slate-200 py-1 px-3 rounded border border-slate-600">Keep it</button>
        </div>
      </div>` : '';
    const need = used[f.id] || 0;
    const buy = buyInfo(f);
    const short = f.locked && need > f.grams + 1e-9;
    const t = totalsOf([{ foodId: f.id, grams: f.grams }]);
    const note = f.locked
      ? (need ? `<span class="${short ? 'text-amber-400' : 'text-slate-400'}">Week plan uses ${fmt(need)}g${short ? ` — ${fmt(need - f.grams)}g short` : ''}</span>` : '')
      : (need ? '' : '<span class="text-slate-400">Not in your week plan yet</span>');
    return `
      <div class="bg-slate-900 border ${short ? 'border-amber-500/60' : 'border-slate-700'} rounded-lg p-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 hover:border-slate-500 transition-colors">
        <div class="basis-full sm:basis-auto flex-1 min-w-0 space-y-1">
          <button data-action="edit-food" data-id="${f.id}" title="Edit ${esc(f.name)}" class="block max-w-full font-bold text-slate-200 text-sm truncate text-left hover:text-brand hover:underline">${esc(f.name)}</button>
          <div class="text-[11px] text-slate-400 flex flex-wrap gap-x-4">
            <span class="text-emerald-400 font-bold">${fmt(t.cals)} kcal</span>
            <span>P: ${fmt(t.protein)}</span> <span>C: ${fmt(t.carbs)}</span> <span>F: ${fmt(t.fat)}</span>
          </div>
          ${foodMicrosHtml(f)}
          ${buy.text || buy.cost != null ? `<div class="text-[11px] text-slate-300">🛒 ${buy.text || 'Buy loose'}${buy.cost != null ? ` · <span class="text-brand">${money(buy.cost)}</span>` : ''}</div>` : ''}
          <div class="flex flex-wrap items-center gap-2 text-[11px]">
            <button data-action="toggle-lock" data-id="${f.id}" aria-pressed="${f.locked}"
              title="${f.locked ? 'Keeps the amount you set. Click to let the week plan decide.' : 'Sized from your week plan. Click to fix your own amount.'}"
              class="px-2 py-0.5 rounded border transition-colors ${f.locked ? 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-emerald-800/50 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/40'}">
              ${f.locked ? '🔒 Fixed amount' : '🔓 From plan'}
            </button>
            <button data-action="toggle-short-life" data-id="${f.id}" aria-pressed="${isShortLife(f)}"
              title="Fresh food that won't keep all week. With two prep days, the part needed later goes on a mid-week top-up."
              class="px-2 py-0.5 rounded border transition-colors ${isShortLife(f) ? 'border-sky-800/60 bg-sky-950/40 text-sky-300 hover:bg-sky-900/50' : 'border-slate-700 text-slate-500 hover:text-slate-300'}">
              🥬 Short life
            </button>
            <button data-action="edit-food" data-id="${f.id}" title="Edit this ingredient: name, aisle, amount, macros, vitamins and minerals"
              class="px-2 py-0.5 rounded border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors">✏️ Edit</button>
            ${topUpGrams[f.id] ? `<span class="text-sky-300">Mid-week top-up: ${fmt(topUpGrams[f.id])}g</span>` : ''}
            ${note}
          </div>
        </div>
        <div class="shrink-0 ml-auto sm:ml-0 text-sm font-bold text-slate-100" title="Total for the week">${fmt(f.grams)}g</div>
        <button data-action="delete-food" data-id="${f.id}" class="shrink-0 text-slate-600 hover:text-rose-400 p-2 hover:bg-slate-800 rounded transition-colors" aria-label="Remove ${esc(f.name)}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>${confirmRow}`;
  };
  $('basket-list').innerHTML =
    (cost.priced ? `<div class="text-sm text-slate-300 flex flex-wrap justify-between gap-2"><span>Estimated shop (whole packs)</span><span class="font-bold text-brand">${money(cost.total)}${cost.priced < cost.items ? ` <span class="text-xs font-normal text-slate-400">· ${cost.items - cost.priced} item${cost.items - cost.priced === 1 ? '' : 's'} without a price</span>` : ''}</span></div>` : '') +
    byAisle(state.foods).map(([label, foods]) => `
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 pt-2">${label}</h3>
      ${foods.map(basketRow).join('')}`).join('');
}

// Pantry row: the micronutrients this food has (per 100 g), or a nudge to add them
function foodMicrosHtml(f) {
  const known = NUTRIENTS.map(([k, label, unit]) => [label, unit, microOf(f, k)]).filter(([, , v]) => v != null);
  if (!known.length) return `<button data-action="edit-food" data-id="${f.id}" data-focus="micros" class="text-[11px] text-slate-500 hover:text-brand">🥗 + Add micronutrients</button>`;
  return `<div class="flex flex-wrap gap-1 text-[10px]" title="Micronutrients per 100g">
    <span class="text-slate-500">🥗 /100g:</span>
    ${known.map(([label, unit, v]) => `<span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">${esc(label)} ${fmtMicro(v)}${unit}</span>`).join('')}
  </div>`;
}

// [[aisle label, foods sorted by name]] in walking order, empty aisles skipped
const byAisle = foods => CATEGORIES
  .map(([cat, label]) => [label, foods.filter(f => meta(f).category === cat).sort((a, b) => a.name.localeCompare(b.name))])
  .filter(([, list]) => list.length);
