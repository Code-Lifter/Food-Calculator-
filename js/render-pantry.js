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
  const per = formPer100();
  const lines = [];
  if (per.cals && state.energyUnit === 'kJ') lines.push(`${fmt(per.energy)} kJ = <b class="text-slate-300">${fmt(per.cals)} kcal</b> per 100g`);
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

// Step 2: the pantry is a library of single foods (per 100 g). Nothing to buy is set here: each food's
// weekly amount comes from the week plan, and the shopping list lives on the Ready tab.
function renderShopping() {
  const total = state.foods.length;
  if (!total) {
    $('pantry-count').textContent = '';
    $('basket-list').innerHTML = emptyNote('Your pantry is empty. Use + Add a food to add one from its label.');
    return;
  }
  const q = pantryQuery.trim().toLowerCase();
  const shown = q ? state.foods.filter(f => f.name.toLowerCase().includes(q)) : state.foods;
  const users = Object.fromEntries(state.foods.map(f => [f.id, mealsUsing(f.id).length]));
  const inPlan = state.foods.filter(f => f.grams > 0).length;
  $('pantry-count').textContent = q
    ? `${plural(shown.length, 'food')} matching “${pantryQuery.trim()}” of ${total}`
    : `${plural(total, 'food')} · ${inPlan} in this week's plan`;

  const row = f => {
    const usedBy = pendingDelete === f.id ? mealsUsing(f.id) : [];
    const confirmRow = usedBy.length ? `
      <div class="text-xs text-amber-200 bg-amber-950/40 border border-amber-600/60 rounded-lg p-3 space-y-2">
        <div><b>${esc(f.name)}</b> is used by ${usedBy.map(m => `<b>${esc(m.name)}</b>`).join(', ')}. Those meals keep its calories, but it won't be on your shopping list.</div>
        <div class="flex gap-2">
          <button data-action="delete-food" data-id="${f.id}" class="bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold py-1 px-3 rounded border border-rose-500/50">Remove anyway</button>
          <button data-action="cancel-delete" class="bg-slate-700 hover:bg-slate-600 text-slate-200 py-1 px-3 rounded border border-slate-600">Keep it</button>
        </div>
      </div>` : '';
    const m = meta(f);
    const pack = m.packLabel || m.pricePerPack != null
      ? `<span class="chip">📦 ${esc(m.packLabel || `${fmt(m.packGrams)}g`)}${m.pricePerPack != null ? ` · <b class="text-brand">${money(m.pricePerPack)}</b>` : ''}</span>` : '';
    const n = users[f.id];
    const status = f.grams > 0 ? `<span class="chip chip-brand">this week · ${fmtWeight(f.grams)}</span>`
      : n ? `<span class="chip">in ${plural(n, 'meal')}</span>` : '<span class="chip chip-muted">not in a meal yet</span>';
    // A food that meals use shows who uses it before it goes (its own confirm step); the rest ask for a second click
    const del = n ? '' : ' data-confirm="Click again to delete"';
    return `
      <div class="bg-slate-900 border border-slate-700 rounded-lg p-3 flex flex-col gap-2 hover:border-slate-500 transition-colors">
        <div class="flex items-start justify-between gap-2">
          <button data-action="edit-food" data-id="${f.id}" title="Edit ${esc(f.name)}" class="min-w-0 font-bold text-slate-100 text-sm truncate text-left hover:text-brand">${esc(f.name)}</button>
          <span class="shrink-0">${status}</span>
        </div>
        <div class="macro-tiles" title="Per 100g">
          <div class="macro-tile kcal"><span>kcal</span><b>${fmt(f.cals)}</b></div>
          <div class="macro-tile"><span>Protein</span><b>${fmt1(f.protein)}g</b></div>
          <div class="macro-tile"><span>Carbs</span><b>${fmt1(f.carbs)}g</b></div>
          <div class="macro-tile"><span>Fat</span><b>${fmt1(f.fat)}g</b></div>
        </div>
        ${foodMicrosHtml(f)}
        <div class="card-foot">
          <div class="flex flex-wrap items-center gap-1.5">
            ${pack}
            <button data-action="toggle-short-life" data-id="${f.id}" aria-pressed="${isShortLife(f)}"
              title="Fresh food that won't keep all week. With two prep days, the part needed later goes on a mid-week top-up."
              class="chip transition-colors ${isShortLife(f) ? 'chip-sky' : 'chip-muted hover:text-slate-300'}">🥬 Short life</button>
          </div>
          <div class="flex gap-1.5 ml-auto">
            <button data-action="edit-food" data-id="${f.id}" title="Edit this food: name, aisle, macros, vitamins and minerals" class="btn-edit">✏️ Edit</button>
            <button data-action="delete-food" data-id="${f.id}"${del} class="btn-del" aria-label="Delete ${esc(f.name)}">🗑 Delete</button>
          </div>
        </div>
        ${confirmRow}
      </div>`;
  };
  $('basket-list').innerHTML = shown.length
    ? byAisle(shown).map(([label, foods]) => `
      <section class="space-y-2">
        <h3 class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300 pt-3 pb-1 border-b border-slate-700/70">${label} <span class="chip">${foods.length}</span></h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-2">${foods.map(row).join('')}</div>
      </section>`).join('')
    : emptyNote(`Nothing in your pantry matches “${esc(pantryQuery.trim())}”.`);
}

// Pantry row: the micronutrients this food has (per 100 g), or a nudge to add them
function foodMicrosHtml(f) {
  const known = NUTRIENTS.map(([k, label, unit]) => [label, unit, microOf(f, k)]).filter(([, , v]) => v != null);
  if (!known.length) return `<button data-action="edit-food" data-id="${f.id}" data-focus="micros" class="self-start text-[11px] text-slate-500 hover:text-brand">🥗 + Add vitamins &amp; minerals</button>`;
  // Folded away by default: fourteen chips per food made the list hard to scan
  return `<details class="micro-fold">
    <summary><span class="fold-arrow">▸</span> 🥗 ${plural(known.length, 'vitamin & mineral', 'vitamins & minerals')} <span class="text-slate-500">per 100g</span></summary>
    <div class="flex flex-wrap gap-1 pt-1.5">
      ${known.map(([label, unit, v]) => `<span class="chip">${esc(label)} <b>${fmtMicro(v)}${unit}</b></span>`).join('')}
    </div>
  </details>`;
}

// [[aisle label, foods sorted by name]] in walking order, empty aisles skipped
const byAisle = foods => CATEGORIES
  .map(([cat, label]) => [label, foods.filter(f => meta(f).category === cat).sort((a, b) => a.name.localeCompare(b.name))])
  .filter(([, list]) => list.length);
