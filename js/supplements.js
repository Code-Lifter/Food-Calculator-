// supplements.js — Supplements: doses, days, costs, shopping lines, modal (plus runMicroTests for ?test).

// --- Supplements ---
const timingLabel = t => (TIMINGS.find(([k]) => k === t) || TIMINGS[TIMINGS.length - 1])[1];
const doseText = x => ['capsule', 'scoop'].includes(x.doseUnit) ? plural(x.dose, x.doseUnit) : `${fmt1(x.dose)} ${x.doseUnit}`;
function daysText(days) {
  if (days.length === DAYS.length) return 'every day';
  // Weekdays / weekends by the real weekday, wherever the plan starts
  const all = test => ALL_DAYS.filter(d => test(weekdayOf(d)));
  if (days.length > 1 && days.join() === all(w => w < 5).join()) return 'weekdays';
  if (days.length > 1 && days.join() === all(w => w >= 5).join()) return 'weekends';
  return days.length ? days.map(dayShort).join(', ') : 'no days';
}
const dosesPerWeek = x => x.days.length;
const weeksPerPack = x => x.servingsPerPack && dosesPerWeek(x) ? x.servingsPerPack / dosesPerWeek(x) : null;
// Price per dose × doses this week; only supplements with both a pack price and a pack size count
function suppWeekCost() {
  const priced = allSupplements().filter(x => x.pricePerPack != null && x.servingsPerPack > 0);
  return { total: priced.reduce((t, x) => t + x.pricePerPack / x.servingsPerPack * dosesPerWeek(x), 0), priced: priced.length };
}
// Ready tab, day by day: supplements sit under the meal they're taken with; the rest (training, bed, any time,
// or a meal slot that isn't in use) get a line of their own
const suppLine = list => list.length ? `<div class="text-xs text-violet-300">${list.map(x => `💊 ${esc(x.name)} ${esc(doseText(x))}`).join(' · ')}</div>` : '';
function otherSuppRows(d) {
  const inSlot = new Set(mainSlots().map(([slot]) => slot));
  const rest = suppsOn(d).filter(x => !inSlot.has(x.timing));
  return TIMINGS.map(([t, label]) => {
    const list = rest.filter(x => x.timing === t);
    return list.length ? `<div><span class="text-slate-400">${label}:</span>${suppLine(list)}</div>` : '';
  }).join('');
}
const suppText = d => {
  const list = suppsOn(d);
  return list.length ? `\n  Supplements: ${list.map(x => `${x.name} ${doseText(x)} (${timingLabel(x.timing).toLowerCase()})`).join(', ')}` : '';
};
// Supplements aren't foods, so they never go in the basket: a section of their own at the end of the shopping list
function suppShopHtml() {
  const supps = allSupplements();
  if (!supps.length) return '';
  return `
    <div class="pt-3 border-t border-slate-700/60 space-y-1">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">💊 Supplements</h3>
      <ul class="divide-y divide-slate-700/60">
        ${supps.map(x => {
          const key = `supp:${x.id}`, weeks = weeksPerPack(x);
          return `<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span class="flex-1 min-w-0 text-slate-100"><b>${esc(x.name)}</b>${esc(x.owner)} — ${esc(doseText(x))} × ${dosesPerWeek(x)} this week${weeks != null ? ` <span class="text-xs text-slate-400">· a pack lasts ≈ ${fmt1(weeks)} weeks</span>` : ''}</span>
            <label class="flex items-center gap-2 text-xs text-slate-300 shrink-0"><input type="checkbox" data-action="toggle-check" data-id="${esc(key)}" ${state.checked[key] ? 'checked' : ''} class="w-5 h-5 accent-emerald-400"> Need to rebuy</label>
          </li>`;
        }).join('')}
      </ul>
    </div>`;
}

function renderSupplements() {
  $('supp-count').textContent = state.supplements.length ? `· ${state.supplements.length}` : '';
  $('supp-list').innerHTML = state.supplements.length ? state.supplements.map(x => `
    <div class="bg-slate-900 border border-slate-700 rounded-lg p-3 flex items-start justify-between gap-2">
      <div class="min-w-0 text-sm">
        <b class="text-slate-200">${esc(x.name)}</b> <span class="text-slate-400">· ${esc(doseText(x))} · ${esc(timingLabel(x.timing).toLowerCase())} · ${daysText(x.days)}</span>
        ${x.kcal || x.protein ? `<div class="text-[11px] text-slate-400">${fmt(x.kcal)} kcal · ${macroLine(x)} per dose — counts toward your day</div>` : ''}
      </div>
      <div class="flex gap-1.5 shrink-0">
        <button data-action="edit-supp" data-id="${esc(x.id)}" class="btn-edit">✏️ Edit</button>
        <button data-action="delete-supp" data-id="${esc(x.id)}" data-confirm="Click again to delete" class="btn-del">🗑 Delete</button>
      </div>
    </div>`).join('')
    : '<p class="text-xs text-slate-400">None yet. Supplements with calories (like whey) count toward your day; vitamins and minerals add to the micronutrient totals on the Ready tab.</p>';
}

// The Days checkboxes follow the plan's days, so they're rebuilt each time the form opens
function renderSuppDays() {
  $('sp-days').innerHTML = DAYS.map((name, d) => `<label class="flex items-center gap-1.5 text-sm text-slate-200 cursor-pointer"><input type="checkbox" data-supp-day value="${d}" checked class="w-4 h-4 accent-emerald-400">${dayShort(d)}</label>`).join('');
}
function openSuppModal(x = null) {
  editingSuppId = x ? x.id : null;
  $('supp-form').reset();
  $('supp-modal-title').textContent = x ? 'Edit Supplement' : 'Add a Supplement';
  renderSuppDays();
  document.querySelectorAll('[data-supp-day]').forEach(b => { b.checked = x ? x.days.includes(Number(b.value)) : true; });
  fillMicros('sp', x ? x.micros : {});
  if (x) {
    $('sp-name').value = x.name;
    $('sp-dose').value = x.dose;
    $('sp-unit').value = x.doseUnit;
    $('sp-timing').value = x.timing;
    $('sp-servings').value = x.servingsPerPack ?? '';
    $('sp-price').value = x.pricePerPack ?? '';
    ['kcal', 'protein', 'carbs', 'fat'].forEach(k => { $(`sp-${k}`).value = x[k] || ''; });
  }
  $('sp-more').open = !!x && (x.kcal > 0 || x.protein > 0 || x.carbs > 0 || x.fat > 0 || Object.keys(x.micros).length > 0);
  $('supp-modal').showModal();
  $('sp-name').focus();
}

function saveSupplement() {
  const days = [...document.querySelectorAll('[data-supp-day]')].filter(b => b.checked).map(b => Number(b.value));
  if (!days.length) { toast('Tick at least one day'); return; }
  const val = id => $(id).value;
  const x = normaliseSupplement({
    id: editingSuppId || uid(), name: val('sp-name').trim(), dose: val('sp-dose'), doseUnit: val('sp-unit'), timing: val('sp-timing'), days,
    servingsPerPack: val('sp-servings'), pricePerPack: val('sp-price'),
    kcal: val('sp-kcal'), protein: val('sp-protein'), carbs: val('sp-carbs'), fat: val('sp-fat'), micros: readMicros('sp')
  });
  const i = state.supplements.findIndex(y => y.id === x.id);
  if (i >= 0) state.supplements[i] = x; else state.supplements.push(x);
  $('supp-modal').close();
  commit();
  toast(`${i >= 0 ? 'Updated' : 'Added'} ${x.name}`);
}

// ?test: micronutrient and supplement checks, each run against a throwaway state that's put back afterwards
function runMicroTests() {
  const saved = state;
  const food = (id, cals, protein, carbs, fat, micros) => ({ id, name: id, grams: 0, locked: false, cals, protein, carbs, fat, ...(micros ? { micros } : {}) });
  const meal = (id, items) => ({ id, name: id, type: 'lunch', types: ['breakfast', 'lunch', 'dinner'], servings: 1, fridgeDays: 3, freezes: false,
    items: items.map(([foodId, grams]) => ({ foodId, grams, mode: 'ratio' })) });
  const mondayLunch = id => DAYS.map((_, d) => ({ ...emptyDay(), lunch: d === 0 ? id : '' }));
  const run = (partial, fn) => { state = { ...defaultState(), ...partial }; try { fn(); } finally { state = saved; } };
  const rows = [];
  const check = (name, ok, detail) => rows.push({ check: name, ok, detail });

  run({ foods: [food('lentils', 116, 9, 20, 0.4, { iron: 2 })], meals: [meal('m', [['lentils', 300]])], plan: mondayLunch('m') }, () => {
    const m = dayMicros(state.plan[0], 0);
    check('1. Iron 2 mg/100 g × 300 g → 6 mg, coverage 100%', Math.abs(m.food.iron - 6) < 1e-9 && m.coverage.iron === 1, `iron ${fmtMicro(m.food.iron)} mg, coverage ${fmt(m.coverage.iron * 100)}%`);
  });
  run({ foods: [food('orange', 47, 0.9, 12, 0.1, { vitC: 50 }), food('rice', 360, 7, 79, 0.6)], meals: [meal('m', [['orange', 100], ['rice', 150]])], plan: mondayLunch('m') }, () => {
    const m = dayMicros(state.plan[0], 0);
    const row = microRows(m, 0).find(r => r.k === 'vitC');
    check('2. Vit C on one food, not the other → coverage < 100%, bar greyed under 70%', m.coverage.vitC < 1 && row.grey === (m.coverage.vitC < COVERAGE_MIN) && row.grey,
      `coverage ${fmt(m.coverage.vitC * 100)}%, greyed: ${row.grey}`);
  });
  const whey = { id: 'whey', name: 'Whey', dose: 1, doseUnit: 'scoop', timing: 'post-training', days: [...ALL_DAYS], servingsPerPack: null, pricePerPack: null,
    kcal: 120, protein: 24, carbs: 3, fat: 2, micros: {} };
  run({
    daily: { cals: 2500, protein: 180, carbs: 280, fat: 70 },
    foods: [food('chicken', 120, 22.5, 0, 2.6), food('rice', 360, 7, 79, 0.6), food('oats', 375, 12.5, 60, 8), food('milk', 46, 3.5, 4.8, 1.7)],
    meals: [meal('oats', [['oats', 80], ['milk', 250]]), meal('bowl', [['chicken', 150], ['rice', 90]])],
    plan: DAYS.map(() => ({ ...emptyDay(), breakfast: 'oats', lunch: 'bowl', dinner: 'bowl' })), supplements: [whey]
  }, () => {
    state.plan.forEach((day, d) => fitMains(day, state.daily.cals, d));
    const totals = state.plan.map((day, d) => dayTotals(day, d));
    const within = totals.every(t => Math.abs(t.cals - 2500) / 2500 <= 0.05);
    const withWhey = state.plan.every((day, d) => Math.abs(dayTotals(day, d).protein - dayTotals(day, null).protein - 24) < 1e-9);
    check('3. Whey 120 kcal every day + Fit portions → within ±5%, protein includes 24 g', within && withWhey, `${totals.map(t => fmt(t.cals)).join(', ')} kcal (target 2,500)`);
  });
  run({ supplements: [{ ...whey, id: 'vitd', name: 'Vitamin D', dose: 100, doseUnit: 'µg', kcal: 0, protein: 0, carbs: 0, fat: 0, micros: { vitD: 100 } }] }, () => {
    const w = ulWarnings();
    check('4. Vitamin D 100 µg a day → upper-level warning', w.some(x => x.k === 'vitD'), w.length ? w[0].text : 'no warning');
  });
  console.table(rows);
  return rows;
}
