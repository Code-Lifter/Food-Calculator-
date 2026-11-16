// render-core.js — Status bar, tabs, step 1 (stats + targets) and the prep-style switch.

// --- Rendering ---
function renderStatus() {
  const wt = weekly(), pt = planTotals(), shop = shopCost();
  const cell = (label, value, color, mark = '', cls = '') => `
    <div class="min-w-0 ${cls}">
      <span class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">${label}</span>
      <span class="block text-sm sm:text-lg font-bold truncate ${color}">${mark}${value}</span>
    </div>`;
  $('status-bar').innerHTML =
    cell('Week target', wt.cals ? `${fmt(wt.cals)} kcal` : '—', 'text-slate-100') +
    (shop.priced ? cell('Shop estimate', money(shop.total), 'text-slate-100') : cell('Pantry', plural(state.foods.length, 'food'), 'text-slate-100')) +
    cell('Planned', `${fmt(pt.cals)} kcal`, statusColor(pt.cals, wt.cals), statusMark(pt.cals, wt.cals)) +
    cell('Protein planned', wt.protein ? `${fmt(pt.protein)} / ${fmt(wt.protein)}g` : `${fmt(pt.protein)}g`, statusColor(pt.protein, wt.protein), statusMark(pt.protein, wt.protein)) +
    sugarCell(cell);
}

// Daily average sugars from the planned food (and supplements) against the 18%-of-energy guide.
// Grey "?" when under half the food eaten has a sugars value.
function sugarCell(cell) {
  const w = weekMicros();
  const wide = 'col-span-2 sm:col-span-1'; // a row of its own on phones
  if (!w.days) return cell('Sugar / day', '—', 'text-slate-100', '', wide);
  const g = (w.food.sugars || 0) + (w.supp.sugars || 0);
  const kcal = w.kcal || state.daily.cals;
  const guide = kcal * SUGAR_PCT / 100 / 4;
  if ((w.coverage.sugars || 0) < COVERAGE_MIN) return cell('Sugar / day', `${fmt(g)}g ?`, 'text-slate-400', '', wide);
  const tone = guide ? microTone(g / guide, 'sugars') : MICRO_TONES.none;
  return cell('Sugar / day', `${fmt(g)}${guide ? ` / ${fmt(guide)}` : ''}g`, tone.text, '', wide);
}

function renderTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === state.tab;
    btn.setAttribute('aria-selected', active);
    btn.tabIndex = active ? 0 : -1;
    btn.className = `tab-btn flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-sm font-semibold transition-colors ${active ? 'bg-brand text-slate-950' : 'text-slate-400 hover:bg-slate-700'}`;
  });
  document.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== state.tab));
}

function renderStats() {
  const s = state.stats;
  const on = 'bg-emerald-500/10 border-emerald-500 text-emerald-400';
  const off = 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white';
  document.querySelectorAll('.gender-btn').forEach(b => {
    b.className = `gender-btn py-2 rounded-lg border font-bold transition-colors ${b.dataset.value === s.gender ? on : off}`;
  });
  document.querySelectorAll('.goal-btn').forEach(b => {
    b.className = `goal-btn py-2 rounded-lg border font-bold text-sm transition-colors ${b.dataset.value === s.goal ? 'bg-emerald-500 border-emerald-500 text-slate-900' : off}`;
  });
  document.querySelectorAll('.unit-btn').forEach(b => {
    b.className = `unit-btn px-3 py-1 rounded-md transition-colors ${b.dataset.value === s.unit ? 'bg-emerald-500 text-slate-900' : 'text-slate-400 hover:text-white'}`;
  });
  document.querySelector('.unit-weight').textContent = s.unit === 'kg' ? 'kg' : 'lbs';
  document.querySelector('.unit-height').textContent = s.unit === 'kg' ? 'cm' : 'in';
  $('st-height').placeholder = s.unit === 'kg' ? '180' : '71';
  // Speed toggle under Cut and Bulk
  const speed = speedOf(s);
  $('goal-speed').innerHTML = SPEEDS[s.goal] ? `
    <div class="flex justify-center gap-1 text-xs" role="group" aria-label="${s.goal === 'cut' ? 'Cut' : 'Bulk'} speed">
      ${SPEEDS[s.goal].map(([v, label]) => `<button data-action="set-speed" data-value="${v}" aria-pressed="${speed[0] === v}"
        class="px-3 py-1 rounded-md border font-semibold transition-colors ${speed[0] === v ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : off}">${label}</button>`).join('')}
    </div>` : '';
  // The % always; the weekly rate once the stats are complete enough to work it out
  const goal = GOALS[goalKey(s)];
  const { body } = bodyFromStats(s);
  let desc = goal.desc;
  if (body && goal.pct) {
    const t = targetsFor(body);
    desc += ` · ≈ ${fmt1(Math.abs(t.kgPerWeek))} kg/week ${t.kgPerWeek < 0 ? 'loss' : 'gain'} (estimate)`;
  }
  $('goal-desc').textContent = desc;
  const bf = parseFloat(s.bfPct);
  $('bmr-formula').textContent = `BMR formula: ${bf >= 3 && bf <= 60 ? 'Cunningham (uses your body fat %)' : 'Mifflin-St Jeor'}`;
}

function fillInputs() {
  document.querySelectorAll('[data-stat]').forEach(el => { el.value = state.stats[el.dataset.stat] ?? ''; });
  MACROS.forEach(([k]) => { $(`daily-${k}`).value = state.daily[k] ? Math.round(state.daily[k]) : ''; });
}

function renderTarget() {
  const wt = weekly();
  $('weekly-output').innerHTML = `
    <div class="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50 flex flex-wrap justify-between items-center text-xs text-slate-300 gap-2">
      <span>Weekly Target (× 7 days):</span>
      <div class="flex gap-3 font-semibold text-brand">
        <span>${fmt(wt.cals)} kcal</span>
        <span>${fmt(wt.protein)}g P</span>
        <span>${fmt(wt.carbs)}g C</span>
        <span>${fmt(wt.fat)}g F</span>
      </div>
    </div>`;

  const c = state.daily.cals;
  $('split-output').innerHTML = `
    <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Rough size of each meal (use this in step 3)</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      ${[...mainSlots(), ['snack', 'Snacks']].map(([slot, label]) => [label, slotShare(slot)]).map(([label, share]) => `
        <div class="bg-slate-900/60 p-3 rounded-lg border border-slate-700/50">
          <span class="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">${label} · ${fmt1(share * 100)}%</span>
          <span class="text-lg font-bold text-slate-100">${c ? fmt(c * share) : '—'}</span>
          <span class="text-xs text-slate-400">kcal</span>
        </div>`).join('')}
    </div>`;
}

// Prep style: one Sunday session plus the freezer, or a second session mid-week
function renderPrep() {
  const p = state.prep;
  const btn = (value, label) => `<button data-action="set-prep" data-value="${value}" aria-pressed="${p.mode === value}"
    class="py-2 rounded-lg border font-bold text-sm transition-colors ${p.mode === value ? 'bg-emerald-500 border-emerald-500 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}">${label}</button>`;
  const firstStretch = p.second === 0 ? 'Monday' : `Monday–${DAYS[p.second]}`;
  $('prep-style').innerHTML = `
    <div class="grid grid-cols-2 gap-2">${btn('freezer', '🧊 One prep day + freezer')}${btn('two', '🔪 Two prep days')}</div>
    ${p.mode === 'two' ? `
      <label class="flex items-center gap-2 text-sm text-slate-300">Second prep day
        <select data-action="set-prep-day" class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 focus:outline-none focus:border-brand">
          ${DAYS.slice(0, 6).map((name, d) => `<option value="${d}" ${d === p.second ? 'selected' : ''}>${name} evening</option>`).join('')}
        </select>
      </label>` : ''}
    <p class="text-xs text-slate-400">${p.mode === 'two'
      ? `Batch cook on Sunday for ${firstStretch}, then again on ${DAYS[p.second]} evening for the rest of the week, so boxes stay fresh in the fridge. Short-life fresh food for the second session goes on a mid-week top-up shop.`
      : 'Batch cook everything on Sunday. Boxes eaten after a meal\'s fridge life go in the freezer and move to the fridge the night before; meals that don\'t freeze are kept to the start of the week.'}</p>`;
}
