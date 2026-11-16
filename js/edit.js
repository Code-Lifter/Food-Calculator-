// edit.js — Calculating targets and adding/removing pantry foods.

// Checks the stats, then sets the daily targets from targetsFor(); errors go in #stats-error (red),
// notes about the result go in the amber line under the button
function calculateTargets() {
  const { body, missing, minor, invalid } = bodyFromStats(state.stats);
  const field = k => document.querySelector(`[data-stat="${k}"]`);
  document.querySelectorAll('[data-stat]').forEach(el => { if (el.tagName === 'INPUT') markInvalid(el, false); });
  showStatsNotes([]);
  if (!body) {
    const bad = missing || invalid;
    bad.forEach(k => markInvalid(field(k), true));
    $('stats-error').textContent = minor ? 'This calculator is for adults – please see a GP or dietitian.'
      : missing ? `Fill in your ${missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} to calculate.`
      : `Check your ${invalid.map(k => { const [lo, hi, unit, name] = STAT_LIMITS[k]; return `${name} (${lo}–${hi}${unit})`; }).join(', ')}.`;
    $('stats-error').classList.remove('hidden');
    field(bad[0]).focus();
    return;
  }
  $('stats-error').classList.add('hidden');

  const t = targetsFor(body);
  state.daily = { cals: t.target, protein: t.macros.protein, carbs: t.macros.carbs, fat: t.macros.fat };
  fillInputs();
  commit();
  showStatsNotes(t.notes);
  toast(`Daily target: ${fmt(t.target)} kcal`);
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
