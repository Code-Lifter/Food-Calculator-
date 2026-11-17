// edit.js — Live daily targets from the stats (step 1), and adding/removing pantry foods.

// Step 1's daily targets follow the stats live: every change to the stats (typing, Male/Female, Cut/Bulk,
// speed, job…) re-works them out, as long as the stats are complete and the person hasn't typed their own
// targets. state.stats.autoTargets: true = live from the stats; false = their own numbers (typing in Daily
// Targets switches it off; "Use calculated targets" switches it back on).
const liveOn = () => state.stats.autoTargets !== false;

// The calculated targets for the stats as they stand, or why there aren't any yet
function statsResult() {
  const { body, missing, minor, invalid } = bodyFromStats(state.stats);
  if (body) return { t: targetsFor(body) };
  if (minor) return { error: 'This calculator is for adults – please see a GP or dietitian.', bad: ['age'] };
  if (missing) return { waiting: `Fill in your ${missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} to see your targets.` };
  return { error: `Check your ${invalid.map(k => { const [lo, hi, unit, name] = STAT_LIMITS[k]; return `${name} (${lo}–${hi}${unit})`; }).join(', ')}.`, bad: invalid };
}
const sameTargets = (a, b) => MACROS.every(([k]) => Math.round(a[k] || 0) === Math.round(b[k] || 0));
const targetsOf = t => ({ cals: t.target, protein: t.macros.protein, carbs: t.macros.carbs, fat: t.macros.fat });

// Runs in commit(): when live, puts the calculated targets into state.daily (and the boxes, unless one is being
// typed in). Returns true when they changed.
function applyLiveTargets() {
  if (!liveOn()) return false;
  const { t } = statsResult();
  if (!t || sameTargets(state.daily, targetsOf(t))) return false;
  state.daily = targetsOf(t);
  MACROS.forEach(([k]) => { const el = $(`daily-${k}`); if (el && document.activeElement !== el) el.value = Math.round(state.daily[k]); });
  return true;
}

// "Use calculated targets": back to live, straight away
function calculateTargets() {
  const r = statsResult();
  if (!r.t) { renderLiveTargets(); const bad = (r.bad || [])[0]; if (bad) document.querySelector(`[data-stat="${bad}"]`).focus(); return; }
  state.stats.autoTargets = true;
  state.daily = targetsOf(r.t);
  fillInputs();
  commit();
  toast(`Daily targets now follow your stats: ${fmt(r.t.target)} kcal`, { undoable: true });
}

// The live result under the stats, in place of a Calculate button
function renderLiveTargets() {
  const r = statsResult();
  document.querySelectorAll('[data-stat]').forEach(el => {
    if (el.tagName === 'INPUT') markInvalid(el, !!(r.bad && r.bad.includes(el.dataset.stat) && el.value !== ''));
  });
  const box = $('live-targets');
  if (!r.t) {
    box.innerHTML = `<div class="rounded-lg border ${r.error ? 'border-rose-700/60 bg-rose-950/30 text-rose-300' : 'border-dashed border-slate-700 text-slate-400'} px-4 py-3 text-sm text-center">${esc(r.error || r.waiting)}</div>`;
    return;
  }
  const t = r.t, calc = targetsOf(t), live = liveOn();
  showStatsNotes(t.notes);
  // While live, the Daily Targets boxes below already show these numbers; only show them here to compare
  // against the person's own typed targets
  if (live) { box.innerHTML = ''; return; }
  const tile = (label, v, unit) => `<div class="macro-tile ${unit === 'kcal' ? 'kcal' : ''}"><span>${label}</span><b>${fmt(v)}${unit === 'kcal' ? '' : 'g'}</b></div>`;
  box.innerHTML = `
    <div class="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Calculated from your stats</span>
        <button data-action="calculate" class="btn-edit">↻ Use calculated targets</button>
      </div>
      <div class="macro-tiles">${tile('kcal', calc.cals, 'kcal')}${tile('Protein', calc.protein)}${tile('Carbs', calc.carbs)}${tile('Fat', calc.fat)}</div>
      <p class="text-[11px] text-slate-400">You've typed your own targets below, so these aren't being used. Press ↻ to switch back to live.</p>
    </div>`;
}

function showStatsNotes(notes) {
  $('stats-note').innerHTML = notes.map(n => `<div>⚠ ${esc(n)}</div>`).join('');
  $('stats-note').classList.toggle('hidden', !notes.length);
}

// Adds a food to the pantry library. A food with the same name is updated instead of doubled up.
// Returns false (and changes nothing) when there's nothing to add.
function addFood(food) {
  const existing = state.foods.find(f => f.name.toLowerCase() === food.name.toLowerCase());
  if (existing) {
    Object.assign(existing, { ...food, id: existing.id, grams: existing.grams });
    toast(`${food.name} was already in your pantry — updated it`);
  } else {
    state.foods.push({ id: idForNewFood(food.name), ...food, grams: 0 });
    toast(`Added ${food.name} to your pantry`);
  }
  commit();
}

// Meals keep removed foods' ingredients (with their snapshot), so their calories don't vanish
function removeFoods(ids) {
  refreshSnapshots();
  const gone = new Set(ids);
  state.foods = state.foods.filter(f => !gone.has(f.id));
  ids.forEach(id => { delete state.checked[id]; delete state.checked[`${id}:top`]; });
}
