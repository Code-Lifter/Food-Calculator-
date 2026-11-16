// events.js — Event wiring: clicks, changes, inputs, keyboard shortcuts, form submits.

// --- Events ---
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab], [data-goto]');
  if (tab) {
    showTab(tab.dataset.tab || tab.dataset.goto);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const el = e.target.closest('[data-action]');
  if (el && el.tagName === 'BUTTON' && actions[el.dataset.action]) actions[el.dataset.action](el);
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-action]');
  if (el && changeActions[el.dataset.action]) changeActions[el.dataset.action](el);
});

document.querySelectorAll('[data-stat]').forEach(el => {
  el.addEventListener('input', () => {
    state.stats[el.dataset.stat] = el.value;
    if (parseFloat(el.value) > 0) markInvalid(el, false);
    if (!document.querySelector('[data-stat][aria-invalid="true"]')) $('stats-error').classList.add('hidden');
    showStatsNotes([]);
    commit(`stat-${el.dataset.stat}`);
  });
});

document.querySelectorAll('[data-target]').forEach(el => {
  el.addEventListener('input', () => {
    state.daily[el.dataset.target] = Math.max(0, parseFloat(el.value) || 0);
    commit(`daily-${el.dataset.target}`);
  });
});

// Step 5: typing what's at home saves as you go and redraws only that row (keeps the cursor)
document.addEventListener('input', e => {
  const el = e.target.closest('[data-stock]');
  if (!el) return;
  const f = stockFood(el.dataset.stock);
  if (!f) return;
  const g = Math.round(parseFloat(el.value) * (Number(el.dataset.unitGrams) || 1));
  if (g > 0) state.stock[f.id] = g; else delete state.stock[f.id];
  recordHistory(`stock-${f.id}`);
  save();
  renderHistory();
  renderStatus();
  updateStockRow(f.id);
});

// Macro sliders: the label follows the thumb while dragging; the value is saved on release (change)
document.addEventListener('input', e => {
  const el = e.target.closest('[data-action="set-lean"]');
  if (!el) return;
  const k = el.dataset.lean, v = (parseFloat(el.value) || 0) / 100, base = state.daily[k] || 0;
  const label = document.querySelector(`[data-lean-label="${k}"]`);
  if (label) label.textContent = `${leanWords(v)}${base ? ` · ${Math.round(base * (1 + v))} g` : ''}`;
  el.setAttribute('aria-valuetext', leanWords(v));
});

// Meal builder: picks from the foods in your pantry
searchPicker({
  input: $('mb-search'),
  list: $('mb-results'),
  items: () => {
    return [
      ...state.foods.map(f => ({ name: f.name, cals: f.cals, tag: 'Pantry', value: `food:${f.id}` }))
    ];
  },
  emptyText: 'No matches — add a custom food in the Single Food Pantry first.',
  onPick: hit => {
    mbPicked = hit.value;
    $('mb-grams').focus();
    $('mb-grams').select();
  }
});
// Typing again means the earlier pick no longer matches the box
$('mb-search').addEventListener('input', () => { mbPicked = null; });
$('mb-servings').addEventListener('input', renderMeals);
$('mb-fridge').addEventListener('input', renderMealStorage);
['mb-freezes', 'mb-prep-ahead'].forEach(id => $(id).addEventListener('change', renderMealStorage));
$('mb-type').addEventListener('change', renderMealTarget);
$('mb-grams').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); actions['add-ingredient'](); }
});

// Arrow keys move between step tabs (and select them), as a tablist should
$('tabs').addEventListener('keydown', e => {
  const tabs = [...document.querySelectorAll('.tab-btn')];
  const i = tabs.findIndex(t => t.dataset.tab === state.tab);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  const target = tabs[(next + tabs.length) % tabs.length];
  showTab(target.dataset.tab);
  target.focus();
});

// Clicking the dimmed backdrop (outside the modal box) closes a modal
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => {
  if (e.target === d) d.close();
}));
// A toast shown inside a modal goes back to the page when the modal closes
document.querySelectorAll('dialog').forEach(d => d.addEventListener('close', () => {
  const t = $('toast');
  if (d.contains(t)) document.body.appendChild(t);
}));

// Print shows the summary even when another step is open
window.addEventListener('beforeprint', renderSummary);
// Box labels print on their own; the normal print comes back afterwards
window.addEventListener('afterprint', () => document.body.classList.remove('printing-labels'));

// Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y); text fields keep their own typing undo
document.addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey)) return;
  const t = e.target;
  if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['checkbox', 'button'].includes(t.type))) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});

['ff-cals', 'ff-protein', 'ff-carbs', 'ff-fat', 'ff-fibre'].forEach(id => $(id).addEventListener('input', renderFormPreview));
// Pantry search: view-only, filters the list as you type
$('pantry-search').addEventListener('input', e => { pantryQuery = e.target.value; renderShopping(); });
$('ff-micros').addEventListener('input', renderMicroCount);

$('food-form').addEventListener('submit', e => {
  e.preventDefault();
  const per = formPer100();
  const values = { name: $('ff-name').value.trim(), category: $('ff-category').value };
  MACROS.forEach(([k]) => { values[k] = Math.round(per[k] * 10) / 10; });
  const micros = readMicros('ff');
  const f = editingFoodId && foodById(editingFoodId);
  $('food-modal').close();
  if (f) {
    // Edited in place: same id, so every meal using it picks up the new values
    Object.assign(f, values);
    if (per.fibre) f.fibre = per.fibre; else delete f.fibre;
    if (Object.keys(micros).length) f.micros = micros; else delete f.micros;
    commit();
    toast(`Updated ${f.name}`);
  } else {
    const food = { ...values };
    if (per.fibre) food.fibre = per.fibre;
    if (Object.keys(micros).length) food.micros = micros;
    addFood(food);
  }
  e.target.reset();
  renderFormPreview();
});
$('food-modal').addEventListener('close', () => { editingFoodId = null; });
$('supp-modal').addEventListener('close', () => { editingSuppId = null; });
$('supp-form').addEventListener('submit', e => { e.preventDefault(); saveSupplement(); });
// <details> on re-rendered panels: remember whether the micronutrient card is open (toggle doesn't bubble, so capture)
document.addEventListener('toggle', e => { if (e.target.id === 'micro-card') microCardOpen = e.target.open; }, true);
